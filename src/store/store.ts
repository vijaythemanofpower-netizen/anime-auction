// App store: current screen, the game, settings. Saves to localStorage after
// every change so a refresh (or a crash) never loses the game.
import { useSyncExternalStore } from 'react';
import { PLAYERS } from '../engine/data/players';
import type { Cricketer } from '../engine/types';
import { autoLineup, createGame, ctxOf, matchSetup, type GameConfig, type GameState, type Lineup } from '../engine/game';
import { closeIfDue, finishAuction, npcStep, openNext, placeBid, scout } from '../engine/auction';
import { playMatch, type Answers, type MatchRecord } from '../engine/match';
import { freshSeed } from '../engine/rng';

export type Screen = 'home' | 'setup' | 'game' | 'howto' | 'roster';

export interface Settings { realNames: boolean; reducedMotion: boolean; sound: boolean; speed: 1 | 2 | 4 }
const DEFAULT_SETTINGS: Settings = { realNames: false, reducedMotion: false, sound: true, speed: 1 };

export interface AppState { screen: Screen; game: GameState | null; settings: Settings }

export const PLAYER_MAP: Record<string, Cricketer> = Object.fromEntries(PLAYERS.map((p) => [p.id, p]));

const KEY = 'cricket-auction:v1';

function load(): AppState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) {
      const s = JSON.parse(raw) as Partial<AppState>;
      const game = s.game && s.game.version === 1 && s.game.poolIds.every((id) => PLAYER_MAP[id]) ? s.game : null;
      return { screen: 'home', game, settings: { ...DEFAULT_SETTINGS, ...(s.settings ?? {}) } };
    }
  } catch { /* corrupt save: start fresh */ }
  return { screen: 'home', game: null, settings: DEFAULT_SETTINGS };
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function set(next: Partial<AppState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
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
  quit() { set({ game: null, screen: 'home' }); },

  // ----- auction
  tick(now = Date.now()) {
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
    const g = state.game;
    if (!g || !g.auction.live) return;
    const a = placeBid(ctxOf(g, PLAYER_MAP), g.auction, fid, now);
    if (a !== g.auction) setGame({ ...g, auction: a });
  },
  scout(fid: string, playerId: string) {
    const g = state.game;
    if (!g) return;
    setGame({ ...g, franchises: scout(g.franchises, fid, playerId) });
  },
  /** Close the current lot now (sold to the top bidder, or unsold). */
  hammer() {
    const g = state.game;
    if (!g?.auction.live) return;
    const a = { ...g.auction, live: { ...g.auction.live, endsAt: 0 } };
    const r = closeIfDue(ctxOf({ ...g, auction: a }, PLAYER_MAP), a, Date.now());
    setGame({ ...g, auction: r.a, franchises: r.franchises });
  },
  /** Let the computer finish the rest of the auction instantly, humans bidding like computer teams. */
  simulateRest() {
    const g = state.game;
    if (!g || g.phase !== 'auction') return;
    const r = simulateAuction(g, Date.now());
    finish(g, r.a, r.franchises);
  },

  // ----- after the auction
  toPrep() {
    const g = state.game;
    if (!g) return;
    const lineups: Record<string, Lineup> = { ...g.lineups };
    for (const f of g.franchises) lineups[f.id] ??= autoLineup(f.squad.map((id) => PLAYER_MAP[id]), g.form);
    setGame({ ...g, phase: 'prep', lineups });
  },
  setLineup(fid: string, l: Lineup) {
    const g = state.game;
    if (!g) return;
    setGame({ ...g, lineups: { ...g.lineups, [fid]: l } });
  },
  startMatch(home: string, away: string) {
    const g = state.game;
    if (!g) return;
    setGame({ ...g, phase: 'match', match: { home, away, seed: freshSeed(), answers: {} } });
  },
  answer(a: Answers) {
    const g = state.game;
    if (!g?.match) return;
    setGame({ ...g, match: { ...g.match, answers: { ...g.match.answers, ...a } } });
  },
  endMatch() {
    const g = state.game;
    if (!g) return;
    setGame({ ...g, phase: 'done' });
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
