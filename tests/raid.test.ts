import { describe, expect, it } from 'vitest';
import { legendVillains, raidTeam, runRaid } from '../src/engine/raid';
import { makeGame, runAuction } from './helpers';

describe('raid boss', () => {
  it('can be won or lost, crowns an MVP, and leaves the tournament alone', () => {
    const { g, vault } = makeGame(4, 3, 'live', 4321) as never as { g: import('../src/engine/types').GameState; vault: import('../src/engine/hidden').Vault };
    runAuction(g);
    const before = JSON.stringify({ c: g.conditions, coins: g.players.map((p) => p.coins), t: g.tournament });
    expect(raidTeam(g, vault).length).toBe(8); // 4 players x 2 each
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

describe('healers', () => {
  it('mend hurt teammates and sometimes bring one back, never past full health', async () => {
    const { simulateBattle } = await import('../src/engine/combat/engine');
    const { buildRaidInput, legendVillains } = await import('../src/engine/raid');
    const { g, vault } = makeGame(4, 3, 'live', 99) as never as { g: import('../src/engine/types').GameState; vault: import('../src/engine/hidden').Vault };
    runAuction(g);
    let mends = 0, revives = 0;
    for (let k = 0; k < 20; k++) {
      const input = buildRaidInput(g, vault, legendVillains()[k % 11], 300 + k);
      // Make two of the party healers to exercise the mechanic.
      input.sides[0].fighters[1].archetype = 'Support';
      input.sides[0].fighters[4].archetype = 'Support';
      const r = simulateBattle(input);
      for (const e of r.events) {
        if (e.type === 'heal' && e.context?.mend) { mends++; expect(e.actor).not.toBe(e.target); }
        if (e.type === 'heal' && e.context?.revive) revives++;
        if (e.type === 'heal' && e.hpAfter !== undefined) {
          const max = r.fighters.find((f) => f.charId === e.target)!.maxHp;
          expect(e.hpAfter).toBeLessThanOrEqual(max);
        }
      }
    }
    expect(mends).toBeGreaterThan(5);
    expect(revives).toBeGreaterThan(0);
  });
});

describe('raid comics', () => {
  it('draw the boss in a good share of the panels', async () => {
    const { buildComic, COMIC_LENGTHS } = await import('../src/engine/comic');
    const { g, vault } = makeGame(3, 3, 'live', 777) as never as { g: import('../src/engine/types').GameState; vault: import('../src/engine/hidden').Vault };
    runAuction(g);
    const boss = legendVillains()[0];
    const { record } = runRaid(g, vault, boss, 12);
    const script = buildComic(record, g.characters, { max: COMIC_LENGTHS.whole });
    const withBoss = script.panels.filter((p) => p.focus === boss.id || p.other === boss.id).length;
    expect(withBoss / script.panels.length).toBeGreaterThan(0.5);
  });
});

describe('pre-fight poll', () => {
  it('asks who wins, who falls first and who deals the most damage, with right answers', async () => {
    const { preFightPoll } = await import('../src/engine/predictions');
    const { g, vault } = makeGame(3, 3, 'live', 31) as never as { g: import('../src/engine/types').GameState; vault: import('../src/engine/hidden').Vault };
    runAuction(g);
    const { record } = runRaid(g, vault, legendVillains()[1], 5);
    const qs = preFightPoll(record, ['Party', 'Boss']);
    expect(qs.map((q) => q.id)).toContain('winner');
    expect(qs.find((q) => q.id === 'winner')!.answer).toBe(String(record.result.winnerSide));
    for (const q of qs) expect(q.options.some((o) => o.id === q.answer)).toBe(true);
  });
});

describe('multi-boss raids', () => {
  it('put up to four bosses in the fight and name them all', () => {
    const { g, vault } = makeGame(3, 3, 'live', 55) as never as { g: import('../src/engine/types').GameState; vault: import('../src/engine/hidden').Vault };
    runAuction(g);
    const bosses = legendVillains().slice(0, 5);
    const { record, result } = runRaid(g, vault, bosses, 3);
    expect(record.input.sides[1].fighters.map((f) => f.charId)).toEqual(bosses.slice(0, 4).map((b) => b.id));
    expect(result.bossIds).toHaveLength(4);
    expect(result.bossName).toContain(' & ');
  });
});
