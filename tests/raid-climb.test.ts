import { describe, expect, it } from 'vitest';
import { RAID_LEVELS, bossCount, bossTiers, buildRaidInput, legendVillains, levelBosses, nextRaidLevel, runRaid } from '../src/engine/raid';
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

  it('sends one boss per level, two at level 5 or from level 3 for a big party', () => {
    expect([1, 2, 3, 4, 5].map((lv) => bossCount(lv, 4))).toEqual([1, 1, 1, 1, 2]);
    expect([1, 2, 3, 4, 5].map((lv) => bossCount(lv, 8))).toEqual([1, 1, 2, 2, 2]);
    expect(levelBosses(pool, 7, 3, 1, [], 8)).toHaveLength(2);
  });

  it('makes every level tougher, raids only', () => {
    const { g, vault } = makeGame(2, 3, 'live', 99) as never as { g: GameState; vault: Vault };
    runAuction(g);
    const boss = (lv?: number) => buildRaidInput(g, vault, pool[0], 5, lv).sides[1].fighters[0].boss!;
    for (let lv = 2; lv <= RAID_LEVELS; lv++) {
      expect(boss(lv).hpScale).toBeGreaterThan(boss(lv - 1).hpScale);
      expect(boss(lv).power).toBeGreaterThan(boss(lv - 1).power);
    }
    expect(boss(1).hpScale).toBeGreaterThan(boss().hpScale);
  });

  it('limits a healer to three mends a fight', () => {
    const { g, vault } = makeGame(4, 3, 'live', 321) as never as { g: GameState; vault: Vault };
    runAuction(g);
    for (let seed = 1; seed < 12; seed++) {
      const { record } = runRaid(g, vault, pool.slice(0, 2), seed, 5);
      const mends = new Map<string, number>();
      for (const e of record.result.events) if (e.type === 'heal' && e.context?.mend && e.actor) mends.set(e.actor, (mends.get(e.actor) ?? 0) + 1);
      for (const n of mends.values()) expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('never repeats a villain at a level until the whole tier has been fought', () => {
    const tier = bossTiers(pool, 7)[0];
    const seen: string[] = [];
    for (let run = 0; run < tier.length; run++) seen.push(levelBosses(pool, 7, 1, run * 31 + 5, seen)[0].id);
    expect(new Set(seen).size).toBe(tier.length); // every weak villain once
    const again = levelBosses(pool, 7, 1, 999, seen)[0].id;
    expect(again).toBe(seen[0]); // then the least recently fought comes back first
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
