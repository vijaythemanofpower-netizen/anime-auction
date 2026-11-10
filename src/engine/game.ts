// A game: who plays, the franchises, the auction, then the match. Pure.
import { Rng, deriveSeed } from './rng';
import type { Cricketer, Form } from './types';
import { canBowl, isPace, isSpin } from './types';
import { PURSE, RULES, type SquadMode } from './squad';
import { buildQueue, newAuction, type AuctionCtx, type AuctionState, type Franchise } from './auction';
import { batValue, bowlValue, type MatchSetup, type Plan, type TeamSheet } from './match';

/**
 * Team modes:
 * - solo: every human owns a franchise; computer teams fill seats.
 * - pairs: humans team up two (or three) to a franchise, sharing purse and squad.
 * - handicap: one human alone against a partnership (1v2 or 1v3), with extra purse and scouts.
 * - boss: 1v4 — four friends share one franchise against a single Boss NPC with a war chest.
 */
export type TeamMode = 'solo' | 'pairs' | 'handicap' | 'boss';

export interface Human { id: string; name: string; color: string }

export interface GameConfig {
  humans: Human[];
  teamMode: TeamMode;
  /** pairs: 2 or 3 owners per franchise. */
  partnerSize?: 2 | 3;
  /** Computer franchises added in solo mode. */
  npcs: number;
  mode: SquadMode;
  timer: number;
  mystery: boolean;
  realNames: boolean;
  seed: number;
  /** Overs per innings (default 20). */
  overs?: 5 | 10 | 20;
  /** Play every ball (bat and bowl yourself) instead of only making captain's calls. Default true. */
  play?: boolean;
}

export type Phase = 'auction' | 'reveal' | 'prep' | 'match' | 'done';

/** Captain roles inside a shared franchise. */
export type CaptainRole = 'bat' | 'bowl' | 'drs' | 'mind';
export const ROLE_LABEL: Record<CaptainRole, string> = { bat: 'Batting captain', bowl: 'Bowling captain', drs: 'DRS & strategy', mind: 'Mind games & sledging' };

export interface Lineup { xi: string[]; bench: string[]; captain: string; keeper: string; plan: Plan; bowlers: string[] }

export interface GameState {
  id: string;
  version: 1;
  createdAt: number;
  config: GameConfig;
  phase: Phase;
  poolIds: string[];
  form: Record<string, Form>;
  franchises: Franchise[];
  auction: AuctionState;
  /** Owner id -> captain role, for shared franchises. */
  roles: Record<string, CaptainRole[]>;
  lineups: Record<string, Lineup>;
  /** The match being played: franchise ids, seed and answers so far. */
  match?: { home: string; away: string; seed: number; answers: Record<string, string> };
}

export const FRANCHISE_NAMES: Array<{ name: string; short: string; color: string }> = [
  { name: 'Coastal Cyclones', short: 'CYC', color: '#38bdf8' },
  { name: 'Desert Falcons', short: 'FAL', color: '#f59e0b' },
  { name: 'Highland Tuskers', short: 'TUS', color: '#a3e635' },
  { name: 'Monsoon Mavericks', short: 'MAV', color: '#22d3ee' },
  { name: 'Riverside Royals', short: 'RIV', color: '#c084fc' },
  { name: 'Thunder Bay Strikers', short: 'STR', color: '#f43f5e' },
  { name: 'Spice Coast Panthers', short: 'PAN', color: '#fb923c' },
  { name: 'Northern Nawabs', short: 'NAW', color: '#34d399' },
];

const NPC_NAMES = ['Auction Bot Arjun', 'Scout Sharma', 'Trader Tara', 'Moneyball Mani'];

/** The NPC's advantage in each handicap. */
export const HANDICAP = {
  /** One human against two: 1.5x purse, +2 scouts. */
  vs2: { purse: 1.5, scouts: 2 },
  /** One human against three: 2x purse, +3 scouts, and a free first pick at base price. */
  vs3: { purse: 2, scouts: 3 },
  /** Boss NPC against four friends: 2.5x purse, +4 scouts. */
  boss: { purse: 2.5, scouts: 4 },
};

/** Pick the auction pool: enough players for every squad plus spares, balanced by role and tier. */
export function choosePool(all: Cricketer[], teams: number, mode: SquadMode, seed: number): Cricketer[] {
  const r = RULES[mode];
  const need = teams * (r.size + r.autoFill);
  const size = Math.min(all.length, Math.max(need + 12, Math.round(need * 1.6)));
  const rng = new Rng(deriveSeed(seed, 'pool'));
  // Stars always appear; the rest is a weighted draw that keeps every role available.
  const stars = all.filter((c) => c.tier >= 4);
  const rest = rng.shuffle(all.filter((c) => c.tier < 4));
  const picked = rng.shuffle(stars).slice(0, Math.round(size * 0.3));
  const quota: Record<string, number> = { keeper: 0.1, opener: 0.13, middle: 0.13, finisher: 0.1, allrounder: 0.17, pace: 0.21, spin: 0.16 };
  for (const role of Object.keys(quota)) {
    const want = Math.round(size * quota[role]) - picked.filter((c) => c.role === role).length;
    picked.push(...rest.filter((c) => c.role === role && !picked.includes(c)).slice(0, Math.max(0, want)));
  }
  const unc = picked.filter((c) => c.uncapped).length;
  picked.push(...rest.filter((c) => c.uncapped && !picked.includes(c)).slice(0, Math.max(0, teams * 3 + 2 - unc)));
  for (const c of rest) { if (picked.length >= size) break; if (!picked.includes(c)) picked.push(c); }
  return picked;
}

export function rollForm(pool: Cricketer[], seed: number): Record<string, Form> {
  const rng = new Rng(deriveSeed(seed, 'form'));
  const out: Record<string, Form> = {};
  for (const c of pool) out[c.id] = rng.weighted<Form>([1, 0, -1], [28, 50, 22]);
  return out;
}

export function createGame(cfg: GameConfig, all: Cricketer[], now: number): GameState {
  const rng = new Rng(deriveSeed(cfg.seed, 'setup'));
  const names = rng.shuffle(FRANCHISE_NAMES);
  const basePurse = PURSE[cfg.mode];
  const franchises: Franchise[] = [];
  const roles: Record<string, CaptainRole[]> = {};
  const make = (owners: string[], npc: boolean, purseX = 1, scouts = 2, boss = false): Franchise => {
    const n = names[franchises.length % names.length];
    const human = owners.length ? cfg.humans.find((h) => h.id === owners[0]) : undefined;
    const name = npc ? (boss ? 'The Boss XI' : n.name) : owners.length > 1 ? n.name : n.name;
    return {
      id: `f${franchises.length}`, name, short: boss ? 'BOS' : n.short, color: boss ? '#ef4444' : human?.color ?? n.color, owners, npc, boss,
      purse: Math.round(basePurse * purseX), startPurse: Math.round(basePurse * purseX), squad: [], paid: {}, scouts, scouted: [], penalties: [],
    };
  };
  const ids = cfg.humans.map((h) => h.id);
  const assignRoles = (owners: string[]) => {
    const order: CaptainRole[] = ['bat', 'bowl', 'drs', 'mind'];
    owners.forEach((o, i) => { roles[o] = owners.length === 1 ? order : order.filter((_, k) => k % owners.length === i); });
  };
  if (cfg.teamMode === 'boss') {
    // 1v4: all humans in one franchise against the Boss NPC.
    franchises.push(make(ids, false, 1, 2));
    franchises.push(make([], true, HANDICAP.boss.purse, 2 + HANDICAP.boss.scouts, true));
    assignRoles(ids);
  } else if (cfg.teamMode === 'pairs') {
    const k = cfg.partnerSize ?? 2;
    for (let i = 0; i < ids.length; i += k) { const o = ids.slice(i, i + k); franchises.push(make(o, false)); assignRoles(o); }
    for (let i = 0; i < cfg.npcs; i++) franchises.push(make([], true));
  } else if (cfg.teamMode === 'handicap') {
    const [solo, ...rest] = ids;
    const h = rest.length >= 3 ? HANDICAP.vs3 : HANDICAP.vs2;
    franchises.push(make([solo], false, h.purse, 2 + h.scouts));
    franchises.push(make(rest, false));
    assignRoles([solo]); assignRoles(rest);
  } else {
    for (const id of ids) { franchises.push(make([id], false)); assignRoles([id]); }
    for (let i = 0; i < cfg.npcs; i++) franchises.push(make([], true));
    if (franchises.length < 2) franchises.push(make([], true));
  }
  franchises.forEach((f, i) => { if (f.npc && !f.boss) f.name = `${f.name}`; void i; });
  const pool = choosePool(all, franchises.length, cfg.mode, cfg.seed);
  const form = rollForm(pool, cfg.seed);
  let mystery: string | null = null;
  if (cfg.mystery) {
    // Star or flop, decided now and hidden until the hammer falls.
    const star = rng.chance(0.5);
    // Domestic players only, so the hidden lot can never break anyone's overseas cap.
    const cands = pool.filter((c) => (star ? c.tier >= 4 && form[c.id] >= 0 : c.tier <= 2 && form[c.id] <= 0) && !c.uncapped && !c.overseas);
    mystery = cands.length ? rng.pick(cands).id : null;
  }
  const queue = buildQueue(pool, cfg.seed, mystery);
  return {
    id: `g${cfg.seed.toString(36)}`, version: 1, createdAt: now, config: cfg, phase: 'auction', poolIds: pool.map((c) => c.id), form, franchises,
    auction: newAuction(queue, cfg.timer, Math.max(4, Math.round(cfg.timer * 0.5))), roles, lineups: {},
  };
}

export function ctxOf(g: GameState, players: Record<string, Cricketer>): AuctionCtx {
  return { seed: g.config.seed, mode: g.config.mode, players, form: g.form, franchises: g.franchises };
}

export { NPC_NAMES };

// ------------------------------------------------------------------ XI

const formAdj = (form: Record<string, Form>, id: string) => (form[id] ?? 0) * 6;

/** Pick a sensible XI, batting order and bowling plan from a squad. */
export function autoLineup(squad: Cricketer[], form: Record<string, Form>, maxOverseas = 4, unavailable: string[] = []): Lineup {
  const pool = squad.filter((c) => !unavailable.includes(c.id));
  const val = (c: Cricketer) => Math.max(batValue(c), bowlValue(c) * 1.02) + (c.role === 'allrounder' ? (batValue(c) + bowlValue(c)) * 0.15 : 0) + formAdj(form, c.id);
  const xi: Cricketer[] = [];
  let os = 0;
  const add = (c: Cricketer | undefined) => { if (!c || xi.includes(c) || (c.overseas && os >= maxOverseas)) return false; xi.push(c); if (c.overseas) os++; return true; };
  const best = (pred: (c: Cricketer) => boolean) => pool.filter((c) => pred(c) && !xi.includes(c) && !(c.overseas && os >= maxOverseas)).sort((a, b) => val(b) - val(a))[0];
  add(best((c) => c.role === 'keeper'));
  for (let i = 0; i < 2; i++) add(best((c) => isPace(c) && c.role === 'pace'));
  add(best((c) => isSpin(c) && c.role === 'spin'));
  // Need five bowling options.
  while (xi.filter(canBowl).length < 5 && add(best((c) => canBowl(c)))) { /* bowlers */ }
  while (xi.filter((c) => batValue(c) >= 55).length < 6 && add(best((c) => batValue(c) >= 55))) { /* batters */ }
  while (xi.length < 11 && add(best(() => true))) { /* rest */ }
  const order = xi.slice().sort((a, b) => battingSlot(a) - battingSlot(b) || batValue(b) - batValue(a));
  const bench = pool.filter((c) => !xi.includes(c)).sort((a, b) => val(b) - val(a)).map((c) => c.id);
  const bowlers = xi.filter(canBowl).sort((a, b) => bowlValue(b) - bowlValue(a)).map((c) => c.id);
  const captain = xi.slice().sort((a, b) => b.captaincy - a.captaincy)[0];
  const keeper = xi.find((c) => c.role === 'keeper') ?? xi.slice().sort((a, b) => (b.keeping ?? b.fielding / 2) - (a.keeping ?? a.fielding / 2))[0];
  return { xi: order.map((c) => c.id), bench, captain: captain.id, keeper: keeper.id, plan: 'balanced', bowlers };
}

/** Rough batting position: openers first, then middle, keeper, finisher, all-rounders, bowlers. */
export function battingSlot(c: Cricketer): number {
  const b = batValue(c);
  const base = { opener: 1, middle: 3, keeper: 4, finisher: 5, allrounder: 6, pace: 9, spin: 9 }[c.role];
  return base - (c.role === 'pace' || c.role === 'spin' ? b / 50 : 0);
}

export function lineupProblems(l: Lineup, players: Record<string, Cricketer>, maxOverseas = 4): string[] {
  const out: string[] = [];
  const xi = l.xi.map((id) => players[id]);
  if (xi.length !== 11) out.push(`Pick 11 players (you have ${xi.length}).`);
  if (xi.filter((c) => c?.overseas).length > maxOverseas) out.push(`At most ${maxOverseas} overseas players in the XI.`);
  if (xi.filter((c) => c && canBowl(c)).length < 5) out.push('You need at least five players who can bowl.');
  if (!l.xi.includes(l.keeper)) out.push('Choose a wicketkeeper from the XI.');
  if (!l.xi.includes(l.captain)) out.push('Choose a captain from the XI.');
  return out;
}

export function sheetFor(f: Franchise, l: Lineup, human: boolean): TeamSheet {
  return { name: f.name, short: f.short, color: f.color, xi: l.xi, bench: l.bench, captain: l.captain, keeper: l.keeper, plan: l.plan, control: human ? 'human' : 'cpu', bowlers: l.bowlers };
}

export function matchSetup(g: GameState, players: Record<string, Cricketer>, homeId: string, awayId: string, seed: number): MatchSetup {
  const home = g.franchises.find((f) => f.id === homeId)!;
  const away = g.franchises.find((f) => f.id === awayId)!;
  const lh = g.lineups[homeId] ?? autoLineup(home.squad.map((id) => players[id]), g.form);
  const la = g.lineups[awayId] ?? autoLineup(away.squad.map((id) => players[id]), g.form);
  const used = new Set([...home.squad, ...away.squad]);
  const sub: Record<string, Cricketer> = {};
  for (const id of used) sub[id] = players[id];
  return {
    id: `${g.id}-${homeId}-${awayId}-${seed}`, seed, overs: g.config.overs ?? 20, play: g.config.play ?? true, teams: [sheetFor(home, lh, !home.npc), sheetFor(away, la, !away.npc)], players: sub, form: g.form, reviews: 2,
  };
}
