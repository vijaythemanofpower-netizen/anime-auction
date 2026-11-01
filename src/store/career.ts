// Career dashboard: everything you've done across games, kept per account (on your
// profile, so it follows you to any device) and on this device. Counted for "you":
// your seat in an online room, or the only human player in a local game.
import { useSyncExternalStore } from 'react';
import type { GameState } from '../engine/types';
import { playerBadges } from '../engine/badges';
import { store } from './store';
import { auth } from '../online/auth';
import { rooms } from '../online/room';
import { supabase } from '../online/client';

export interface Career {
  tournaments: number; titles: number;
  fights: number; fightsWon: number;
  raids: number; raidsWon: number;
  teamBattles: number; teamWins: number;
  mvps: number;
  badges: Record<string, { icon: string; name: string; count: number }>;
  rivals: Record<string, { w: number; l: number }>;
  /** Results already counted, so nothing is counted twice (even across devices). */
  seen: string[];
}

export const EMPTY_CAREER: Career = { tournaments: 0, titles: 0, fights: 0, fightsWon: 0, raids: 0, raidsWon: 0, teamBattles: 0, teamWins: 0, mvps: 0, badges: {}, rivals: {}, seen: [] };

let career: Career = { ...EMPTY_CAREER };
let owner = '';
const listeners = new Set<() => void>();
export const careerStore = { get: () => career, subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; } };
export function useCareer(): Career { return useSyncExternalStore(careerStore.subscribe, careerStore.get); }

const key = (uid: string) => `aa-career:${uid}`;
function readLocal(uid: string): Career {
  try { return { ...EMPTY_CAREER, ...JSON.parse(localStorage.getItem(key(uid)) ?? '{}') }; } catch { return { ...EMPTY_CAREER }; }
}

/** Two records of the same career (this device and the account): keep the larger counts. */
function merge(a: Career, b: Career): Career {
  const max = (k: keyof Career) => Math.max(Number(a[k]) || 0, Number(b[k]) || 0);
  const badges = { ...a.badges };
  for (const [id, x] of Object.entries(b.badges ?? {})) badges[id] = { ...x, count: Math.max(x.count, badges[id]?.count ?? 0) };
  const rivals = { ...a.rivals };
  for (const [n, x] of Object.entries(b.rivals ?? {})) rivals[n] = { w: Math.max(x.w, rivals[n]?.w ?? 0), l: Math.max(x.l, rivals[n]?.l ?? 0) };
  return {
    tournaments: max('tournaments'), titles: max('titles'), fights: max('fights'), fightsWon: max('fightsWon'), raids: max('raids'), raidsWon: max('raidsWon'),
    teamBattles: max('teamBattles'), teamWins: max('teamWins'), mvps: max('mvps'), badges, rivals, seen: [...new Set([...(a.seen ?? []), ...(b.seen ?? [])])].slice(-800),
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function save() {
  listeners.forEach((l) => l());
  try { localStorage.setItem(key(owner), JSON.stringify(career)); } catch { /* storage unavailable */ }
  const uid = auth.get().userId;
  if (!uid || owner !== uid) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void supabase().then((sb) => sb.from('profiles').update({ career }).eq('id', uid)); }, 2500);
}

async function load(uid: string) {
  owner = uid;
  career = readLocal(uid);
  listeners.forEach((l) => l());
  if (uid === 'local') return;
  try {
    const sb = await supabase();
    const { data } = await sb.from('profiles').select('career').eq('id', uid).maybeSingle();
    const remote = (data as { career?: Career } | null)?.career;
    if (remote && owner === uid) { career = merge(career, { ...EMPTY_CAREER, ...remote }); save(); }
  } catch { /* offline: this device's copy */ }
}

/** Who "you" are in this game: your online seat, or the only human in a local game. */
function myPlayer(g: GameState): string | null {
  const r = rooms.get();
  if (r?.myPlayerId) return r.myPlayerId;
  if (r) return null;
  const humans = g.players.filter((p) => p.kind === 'human');
  return humans.length === 1 ? humans[0].id : null;
}

function track() {
  const g = store.getState().game;
  if (!g) return;
  const me = myPlayer(g);
  if (!me) return;
  const seen = new Set(career.seen);
  let changed = false;
  const once = (id: string, fn: () => void) => { if (seen.has(id)) return; seen.add(id); fn(); changed = true; };
  const name = (pid: string) => g.players.find((p) => p.id === pid)?.name ?? 'Someone';

  for (const st of g.tournament?.stages ?? []) for (const m of st.matches) {
    if (!m.winner || !m.players.includes(me)) continue;
    once(`m:${g.id}:${m.id}`, () => {
      const won = m.winner === me;
      const foe = name(m.players.find((p) => p !== me)!);
      career.fights++; if (won) career.fightsWon++;
      const r = career.rivals[foe] ?? { w: 0, l: 0 };
      career.rivals = { ...career.rivals, [foe]: { w: r.w + (won ? 1 : 0), l: r.l + (won ? 0 : 1) } };
    });
  }
  if (g.phase === 'champion' && g.tournament?.championId) {
    once(`t:${g.id}`, () => {
      career.tournaments++;
      if (g.tournament!.championId === me) career.titles++;
      for (const b of playerBadges(g)[me] ?? []) career.badges = { ...career.badges, [b.id]: { icon: b.icon, name: b.name, count: (career.badges[b.id]?.count ?? 0) + 1 } };
    });
  }
  const mine = (pid: string | undefined) => pid === me;
  for (const r of g.raids ?? []) {
    once(`r:${r.id}`, () => {
      career.raids++; if (r.won) career.raidsWon++;
      if (mine(r.contributions.find((c) => c.charId === r.mvp)?.playerId)) career.mvps++;
    });
  }
  for (const t of g.teamBattles ?? []) {
    const myTeam = t.teamA.includes(me) ? 'A' : t.teamB.includes(me) ? 'B' : null;
    if (!myTeam) continue;
    once(`tb:${t.id}`, () => {
      career.teamBattles++; if (t.winner === myTeam) career.teamWins++;
      if (mine(t.contributions.find((c) => c.charId === t.mvp)?.playerId)) career.mvps++;
    });
  }
  if (changed) { career = { ...career, seen: [...seen].slice(-800) }; save(); }
}

if (typeof window !== 'undefined') {
  const who = () => { const a = auth.get(); return a.userId ?? 'local'; };
  void load(who());
  auth.subscribe(() => { if (who() !== owner) void load(who()); });
  store.subscribe(track);
}
