import { describe, expect, it } from 'vitest';
import { FIXED_NAMES, PLAYERS } from '../src/engine/data/players';
import { matchPhoto } from '../src/store/photos';
import { autoLineup, controllerOf, createGame, ctxOf, matchSetup, type GameState } from '../src/engine/game';
import { ballSkill, playMatch, shotSkill, type MatchRecord, type MatchSetup } from '../src/engine/match';
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

describe('play mode as a game', () => {
  it('shows the batter the ball that was bowled, and gives better batters more time', async () => {
    const { timingQ } = await import('../src/ui/ground');
    const g = game(11);
    const setup: MatchSetup = { ...matchSetup(g, P, g.franchises[0].id, g.franchises[1].id, 99), overs: 5, play: true };
    const answers: Record<string, string> = {};
    let rec = playMatch(setup, answers);
    let seen = 0;
    for (let i = 0; i < 400 && rec.pending?.length && seen < 6; i++) {
      for (const d of rec.pending) {
        if (d.kind === 'batBall') { expect(['length', 'yorker', 'bouncer', 'slower', 'wide']).toContain(d.meta?.ball); expect(d.meta?.acc).toBeGreaterThanOrEqual(0); seen++; }
        answers[d.id] = d.meta ? 'auto' : d.def;
      }
      rec = playMatch(setup, answers);
    }
    expect(seen).toBeGreaterThan(0);
    // 100 ms late: fine for a top batter, a poor one for a tail-ender.
    expect(timingQ(100, 0.3)).toBeGreaterThan(timingQ(100, 0.08));
    expect(timingQ(0, 0.08)).toBe(3);
  });
});

describe('players play to their own ratings', () => {
  it('rates each shot and delivery from the player, and gives the weaker player a smaller window', () => {
    const hitter = [...PLAYERS].sort((a, b) => b.bat.power - a.bat.power)[0];
    const tail = [...PLAYERS].sort((a, b) => a.bat.power - b.bat.power)[0];
    expect(shotSkill(hitter, false, 'slog')).toBeGreaterThan(shotSkill(tail, false, 'slog') + 25);
    const death = [...PLAYERS].filter((p) => p.bowling).sort((a, b) => b.bowling!.death - a.bowling!.death)[0];
    const part = [...PLAYERS].filter((p) => p.bowling).sort((a, b) => a.bowling!.death - b.bowling!.death)[0];
    expect(ballSkill(death, 'yorker')).toBeGreaterThan(ballSkill(part, 'yorker') + 25);

    const g = game(11);
    const setup: MatchSetup = { ...matchSetup(g, P, g.franchises[0].id, g.franchises[1].id, 99), overs: 5, play: true };
    const answers: Record<string, string> = {};
    let rec = playMatch(setup, answers);
    let checked = 0;
    for (let i = 0; i < 300 && rec.pending?.length && checked < 5; i++) {
      for (const d of rec.pending) {
        if (d.meta) {
          const skills = d.options.map((o) => o.skill!);
          expect(Math.min(...skills)).toBeGreaterThan(0);
          // The better the player is at an option, the wider its window.
          const best = d.options.reduce((a, b) => (b.skill! > a.skill! ? b : a)), worst = d.options.reduce((a, b) => (b.skill! < a.skill! ? b : a));
          expect(d.meta.zones![best.id]).toBeGreaterThanOrEqual(d.meta.zones![worst.id]);
          checked++;
        }
        answers[d.id] = d.meta ? 'auto' : d.def;
      }
      rec = playMatch(setup, answers);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('sends the ball where the shot was aimed', () => {
    const g = game(12);
    const setup: MatchSetup = { ...matchSetup(g, P, g.franchises[0].id, g.franchises[1].id, 7), overs: 5, play: true };
    const rec = playOut(setup, (k) => (k === 'batBall' ? 'drive@3' : 'length@2'));
    const drives = rec.events.filter((e) => e.mind?.bat === 'drive' && e.runs > 0 && e.angle !== undefined && P[e.batter].bats === 'R');
    expect(drives.length).toBeGreaterThan(3);
    // A right-hander's drive goes straight or through the off side, never behind square.
    for (const e of drives) expect(e.angle! <= 60 || e.angle! >= 345).toBe(true);
  });
});

describe('shared teams', () => {
  it('shares the XI between teammates and lets them claim players', () => {
    let g = createGame({ humans: [{ id: 'a', name: 'A', color: '#fff' }, { id: 'b', name: 'B', color: '#000' }], teamMode: 'teams', teams: [0, 0], npcs: 1, mode: 'standard', timer: 10, mystery: false, realNames: false, seed: 5 }, PLAYERS, 0);
    const r = simulateAuction(g, 0);
    g = { ...g, franchises: finishAuction(ctxOf({ ...g, franchises: r.franchises }, P), r.a, g.poolIds) };
    const f = g.franchises.find((x) => x.owners.length === 2)!;
    g.lineups[f.id] = autoLineup(f.squad.map((id) => P[id]), g.form);
    const xi = g.lineups[f.id].xi;
    expect(new Set(xi.map((id) => controllerOf(g, f.id, id)))).toEqual(new Set(['a', 'b']));
    g.lineups[f.id] = { ...g.lineups[f.id], play: { [xi[0]]: 'b', [xi[1]]: 'b' } };
    expect(controllerOf(g, f.id, xi[0])).toBe('b');
    expect(controllerOf(g, f.id, xi[1])).toBe('b');
    // A pick for someone outside the team is ignored.
    g.lineups[f.id] = { ...g.lineups[f.id], play: { [xi[0]]: 'zz' } };
    expect(controllerOf(g, f.id, xi[0])).toBe('a');
  });
});
