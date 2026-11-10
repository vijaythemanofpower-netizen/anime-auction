// Ball-by-ball T20 match engine. Pure and seeded: the same setup, seed and
// answers always give the same match, so every browser in a room replays it
// identically. Human decisions ("Captain's Calls", mind-game balls, DRS,
// sledges) are requested by returning `pending`; the caller adds an answer and
// runs the match again from the start (a T20 is ~250 balls, so this is cheap).
import { Rng, deriveSeed } from './rng';
import type { Cricketer, Form } from './types';
import { canBowl, isPace, isSpin } from './types';

// ------------------------------------------------------------------ types

export type Pitch = 'green' | 'flat' | 'dusty' | 'balanced';
export type Weather = 'clear' | 'hot' | 'humid' | 'rain';
export type Plan = 'aggressive' | 'balanced' | 'defensive' | 'allout';
export type Control = 'human' | 'cpu';

export interface TeamSheet {
  name: string;
  short: string;
  color: string;
  /** Batting order, 11 player ids. */
  xi: string[];
  /** Substitutes (Impact Player / concussion sub candidates). */
  bench: string[];
  captain: string;
  keeper: string;
  plan: Plan;
  control: Control;
  /** Optional preferred bowlers (ids from the XI), best first. */
  bowlers?: string[];
}

export interface MatchSetup {
  id: string;
  seed: number;
  overs: number;
  teams: [TeamSheet, TeamSheet];
  players: Record<string, Cricketer>;
  form?: Record<string, Form>;
  /** Season fatigue 0..1 for pacers who play every match. */
  fatigue?: Record<string, number>;
  pitch?: Pitch;
  weather?: Weather;
  /** Finals: no rain shortening, super overs repeat until there is a winner. */
  final?: boolean;
  /** DRS reviews per team per innings (1 or 2). */
  reviews?: number;
  /** Turn on Captain's Calls etc. for human teams (default true). */
  calls?: boolean;
}

export type DecisionKind = 'toss' | 'plan' | 'bowler' | 'review' | 'mindBowl' | 'mindBat' | 'sledge' | 'taunt' | 'impact';

export interface Option { id: string; label: string; hint?: string }

export interface Decision {
  id: string;
  kind: DecisionKind;
  team: 0 | 1;
  prompt: string;
  options: Option[];
  /** Used when nobody answers in time. */
  def: string;
  /** Mind-game decisions come in a pair and are revealed together. */
  secret?: boolean;
}

export type Answers = Record<string, string>;

export type WicketKind = 'bowled' | 'caught' | 'caughtBehind' | 'lbw' | 'runout' | 'stumped';
export type Banner =
  | 'four' | 'six' | 'wicket' | 'hattrick' | 'fifty' | 'hundred' | 'threefer' | 'fivefer'
  | 'lastover' | 'freehit' | 'drs' | 'rain' | 'superover' | 'sledge' | 'referee' | 'injury' | 'impact' | 'dropped';

export interface BallEvent {
  /** 0,1 = main innings; 2,3,... = super-over innings. */
  inn: number;
  /** Batting team. */
  team: 0 | 1;
  /** Chase target (second innings and super overs). */
  target?: number;
  /** Overs in this innings (after any rain cut). */
  overs: number;
  /** Batters at the crease after this ball: [striker, non-striker]. */
  crease: [string, string];
  over: number;
  /** Legal balls bowled in this over after this delivery (1-6); extras keep the count. */
  ball: number;
  bowler: string;
  batter: string;
  runs: number;
  extra?: 'wide' | 'noball';
  extraRuns: number;
  wicket?: { kind: WicketKind; out: string; fielder?: string };
  freeHit?: boolean;
  dropped?: string;
  /** Cosmetic: wagon-wheel angle (deg, 0 = straight down the ground) and distance 0..1. */
  angle?: number;
  dist?: number;
  text: string;
  banners: Banner[];
  /** Score after this ball. */
  score: number;
  wkts: number;
  momentum: number;
  mind?: { bowl: string; bat: string };
  /** Non-ball notes shown in the feed (DRS, sledges, rain, referee...). */
  notes: string[];
  /** Importance 0..100, for the highlights reel. */
  weight: number;
}

export interface BatCard { id: string; runs: number; balls: number; fours: number; sixes: number; out?: string; outKind?: WicketKind; bowler?: string; fielder?: string; fiftyAt?: number }
export interface BowlCard { id: string; balls: number; runs: number; wkts: number; dots: number; maidens: number; wides: number; noballs: number }

export interface InningsSummary {
  team: 0 | 1;
  runs: number;
  wkts: number;
  balls: number;
  overs: number;
  target?: number;
  extras: number;
  bat: BatCard[];
  bowl: BowlCard[];
  fow: Array<{ score: number; wkts: number; over: string; id: string }>;
  bestPartnership: { runs: number; a: string; b: string };
}

export interface MatchOutcome {
  winner: 0 | 1 | null;
  /** "won by 23 runs", "won by 4 wickets (8 balls left)", "won the Super Over", "tie", "no result". */
  margin: string;
  byRuns?: number;
  byWkts?: number;
  ballsLeft?: number;
  superOvers: number;
  potm: string;
  /** Season bonus point: win by 40+ runs or a chase with 4+ overs left. */
  bonus: boolean;
}

export interface Offence { team: 0 | 1; player: string; level: 'warning' | 'fine' | 'ban' }
export interface Injury { id: string; team: 0 | 1; kind: string; matchesOut: number }

export interface MatchRecord {
  setupId: string;
  toss: { winner: 0 | 1; choice: 'bat' | 'bowl' };
  pitch: Pitch;
  weather: Weather;
  dew: boolean;
  overs: number;
  events: BallEvent[];
  innings: InningsSummary[];
  outcome?: MatchOutcome;
  pending?: Decision[];
  offences: Offence[];
  injuries: Injury[];
  impact: Array<{ team: 0 | 1; in: string; out: string }>;
  /** Mind-game and captain's-call record per team: [worked, total]. */
  calls: [[number, number], [number, number]];
  sledges: Array<{ team: 0 | 1; by: string; at: string; level: string; result: 'ignored' | 'rattled' | 'backfired' | 'out' }>;
  highlights: number[];
  /** Revised target after rain, if any. */
  revised?: { target: number; overs: number };
}

// --------------------------------------------------------------- tunables

/** Model constants, tuned by tools/tune.ts against real T20 scoring. */
export const K = {
  base: { dot: 0.35, one: 0.37, two: 0.07, three: 0.006, four: 0.108, six: 0.04, out: 0.069 },
  edge4: 0.3, edge6: 0.35, edgeOut: 0.4, edgeDot: 0.25,
  agg4: 0.25, agg6: 0.5, aggOut: 0.5, aggDot: 0.45, agg1: -0.12,
  power6: 0.5, consOut: 0.5,
  pp4: 1.22, pp6: 0.85, ppOut: 0.9, death4: 1.05, death6: 1.35, deathOut: 1.25,
  wide: 0.034, noball: 0.0055,
};

/** Tuning probe (tools/tune.ts turns it on): running sums of the model inputs. */
export const DIAG = { on: false, n: 0, edge: 0, agg: 0, bat: 0, bowl: 0 };

// ------------------------------------------------------------------ helpers

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

class NeedAnswer extends Error { constructor(public decisions: Decision[]) { super('pending'); } }

interface BatState { id: string; runs: number; balls: number; fours: number; sixes: number; out?: string; outKind?: WicketKind; bowler?: string; fielder?: string; fired: number; focused: number; fiftyAt?: number; hundredAt?: number }
interface BowlState { id: string; balls: number; runs: number; wkts: number; dots: number; maidens: number; wides: number; noballs: number; overRuns: number; lastOver: number; spell: number; out?: boolean }

interface Inn {
  idx: number;
  team: 0 | 1;
  overs: number;
  target?: number;
  runs: number;
  wkts: number;
  legal: number;
  extras: number;
  order: string[];
  next: number;
  striker: string;
  non: string;
  bat: Map<string, BatState>;
  bowl: Map<string, BowlState>;
  maxPerBowler: number;
  lastBowler?: string;
  reviews: [number, number];
  pship: { runs: number; balls: number; a: string; b: string };
  best: { runs: number; a: string; b: string };
  fow: InningsSummary['fow'];
  freeHit: boolean;
  plan: Plan;
  recent: number[];
  hatTrick: { bowler: string; count: number };
  sledgeOffers: number;
  taunts: number;
  slowOverRate: boolean;
  /** Count of delays (wides, reviews, sledges) by the bowling side. */
  delays: number;
  superOver: boolean;
  maxWkts: number;
}

// ------------------------------------------------------------------ engine

export function playMatch(setup: MatchSetup, answers: Answers = {}): MatchRecord {
  return new Sim(setup, answers).run();
}

/** Run a whole match with nobody answering (all defaults/CPU): used for simulations and tests. */
export function autoPlay(setup: MatchSetup): MatchRecord {
  const s: MatchSetup = { ...setup, teams: [{ ...setup.teams[0], control: 'cpu' }, { ...setup.teams[1], control: 'cpu' }] };
  return playMatch(s, {});
}

/** Answer every pending decision with its default (what a timer running out does). */
export function withDefaults(rec: MatchRecord, answers: Answers): Answers {
  const out = { ...answers };
  for (const d of rec.pending ?? []) if (!(d.id in out)) out[d.id] = d.def;
  return out;
}

class Sim {
  s: MatchSetup;
  ans: Answers;
  rng: Rng;
  txt: Rng;
  rec: MatchRecord;
  p: Record<string, Cricketer>;
  sheets: [TeamSheet, TeamSheet];
  xi: [string[], string[]];
  bench: [string[], string[]];
  keeper: [string, string];
  offenceCount: [number, number] = [0, 0];
  momentum = 0;
  wear = 0;
  injuredOut = new Set<string>();
  lastSixer: Record<string, number> = {};

  constructor(setup: MatchSetup, answers: Answers) {
    this.s = setup;
    this.ans = answers;
    this.rng = new Rng(setup.seed);
    this.txt = new Rng(deriveSeed(setup.seed, 'text'));
    this.p = setup.players;
    this.sheets = setup.teams;
    this.xi = [setup.teams[0].xi.slice(), setup.teams[1].xi.slice()];
    this.bench = [setup.teams[0].bench.slice(), setup.teams[1].bench.slice()];
    this.keeper = [setup.teams[0].keeper, setup.teams[1].keeper];
    const pitch = setup.pitch ?? this.rng.pick<Pitch>(['green', 'flat', 'flat', 'dusty', 'balanced', 'balanced']);
    let weather = setup.weather ?? this.rng.weighted<Weather>(['clear', 'hot', 'humid', 'rain'], [50, 18, 20, 12]);
    if (setup.final && weather === 'rain') weather = 'humid';
    const dew = weather === 'humid' ? this.rng.chance(0.7) : this.rng.chance(0.25);
    this.rec = {
      setupId: setup.id, toss: { winner: 0, choice: 'bat' }, pitch, weather, dew, overs: setup.overs, events: [], innings: [],
      offences: [], injuries: [], impact: [], calls: [[0, 0], [0, 0]], sledges: [], highlights: [],
    };
  }

  // ----- decisions

  human(team: 0 | 1) { return this.sheets[team].control === 'human' && this.s.calls !== false; }

  /** Ask one or more decisions. Human teams must answer; CPU teams pick with their own seeded choice. */
  ask(ds: Decision[], cpu: (d: Decision, r: Rng) => string): string[] {
    const missing: Decision[] = [];
    const out = ds.map((d) => {
      if (!this.human(d.team)) return cpu(d, new Rng(deriveSeed(this.s.seed, d.id)));
      const a = this.ans[d.id];
      if (a === undefined || !d.options.some((o) => o.id === a)) { missing.push(d); return d.def; }
      return a;
    });
    if (missing.length) throw new NeedAnswer(missing);
    return out;
  }

  name(id: string) { return this.p[id]?.name ?? id; }

  run(): MatchRecord {
    try {
      this.toss();
      const first = this.rec.toss.choice === 'bat' ? this.rec.toss.winner : (1 - this.rec.toss.winner) as 0 | 1;
      let overs = this.s.overs;
      if (this.rec.weather === 'rain' && !this.s.final && this.rng.chance(0.4)) {
        overs = this.rng.int(Math.max(5, overs - 8), overs - 2);
        this.rec.overs = overs;
        this.note(`Rain delays the start. It's now a ${overs}-over match.`, 'rain');
      }
      const i1 = this.innings(0, first, overs);
      this.impactBreak(i1);
      const second = (1 - first) as 0 | 1;
      let target = i1.runs + 1;
      let overs2 = overs;
      const rainAt = this.rec.weather === 'rain' && !this.s.final && this.rng.chance(0.55) ? this.rng.int(Math.max(3, Math.floor(overs * 0.3)), overs - 3) : -1;
      const i2 = this.innings(1, second, overs2, target, rainAt);
      target = i2.target ?? target;
      overs2 = i2.overs;
      this.finish(i1, i2);
    } catch (e) {
      if (e instanceof NeedAnswer) this.rec.pending = e.decisions;
      else throw e;
    }
    return this.rec;
  }

  toss() {
    const winner: 0 | 1 = this.rng.chance(0.5) ? 0 : 1;
    const d: Decision = {
      id: 'toss', kind: 'toss', team: winner, prompt: `${this.sheets[winner].name} won the toss. Bat or bowl first?`,
      options: [{ id: 'bat', label: 'Bat first', hint: this.rec.pitch === 'flat' ? 'Flat pitch: post a big total' : 'Set a target' }, { id: 'bowl', label: 'Bowl first', hint: this.rec.dew ? 'Dew expected: chasing is easier' : this.rec.pitch === 'green' ? 'Green pitch: use the new ball' : 'Know the target' }],
      def: this.rec.dew || this.rec.pitch === 'green' ? 'bowl' : 'bat',
    };
    const [choice] = this.ask([d], (dd, r) => (this.rec.dew ? (r.chance(0.8) ? 'bowl' : 'bat') : dd.def === 'bowl' ? (r.chance(0.65) ? 'bowl' : 'bat') : r.chance(0.5) ? 'bat' : 'bowl'));
    this.rec.toss = { winner, choice: choice as 'bat' | 'bowl' };
  }

  // ----- player effective skills

  formOf(id: string) { return (this.s.form?.[id] ?? 0) * 6; }

  batRating(bat: Cricketer, bowler: Cricketer, inn: Inn) {
    const vs = isSpin(bowler) ? bat.bat.vsSpin : bat.bat.vsPace;
    let r = vs * 0.75 + bat.bat.consistency * 0.25 + this.formOf(bat.id);
    const st = inn.bat.get(bat.id)!;
    if (st.balls < 6) r -= 4; else if (st.balls < 12) r -= 2; else if (st.balls > 25) r += 2;
    if (this.pressure(inn) > 0.5) r += (bat.clutch - 60) * 0.12;
    return r;
  }

  bowlRating(b: Cricketer, inn: Inn, over: number) {
    const s = b.bowling ?? { attack: 20, control: 25, powerplay: 20, death: 20, speed: 110 };
    const phase = this.phase(inn, over);
    let r = s.attack * 0.5 + s.control * 0.5;
    if (phase === 'pp') r = r * 0.6 + s.powerplay * 0.4;
    if (phase === 'death') r = r * 0.55 + s.death * 0.45;
    r += this.formOf(b.id);
    const pitch = this.rec.pitch;
    if (isPace(b)) {
      if (pitch === 'green') r += 6 - inn.idx * 2;
      if (pitch === 'flat') r -= 3;
      if (this.rec.weather === 'humid' && phase === 'pp') r += 3;
      const st = inn.bowl.get(b.id);
      const fat = (this.s.fatigue?.[b.id] ?? 0) * 6 + (st ? Math.max(0, st.spell - 2) * (this.rec.weather === 'hot' ? 3 : 1.5) : 0);
      r -= fat;
    } else if (isSpin(b)) {
      if (pitch === 'dusty') r += 5 + this.wear * 4;
      else r += this.wear * 2;
      if (pitch === 'green') r -= 3;
    }
    if (this.rec.dew && inn.idx === 1) r -= isSpin(b) ? 6 : 3;
    if (this.pressure(inn) > 0.5) r += (b.clutch - 60) * 0.1;
    return r;
  }

  phase(inn: Inn, over: number): 'pp' | 'mid' | 'death' {
    const pp = Math.max(1, Math.round(inn.overs * 0.3));
    if (inn.superOver) return 'death';
    if (over < pp) return 'pp';
    if (over >= inn.overs - 4) return 'death';
    return 'mid';
  }

  /** 0..1, how tight the situation is. */
  pressure(inn: Inn) {
    if (inn.superOver) return 1;
    if (inn.target === undefined) return inn.legal > inn.overs * 6 - 12 ? 0.6 : 0.2;
    const left = inn.overs * 6 - inn.legal;
    const need = inn.target - inn.runs;
    if (left <= 0) return 1;
    const rrr = (need / left) * 6;
    return clamp((rrr - 6) / 8 + (left < 18 ? 0.4 : 0), 0, 1);
  }

  aggression(inn: Inn, bat: Cricketer, over: number) {
    const plan = inn.plan;
    let a = plan === 'aggressive' ? 0.3 : plan === 'defensive' ? -0.35 : plan === 'allout' ? 0.85 : 0;
    const phase = this.phase(inn, over);
    const wktsLeft = inn.maxWkts - inn.wkts;
    if (phase === 'pp') a += 0.1;
    if (phase === 'death') a += 0.15 + 0.05 * Math.min(wktsLeft, 6);
    if (wktsLeft <= 3 && !inn.superOver) a -= 0.25;
    a += (bat.bat.tempo - 75) / 70;
    const left = inn.overs * 6 - inn.legal;
    if (inn.target !== undefined && left > 0) {
      const rrr = ((inn.target - inn.runs) / left) * 6;
      const crr = inn.legal ? (inn.runs / inn.legal) * 6 : 8;
      a += clamp((rrr - Math.max(crr, 7.5)) / 5, -0.6, 0.9);
    }
    const st = inn.bat.get(bat.id)!;
    if (st.fired > 0) a += 0.6;
    if (st.focused > 0) a -= 0.1;
    return clamp(a, -1, 1.6);
  }

  // ----- innings

  newInn(idx: number, team: 0 | 1, overs: number, order: string[], target?: number, superOver = false): Inn {
    const reviews = this.s.reviews ?? 2;
    return {
      idx, team, overs, target, runs: 0, wkts: 0, legal: 0, extras: 0, order, next: 2, striker: order[0], non: order[1],
      bat: new Map(order.map((id) => [id, { id, runs: 0, balls: 0, fours: 0, sixes: 0, fired: 0, focused: 0 }])),
      bowl: new Map(), maxPerBowler: superOver ? 1 : Math.max(1, Math.ceil(overs / 5)), reviews: superOver ? [1, 1] : [reviews, reviews],
      pship: { runs: 0, balls: 0, a: order[0], b: order[1] }, best: { runs: 0, a: order[0], b: order[1] }, fow: [], freeHit: false,
      plan: this.sheets[team].plan, recent: [], hatTrick: { bowler: '', count: 0 }, sledgeOffers: 0, taunts: 0, slowOverRate: false, delays: 0,
      superOver, maxWkts: superOver ? 2 : Math.min(10, order.length - 1),
    };
  }

  innings(idx: number, team: 0 | 1, overs: number, target?: number, rainAt = -1): Inn {
    const inn = this.newInn(idx, team, overs, this.xi[team].slice(), target);
    this.momentum = 0;
    const fieldTeam = (1 - team) as 0 | 1;
    for (let over = 0; over < inn.overs; over++) {
      if (this.done(inn)) break;
      if (over === rainAt && inn.target !== undefined) this.rainBreak(inn, over);
      if (over >= inn.overs) break;
      this.wear = (idx * 20 + over) / 40;
      this.planCall(inn, over);
      if (over === inn.overs - 1) {
        inn.slowOverRate = inn.delays >= 14;
        if (inn.slowOverRate) this.note(`Slow over rate: ${this.sheets[fieldTeam].name} must bring a fielder inside the circle for the last over.`, 'referee');
        if (inn.target !== undefined) {
          const need = inn.target - inn.runs;
          if (need > 0 && need <= 30) this.note(this.line('lastOver', { need: String(need), balls: String(inn.overs * 6 - inn.legal), team: this.sheets[team].name }), 'lastover');
        }
      }
      this.bowlOver(inn, over);
    }
    this.rec.innings[idx] = this.summary(inn);
    return inn;
  }

  done(inn: Inn) {
    if (inn.wkts >= inn.maxWkts) return true;
    if (inn.target !== undefined && inn.runs >= inn.target) return true;
    return false;
  }

  rainBreak(inn: Inn, over: number) {
    const lost = this.rng.int(2, Math.min(6, inn.overs - over - 1));
    const before = resources(inn.overs - over, inn.wkts);
    const after = resources(inn.overs - over - lost, inn.wkts);
    const full = resources(inn.overs, 0);
    const r2 = (full - (before - after)) / full;
    const first = this.rec.innings[0].runs;
    const newTarget = Math.floor(first * r2) + 1;
    inn.overs -= lost;
    inn.maxPerBowler = Math.max(1, Math.ceil(inn.overs / 5));
    inn.target = newTarget;
    this.rec.revised = { target: newTarget, overs: inn.overs };
    this.note(`${this.line('rain', {})} ${lost} overs lost. Revised target: ${newTarget} from ${inn.overs} overs.`, 'rain');
  }

  planCall(inn: Inn, over: number) {
    const team = inn.team;
    if (inn.superOver) return;
    const at = [Math.round(inn.overs * 0.3), inn.overs - 5];
    if (!at.includes(over) || over === 0) return;
    const left = inn.overs * 6 - inn.legal;
    const rrr = inn.target !== undefined ? ((inn.target - inn.runs) / Math.max(1, left)) * 6 : 0;
    const opts: Option[] = [
      { id: 'aggressive', label: 'Attack', hint: 'More boundaries, more risk' },
      { id: 'balanced', label: 'Balanced' },
      { id: 'defensive', label: 'Consolidate', hint: 'Rotate strike, protect wickets' },
    ];
    if (inn.target !== undefined && rrr > 10) opts.push({ id: 'allout', label: 'Go all out', hint: `Need ${rrr.toFixed(1)} an over` });
    const wl = inn.maxWkts - inn.wkts;
    const def = inn.target !== undefined ? (rrr > 12 ? 'allout' : rrr > 9.5 ? 'aggressive' : wl <= 4 ? 'defensive' : 'balanced') : wl <= 3 ? 'defensive' : over >= inn.overs - 5 ? 'aggressive' : 'balanced';
    const score = `${inn.runs}/${inn.wkts} after ${over}`;
    const d: Decision = { id: `i${inn.idx}-o${over}-plan`, kind: 'plan', team, prompt: `Captain's Call: ${score} overs${inn.target !== undefined ? `, need ${inn.target - inn.runs} from ${left}` : ''}. How do you play the next phase?`, options: opts, def };
    const [pick] = this.ask([d], () => def);
    inn.plan = pick as Plan;
    if (this.human(team)) this.rec.calls[team][1]++;
    (inn as Inn & { planFrom?: number; planRuns?: number; planWkts?: number }).planFrom = inn.legal;
  }

  // ----- bowling selection

  eligible(inn: Inn): string[] {
    const fieldTeam = (1 - inn.team) as 0 | 1;
    const xi = this.xi[fieldTeam].filter((id) => !this.injuredOut.has(id));
    const bowlers = xi.filter((id) => canBowl(this.p[id]));
    const pool = bowlers.length >= 5 ? bowlers : xi;
    return pool.filter((id) => id !== inn.lastBowler && (inn.bowl.get(id)?.balls ?? 0) + 6 <= inn.maxPerBowler * 6 && !inn.bowl.get(id)?.out);
  }

  bowlerScore(id: string, inn: Inn, over: number) {
    const c = this.p[id];
    const pref = this.sheets[(1 - inn.team) as 0 | 1].bowlers;
    let s = this.bowlRating(c, inn, over);
    if (!canBowl(c)) s -= 40;
    if (pref?.includes(id)) s += 4 - pref.indexOf(id) * 0.5;
    const used = (inn.bowl.get(id)?.balls ?? 0) / 6;
    const remaining = inn.maxPerBowler - used;
    const phase = this.phase(inn, over);
    // Save the best death bowlers for the end.
    if (phase !== 'death' && c.bowling && c.bowling.death > 78 && remaining <= 2) s -= 12;
    if (phase === 'pp' && isSpin(c) && this.rec.pitch !== 'dusty') s -= 4;
    s += this.rng.next() * 0; // keep rng untouched
    return s;
  }

  pickBowler(inn: Inn, over: number): string {
    const fieldTeam = (1 - inn.team) as 0 | 1;
    let cands = this.eligible(inn);
    // Out of planned bowlers: anyone in the XI who still has overs left (a part-timer), never a fifth over.
    if (!cands.length) cands = this.xi[fieldTeam].filter((id) => id !== inn.lastBowler && !this.injuredOut.has(id) && (inn.bowl.get(id)?.balls ?? 0) + 6 <= inn.maxPerBowler * 6);
    // If only the previous bowler has room left, allow consecutive overs rather than exceed the cap.
    if (!cands.length) cands = this.xi[fieldTeam].filter((id) => !this.injuredOut.has(id) && (inn.bowl.get(id)?.balls ?? 0) + 6 <= inn.maxPerBowler * 6);
    const oversLeft = inn.overs - over;
    // Keep the innings bowlable: a bowler with many overs left must be used if others can't cover.
    const capacity = (ids: string[]) => ids.reduce((a, id) => a + inn.maxPerBowler - (inn.bowl.get(id)?.balls ?? 0) / 6, 0);
    const all = this.eligibleAll(inn);
    const ranked = cands.map((id) => ({ id, s: this.bowlerScore(id, inn, over) })).sort((a, b) => b.s - a.s);
    let feasible = ranked.filter(({ id }) => capacity(all.filter((x) => x !== id)) + (inn.maxPerBowler - (inn.bowl.get(id)?.balls ?? 0) / 6) - 1 >= oversLeft - 1);
    if (!feasible.length) feasible = ranked;
    const def = feasible[0].id;
    const ask = !inn.superOver && [0, Math.round(inn.overs * 0.3), inn.overs - 4, inn.overs - 2, inn.overs - 1].includes(over);
    if (!ask || !this.human(fieldTeam)) return def;
    const opts = feasible.slice(0, 4).map(({ id }) => {
      const c = this.p[id];
      const b = inn.bowl.get(id);
      return { id, label: c.name, hint: `${b ? `${Math.floor(b.balls / 6)}-${b.runs}-${b.wkts}` : 'fresh'} · ${bowlTypeLabel(c)}` };
    });
    const d: Decision = { id: `i${inn.idx}-o${over}-bowler`, kind: 'bowler', team: fieldTeam, prompt: `Who bowls over ${over + 1}? ${inn.runs}/${inn.wkts}${inn.target !== undefined ? `, they need ${inn.target - inn.runs}` : ''}.`, options: opts, def };
    const [pick] = this.ask([d], () => def);
    return pick;
  }

  eligibleAll(inn: Inn) {
    const fieldTeam = (1 - inn.team) as 0 | 1;
    const xi = this.xi[fieldTeam].filter((id) => !this.injuredOut.has(id));
    const bowlers = xi.filter((id) => canBowl(this.p[id]));
    const pool = bowlers.length >= 5 ? bowlers : xi;
    return pool.filter((id) => (inn.bowl.get(id)?.balls ?? 0) + 6 <= inn.maxPerBowler * 6 && !inn.bowl.get(id)?.out);
  }

  bowlOver(inn: Inn, over: number) {
    let bowlerId = this.pickBowler(inn, over);
    const prevSpell = inn.bowl.get(bowlerId);
    const bs = prevSpell ?? { id: bowlerId, balls: 0, runs: 0, wkts: 0, dots: 0, maidens: 0, wides: 0, noballs: 0, overRuns: 0, lastOver: -9, spell: 0 };
    bs.spell = bs.lastOver === over - 2 ? bs.spell + 1 : 1;
    bs.lastOver = over;
    inn.bowl.set(bowlerId, bs);
    let overRuns = 0;
    let legalInOver = 0;
    let changedMidOver = false;
    while (legalInOver < 6) {
      if (this.done(inn)) break;
      const cur = inn.bowl.get(bowlerId)!;
      const legal = this.ball(inn, over, legalInOver, cur);
      if (legal) legalInOver++;
      overRuns = cur.overRuns;
      // In-match injury: a pacer pulls up mid-over.
      if (legalInOver < 6 && legal && !inn.superOver && isPace(this.p[bowlerId]) && this.rng.chance(0.0016)) {
        cur.out = true;
        this.injuredOut.add(bowlerId);
        this.rec.injuries.push({ id: bowlerId, team: (1 - inn.team) as 0 | 1, kind: 'pulled hamstring', matchesOut: this.rng.int(1, 3) });
        this.note(`${this.name(bowlerId)} pulls up with a hamstring strain and walks off mid-over.`, 'injury');
        const room = 6 - legalInOver;
        const others = this.xi[(1 - inn.team) as 0 | 1].filter((id) => id !== bowlerId && id !== inn.lastBowler && canBowl(this.p[id]) && !this.injuredOut.has(id) && (inn.bowl.get(id)?.balls ?? 0) + room <= inn.maxPerBowler * 6 && (inn.bowl.get(id)?.balls ?? 0) + 6 <= inn.maxPerBowler * 6);
        const sub = others.sort((a, b) => this.bowlerScore(b, inn, over) - this.bowlerScore(a, inn, over))[0];
        if (sub) {
          bowlerId = sub;
          if (!inn.bowl.get(sub)) inn.bowl.set(sub, { id: sub, balls: 0, runs: 0, wkts: 0, dots: 0, maidens: 0, wides: 0, noballs: 0, overRuns: 0, lastOver: over, spell: 1 });
          inn.bowl.get(sub)!.overRuns = 0;
          this.note(`${this.name(sub)} will finish the over.`);
          changedMidOver = true;
        }
      }
    }
    const final = inn.bowl.get(bowlerId)!;
    if (!changedMidOver && legalInOver === 6 && overRuns === 0) final.maidens++;
    for (const b of inn.bowl.values()) b.overRuns = 0;
    inn.lastBowler = bowlerId;
    if (legalInOver === 6) [inn.striker, inn.non] = [inn.non, inn.striker];
  }

  // ----- one delivery

  ball(inn: Inn, over: number, legalBefore: number, bs: BowlState): boolean {
    const bowler = this.p[bs.id];
    const batter = this.p[inn.striker];
    const st = inn.bat.get(inn.striker)!;
    const fieldTeam = (1 - inn.team) as 0 | 1;
    const notes: string[] = [];
    const banners: Banner[] = [];
    let weight = 0;

    if (legalBefore === 0 && st.balls === 0 && inn.legal > 0 && !inn.superOver) this.sledgeOffer(inn, over, bs, notes, banners);

    // Mind-game ball at the biggest moments.
    let mind: { bowl: string; bat: string } | undefined;
    const isHatTrick = inn.hatTrick.bowler === bs.id && inn.hatTrick.count >= 2;
    const chaseLive = inn.target !== undefined && inn.target - inn.runs <= (inn.overs * 6 - inn.legal) * 3 && inn.target - inn.runs > 0;
    const lastOver = over === inn.overs - 1;
    if ((isHatTrick || inn.superOver || (lastOver && chaseLive && inn.idx === 1)) && (this.human(inn.team) || this.human(fieldTeam))) {
      mind = this.mindGame(inn, over, legalBefore, bs, isHatTrick);
    } else if (isHatTrick || inn.superOver || (lastOver && chaseLive)) {
      mind = this.mindGame(inn, over, legalBefore, bs, isHatTrick);
    }
    if (isHatTrick) { notes.push(this.line('hatTrickBall', { bowl: bowler.name })); }

    // Extras.
    const ctrl = bowler.bowling?.control ?? 25;
    const dewX = this.rec.dew && inn.idx === 1 ? 0.012 : 0;
    let wideP = K.wide + (60 - ctrl) / 1400 + dewX;
    let nbP = K.noball + (isPace(bowler) ? 0.002 : -0.002);
    if (mind?.bowl === 'wide') wideP += 0.12;
    if (mind?.bowl === 'yorker') nbP += 0.01;
    const freeHit = inn.freeHit;
    const r = this.rng.next();
    if (r < wideP) {
      const runs = this.rng.chance(0.06) ? 5 : 1;
      inn.runs += runs; inn.extras += runs; bs.runs += runs; bs.wides++; bs.overRuns += runs; inn.delays++;
      this.push(inn, over, legalBefore, bs.id, { runs: 0, extra: 'wide', extraRuns: runs, text: runs === 5 ? `Wide, and it beats the keeper too! Five wides.` : this.line('wide', { bowl: bowler.name }), banners, notes, mind, freeHit, weight: 2 });
      return false;
    }
    let noBall = false;
    if (r < wideP + nbP) { noBall = true; inn.delays++; }

    // Legal (or no-ball) delivery: compute outcome.
    const o = this.outcome(inn, over, batter, bowler, mind, freeHit || noBall);
    inn.freeHit = false;
    let runs = o.runs;
    let wicket: BallEvent['wicket'] | undefined;
    let dropped: string | undefined;
    let text = '';
    if (o.out) {
      const kind = o.out;
      let fielder: string | undefined;
      if (kind === 'caught') fielder = this.pickFielder(fieldTeam, bs.id);
      if (kind === 'caughtBehind' || kind === 'stumped') fielder = this.keeper[fieldTeam];
      if (kind === 'runout') fielder = this.pickFielder(fieldTeam, '');
      // Dropped catch.
      if (kind === 'caught' && fielder) {
        const f = this.p[fielder].fielding;
        if (this.rng.chance(0.13 - f / 1100)) {
          dropped = fielder; runs = this.rng.chance(0.5) ? 1 : 0;
          text = this.line('dropped', { bat: batter.name, fld: this.p[fielder].name });
          banners.push('dropped'); weight += 30;
        }
      }
      if (!dropped) {
        // DRS for LBW and caught behind.
        const drs = (kind === 'lbw' || kind === 'caughtBehind') ? this.review(inn, over, legalBefore, batter, kind, notes) : 'out';
        if (drs === 'notout') { runs = 0; text = `${this.line('drsOverturned', { bat: batter.name })}`; banners.push('drs'); weight += 35; }
        else {
          if (drs === 'upheld') banners.push('drs');
          wicket = { kind, out: inn.striker, fielder };
        }
      }
    } else if (o.appeal) {
      // A not-out LBW shout the fielding side may review.
      const res = this.notOutAppeal(inn, over, legalBefore, batter, notes);
      if (res) { wicket = { kind: 'lbw', out: inn.striker }; banners.push('drs'); runs = 0; }
    }

    if (noBall && wicket && wicket.kind !== 'runout') wicket = undefined;
    const extraRuns = noBall ? 1 : 0;
    inn.runs += runs + extraRuns; inn.extras += extraRuns;
    bs.runs += runs + extraRuns; bs.overRuns += runs + extraRuns;
    if (noBall) { bs.noballs++; inn.freeHit = true; }
    st.runs += runs; st.balls += noBall ? 1 : 1;
    if (!noBall) { inn.legal++; bs.balls++; }
    if (runs === 4) st.fours++;
    if (runs === 6) st.sixes++;
    if (runs === 0 && !noBall && !wicket) bs.dots++;
    inn.pship.runs += runs + extraRuns; inn.pship.balls++;
    st.fired = Math.max(0, st.fired - 1); st.focused = Math.max(0, st.focused - 1);
    inn.recent.push(wicket ? -1 : runs); if (inn.recent.length > 12) inn.recent.shift();

    // Text and banners.
    const bn = batter.name; const bw = bowler.name;
    if (!text) {
      if (wicket) {
        text = this.line(wicket.kind, { bat: bn, bowl: bw, fld: wicket.fielder ? this.name(wicket.fielder) : '' });
        banners.push('wicket'); weight += 40;
      } else if (runs === 6) { text = this.line('six', { bat: bn, bowl: bw }); banners.push('six'); weight += 25; }
      else if (runs === 4) { text = this.line('four', { bat: bn, bowl: bw }); banners.push('four'); weight += 12; }
      else if (runs === 3) text = this.line('three', { bat: bn });
      else if (runs === 2) text = this.line('two', { bat: bn, fld: this.name(this.pickFielderTxt(fieldTeam)) });
      else if (runs === 1) text = this.line('single', { bat: bn, bowl: bw });
      else text = this.line('dot', { bat: bn, bowl: bw });
    }
    if (noBall) { text = `${this.line('noball', { bowl: bw })} ${runs ? `${runs} off the bat too.` : ''}`.trim(); banners.push('freehit'); }
    if (freeHit) notes.push('Free hit!');

    // Fired-up batter who connects: the sledge backfires.
    if (st.fired > 0 && runs >= 4) {
      notes.push(this.line('sledgeBackfire', { bat: bn, bowl: bw }));
      const s = this.rec.sledges.filter((x) => x.at === batter.id).pop();
      if (s && s.result === 'rattled') s.result = 'backfired';
      st.fired = 0;
    }
    if (st.fired > 0 && wicket) {
      const s = this.rec.sledges.filter((x) => x.at === batter.id).pop();
      if (s) { s.result = 'out'; this.rec.calls[s.team][0]++; }
    }
    if (mind) {
      const worked = wicket || runs === 0 ? fieldTeam : runs >= 4 ? inn.team : null;
      if (worked !== null && this.human(worked)) this.rec.calls[worked][0]++;
      weight += 15;
    }

    // Milestones.
    if (!st.fiftyAt && st.runs >= 50) { st.fiftyAt = st.balls; banners.push('fifty'); notes.push(this.line('fifty', { bat: bn, balls: String(st.balls) })); weight += 20; }
    if (!st.hundredAt && st.runs >= 100) { st.hundredAt = st.balls; banners.push('hundred'); notes.push(this.line('hundred', { bat: bn, balls: String(st.balls) })); weight += 35; }

    // Hat-trick tracking (bowler's consecutive wickets in his own deliveries).
    if (wicket && wicket.kind !== 'runout') {
      bs.wkts++;
      if (inn.hatTrick.bowler === bs.id) inn.hatTrick.count++; else inn.hatTrick = { bowler: bs.id, count: 1 };
      if (inn.hatTrick.count === 3) { banners.push('hattrick'); notes.push(this.line('hatTrick', { bowl: bw })); weight += 50; }
      if (bs.wkts === 3) { banners.push('threefer'); notes.push(this.line('milestoneWickets', { bowl: bw })); }
      if (bs.wkts === 5) banners.push('fivefer');
    } else if (!noBall && inn.hatTrick.bowler === bs.id) {
      inn.hatTrick = { bowler: '', count: 0 };
    }


    // Momentum: batting side's recent scoring against a par of 8/over.
    const recentRuns = inn.recent.reduce((a, x) => a + Math.max(0, x), 0);
    const recentW = inn.recent.filter((x) => x < 0).length;
    this.momentum = clamp(Math.round(((recentRuns - inn.recent.length * 1.35) * 6 - recentW * 25)), -100, 100);

    // Close-finish weighting.
    if (inn.target !== undefined) {
      const need = inn.target - inn.runs;
      const left = inn.overs * 6 - inn.legal;
      if (left <= 12 && need <= 24) weight += 15;
      if (need <= 0) weight += 40;
    }

    if (wicket) this.fallOfWicket(inn, over, wicket.out);
    else if (runs % 2 === 1) [inn.striker, inn.non] = [inn.non, inn.striker];

    const legal = !noBall;
    this.push(inn, over, legalBefore + (legal ? 1 : 0), bs.id, { runs, extra: noBall ? 'noball' : undefined, extraRuns, wicket, dropped, text, banners, notes, mind, freeHit, weight, batterId: batter.id });
    // Taunt after a six (asked once the six is on screen; its notes join that ball).
    if (runs === 6 && !inn.superOver) this.tauntOffer(inn, over, batter, bs, notes);
    // Concussion: a rare blow from a bouncer; like-for-like substitute.
    if (!wicket && mind?.bowl === 'bouncer' && this.rng.chance(0.02)) this.concussion(inn, batter.id);
    return legal;
  }

  outcome(inn: Inn, over: number, bat: Cricketer, bowl: Cricketer, mind: { bowl: string; bat: string } | undefined, free: boolean): { runs: number; out?: WicketKind; appeal?: boolean } {
    const br = this.batRating(bat, bowl, inn); const wr = this.bowlRating(bowl, inn, over);
    const edge = (br - wr) / 25;
    let a = this.aggression(inn, bat, over);
    if (DIAG.on) { DIAG.n++; DIAG.edge += edge; DIAG.agg += a; DIAG.bat += br; DIAG.bowl += wr; }
    const phase = this.phase(inn, over);
    const b = K.base;
    let m4 = 1, m6 = 1, mOut = 1, mDot = 1;
    if (mind) {
      const t = MIND[mind.bowl]?.[mind.bat];
      if (t) { m4 *= t.four; m6 *= t.six; mOut *= t.out; mDot *= t.dot; }
      a = mind.bat === 'defend' ? -0.8 : mind.bat === 'slog' ? Math.max(a, 1.1) : mind.bat === 'ramp' ? Math.max(a, 0.6) : a;
    }
    if (phase === 'pp') { m4 *= K.pp4; m6 *= K.pp6; mOut *= K.ppOut; }
    if (phase === 'death') { m4 *= K.death4; m6 *= K.death6; mOut *= K.deathOut; }
    const pitch = this.rec.pitch;
    if (pitch === 'flat') { m4 *= 1.1; m6 *= 1.12; mOut *= 0.88; }
    if (pitch === 'green' && inn.idx === 0) { mOut *= 1.08; m6 *= 0.92; }
    if (pitch === 'dusty' && isSpin(bowl)) { mOut *= 1.08 + this.wear * 0.1; m4 *= 0.92; }
    // Field and captaincy.
    const fieldTeam = (1 - inn.team) as 0 | 1;
    const fplan = this.sheets[fieldTeam].plan;
    if (fplan === 'aggressive') { mOut *= 1.08; m4 *= 1.06; }
    if (fplan === 'defensive') { mOut *= 0.93; m4 *= 0.93; m6 *= 0.95; }
    const cap = this.p[this.sheets[fieldTeam].captain]?.captaincy ?? 50;
    m4 *= 1 - (cap - 50) / 800;
    if (inn.slowOverRate && over === inn.overs - 1) { m4 *= 1.25; m6 *= 1.1; }
    const st = inn.bat.get(bat.id)!;
    if (st.fired > 0) { mOut *= 1.5; m6 *= 1.25; }
    if (st.focused > 0) mOut *= 0.8;
    // Six-hitting power.
    const pw = (bat.bat.power - 60) / 30;
    const cons = (bat.bat.consistency - 60) / 30;

    const w = {
      dot: b.dot * Math.exp(-K.edgeDot * edge - K.aggDot * a) * mDot,
      one: b.one * Math.exp(K.agg1 * Math.abs(a)),
      two: b.two * (0.8 + (bat.bat.tempo - 50) / 150),
      three: b.three,
      four: b.four * Math.exp(K.edge4 * edge + K.agg4 * a) * m4,
      six: b.six * Math.exp(K.edge6 * edge + K.agg6 * a + K.power6 * pw) * m6,
      out: free ? 0 : b.out * Math.exp(-K.edgeOut * edge + K.aggOut * a - K.consOut * cons) * mOut,
    };
    const keys = ['dot', 'one', 'two', 'three', 'four', 'six', 'out'] as const;
    const k = this.rng.weighted(keys, keys.map((x) => w[x]));
    if (k === 'out') {
      const spin = isSpin(bowl);
      const kinds: WicketKind[] = ['bowled', 'caught', 'caughtBehind', 'lbw', 'runout', 'stumped'];
      const wts = spin ? [16, 52, 5, 15, 4 + a * 3, 8] : [19, 44, 13, 14, 5 + a * 3, 0];
      if (mind?.bowl === 'yorker') { wts[0] += 25; wts[3] += 10; }
      if (mind?.bowl === 'bouncer') { wts[1] += 25; wts[2] += 6; }
      return { runs: 0, out: this.rng.weighted(kinds, wts) };
    }
    const runs = { dot: 0, one: 1, two: 2, three: 3, four: 4, six: 6 }[k];
    const appeal = runs === 0 && this.rng.chance(0.03);
    return { runs, appeal };
  }

  pickFielder(team: 0 | 1, exclude: string) {
    const xi = this.xi[team].filter((id) => id !== exclude && id !== this.keeper[team] && !this.injuredOut.has(id));
    return this.rng.weighted(xi, xi.map((id) => 0.5 + this.p[id].fielding / 100));
  }

  pickFielderTxt(team: 0 | 1) {
    const xi = this.xi[team];
    return xi[Math.floor(this.txt.next() * xi.length)];
  }

  fallOfWicket(inn: Inn, over: number, outId: string) {
    const st = inn.bat.get(outId)!;
    const last = this.rec.events[this.rec.events.length - 1];
    void last;
    inn.wkts++;
    st.out = 'out';
    inn.fow.push({ score: inn.runs, wkts: inn.wkts, over: `${over}.${(inn.legal % 6) || 6}`, id: outId });
    if (inn.pship.runs > inn.best.runs) inn.best = { runs: inn.pship.runs, a: inn.pship.a, b: inn.pship.b };
    if (inn.wkts >= inn.maxWkts) return;
    const nextId = inn.order[inn.next++];
    if (!nextId) { inn.wkts = inn.maxWkts; return; }
    if (outId === inn.striker) inn.striker = nextId; else inn.non = nextId;
    if (!inn.bat.has(nextId)) inn.bat.set(nextId, { id: nextId, runs: 0, balls: 0, fours: 0, sixes: 0, fired: 0, focused: 0 });
    inn.pship = { runs: 0, balls: 0, a: inn.striker, b: inn.non };
  }

  concussion(inn: Inn, id: string) {
    const team = inn.team;
    const c = this.p[id];
    const sub = this.bench[team].find((b) => this.p[b] && this.p[b].role === c.role) ?? this.bench[team][0];
    this.note(`${c.name} takes a blow to the helmet and fails the concussion test.${sub ? ` ${this.name(sub)} comes in as a like-for-like substitute.` : ''}`, 'injury');
    this.rec.injuries.push({ id, team, kind: 'concussion', matchesOut: 1 });
    if (!sub) return;
    this.bench[team] = this.bench[team].filter((b) => b !== sub);
    const st = inn.bat.get(id)!;
    inn.bat.delete(id);
    inn.bat.set(sub, { ...st, id: sub });
    if (inn.striker === id) inn.striker = sub; if (inn.non === id) inn.non = sub;
    inn.order = inn.order.map((x) => (x === id ? sub : x));
    this.xi[team] = this.xi[team].map((x) => (x === id ? sub : x));
    this.injuredOut.add(id);
  }

  // ----- DRS

  review(inn: Inn, over: number, legalBefore: number, bat: Cricketer, kind: WicketKind, notes: string[]): 'out' | 'upheld' | 'notout' {
    const r = this.rng.next();
    const truth: 'out' | 'marginal' | 'notout' = kind === 'lbw' ? (r < 0.6 ? 'out' : r < 0.85 ? 'marginal' : 'notout') : r < 0.9 ? 'out' : 'notout';
    const team = inn.team;
    if (inn.reviews[team] <= 0) return 'out';
    // A noisy hint the batter "feels"; humans and CPU get the same information.
    const hintRight = this.rng.chance(0.75);
    const feelsNot = truth === 'notout' ? hintRight : !hintRight;
    const hint = kind === 'lbw' ? (feelsNot ? 'Batter thinks it pitched outside leg' : 'Looked plumb from side-on') : feelsNot ? 'Batter is shaking his head: no edge?' : 'There was a noise';
    const d: Decision = {
      id: `i${inn.idx}-o${over}-b${legalBefore}-${inn.legal}-review`, kind: 'review', team,
      prompt: `${bat.name} is given out ${kind === 'lbw' ? 'LBW' : 'caught behind'}. Review? (${inn.reviews[team]} left)`,
      options: [{ id: 'review', label: 'Review', hint }, { id: 'walk', label: 'Walk off' }], def: feelsNot ? 'review' : 'walk',
    };
    const [pick] = this.ask([d], (_dd, rr) => (feelsNot ? (rr.chance(0.85) ? 'review' : 'walk') : rr.chance(0.12) ? 'review' : 'walk'));
    if (pick !== 'review') return 'out';
    if (this.human(team)) this.rec.calls[team][1]++;
    if (truth === 'notout') {
      if (this.human(team)) this.rec.calls[team][0]++;
      notes.push(`DRS: ${bat.name} reviews... overturned! Not out.`);
      return 'notout';
    }
    if (truth === 'marginal') { notes.push(`DRS: ${this.line('umpiresCall', { bat: bat.name })} Review retained.`); return 'upheld'; }
    inn.reviews[team]--;
    inn.delays++;
    notes.push(`DRS: ${this.line('drsOut', { bat: bat.name })}`);
    return 'upheld';
  }

  notOutAppeal(inn: Inn, over: number, legalBefore: number, bat: Cricketer, notes: string[]): boolean {
    const fieldTeam = (1 - inn.team) as 0 | 1;
    if (inn.reviews[fieldTeam] <= 0) return false;
    const r = this.rng.next();
    const truth = r < 0.18 ? 'out' : r < 0.35 ? 'marginal' : 'notout';
    const hintRight = this.rng.chance(0.7);
    const feelsOut = truth === 'out' ? hintRight : !hintRight;
    const d: Decision = {
      id: `i${inn.idx}-o${over}-b${legalBefore}-${inn.legal}-appeal`, kind: 'review', team: fieldTeam,
      prompt: `Big LBW shout against ${bat.name}... not out! Review? (${inn.reviews[fieldTeam]} left)`,
      options: [{ id: 'review', label: 'Review', hint: feelsOut ? 'Bowler is convinced: hitting middle' : 'Keeper thinks it was high' }, { id: 'no', label: 'Let it go' }],
      def: 'no',
    };
    const [pick] = this.ask([d], (_, rr) => (feelsOut ? (rr.chance(0.6) ? 'review' : 'no') : rr.chance(0.08) ? 'review' : 'no'));
    if (pick !== 'review') return false;
    if (this.human(fieldTeam)) this.rec.calls[fieldTeam][1]++;
    inn.delays++;
    if (truth === 'out') { if (this.human(fieldTeam)) this.rec.calls[fieldTeam][0]++; notes.push(`DRS: the bowling side reviews... three reds! ${bat.name} has to go.`); return true; }
    if (truth === 'marginal') { notes.push(`DRS: ${this.line('umpiresCall', { bat: bat.name })} Stays not out, review retained.`); return false; }
    inn.reviews[fieldTeam]--;
    notes.push(`DRS: missing the stumps. Not out, and the review is lost.`);
    return false;
  }

  // ----- mind games, sledges, taunts

  mindGame(inn: Inn, over: number, legalBefore: number, bs: BowlState, hat: boolean) {
    const fieldTeam = (1 - inn.team) as 0 | 1;
    const base = `i${inn.idx}-o${over}-b${legalBefore}-${inn.legal}`;
    const situation = inn.superOver ? 'Super Over' : hat ? 'Hat-trick ball' : `Need ${(inn.target ?? 0) - inn.runs} off ${inn.overs * 6 - inn.legal}`;
    const bowlD: Decision = {
      id: `${base}-mindBowl`, kind: 'mindBowl', team: fieldTeam, secret: true, prompt: `${situation}. ${this.name(bs.id)} to ${this.name(inn.striker)}: pick the delivery.`,
      options: [{ id: 'yorker', label: 'Yorker' }, { id: 'bouncer', label: 'Bouncer' }, { id: 'slower', label: 'Slower ball' }, { id: 'wide', label: 'Wide line' }], def: 'yorker',
    };
    const batD: Decision = {
      id: `${base}-mindBat`, kind: 'mindBat', team: inn.team, secret: true, prompt: `${situation}. ${this.name(inn.striker)} faces ${this.name(bs.id)}: pick the shot.`,
      options: [{ id: 'defend', label: 'Defend' }, { id: 'drive', label: 'Drive' }, { id: 'slog', label: 'Slog' }, { id: 'ramp', label: 'Ramp' }],
      def: inn.target !== undefined && (inn.target - inn.runs) / Math.max(1, inn.overs * 6 - inn.legal) > 1.6 ? 'slog' : 'drive',
    };
    const bowler = this.p[bs.id];
    const [b, t] = this.ask([bowlD, batD], (d, r) => {
      if (d.kind === 'mindBowl') {
        const death = bowler.bowling?.death ?? 40;
        return r.weighted(['yorker', 'bouncer', 'slower', 'wide'], isSpin(bowler) ? [15, 5, 45, 35] : [25 + death / 4, 20, 25, 20]);
      }
      const need = inn.target !== undefined ? (inn.target - inn.runs) / Math.max(1, inn.overs * 6 - inn.legal) : 1.5;
      return r.weighted(['defend', 'drive', 'slog', 'ramp'], need > 1.8 ? [5, 25, 50, 20] : need < 0.9 ? [40, 40, 12, 8] : [15, 40, 30, 15]);
    });
    if (this.human(fieldTeam)) this.rec.calls[fieldTeam][1]++;
    if (this.human(inn.team)) this.rec.calls[inn.team][1]++;
    return { bowl: b, bat: t };
  }

  sledgeOffer(inn: Inn, over: number, bs: BowlState, notes: string[], banners: Banner[]) {
    const fieldTeam = (1 - inn.team) as 0 | 1;
    if (inn.sledgeOffers >= 3 || over < 3) return;
    const bat = this.p[inn.striker];
    if (bat.tier < 3 && !this.human(fieldTeam)) return;
    inn.sledgeOffers++;
    const d: Decision = {
      id: `i${inn.idx}-o${over}-${inn.legal}-sledge`, kind: 'sledge', team: fieldTeam,
      prompt: `${bat.name} walks out (${bat.temper}). Give ${this.name(bs.id)} the nod for a word?`,
      options: [{ id: 'none', label: 'Say nothing' }, { id: 'light', label: 'Light chirp', hint: 'Safe' }, { id: 'stare', label: 'Stare-down', hint: 'Might be reported' }, { id: 'heavy', label: 'Heavy sledge', hint: 'Referee will notice' }],
      def: 'none',
    };
    const [pick] = this.ask([d], (_, r) => (bat.temper === 'fiery' ? r.weighted(['none', 'light', 'stare', 'heavy'], [40, 30, 15, 15]) : r.weighted(['none', 'light', 'stare', 'heavy'], [75, 15, 7, 3])));
    if (pick === 'none') return;
    inn.delays++;
    const st = inn.bat.get(bat.id)!;
    const by = bs.id;
    if (pick === 'stare') notes.push(this.line('sledgeStare', { bowl: this.name(by), bat: bat.name }));
    else notes.push(`${this.name(by)}: ${this.line(pick === 'heavy' ? 'sledgeHeavy' : 'sledgeLight', {})}`);
    banners.push('sledge');
    const power = pick === 'heavy' ? 1 : pick === 'stare' ? 0.6 : 0.35;
    const pRattle = bat.temper === 'fiery' ? 0.45 + power * 0.4 : bat.temper === 'steady' ? 0.1 + power * 0.3 : 0.03 + power * 0.07;
    let result: 'ignored' | 'rattled' | 'backfired' = 'ignored';
    if (this.rng.chance(pRattle)) {
      st.fired = 8; result = 'rattled';
      notes.push(this.line('sledgeFired', { bat: bat.name, bowl: this.name(by) }));
    } else {
      notes.push(this.line('sledgeCalm', { bat: bat.name }));
      if (bat.temper === 'calm' && pick === 'heavy' && this.rng.chance(0.4)) { st.focused = 18; result = 'backfired'; }
    }
    if (this.human(fieldTeam)) this.rec.calls[fieldTeam][1]++;
    this.rec.sledges.push({ team: fieldTeam, by, at: bat.id, level: pick, result });
    const reported = pick === 'heavy' || (pick === 'stare' && this.rng.chance(0.35));
    if (reported) this.offence(fieldTeam, by, notes, banners);
  }

  tauntOffer(inn: Inn, over: number, batter: Cricketer, bs: BowlState, notes: string[]) {
    if (inn.taunts >= 2) return;
    const team = inn.team;
    if (!this.human(team) && batter.temper !== 'fiery') return;
    inn.taunts++;
    const d: Decision = {
      id: `i${inn.idx}-o${over}-${inn.legal}-taunt`, kind: 'taunt', team,
      prompt: `${batter.name} just hit ${this.name(bs.id)} for six. Have a word back?`,
      options: [{ id: 'no', label: 'Keep quiet' }, { id: 'taunt', label: 'Taunt him', hint: 'Fires the bowler up; referee may act' }], def: 'no',
    };
    const [pick] = this.ask([d], (_, r) => (r.chance(0.35) ? 'taunt' : 'no'));
    if (pick !== 'taunt') return;
    notes.push(`${batter.name}: ${this.line('taunt', {})}`);
    this.rec.sledges.push({ team, by: batter.id, at: bs.id, level: 'taunt', result: 'ignored' });
    inn.bat.get(batter.id)!.focused = 0;
    if (this.rng.chance(0.5)) this.offence(team, batter.id, notes, []);
  }

  offence(team: 0 | 1, player: string, notes: string[], banners: Banner[]) {
    const n = ++this.offenceCount[team];
    const opp = this.sheets[team].name;
    const level: Offence['level'] = n === 1 ? 'warning' : n === 2 ? 'fine' : 'ban';
    if (n > 3) return;
    notes.push(level === 'warning' ? this.line('refereeWarn', { opp }) : level === 'fine' ? this.line('refereeFine', { opp }) : this.line('refereeBan', { bowl: this.name(player) }));
    banners.push('referee');
    this.rec.offences.push({ team, player, level });
  }

  // ----- Impact Player

  impactBreak(i1: Inn) {
    for (const team of [0, 1] as const) {
      const bench = this.bench[team].filter((id) => this.p[id]);
      if (!bench.length) continue;
      const battedFirst = i1.team === team;
      const xi = this.xi[team];
      const overseas = xi.filter((id) => this.p[id].overseas).length;
      const opts: Option[] = [];
      const pairs: Array<{ inId: string; outId: string; score: number }> = [];
      for (const inId of bench) {
        const c = this.p[inId];
        if (c.overseas && overseas >= 4) continue;
        // Batting first -> now bowling: bring a bowler for a batter who has batted. Chasing: a batter for a bowler.
        if (battedFirst) {
          if (!canBowl(c)) continue;
          const outId = xi.filter((id) => id !== this.keeper[team] && !canBowl(this.p[id])).sort((a, b) => batValue(this.p[a]) - batValue(this.p[b]))[0];
          if (outId) pairs.push({ inId, outId, score: bowlValue(c) });
        } else {
          const outId = xi.filter((id) => id !== this.keeper[team] && canBowl(this.p[id]) && i1.bowl.has(id)).sort((a, b) => batValue(this.p[a]) - batValue(this.p[b]))[0];
          if (outId) pairs.push({ inId, outId, score: batValue(c) });
        }
      }
      pairs.sort((a, b) => b.score - a.score);
      for (const pr of pairs.slice(0, 3)) opts.push({ id: `${pr.inId}>${pr.outId}`, label: `${this.name(pr.inId)} in for ${this.name(pr.outId)}`, hint: battedFirst ? 'Extra bowler' : 'Extra batter' });
      if (!opts.length) continue;
      opts.push({ id: 'none', label: 'No change' });
      const d: Decision = { id: `impact-${team}`, kind: 'impact', team, prompt: `Innings break. Use your Impact Player?`, options: opts, def: opts[0].id };
      const [pick] = this.ask([d], () => opts[0].id);
      if (pick === 'none') continue;
      const [inId, outId] = pick.split('>');
      this.xi[team] = xi.map((id) => (id === outId ? inId : id));
      if (!battedFirst) {
        // The new batter goes in at no. 6, ahead of the tail.
        const order = this.xi[team].filter((id) => id !== inId);
        order.splice(5, 0, inId);
        this.xi[team] = order;
      }
      this.bench[team] = this.bench[team].filter((id) => id !== inId);
      this.rec.impact.push({ team, in: inId, out: outId });
      this.note(`Impact Player: ${this.name(inId)} comes in for ${this.name(outId)} (${this.sheets[team].short}).`, 'impact');
    }
  }

  // ----- finish, super over

  finish(i1: Inn, i2: Inn) {
    const t1 = i1.team; const t2 = i2.team;
    const target = i2.target ?? i1.runs + 1;
    let winner: 0 | 1 | null; let margin: string; let byRuns: number | undefined; let byWkts: number | undefined; let ballsLeft: number | undefined;
    let superOvers = 0;
    if (i2.runs >= target) {
      winner = t2; byWkts = i2.maxWkts - i2.wkts; ballsLeft = i2.overs * 6 - i2.legal;
      margin = `won by ${byWkts} wicket${byWkts === 1 ? '' : 's'} (${ballsLeft} ball${ballsLeft === 1 ? '' : 's'} left)`;
      this.note(this.line('chaseWon', { team: this.sheets[t2].name }));
    } else if (i2.runs === target - 1) {
      this.note(this.line('tie', {}), 'superover');
      const so = this.superOvers(t2, t1);
      winner = so.winner; superOvers = so.count;
      margin = winner === null ? 'tied (shared after Super Overs)' : `won the Super Over${so.count > 1 ? ` (after ${so.count})` : ''}`;
    } else {
      winner = t1; byRuns = target - 1 - i2.runs;
      margin = `won by ${byRuns} run${byRuns === 1 ? '' : 's'}${this.rec.revised ? ' (revised target)' : ''}`;
      this.note(this.line('defended', { opp: this.sheets[t1].name }));
    }
    const potm = this.playerOfMatch(winner);
    const bonus = winner !== null && ((byRuns ?? 0) >= 40 || (ballsLeft ?? 0) >= 24);
    this.rec.outcome = { winner, margin, byRuns, byWkts, ballsLeft, superOvers, potm, bonus };
    this.rec.highlights = this.rec.events.map((e, i) => ({ i, w: e.weight })).sort((a, b) => b.w - a.w).slice(0, 3).map((x) => x.i).sort((a, b) => a - b);
  }

  superOvers(firstBat: 0 | 1, second: 0 | 1): { winner: 0 | 1 | null; count: number } {
    let a = firstBat; let b = second;
    const used: [Set<string>, Set<string>] = [new Set(), new Set()];
    for (let n = 1; n <= 10; n++) {
      this.note(`Super Over ${n > 1 ? n : ''}! ${this.sheets[a].name} bat first.`.replace('  ', ' '), 'superover');
      const ra = this.superInnings(2 * n, a, b, undefined, used);
      const rb = this.superInnings(2 * n + 1, b, a, ra + 1, used);
      if (rb > ra) return { winner: b, count: n };
      if (rb < ra) return { winner: a, count: n };
      if (!this.s.final && n >= 3) return { winner: null, count: n };
      [a, b] = [b, a];
    }
    return { winner: null, count: 10 };
  }

  superInnings(idx: number, team: 0 | 1, field: 0 | 1, target: number | undefined, used: [Set<string>, Set<string>]): number {
    const xi = this.xi[team].filter((id) => !this.injuredOut.has(id));
    const order = xi.slice().sort((x, y) => (this.p[y].bat.power + this.p[y].bat.tempo) - (this.p[x].bat.power + this.p[x].bat.tempo)).slice(0, 3);
    const inn = this.newInn(idx, team, 1, order, target, true);
    // The fielding side's best death bowler who didn't bowl the previous super over.
    const bowlers = this.xi[field].filter((id) => canBowl(this.p[id]) && !used[field].has(id) && !this.injuredOut.has(id));
    const best = bowlers.sort((x, y) => (this.p[y].bowling?.death ?? 0) - (this.p[x].bowling?.death ?? 0))[0] ?? this.xi[field][0];
    used[field].add(best);
    this.sheets[field].bowlers = [best];
    inn.bowl.set(best, { id: best, balls: 0, runs: 0, wkts: 0, dots: 0, maidens: 0, wides: 0, noballs: 0, overRuns: 0, lastOver: -9, spell: 0 });
    const xiField = this.xi[field];
    this.xi[field] = [best, ...xiField.filter((x) => x !== best)];
    const saved = this.eligible;
    this.eligible = () => [best];
    this.bowlOver(inn, 0);
    this.eligible = saved;
    this.xi[field] = xiField;
    this.rec.innings[idx] = this.summary(inn);
    return inn.runs;
  }

  playerOfMatch(winner: 0 | 1 | null): string {
    const score = new Map<string, number>();
    for (const inn of this.rec.innings.slice(0, 2)) {
      if (!inn) continue;
      for (const b of inn.bat) score.set(b.id, (score.get(b.id) ?? 0) + b.runs + b.sixes * 2 + (b.balls >= 10 ? (b.runs / b.balls - 1.3) * 20 : 0));
      for (const b of inn.bowl) score.set(b.id, (score.get(b.id) ?? 0) + b.wkts * 25 + (b.balls >= 12 ? (8 - (b.runs / b.balls) * 6) * 4 : 0) + b.dots);
    }
    let best = ''; let bestS = -1e9;
    for (const [id, sc] of score) {
      const team = this.xi[0].includes(id) || this.sheets[0].xi.includes(id) ? 0 : 1;
      const s = sc + (winner === team ? 15 : 0);
      if (s > bestS) { bestS = s; best = id; }
    }
    return best;
  }

  // ----- events and text

  note(text: string, banner?: Banner) {
    const last = this.rec.events[this.rec.events.length - 1];
    const inn = last?.inn ?? 0;
    this.rec.events.push({ inn, team: last?.team ?? 0, target: last?.target, overs: last?.overs ?? this.rec.overs, crease: last?.crease ?? ['', ''], over: last?.over ?? 0, ball: last?.ball ?? 0, bowler: '', batter: '', runs: 0, extraRuns: 0, text, banners: banner ? [banner] : [], score: last?.score ?? 0, wkts: last?.wkts ?? 0, momentum: this.momentum, notes: [], weight: banner === 'superover' ? 20 : 0 });
  }

  push(inn: Inn, over: number, ball: number, bowler: string, e: { runs: number; extra?: 'wide' | 'noball'; extraRuns: number; wicket?: BallEvent['wicket']; dropped?: string; text: string; banners: Banner[]; notes: string[]; mind?: { bowl: string; bat: string }; freeHit?: boolean; weight: number; batterId?: string }) {
    const scoring = e.runs > 0;
    this.rec.events.push({
      inn: inn.idx, team: inn.team, target: inn.target, overs: inn.overs, crease: [inn.striker, inn.non], over, ball, bowler, batter: e.batterId ?? inn.striker, runs: e.runs, extra: e.extra, extraRuns: e.extraRuns, wicket: e.wicket, dropped: e.dropped,
      freeHit: e.freeHit || undefined, angle: scoring ? Math.round(this.txt.next() * 360) : undefined, dist: scoring ? (e.runs >= 4 ? 1 : 0.3 + this.txt.next() * 0.4) : undefined,
      text: e.text, banners: e.banners, score: inn.runs, wkts: inn.wkts, momentum: this.momentum, mind: e.mind, notes: e.notes, weight: e.weight,
    });
  }

  line(key: string, vars: Record<string, string>): string {
    const arr = (LINES_REF.lines as Record<string, readonly string[]>)[key];
    const raw = arr && arr.length ? arr[Math.floor(this.txt.next() * arr.length)] : FALLBACK[key] ?? key;
    return raw.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  }

  summary(inn: Inn): InningsSummary {
    if (inn.pship.runs > inn.best.runs) inn.best = { runs: inn.pship.runs, a: inn.pship.a, b: inn.pship.b };
    return {
      team: inn.team, runs: inn.runs, wkts: inn.wkts, balls: inn.legal, overs: inn.overs, target: inn.target, extras: inn.extras,
      bat: [...inn.bat.values()].filter((b) => b.balls > 0 || b.out || b.id === inn.striker || b.id === inn.non).map(({ id, runs, balls, fours, sixes, out, fiftyAt }) => ({ id, runs, balls, fours, sixes, out, fiftyAt })),
      bowl: [...inn.bowl.values()].filter((b) => b.balls > 0 || b.runs > 0).map(({ id, balls, runs, wkts, dots, maidens, wides, noballs }) => ({ id, balls, runs, wkts, dots, maidens, wides, noballs })),
      fow: inn.fow, bestPartnership: inn.best,
    };
  }
}

// Fill dismissal details on the batting cards from the events (kept out of the hot loop).
export function dismissals(rec: MatchRecord): Map<string, BallEvent> {
  const m = new Map<string, BallEvent>();
  for (const e of rec.events) if (e.wicket) m.set(`${e.inn}:${e.wicket.out}`, e);
  return m;
}

// ------------------------------------------------------------------ tables

/** Mind-game match-ups: bowler's delivery (rows) vs batter's shot (columns). Values multiply the base model. */
export const MIND: Record<string, Record<string, { four: number; six: number; out: number; dot: number }>> = {
  yorker: { defend: { four: 0.4, six: 0.2, out: 0.6, dot: 1.6 }, drive: { four: 0.8, six: 0.4, out: 1.6, dot: 1.2 }, slog: { four: 0.7, six: 0.8, out: 2.2, dot: 1.3 }, ramp: { four: 0.9, six: 0.6, out: 1.8, dot: 1.2 } },
  bouncer: { defend: { four: 0.5, six: 0.2, out: 0.8, dot: 1.5 }, drive: { four: 0.7, six: 0.6, out: 1.8, dot: 1.2 }, slog: { four: 1.3, six: 1.8, out: 1.4, dot: 0.8 }, ramp: { four: 1.6, six: 1.9, out: 1.2, dot: 0.8 } },
  slower: { defend: { four: 0.6, six: 0.2, out: 0.7, dot: 1.3 }, drive: { four: 0.9, six: 0.8, out: 1.5, dot: 1.1 }, slog: { four: 1.1, six: 1.4, out: 1.9, dot: 0.9 }, ramp: { four: 0.6, six: 0.4, out: 1.9, dot: 1.3 } },
  wide: { defend: { four: 0.5, six: 0.1, out: 0.4, dot: 1.7 }, drive: { four: 1.7, six: 0.9, out: 1.1, dot: 0.8 }, slog: { four: 1.1, six: 0.9, out: 1.8, dot: 1.0 }, ramp: { four: 0.4, six: 0.3, out: 1.4, dot: 1.8 } },
};

const FALLBACK: Record<string, string> = {
  dot: 'Dot ball.', single: 'Single taken.', two: 'Two runs.', three: 'Three.', four: 'FOUR!', six: 'SIX!', wide: 'Wide.', noball: 'No-ball! Free hit next.',
  bowled: '{bat} is bowled!', caught: '{bat} is caught by {fld}!', caughtBehind: '{bat} edges it behind!', lbw: '{bat} is LBW!', runout: '{bat} is run out!', stumped: '{bat} is stumped!',
  dropped: '{fld} drops {bat}!', fifty: 'Fifty for {bat}.', hundred: 'A hundred for {bat}!', hatTrickBall: 'Hat-trick ball!', hatTrick: 'HAT-TRICK for {bowl}!',
  lastOver: '{need} needed off {balls}.', chaseWon: '{team} get there!', defended: '{opp} defend it!', tie: 'Scores level! Super Over!', rain: 'Rain stops play.',
  drsOut: 'Out stands.', drsOverturned: 'Overturned! {bat} survives.', umpiresCall: "Umpire's call.", milestoneWickets: 'Three for {bowl}.',
  sledgeLight: '"Nice bat."', sledgeStare: '{bowl} stares at {bat}.', sledgeHeavy: '"You won\'t last."', sledgeCalm: '{bat} ignores it.', sledgeFired: '{bat} fires back at {bowl}!',
  sledgeBackfire: '{bat} answers with the bat!', taunt: '"Fetch that."', refereeWarn: 'Referee warns {opp}.', refereeFine: '{opp} fined.', refereeBan: '{bowl} banned next match.',
};

/** Set by lines.ts at import time, so the engine runs (with fallbacks) even before the lines exist. */
export const LINES_REF: { lines: Record<string, readonly string[]> } = { lines: {} };

/** Simplified resource table (share of scoring resources left) for rain revisions. */
export function resources(oversLeft: number, wktsLost: number): number {
  if (oversLeft <= 0 || wktsLost >= 10) return 0;
  const cap = Math.pow((10 - wktsLost) / 10, 0.85);
  const k = 0.11 / cap;
  return cap * (1 - Math.exp(-k * oversLeft)) / (1 - Math.exp(-0.11 * 20));
}

export function batValue(c: Cricketer) { return (c.bat.vsPace + c.bat.vsSpin) / 2 * 0.6 + c.bat.power * 0.2 + c.bat.tempo * 0.2; }
export function bowlValue(c: Cricketer) { const b = c.bowling; return b ? b.attack * 0.4 + b.control * 0.3 + b.death * 0.15 + b.powerplay * 0.15 : 0; }

export function bowlTypeLabel(c: Cricketer): string {
  return ({ none: 'does not bowl', fast: 'fast', fastmed: 'fast-medium', medium: 'medium pace', offspin: 'off-spin', legspin: 'leg-spin', slaorth: 'left-arm spin', slachina: 'left-arm wrist spin' } as const)[c.bowl];
}

export function oversText(balls: number) { return `${Math.floor(balls / 6)}.${balls % 6}`; }
