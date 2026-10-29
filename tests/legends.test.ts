import { describe, expect, it } from 'vitest';
import { LEGEND_CHARACTERS, LEGEND_KITS } from '../src/engine/data/legends';
import { LEGEND_MOVESETS } from '../src/engine/data/legendMoves';
import { ABILITY_IDS, ABILITIES, getAbility, vfxOf } from '../src/engine/data/abilities';
import { ORIGINAL_CHARACTERS } from '../src/engine/data/originals';
import { generateHidden, Vault } from '../src/engine/hidden';
import * as G from '../src/engine/game';
import { narrate, validateNarration } from '../src/engine/narration';
import { setup, runAuction, runTournament } from './helpers';

describe('anime legends', () => {
  it('has 76 real characters with official AniList images and unique ids', () => {
    expect(LEGEND_CHARACTERS).toHaveLength(76);
    expect(new Set(LEGEND_CHARACTERS.map((c) => c.id)).size).toBe(76);
    for (const c of LEGEND_CHARACTERS) {
      expect(c.source).toBe('legend');
      expect(c.imageUrl).toMatch(/^https:\/\/s4\.anilist\.co\/file\/anilistcdn\/character\/large\//);
      expect(c.anilistId).toBeGreaterThan(0);
    }
  });

  it('gives every character four signature moves of their own', () => {
    for (const c of LEGEND_CHARACTERS) {
      const key = c.id.replace('legend:', '');
      const moves = LEGEND_MOVESETS[key];
      expect(moves).toHaveLength(4);
      for (const m of moves) {
        expect(m.owner).toBe(key);
        expect(m.look && m.look.length).toBeGreaterThan(20);
        expect(ABILITIES[m.id]).toBe(m);
        expect(vfxOf(m)).toBeTruthy();
      }
      expect(c.knownAbilities).toEqual([moves[0].id, moves[1].id]);
      const h = generateHidden(c, 77);
      expect(h.hiddenAbility).toBe(moves[2].id);
      expect(h.evolution.unlockAbility).toBe(moves[3].id);
      expect(h.evolution.formName).toBe(LEGEND_KITS[c.id].form);
    }
  });

  it('never hands signature moves to other characters', () => {
    for (const id of ABILITY_IDS) expect(getAbility(id).owner).toBeUndefined();
    for (const c of ORIGINAL_CHARACTERS) {
      for (let s = 0; s < 5; s++) {
        const h = generateHidden(c, s);
        expect(getAbility(h.hiddenAbility).owner).toBeUndefined();
        expect(getAbility(h.evolution.unlockAbility).owner).toBeUndefined();
      }
    }
  });

  it('every generic move has a visual effect', () => {
    for (const id of ABILITY_IDS) expect(vfxOf(getAbility(id))).toBeTruthy();
  });

  it('plays a full tournament with legends and grounded narration', () => {
    const g = G.newGame(setup(4, 4, 'live'), 4242);
    const vault = new Vault(g.secret);
    G.autoFillPool(g, vault, LEGEND_CHARACTERS);
    runAuction(g);
    const records = runTournament(g, vault, 9);
    expect(g.phase).toBe('champion');
    let movesSeen = 0;
    for (const r of records) {
      const stageName = 'Test stage 1';
      const lines = narrate(r.input, r.result, { prices: g.prices, playerNames: Object.fromEntries(g.players.map((p) => [p.id, p.name])), previousLoss: {}, stageName });
      expect(validateNarration(lines, r.input, r.result, { stageName })).toEqual([]);
      movesSeen += r.result.events.filter((e) => e.type === 'ability' && e.ability && getAbility(e.ability).owner).length;
    }
    expect(movesSeen).toBeGreaterThan(5);
  });

  it('the same matchup does not always produce the same winner', () => {
    const g = G.newGame(setup(2, 3, 'live'), 99);
    const vault = new Vault(g.secret);
    G.autoFillPool(g, vault, LEGEND_CHARACTERS);
    runAuction(g);
    const [first] = runTournament(g, vault, 1);
    const winners = new Set<number>();
    for (let s = 0; s < 60; s++) winners.add(G.freshRematch(g, first, 1000 + s).result.winnerSide);
    expect(winners.size).toBe(2);
  });
});

describe('what decided it', () => {
  it('re-simulates deterministically and lists factors from the log', async () => {
    const { explainOutcome, reSimulate } = await import('../src/engine/outcome');
    const g = G.newGame(setup(2, 3, 'live'), 5150);
    const vault = new Vault(g.secret);
    G.autoFillPool(g, vault, LEGEND_CHARACTERS);
    runAuction(g);
    const [rec] = runTournament(g, vault, 3);
    const a = reSimulate(rec, 20), b = reSimulate(rec, 20);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(20);
    const report = explainOutcome(rec, a, 20, ['A', 'B']);
    expect(['expected', 'toss-up', 'upset']).toContain(report.verdict);
    expect(report.factors.length).toBeGreaterThan(0);
  });
});

describe('event integrity', () => {
  it('every ability referenced by an event is a real move', () => {
    const g = G.newGame(setup(4, 4, 'live'), 777);
    const vault = new Vault(g.secret);
    G.autoFillPool(g, vault, LEGEND_CHARACTERS);
    runAuction(g);
    for (const r of runTournament(g, vault, 21)) for (const e of r.result.events) if (e.ability) expect(() => getAbility(e.ability!)).not.toThrow();
  });
});
