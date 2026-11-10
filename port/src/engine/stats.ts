// Player statistics, as pure functions: what a finished match adds to someone's record, what that
// record says about them (strengths, weaknesses, picks, rivals), and how players rank against each
// other. Reading and saving the record is store/career.ts; the screen is ui/screens/Leaderboards.tsx.
import type { BattleMode, BattleRecord, GameState, MentalApproach, Strategy } from './types';

export interface WL { w: number; l: number }
export interface Pick extends WL { bought: number; paid: number }

/** The detailed record. Starts empty for everyone the day it was added. */
export interface Lab {
  picks: Record<string, Pick>;
  foes: Record<string, WL>;
  arenas: Record<string, WL>;
  modes: Record<string, WL>;
  strategies: Record<string, WL>;
  mentals: Record<string, WL>;
  series: Record<string, WL>;
  roles: Record<string, WL>;
  streak: number;
  bestStreak: number;
  lots: number;
  spent: number;
  biggestBuy: { name: string; price: number } | null;
  bounties: number;
  betsWon: number;
  betsLost: number;
}

export const emptyLab = (): Lab => ({
  picks: {}, foes: {}, arenas: {}, modes: {}, strategies: {}, mentals: {}, series: {}, roles: {},
  streak: 0, bestStreak: 0, lots: 0, spent: 0, biggestBuy: null, bounties: 0, betsWon: 0, betsLost: 0,
});

export interface MatchFacts {
  won: boolean;
  mode: BattleMode;
  arena: string;
  strategy: Strategy;
  mental: MentalApproach;
  /** My fighters and theirs, by name. */
  mine: Array<{ name: string; series: string; role: string }>;
  theirs: string[];
}

/** What one finished match adds to your record. */
export function factsFor(g: GameState, rec: BattleRecord, me: string): MatchFacts | null {
  const i = rec.input.sides.findIndex((s) => s.playerId === me);
  if (i < 0) return null;
  const mine = rec.input.sides[i], theirs = rec.input.sides[1 - i];
  return {
    won: rec.result.winnerSide === i, mode: rec.input.mode, arena: rec.input.environmentId, strategy: mine.strategy, mental: mine.mental,
    mine: mine.fighters.map((f) => ({ name: g.characters[f.charId]?.name ?? f.name, series: g.characters[f.charId]?.series ?? 'Unknown', role: f.archetype })),
    theirs: theirs.fighters.map((f) => g.characters[f.charId]?.name ?? f.name),
  };
}

const tally = (map: Record<string, WL>, key: string, won: boolean) => {
  const x = map[key] ?? { w: 0, l: 0 };
  map[key] = { ...x, w: x.w + (won ? 1 : 0), l: x.l + (won ? 0 : 1) };
};

/** Returns a new record with one more match in it. */
export function addMatch(lab: Lab, f: MatchFacts): Lab {
  const n = structuredClone(lab);
  for (const m of f.mine) {
    const p = n.picks[m.name] ?? { w: 0, l: 0, bought: 0, paid: 0 };
    n.picks[m.name] = { ...p, w: p.w + (f.won ? 1 : 0), l: p.l + (f.won ? 0 : 1) };
    tally(n.roles, m.role, f.won);
  }
  for (const s of new Set(f.mine.map((m) => m.series))) tally(n.series, s, f.won);
  for (const name of f.theirs) tally(n.foes, name, f.won);
  tally(n.arenas, f.arena, f.won);
  tally(n.modes, f.mode, f.won);
  tally(n.strategies, f.strategy, f.won);
  tally(n.mentals, f.mental, f.won);
  n.streak = f.won ? n.streak + 1 : 0;
  n.bestStreak = Math.max(n.bestStreak, n.streak);
  return n;
}

/** Returns a new record with one finished auction in it. */
export function addAuction(lab: Lab, buys: Array<{ name: string; price: number }>): Lab {
  const n = structuredClone(lab);
  for (const b of buys) {
    const p = n.picks[b.name] ?? { w: 0, l: 0, bought: 0, paid: 0 };
    n.picks[b.name] = { ...p, bought: p.bought + 1, paid: p.paid + b.price };
    n.lots++;
    n.spent += b.price;
    if (!n.biggestBuy || b.price > n.biggestBuy.price) n.biggestBuy = { name: b.name, price: b.price };
  }
  return n;
}

/** The same career from two devices: keep the larger count everywhere. */
export function mergeLab(a: Lab, b: Lab): Lab {
  const maxDeep = <T,>(x: T, y: T): T => {
    if (typeof x === 'number' && typeof y === 'number') return Math.max(x, y) as T;
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      const out: Record<string, unknown> = { ...(x as Record<string, unknown>) };
      for (const [k, v] of Object.entries(y as Record<string, unknown>)) out[k] = k in out ? maxDeep(out[k], v) : v;
      return out as T;
    }
    return x ?? y;
  };
  const { biggestBuy: bx, ...ax } = { ...emptyLab(), ...a };
  const { biggestBuy: by, ...ay } = { ...emptyLab(), ...b };
  return { ...maxDeep(ax, ay), biggestBuy: (bx?.price ?? -1) >= (by?.price ?? -1) ? bx : by };
}

export const games = (x: WL | undefined) => (x ? x.w + x.l : 0);
export const rate = (x: WL) => (games(x) ? x.w / games(x) : 0);
export const pct = (x: WL) => Math.round(rate(x) * 100);

/** The career fields the report and the boards read. */
export interface PlayerRecord {
  tournaments: number; titles: number;
  fights: number; fightsWon: number;
  raids: number; raidsWon: number;
  teamBattles: number; teamWins: number;
  mvps: number;
  badges: number;
  rivals: Record<string, WL>;
  lab: Lab;
}

export interface Insight { label: string; detail: string; rate: number }
export interface Line extends WL { name: string; pct: number }
export interface Report {
  good: Insight[];
  bad: Insight[];
  alwaysPick: (Line & { bought: number; paid: number }) | null;
  bestFighter: Line | null;
  worstFighter: Line | null;
  bestRivalry: Line | null;
  bestWinChance: Line | null;
  worstWinChance: Line | null;
  nemesisFighter: Line | null;
  easiestFighter: Line | null;
  bestArena: Line | null;
  worstArena: Line | null;
  bestSeries: Line | null;
  bestStrategy: Line | null;
}

/** Fewer games than this says nothing about someone. */
export const MIN_GAMES = 3;

const MODE_NAME: Record<string, string> = { solo: '1v1 duels', tag: '2v2 tag team', squad: 'Squad fights' };

const line = (name: string, x: WL): Line => ({ name, w: x.w, l: x.l, pct: pct(x) });
const lines = (map: Record<string, WL>, min = MIN_GAMES) => Object.entries(map).filter(([, x]) => games(x) >= min).map(([k, x]) => line(k, x));
/** Best first; among equals, the larger sample. */
const best = (xs: Line[]) => [...xs].sort((a, b) => b.pct - a.pct || games(b) - games(a))[0] ?? null;
const worst = (xs: Line[]) => [...xs].sort((a, b) => a.pct - b.pct || games(b) - games(a))[0] ?? null;

/** What someone is good and bad at, and their picks and rivals. Needs a few games to say anything. */
export function reportFor(r: PlayerRecord, nameOf: (arenaId: string) => string = (x) => x): Report {
  const lab = { ...emptyLab(), ...r.lab };
  const skills: Insight[] = [];
  const add = (label: string, x: WL, what = 'won') => { if (games(x) >= MIN_GAMES) skills.push({ label, detail: `${x.w} of ${games(x)} ${what}`, rate: rate(x) }); };
  for (const [k, x] of Object.entries(lab.modes)) add(MODE_NAME[k] ?? k, x);
  add('Boss raids', { w: r.raidsWon, l: r.raids - r.raidsWon });
  add('Team battles', { w: r.teamWins, l: r.teamBattles - r.teamWins });
  add('Calling fight bets', { w: lab.betsWon, l: lab.betsLost }, 'called');
  add('Winning tournaments', { w: r.titles, l: r.tournaments - r.titles });
  for (const [k, x] of Object.entries(lab.arenas)) add(`Fighting in ${nameOf(k)}`, x);
  for (const [k, x] of Object.entries(lab.strategies)) add(`The ${k} strategy`, x);
  for (const [k, x] of Object.entries(lab.series)) add(`${k} fighters`, x);
  const sorted = [...skills].sort((a, b) => b.rate - a.rate);
  const good = sorted.filter((s) => s.rate >= 0.5).slice(0, 4);
  const bad = sorted.filter((s) => s.rate < 0.5).reverse().slice(0, 4);

  const fighters = lines(lab.picks);
  const picked = Object.entries(lab.picks).map(([k, p]) => ({ ...line(k, p), bought: p.bought, paid: p.paid })).sort((a, b) => games(b) - games(a) || b.bought - a.bought);
  const rivals = Object.entries(r.rivals ?? {}).filter(([, x]) => games(x) >= 2).map(([k, x]) => line(k, x));
  const foes = lines(lab.foes);
  const arenas = lines(lab.arenas).map((a) => ({ ...a, name: nameOf(a.name) }));
  return {
    good, bad,
    alwaysPick: picked[0] ?? null,
    bestFighter: best(fighters), worstFighter: fighters.length > 1 ? worst(fighters) : null,
    bestRivalry: [...rivals].sort((a, b) => games(b) - games(a))[0] ?? null,
    bestWinChance: best(rivals), worstWinChance: rivals.length > 1 ? worst(rivals) : null,
    nemesisFighter: worst(foes), easiestFighter: foes.length > 1 ? best(foes) : null,
    bestArena: best(arenas), worstArena: arenas.length > 1 ? worst(arenas) : null,
    bestSeries: best(lines(lab.series)), bestStrategy: best(lines(lab.strategies)),
  };
}

export interface Row { id: string; name: string; record: PlayerRecord }
export interface Ranked { id: string; name: string; value: number; shown: string; sub: string }

export interface Board { id: string; title: string; group: string; hint: string; value: (r: PlayerRecord) => number | null; shown?: (v: number, r: PlayerRecord) => string; sub?: (r: PlayerRecord) => string }

const money = (v: number) => v.toLocaleString();
const percent = (v: number) => `${Math.round(v * 100)}%`;
const lab = (r: PlayerRecord) => ({ ...emptyLab(), ...r.lab });
/** Percentage boards ask for enough games that one lucky win doesn't top them. */
const rated = (w: number, n: number, min: number) => (n >= min ? w / n : null);

export const BOARDS: Board[] = [
  { id: 'titles', group: 'Tournaments', title: 'Most titles', hint: 'Tournaments won', value: (r) => r.titles, sub: (r) => `${r.tournaments} played` },
  { id: 'titlerate', group: 'Tournaments', title: 'Best title rate', hint: 'At least 5 tournaments', value: (r) => rated(r.titles, r.tournaments, 5), shown: percent, sub: (r) => `${r.titles} of ${r.tournaments}` },
  { id: 'played', group: 'Tournaments', title: 'Most tournaments', hint: 'Tournaments finished', value: (r) => r.tournaments },
  { id: 'wins', group: 'Fights', title: 'Most wins', hint: 'Tournament matches won', value: (r) => r.fightsWon, sub: (r) => `${r.fights} fought` },
  { id: 'winrate', group: 'Fights', title: 'Best win rate', hint: 'At least 10 matches', value: (r) => rated(r.fightsWon, r.fights, 10), shown: percent, sub: (r) => `${r.fightsWon} of ${r.fights}` },
  { id: 'streak', group: 'Fights', title: 'Longest win streak', hint: 'Matches in a row', value: (r) => lab(r).bestStreak },
  { id: 'hot', group: 'Fights', title: 'On fire now', hint: 'Current win streak', value: (r) => lab(r).streak },
  { id: 'mvps', group: 'Fights', title: 'Most MVPs', hint: 'Raids and team battles', value: (r) => r.mvps },
  { id: 'duel', group: 'Fights', title: 'Best duelist', hint: '1v1 win rate, at least 5', value: (r) => { const x = lab(r).modes.solo; return x ? rated(x.w, games(x), 5) : null; }, shown: percent, sub: (r) => `${games(lab(r).modes.solo)} duels` },
  { id: 'tag', group: 'Fights', title: 'Best tag partner', hint: '2v2 win rate, at least 5', value: (r) => { const x = lab(r).modes.tag; return x ? rated(x.w, games(x), 5) : null; }, shown: percent, sub: (r) => `${games(lab(r).modes.tag)} tag matches` },
  { id: 'raids', group: 'Raids and teams', title: 'Most raid wins', hint: 'Bosses beaten', value: (r) => r.raidsWon, sub: (r) => `${r.raids} tried` },
  { id: 'raidrate', group: 'Raids and teams', title: 'Best raider', hint: 'Raid win rate, at least 5', value: (r) => rated(r.raidsWon, r.raids, 5), shown: percent, sub: (r) => `${r.raidsWon} of ${r.raids}` },
  { id: 'teamwins', group: 'Raids and teams', title: 'Most team wins', hint: 'Team battles won', value: (r) => r.teamWins, sub: (r) => `${r.teamBattles} fought` },
  { id: 'spent', group: 'Auction', title: 'Biggest spender', hint: 'Coins spent on fighters', value: (r) => lab(r).spent, shown: money, sub: (r) => `${lab(r).lots} fighters bought` },
  { id: 'buy', group: 'Auction', title: 'Biggest single buy', hint: 'Most paid for one fighter', value: (r) => lab(r).biggestBuy?.price ?? 0, shown: money, sub: (r) => lab(r).biggestBuy?.name ?? '' },
  { id: 'lots', group: 'Auction', title: 'Most fighters bought', hint: 'Auction lots won', value: (r) => lab(r).lots },
  { id: 'bounties', group: 'Auction', title: 'Bargain hunter', hint: 'Bargain Bounties earned', value: (r) => lab(r).bounties },
  { id: 'bets', group: 'Bets and badges', title: 'Most bets won', hint: 'Right calls on Fight Bets', value: (r) => lab(r).betsWon },
  { id: 'betrate', group: 'Bets and badges', title: 'Best fight reader', hint: 'Bet rate, at least 5', value: (r) => rated(lab(r).betsWon, lab(r).betsWon + lab(r).betsLost, 5), shown: percent, sub: (r) => `${lab(r).betsWon + lab(r).betsLost} bets` },
  { id: 'badges', group: 'Bets and badges', title: 'Most badges', hint: 'Badges earned', value: (r) => r.badges },
];

/** One board, best first. Players with nothing to show aren't listed. */
export function rank(rows: Row[], board: Board, limit = 50): Ranked[] {
  return rows.flatMap((row) => {
    const value = board.value(row.record);
    if (value === null || value <= 0) return [];
    return [{ id: row.id, name: row.name, value, shown: board.shown ? board.shown(value, row.record) : String(value), sub: board.sub?.(row.record) ?? '' }];
  }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, limit);
}

export type MasterKind = 'picks' | 'series' | 'arenas';
/** The best players with one fighter, series or arena: most wins, then fewest games. */
export function masters(rows: Row[], kind: MasterKind, key: string, limit = 50): Ranked[] {
  return rows.flatMap((row) => {
    const x = lab(row.record)[kind][key];
    if (!x || !games(x)) return [];
    return [{ id: row.id, name: row.name, played: games(x), value: x.w, shown: `${x.w} won`, sub: `${pct(x)}% of ${games(x)}` }];
  }).sort((a, b) => b.value - a.value || a.played - b.played || a.name.localeCompare(b.name)).slice(0, limit)
    .map(({ played: _played, ...r }) => r);
}

/** Every fighter, series or arena anyone has a record with, most played first. */
export function masterKeys(rows: Row[], kind: MasterKind): string[] {
  const n = new Map<string, number>();
  for (const row of rows) for (const [k, x] of Object.entries(lab(row.record)[kind])) n.set(k, (n.get(k) ?? 0) + games(x));
  return [...n.entries()].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}
