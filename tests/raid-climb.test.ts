import { describe, expect, it } from 'vitest';
import { RAID_LEVELS, bossTiers, legendVillains, levelBosses, nextRaidLevel, runRaid } from '../src/engine/raid';
import { VILLAINS } from '../src/engine/data/villains';
import { canonFor } from '../src/engine/data/canonByName';
import { generateHidden, truePower } from '../src/engine/hidden';
import type { GameState } from '../src/engine/types';
import type { Vault } from '../src/engine/hidden';
import { makeGame, runAuction } from './helpers';

const pool = [...legendVillains(), ...VILLAINS];
const power = (secret: number) => (c: (typeof pool)[number]) => truePower(canonFor(c) ?? generateHidden(c, secret).stats);

describe('boss climb, levels 1 to 5', () => {
  it('cuts the villains into five tiers that get stronger', () => {
    const tiers = bossTiers(pool, 7);
    expect(tiers).toHaveLength(RAID_LEVELS);
    expect(tiers.flat()).toHaveLength(pool.length);
    const p = power(7);
    for (let i = 1; i < tiers.length; i++) expect(Math.max(...tiers[i - 1].map(p))).toBeLessThanOrEqual(Math.min(...tiers[i].map(p)));
  });

  it('picks a random boss from the level tier, and two at level 5', () => {
    const tiers = bossTiers(pool, 7);
    const seen = new Set<string>();
    for (let s = 0; s < 20; s++) {
      const [b] = levelBosses(pool, 7, 1, s);
      expect(tiers[0].map((c) => c.id)).toContain(b.id);
      seen.add(b.id);
    }
    expect(seen.size).toBeGreaterThan(1); // random, not always the same villain
    const top = levelBosses(pool, 7, 5, 3);
    expect(top).toHaveLength(2);
    for (const b of top) expect(tiers[4].map((c) => c.id)).toContain(b.id);
  });

  it('climbs one level per win and ends the run on a loss', () => {
    const { g, vault } = makeGame(4, 3, 'live', 4321) as never as { g: GameState; vault: Vault };
    runAuction(g);
    expect(nextRaidLevel(g)).toBe(1);
    for (let lv = 1, seed = 1; lv && seed < 60; seed++) {
      const { result } = runRaid(g, vault, levelBosses(pool, g.secret, lv, seed), seed, lv);
      expect(result.level).toBe(lv);
      const next = nextRaidLevel(g);
      if (result.won) expect(next).toBe(lv < RAID_LEVELS ? lv + 1 : null);
      else expect(next).toBeNull();
      if (next === null) break;
      lv = next;
    }
  });
});
