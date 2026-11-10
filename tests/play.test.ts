import { describe, expect, it } from 'vitest';
import { FIXED_NAMES, PLAYERS } from '../src/engine/data/players';
import { matchPhoto } from '../src/store/photos';
import { autoLineup, createGame, ctxOf, matchSetup, type GameState } from '../src/engine/game';
import { playMatch, type MatchRecord, type MatchSetup } from '../src/engine/match';
import { finishAuction } from '../src/engine/auction';
import { simulateAuction } from '../src/store/store';
import type { Cricketer } from '../src/engine/types';
import { caps, makeSeason, nextFixture, record, table, type Result } from '../src/engine/season';

const P: Record<string, Cricketer> = Object.fromEntries(PLAYERS.map((p) => [p.id, p]));

function game(seed: number): GameState {
  let g = createGame({ humans: [{ id: 'h0', name: 'P0', color: '#fff' }], teamMode: 'solo', npcs: 1, mode: 'standard', timer: 10, mystery: false, realNames: false, seed }, PLAYERS, 0);
  const r = simulateAuction(g, 0);
  g = { ...g, franchises: finishAuction(ctxOf({ ...g, franchises: r.franchises }, P), r.a, g.poolIds) };
  for (const f of g.franchises) g.lineups[f.id] = autoLineup(f.squad.map((id) => P[id]), g.form);
  return g;
}

/** Answer every play-mode ball with `pick`, everything else with its default. */
function playOut(setup: MatchSetup, pick: (kind: string) => string): MatchRecord {
  const answers: Record<string, string> = {};
  let rec = playMatch(setup, answers);
  for (let i = 0; i < 2000 && rec.pending?.length; i++) {
    for (const d of rec.pending) answers[d.id] = d.kind === 'batBall' || d.kind === 'bowlBall' ? pick(d.kind) : d.def;
    rec = playMatch(setup, answers);
  }
  return rec;
}

describe('roster corrections', () => {
  it('applies every correction and fixes the misfiled bowlers', () => {
    const names = new Set(PLAYERS.map((p) => p.realName));
    expect(FIXED_NAMES.filter((n) => !names.has(n))).toEqual([]);
    const by = (n: string) => PLAYERS.find((p) => p.realName === n)!;
    for (const n of ['Pat Cummins', 'Arshdeep Singh', 'T. Natarajan']) expect(by(n).role).toBe('pace');
    expect(by('Jasprit Bumrah').bowling!.death).toBeGreaterThan(by('Kagiso Rabada').bowling!.death);
  });
});

describe('photo import', () => {
  it('matches file names to players by real name, alike name or id', () => {
    expect(matchPhoto('Virat Kohli.jpg', PLAYERS)).toBe(PLAYERS.find((p) => p.realName === 'Virat Kohli')!.id);
    expect(matchPhoto('jasprit-bumrah.PNG', PLAYERS)).toBe(PLAYERS.find((p) => p.realName === 'Jasprit Bumrah')!.id);
    expect(matchPhoto('random-picture.jpg', PLAYERS)).toBeUndefined();
  });
});

describe('season', () => {
  it('runs a 5-team league, IPL playoffs and a final to a champion', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    let s = makeSeason(ids);
    expect(s.fixtures.filter((f) => f.stage === 'league')).toHaveLength(10);
    const res = (w: string | null, h: string, a: string): Result => ({ winner: w, margin: '', potm: '', runs: { [h]: 160, [a]: 150 }, balls: { [h]: 120, [a]: 120 }, bat: { x: 30 }, wkts: { y: 2 } });
    for (let i = 0; i < 20; i++) {
      const f = nextFixture(s);
      if (!f) break;
      // Alphabetical order wins, so the table is a, b, c, d, e.
      s = record(s, f.id, res([f.home, f.away].sort()[0], f.home, f.away), ids);
    }
    expect(s.fixtures.map((f) => f.stage).slice(-4)).toEqual(['q1', 'elim', 'q2', 'final']);
    expect(table(s, ids).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(s.champion).toBe('a');
    expect(caps(s).orange[0]).toEqual(['x', 30 * 14]);
  });

  it('two teams play home and away, then a final', () => {
    const s = makeSeason(['a', 'b']);
    expect(s.fixtures).toHaveLength(2);
  });
});

describe('play mode', () => {
  const g = game(4242);
  const base = matchSetup(g, P, g.franchises[0].id, g.franchises[1].id, 99);
  const setup: MatchSetup = { ...base, overs: 5, play: true };

  it('asks the human for every ball and finishes the match', () => {
    const rec = playOut(setup, () => 'auto');
    expect(rec.outcome).toBeDefined();
    expect(rec.pending ?? []).toHaveLength(0);
    // Every legal ball involving the human side carried a delivery v shot duel.
    const balls = rec.events.filter((e) => e.bowler && e.inn < 2);
    expect(balls.every((e) => e.mind)).toBe(true);
  });

  it('rewards good timing: perfect shots outscore missed ones', () => {
    let good = 0; let bad = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = { ...setup, seed };
      const human = (rec: MatchRecord) => rec.innings.slice(0, 2).find((x) => x.team === 0)!.runs;
      good += human(playOut(s, (k) => (k === 'batBall' ? 'drive@3' : 'length@2')));
      bad += human(playOut(s, (k) => (k === 'batBall' ? 'drive@0' : 'length@2')));
    }
    expect(good).toBeGreaterThan(bad * 1.3);
  });

  it('lets the batting side choose who comes in after a wicket', () => {
    const answers: Record<string, string> = {};
    let rec = playMatch(setup, answers);
    let chose = false;
    for (let i = 0; i < 2000 && rec.pending?.length; i++) {
      for (const d of rec.pending) {
        if (d.kind === 'nextBat') { answers[d.id] = d.options[d.options.length - 1].id; chose = true; }
        else answers[d.id] = d.kind === 'batBall' ? 'slog@0' : d.kind === 'bowlBall' ? 'auto' : d.def;
      }
      rec = playMatch(setup, answers);
    }
    expect(chose).toBe(true);
    expect(rec.outcome).toBeDefined();
  });

  it('ignores malformed answers instead of crashing (online guests are untrusted)', () => {
    let rec = playMatch(setup, {});
    const answers: Record<string, string> = {};
    for (let i = 0; i < 2000 && rec.pending?.length; i++) {
      for (const d of rec.pending) answers[d.id] = d.meta ? 'drive@9' : `${d.options[0].id}@x`;
      rec = playMatch(setup, answers);
      if (rec.pending?.length) for (const d of rec.pending) answers[d.id] = d.meta ? 'auto' : d.def;
      rec = playMatch(setup, answers);
    }
    expect(rec.outcome).toBeDefined();
  });

  it('never rain-cuts a 5-over match', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rec = playOut({ ...setup, seed, weather: 'rain' }, () => 'auto');
      expect(rec.overs).toBe(5);
      expect(rec.revised).toBeUndefined();
    }
  });

  it('stays deterministic: same answers, same match', () => {
    const a = playOut(setup, () => 'auto');
    const b = playOut(setup, () => 'auto');
    expect(a.events.map((e) => e.text)).toEqual(b.events.map((e) => e.text));
  });
});
