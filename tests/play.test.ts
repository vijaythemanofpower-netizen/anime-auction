import { describe, expect, it } from 'vitest';
import { PLAYERS } from '../src/engine/data/players';
import { autoLineup, createGame, ctxOf, matchSetup, type GameState } from '../src/engine/game';
import { playMatch, type MatchRecord, type MatchSetup } from '../src/engine/match';
import { finishAuction } from '../src/engine/auction';
import { simulateAuction } from '../src/store/store';
import type { Cricketer } from '../src/engine/types';

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

  it('stays deterministic: same answers, same match', () => {
    const a = playOut(setup, () => 'auto');
    const b = playOut(setup, () => 'auto');
    expect(a.events.map((e) => e.text)).toEqual(b.events.map((e) => e.text));
  });
});
