// A season: league (round robin) -> playoffs -> final. Pure.
// 4+ teams: IPL-style playoffs (Qualifier 1: 1v2, Eliminator: 3v4, Qualifier 2: loser Q1 v winner Elim, Final).
// 2-3 teams: double round robin, then a final between the top two.
import type { MatchRecord } from './match';

export type Stage = 'league' | 'q1' | 'elim' | 'q2' | 'final';
export const STAGE_LABEL: Record<Stage, string> = { league: 'League', q1: 'Qualifier 1', elim: 'Eliminator', q2: 'Qualifier 2', final: 'Final' };

export interface Result {
  winner: string | null;
  margin: string;
  potm: string;
  /** Runs scored and balls used for net run rate (all out counts the full quota). */
  runs: Record<string, number>;
  balls: Record<string, number>;
  /** Player runs and wickets, for the Orange and Purple Caps. */
  bat: Record<string, number>;
  wkts: Record<string, number>;
}

export interface Fixture { id: string; home: string; away: string; stage: Stage; result?: Result }

export interface Season { fixtures: Fixture[]; champion?: string }

export interface Row { id: string; p: number; w: number; l: number; nr: number; pts: number; nrr: number }

export function makeSeason(ids: string[]): Season {
  const teams = ids.slice();
  if (teams.length % 2) teams.push('BYE');
  const rounds: Array<[string, string]> = [];
  // Circle method: every team plays every other once.
  const n = teams.length;
  let rot = teams.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const round = [teams[0], ...rot];
    for (let i = 0; i < n / 2; i++) {
      const a = round[i]; const b = round[n - 1 - i];
      if (a !== 'BYE' && b !== 'BYE') rounds.push(r % 2 ? [b, a] : [a, b]);
    }
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  // Few teams: play each other twice so the league means something.
  const legs = ids.length < 4 ? [...rounds, ...rounds.map(([a, b]) => [b, a] as [string, string])] : rounds;
  return { fixtures: legs.map(([home, away], i) => ({ id: `L${i + 1}`, home, away, stage: 'league' })) };
}

export function table(s: Season, ids: string[]): Row[] {
  const rows = new Map(ids.map((id) => [id, { id, p: 0, w: 0, l: 0, nr: 0, pts: 0, rf: 0, bf: 0, ra: 0, ba: 0 }]));
  for (const f of s.fixtures) {
    if (f.stage !== 'league' || !f.result) continue;
    const r = f.result;
    for (const [me, op] of [[f.home, f.away], [f.away, f.home]] as const) {
      const x = rows.get(me)!;
      x.p++;
      if (r.winner === me) { x.w++; x.pts += 2; } else if (r.winner === op) x.l++; else { x.nr++; x.pts += 1; }
      x.rf += r.runs[me] ?? 0; x.bf += r.balls[me] ?? 0; x.ra += r.runs[op] ?? 0; x.ba += r.balls[op] ?? 0;
    }
  }
  return [...rows.values()].map((x) => ({ id: x.id, p: x.p, w: x.w, l: x.l, nr: x.nr, pts: x.pts, nrr: (x.bf ? (x.rf / x.bf) * 6 : 0) - (x.ba ? (x.ra / x.ba) * 6 : 0) }))
    .sort((a, b) => b.pts - a.pts || b.nrr - a.nrr || b.w - a.w);
}

/** The next fixture still to be played (league first, then playoffs as they are drawn). */
export function nextFixture(s: Season): Fixture | undefined {
  return s.fixtures.find((f) => !f.result);
}

/** Result of a finished match (team 0 = home). */
export function resultOf(rec: MatchRecord, home: string, away: string): Result {
  const ids = [home, away];
  const runs: Record<string, number> = {}; const balls: Record<string, number> = {};
  const bat: Record<string, number> = {}; const wkts: Record<string, number> = {};
  for (const inn of rec.innings.slice(0, 2)) {
    if (!inn) continue;
    const id = ids[inn.team];
    runs[id] = inn.runs;
    balls[id] = inn.wkts >= 10 ? inn.overs * 6 : inn.balls;
    for (const b of inn.bat) bat[b.id] = (bat[b.id] ?? 0) + b.runs;
    for (const b of inn.bowl) if (b.wkts) wkts[b.id] = (wkts[b.id] ?? 0) + b.wkts;
  }
  const o = rec.outcome!;
  return { winner: o.winner === null ? null : ids[o.winner], margin: o.margin, potm: o.potm, runs, balls, bat, wkts };
}

/** Record a result and draw the next playoff fixtures when a stage completes. */
export function record(s: Season, fixtureId: string, r: Result, ids: string[]): Season {
  const fixtures = s.fixtures.map((f) => (f.id === fixtureId ? { ...f, result: r } : f));
  const next: Season = { ...s, fixtures };
  const by = (st: Stage) => fixtures.find((f) => f.stage === st);
  const done = (st: Stage) => !!by(st)?.result;
  const t = table(next, ids);
  // A tied playoff (no super-over winner): the higher-placed team goes through.
  const win = (f: Fixture) => f.result!.winner ?? (t.findIndex((x) => x.id === f.home) < t.findIndex((x) => x.id === f.away) ? f.home : f.away);
  const lose = (f: Fixture) => (win(f) === f.home ? f.away : f.home);
  const leagueDone = fixtures.filter((f) => f.stage === 'league').every((f) => f.result);
  if (leagueDone && !by('q1') && !by('final')) {
    if (ids.length >= 4) fixtures.push({ id: 'Q1', home: t[0].id, away: t[1].id, stage: 'q1' }, { id: 'EL', home: t[2].id, away: t[3].id, stage: 'elim' });
    else fixtures.push({ id: 'F', home: t[0].id, away: t[1].id, stage: 'final' });
  }
  if (done('q1') && done('elim') && !by('q2')) fixtures.push({ id: 'Q2', home: lose(by('q1')!), away: win(by('elim')!), stage: 'q2' });
  if (done('q2') && !by('final')) fixtures.push({ id: 'F', home: win(by('q1')!), away: win(by('q2')!), stage: 'final' });
  if (done('final')) next.champion = win(by('final')!);
  return next;
}

/** Orange Cap (most runs) and Purple Cap (most wickets), top five each. */
export function caps(s: Season): { orange: Array<[string, number]>; purple: Array<[string, number]> } {
  const runs = new Map<string, number>(); const wk = new Map<string, number>();
  for (const f of s.fixtures) {
    if (!f.result) continue;
    for (const [id, n] of Object.entries(f.result.bat)) runs.set(id, (runs.get(id) ?? 0) + n);
    for (const [id, n] of Object.entries(f.result.wkts)) wk.set(id, (wk.get(id) ?? 0) + n);
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { orange: top(runs), purple: top(wk) };
}
