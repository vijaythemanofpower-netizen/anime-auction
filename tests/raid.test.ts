import { describe, expect, it } from 'vitest';
import { legendVillains, raidTeam, runRaid } from '../src/engine/raid';
import { makeGame, runAuction } from './helpers';

describe('raid boss', () => {
  it('can be won or lost, crowns an MVP, and leaves the tournament alone', () => {
    const { g, vault } = makeGame(4, 3, 'live', 4321) as never as { g: import('../src/engine/types').GameState; vault: import('../src/engine/hidden').Vault };
    runAuction(g);
    const before = JSON.stringify({ c: g.conditions, coins: g.players.map((p) => p.coins), t: g.tournament });
    expect(raidTeam(g, vault).length).toBe(6);
    let won = 0, lost = 0;
    for (const boss of legendVillains().slice(0, 6)) for (let k = 0; k < 3; k++) {
      const { record, result } = runRaid(g, vault, boss, 50 + k);
      if (result.won) won++; else lost++;
      expect(record.kind).toBe('raid');
      expect(result.mvp).toBe(result.contributions[0].charId);
      expect(result.contributions.every((c) => c.score >= 0)).toBe(true);
    }
    expect(won).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);
    expect(g.raids?.length).toBe(18);
    expect(JSON.stringify({ c: g.conditions, coins: g.players.map((p) => p.coins), t: g.tournament })).toBe(before);
  });
});
