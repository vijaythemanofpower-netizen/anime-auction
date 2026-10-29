import { describe, expect, it } from 'vitest';
import { createTournament, recordResult, nextPendingMatch, knockoutSizeFor } from '../src/engine/tournament';
import { DEFAULT_TOURNAMENT } from '../src/engine/game';
import { Rng } from '../src/engine/rng';

describe('tournament', () => {
  for (let n = 2; n <= 6; n++) {
    it(`runs a valid tournament for ${n} players`, () => {
      for (const cfg of [DEFAULT_TOURNAMENT, { ...DEFAULT_TOURNAMENT, soloRounds: 2 }, { ...DEFAULT_TOURNAMENT, tagRound: false }]) {
        const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
        const t = createTournament(ids, cfg, 42 + n);
        const rng = new Rng(n);
        let guard = 0;
        while (!t.championId && guard++ < 50) {
          const stage = t.stages[t.currentStage];
          if (stage.kind === 'group') {
            // every player appears exactly once: in one match or as a bye
            const appearances = [...stage.matches.flatMap((m) => m.players), ...stage.byes];
            expect(appearances.sort()).toEqual([...ids].sort());
            expect(stage.byes.length).toBe(n % 2);
          }
          const m = nextPendingMatch(t)!;
          expect(m.players[0]).not.toBe(m.players[1]);
          recordResult(t, m.id, rng.pick(m.players), 'b', 0.5, ids);
        }
        expect(t.championId).toBeTruthy();
        expect(ids).toContain(t.championId);
        const final = t.stages[t.stages.length - 1];
        expect(final.name).toBe('Grand Final');
        expect(final.matches[0].winner).toBe(t.championId);
        if (knockoutSizeFor(n) === 4) {
          const semis = t.stages[t.stages.length - 2];
          expect(semis.name).toBe('Semifinals');
          const semiPlayers = semis.matches.flatMap((m) => m.players);
          expect(new Set(semiPlayers).size).toBe(4);
          expect(final.matches[0].players.sort()).toEqual(semis.matches.map((m) => m.winner!).sort());
        }
        // standings account for everyone
        expect(Object.keys(t.standings).sort()).toEqual([...ids].sort());
      }
    });
  }

  it('rotates byes fairly with odd players', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const t = createTournament(ids, { ...DEFAULT_TOURNAMENT, soloRounds: 3, tagRound: true }, 1);
    const byes: string[] = [];
    while (t.stages[t.currentStage].kind === 'group') {
      byes.push(...t.stages[t.currentStage].byes);
      let m;
      while ((m = nextPendingMatch(t)) && t.stages[t.currentStage].kind === 'group' && m.stageIndex === t.currentStage) recordResult(t, m.id, m.players[0], 'b', 0.5, ids);
    }
    expect(new Set(byes).size).toBe(byes.length);
  });

  it('rejects duplicate or invalid results', () => {
    const ids = ['a', 'b'];
    const t = createTournament(ids, DEFAULT_TOURNAMENT, 1);
    const m = nextPendingMatch(t)!;
    expect(() => recordResult(t, m.id, 'zzz', 'b', 1, ids)).toThrow();
    recordResult(t, m.id, 'a', 'b', 1, ids);
    expect(() => recordResult(t, m.id, 'b', 'b', 1, ids)).toThrow();
  });

  it('rejects invalid player counts', () => {
    expect(() => createTournament(['a'], DEFAULT_TOURNAMENT, 1)).toThrow();
    expect(() => createTournament(['a', 'b', 'c', 'd', 'e', 'f', 'g'], DEFAULT_TOURNAMENT, 1)).toThrow();
    expect(() => createTournament(['a', 'a'], DEFAULT_TOURNAMENT, 1)).toThrow();
  });
});
