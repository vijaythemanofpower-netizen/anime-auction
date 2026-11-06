import { describe, expect, it } from 'vitest';
import { applySetBonus, seriesSets, setBonus, setInterest, warChestFrom } from '../src/engine/sets';
import { npcDecide } from '../src/engine/npc';
import { Rng } from '../src/engine/rng';
import { STAT_KEYS, type GameState, type Stats } from '../src/engine/types';

const game = (rosters: Record<string, Array<[string, string]>>) => {
  const characters: Record<string, unknown> = {};
  const players = Object.entries(rosters).map(([id, r]) => {
    for (const [cid, series] of r) characters[cid] = { id: cid, series, seriesId: series };
    return { id, name: id, roster: r.map((x) => x[0]) };
  });
  return { players, characters } as unknown as GameState;
};

describe('War Chest', () => {
  it('turns every 1,500 unspent coins into one point', () => {
    expect(warChestFrom(0)).toBe(0);
    expect(warChestFrom(1499)).toBe(0);
    expect(warChestFrom(1500)).toBe(1);
    expect(warChestFrom(4600)).toBe(3);
  });
});

describe('Series Sets', () => {
  it('needs two from a series and tops out at three', () => {
    expect(setBonus(1)).toBe(0);
    expect(setBonus(2)).toBe(0.01);
    expect(setBonus(3)).toBe(0.02);
    expect(setBonus(5)).toBe(0.02);
  });

  it('raises every stat without passing the cap, and leaves others alone', () => {
    const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, 100])) as Stats;
    const up = applySetBonus(stats, 0.02);
    for (const k of STAT_KEYS) expect(up[k]).toBe(102);
    expect(applySetBonus(stats, 0)).toBe(stats);
    const top = Object.fromEntries(STAT_KEYS.map((k) => [k, 119])) as Stats;
    for (const k of STAT_KEYS) expect(applySetBonus(top, 0.02)[k]).toBe(120);
  });

  it('lists a player\'s sets and who cares about a lot', () => {
    const g = game({ a: [['1', 'Naruto'], ['2', 'Naruto'], ['3', 'Bleach']], b: [['4', 'Naruto']] });
    expect(seriesSets(g, 'a')).toEqual([{ series: 'Naruto', count: 2, bonus: 0.01 }]);
    expect(seriesSets(g, 'b')).toEqual([]);
    expect(setInterest(g, 'Naruto').map((x) => x.count)).toEqual([2, 1]);
    expect(setInterest(g, 'One Piece')).toEqual([]);
  });

  it('makes NPCs pay more for a lot that builds a set', () => {
    const advice = { label: 'MIGHT TAKE', fairPrice: 1000 } as Parameters<typeof npcDecide>[1];
    const bids = (factor: number) => {
      let n = 0;
      for (let i = 0; i < 400; i++) if (npcDecide('p1', advice, 1100, 5000, false, false, new Rng(i), factor).kind === 'bid') n++;
      return n;
    };
    expect(bids(1.3)).toBeGreaterThan(bids(1));
  });
});
