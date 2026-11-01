import { describe, expect, it, vi } from 'vitest';
import { arenaFit } from '../src/engine/arenaFit';
import { simulateBattle } from '../src/engine/combat/engine';
import { buildBattleInput, startMatch, startTournament } from '../src/engine/game';
import { makeGame, runAuction } from './helpers';

describe('arena fit', () => {
  it('scores elements and styles against the arena', () => {
    expect(arenaFit({ tags: ['FIRE'], archetype: 'Berserker' }, 'volcano')).toBeGreaterThan(1);
    expect(arenaFit({ tags: ['ICE'], archetype: 'Support' }, 'volcano')).toBeLessThan(0);
    expect(arenaFit({ tags: [], archetype: 'Mage' }, 'colosseum')).toBe(0);
    expect(arenaFit({ tags: [], archetype: 'Duelist' }, 'colosseum')).toBe(1);
  });

  it('gives a suited fighter a better chance, not a sure win', async () => {
    const { g, vault } = makeGame(2, 3, 'live', 2024) as never as { g: import('../src/engine/types').GameState; vault: import('../src/engine/hidden').Vault };
    runAuction(g);
    startTournament(g);
    expect(startMatch(g, vault).ok).toBe(true);
    const base = buildBattleInput(g, vault, 1);
    base.environmentId = 'colosseum';
    // Side 0 fights as Duelists (suited to the neutral arena), side 1 as Tanks (no fit).
    base.sides[0].fighters.forEach((f) => { f.archetype = 'Duelist'; });
    base.sides[1].fighters.forEach((f, i) => { f.archetype = 'Tank'; f.stats = { ...base.sides[0].fighters[i].stats }; });
    const rate = (sim: typeof simulateBattle) => {
      let w = 0;
      for (let s = 0; s < 400; s++) if (sim({ ...structuredClone(base), seed: s }).winnerSide === 0) w++;
      return w / 400;
    };
    const suited = rate((await import('../src/engine/combat/engine')).simulateBattle);
    // The same fights with the arena edge switched off.
    vi.resetModules();
    vi.doMock('../src/engine/arenaFit', () => ({ arenaFit: () => 0, fitEdge: () => 1 }));
    const plainSim = (await import('../src/engine/combat/engine')).simulateBattle;
    const plain = rate(plainSim);
    vi.doUnmock('../src/engine/arenaFit');
    console.log('arena fit win rate', { suited, plain });
    expect(suited).toBeGreaterThan(plain);
    expect(suited).toBeLessThan(1);
  });
});
