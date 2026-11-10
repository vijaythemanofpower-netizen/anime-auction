// App store: current screen, the game, settings. Saves to localStorage after
// every change so a refresh (or a crash) never loses the game.
import { useSyncExternalStore } from 'react';
import { PLAYERS } from '../engine/data/players';
import type { Cricketer } from '../engine/types';
import { autoLineup, createGame, ctxOf, matchSetup, type GameConfig, type GameState, type Lineup } from '../engine/game';
import { closeIfDue, finishAuction, npcStep, openNext, placeBid, scout } from '../engine/auction';
import { autoPlay, playMatch, type Answers, type MatchRecord } from '../engine/match';
import { deriveSeed, freshSeed } from '../engine/rng';
import { openRoom, roomCode, sayHello, sendAct, sendState, type Act } from '../online/room';
import { makeSeason, nextFixture, record, resultOf } from '../engine/season';

export type Screen = 'home' | 'setup' | 'game' | 'howto' | 'roster';

export interface Settings { realNames: boolean; reducedMotion: boolean; sound: boolean; speed: 1 | 2 | 4 }
const DEFAULT_SETTINGS: Settings = { realNames: false, reducedMotion: false, sound: true, speed: 1 };

export interface Online { role: 'off' | 'host' | 'guest'; code: string; me: string | null; error?: string }
const OFFLINE: Online = { role: 'off', code: '', me: null };
export interface AppState { screen: Screen; game: GameState | null; settings: Settings; online: Online }

export const PLAYER_MAP: Record<string, Cricketer> = Object.fromEntries(PLAYERS.map((p) => [p.id, p]));

const KEY = 'cricket-auction:v1';

function load(): AppState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) {
      const s = JSON.parse(raw) as Partial<AppState>;
      const game = s.game && s.game.version === 1 && s.game.poolIds.every((id) => PLAYER_MAP[id]) ? s.game : null;
      return { screen: 'home', game, settings: { ...DEFAULT_SETTINGS, ...(s.settings ?? {}) }, online: OFFLINE };
    }
  } catch { /* corrupt save: start fresh */ }
  return { screen: 'home', game: null, settings: DEFAULT_SETTINGS, online: OFFLINE };
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function set(next: Partial<AppState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
  if (state.online.role === 'host' && 'game' in next) sendState(state.game);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ game: state.game, settings: state.settings })); } catch { /* storage full */ }
  }, 250);
}

const setGame = (g: GameState) => {
  // A new phase starts at the top of the page.
  if (state.game && g.phase !== state.game.phase && typeof window !== 'undefined') window.scrollTo({ top: 0 });
  set({ game: g });
};

/** Match records are recomputed from the seed and answers, and cached. */
let matchCache: { key: string; rec: MatchRecord } | null = null;

export const store = {
  get: () => state,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  go(screen: Screen) { set({ screen }); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); },
  settings(p: Partial<Settings>) { set({ settings: { ...state.settings, ...p } }); },

  newGame(cfg: Omit<GameConfig, 'seed'>) {
    const g = createGame({ ...cfg, seed: freshSeed() }, PLAYERS, Date.now());
    set({ game: g, screen: 'game' });
  },
  resume() { if (state.game) set({ screen: 'game' }); },
  quit() { set({ game: null, screen: 'home', online: OFFLINE }); },

  // ----- online rooms
  /** Host: open a room for the current game; the host plays as the first human. */
  async hostRoom() {
    const g = state.game;
    if (!g) return;
    const code = roomCode();
    set({ online: { role: 'host', code, me: g.config.humans[0]?.id ?? null } });
    try {
      await openRoom(code, { act: applyAct, hello: () => sendState(state.game) });
      sendState(state.game);
    } catch (e) { set({ online: { ...state.online, error: (e as Error).message } }); }
  },
  async joinRoom(code: string) {
    const c = code.trim().toUpperCase();
    set({ online: { role: 'guest', code: c, me: null }, game: null });
    try {
      await openRoom(c, { state: (g) => set({ game: g as GameState, screen: 'game' }) });
      sayHello();
    } catch (e) { set({ online: { ...state.online, error: (e as Error).message } }); }
  },
  /** Guest: which player in the room this device is. */
  setMe(id: string) { set({ online: { ...state.online, me: id } }); },

  // ----- auction
  tick(now = Date.now()) {
    if (state.online.role === 'guest') return;
    const g = state.game;
    if (!g || g.phase !== 'auction' || g.auction.done) return;
    let a = g.auction;
    let franchises = g.franchises;
    const ctx = () => ctxOf({ ...g, franchises }, PLAYER_MAP);
    if (!a.live) {
      if (now < a.gapUntil) return;
      a = openNext(ctx(), a, now);
      if (a.done) { finish(g, a, franchises); return; }
    } else {
      a = npcStep(ctx(), a, now);
      const r = closeIfDue(ctx(), a, now);
      a = r.a; franchises = r.franchises;
    }
    if (a !== g.auction || franchises !== g.franchises) setGame({ ...g, auction: a, franchises });
  },
  bid(fid: string, now = Date.now()) {
    if (guest('bid', [fid])) return;
    const g = state.game;
    if (!g || !g.auction.live) return;
    const a = placeBid(ctxOf(g, PLAYER_MAP), g.auction, fid, now);
    if (a !== g.auction) setGame({ ...g, auction: a });
  },
  scout(fid: string, playerId: string) {
    if (guest('scout', [fid, playerId])) return;
    const g = state.game;
    if (!g) return;
    setGame({ ...g, franchises: scout(g.franchises, fid, playerId) });
  },
  /** Close the current lot now (sold to the top bidder, or unsold). */
  hammer() {
    if (state.online.role === 'guest') return;
    const g = state.game;
    if (!g?.auction.live) return;
    const a = { ...g.auction, live: { ...g.auction.live, endsAt: 0 } };
    const r = closeIfDue(ctxOf({ ...g, auction: a }, PLAYER_MAP), a, Date.now());
    setGame({ ...g, auction: r.a, franchises: r.franchises });
  },
  /** Let the computer finish the rest of the auction instantly, humans bidding like computer teams. */
  simulateRest() {
    if (state.online.role === 'guest') return;
    const g = state.game;
    if (!g || g.phase !== 'auction') return;
    const r = simulateAuction(g, Date.now());
    finish(g, r.a, r.franchises);
  },

  // ----- after the auction
  toPrep() {
    if (guest('toPrep', [])) return;
    const g = state.game;
    if (!g) return;
    const lineups: Record<string, Lineup> = { ...g.lineups };
    for (const f of g.franchises) lineups[f.id] ??= autoLineup(f.squad.map((id) => PLAYER_MAP[id]), g.form);
    setGame({ ...g, phase: 'prep', lineups, season: g.season ?? makeSeason(g.franchises.map((f) => f.id)) });
  },
  setLineup(fid: string, l: Lineup) {
    if (guest('setLineup', [fid, l])) return;
    const g = state.game;
    if (!g) return;
    setGame({ ...g, lineups: { ...g.lineups, [fid]: l } });
  },
  startMatch(home: string, away: string) {
    const g = state.game;
    if (!g) return;
    setGame({ ...g, phase: 'match', match: { home, away, seed: freshSeed(), answers: {} } });
  },
  /** Season: simulate computer-only fixtures, then start the next fixture a human plays in. */
  playNext() {
    if (guest('playNext', [])) return;
    let g = state.game;
    if (!g) return;
    const ids = g.franchises.map((f) => f.id);
    let s = g.season ?? makeSeason(ids);
    const human = (id: string) => !g!.franchises.find((f) => f.id === id)!.npc;
    for (let guard = 0; guard < 200; guard++) {
      const fx = nextFixture(s);
      if (!fx) break;
      if (human(fx.home) || human(fx.away)) {
        setGame({ ...g, season: s, phase: 'match', match: { home: fx.home, away: fx.away, seed: freshSeed(), answers: {}, fixture: fx.id, final: fx.stage === 'final' } });
        return;
      }
      const seed = deriveSeed(g.config.seed, fx.id);
      const sim = { ...g, match: { home: fx.home, away: fx.away, seed, answers: {}, final: fx.stage === 'final' } };
      const rec = autoPlay(matchSetup(sim, PLAYER_MAP, fx.home, fx.away, seed));
      s = record(s, fx.id, resultOf(rec, fx.home, fx.away), ids);
    }
    g = { ...g, season: s };
    setGame(s.champion ? { ...g, phase: 'done', match: undefined } : g);
  },
  answer(a: Answers) {
    if (guest('answer', [a])) return;
    const g = state.game;
    if (!g?.match) return;
    setGame({ ...g, match: { ...g.match, answers: { ...g.match.answers, ...a } } });
  },
  /** Record the finished match in the season and go back to the season hub (or the trophy). */
  endMatch() {
    if (guest('endMatch', [])) return;
    const g = state.game;
    if (!g?.match) return;
    const rec = currentMatch(g);
    let season = g.season;
    if (season && g.match.fixture && rec?.outcome) {
      season = record(season, g.match.fixture, resultOf(rec, g.match.home, g.match.away), g.franchises.map((f) => f.id));
    }
    matchCache = null;
    setGame({ ...g, season, match: undefined, phase: season?.champion ? 'done' : 'prep' });
  },
  rematch() {
    const g = state.game;
    if (!g) return;
    setGame({ ...g, phase: 'prep', match: undefined });
  },
};

export function simulateAuction(g: GameState, start: number) {
  let now = start;
  let a = g.auction;
  let franchises = g.franchises;
  for (let guard = 0; guard < 40000 && !a.done; guard++) {
    const ctx = ctxOf({ ...g, franchises }, PLAYER_MAP);
    if (!a.live) { a = openNext(ctx, { ...a, gapUntil: 0 }, now); continue; }
    const cx = { ...ctx, franchises: franchises.map((f) => ({ ...f, npc: true })) };
    a = npcStep(cx, a, now);
    now += 700;
    const r = closeIfDue(ctx, a, now);
    a = r.a; franchises = r.franchises;
  }
  return { a, franchises };
}

function finish(g: GameState, a: GameState['auction'], franchises: GameState['franchises']) {
  const ctx = ctxOf({ ...g, franchises }, PLAYER_MAP);
  const done = finishAuction(ctx, a, g.poolIds);
  setGame({ ...g, auction: { ...a, done: true, live: null }, franchises: done, phase: 'reveal' });
}

/** The current match record (recomputed when the answers change). */
export function currentMatch(g: GameState): MatchRecord | null {
  if (!g.match) return null;
  const real = state.settings.realNames;
  const key = `${g.id}|${g.match.seed}|${real}|${JSON.stringify(g.match.answers)}|${JSON.stringify([g.lineups[g.match.home], g.lineups[g.match.away]])}`;
  if (matchCache?.key === key) return matchCache.rec;
  const setup = matchSetup(g, PLAYER_MAP, g.match.home, g.match.away, g.match.seed);
  // Real names (a host setting) only change what the commentary says.
  if (real) for (const id of Object.keys(setup.players)) setup.players[id] = { ...setup.players[id], name: setup.players[id].realName };
  const rec = playMatch(setup, g.match.answers);
  matchCache = { key, rec };
  return rec;
}

export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(state), () => sel(state));
}

/** Name shown for a player: name-alike by default, the real name if this host turned it on. */
export function displayName(c: Cricketer | undefined): string {
  if (!c) return '?';
  return state.settings.realNames ? c.realName : c.name;
}

/** Guest devices forward moves to the host instead of applying them. */
function guest(name: string, args: unknown[]): boolean {
  if (state.online.role !== 'guest') return false;
  if (state.online.me) sendAct({ name, args, me: state.online.me });
  return true;
}

/** Owners of a franchise (guests may only move for their own team). */
const owns = (me: string, fid: unknown) => !!state.game?.franchises.find((f) => f.id === fid)?.owners.includes(me);

/** Host: check a guest's move and apply it. */
function applyAct(a: Act) {
  const g = state.game;
  if (!g || typeof a?.me !== 'string' || !g.config.humans.some((h) => h.id === a.me) || !Array.isArray(a.args)) return;
  const [x, y] = a.args;
  switch (a.name) {
    case 'bid': if (owns(a.me, x)) store.bid(x as string); break;
    case 'scout': if (owns(a.me, x) && typeof y === 'string') store.scout(x as string, y); break;
    case 'setLineup': if (owns(a.me, x) && y && typeof y === 'object') store.setLineup(x as string, y as Lineup); break;
    case 'answer': {
      // Only answers to this guest's own pending decisions.
      const rec = currentMatch(g);
      if (!rec || !g.match || !x || typeof x !== 'object') break;
      const mine = (rec.pending ?? []).filter((d) => owns(a.me, d.team === 0 ? g.match!.home : g.match!.away));
      const ok = Object.fromEntries(Object.entries(x as Answers).filter(([k, v]) => typeof v === 'string' && mine.some((d) => d.id === k)));
      if (Object.keys(ok).length) store.answer(ok);
      break;
    }
    case 'toPrep': case 'playNext': case 'endMatch': store[a.name](); break;
  }
}

/** Can this device act for this franchise? Everyone can on a shared device; online, only its owners. */
export function canAct(fid: string): boolean {
  const o = state.online;
  return o.role === 'off' || (!!o.me && owns(o.me, fid));
}

// Dev only: inspect the live store from the browser console (dynamic import() would load a second copy).
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __store: typeof store }).__store = store;
