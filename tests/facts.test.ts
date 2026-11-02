import { describe, expect, it } from 'vitest';
import { factsFor } from '../src/engine/data/characterFacts';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';

describe('character facts', () => {
  it('turns an AniList profile into real facts, without game filler', () => {
    const base = { ...LEGEND_CHARACTERS[0], id: 'anilist:1', source: 'anilist' as const, name: 'Kaori', series: 'Some Show' };
    const facts = factsFor({ ...base, bio: 'Age: 17 Height: 162 cm Birthday: March 3 Kaori is the captain of the kendo club. She once beat ten opponents in a row at nationals.' });
    expect(facts).toContain('Kaori is 17 years old.');
    expect(facts).toContain('Kaori stands 162 cm tall.');
    expect(facts.some((f) => f.includes('ten opponents'))).toBe(true);
    expect(facts.join(' ')).not.toMatch(/Specialty:|fights with/);
  });
  it('gives built-in characters trivia first', () => {
    const goku = LEGEND_CHARACTERS.find((c) => c.id === 'legend:goku')!;
    expect(factsFor(goku)[0]).toMatch(/Monkey King/);
  });
});

describe('roast badges', () => {
  it('hands out badges from auction habits and purchases', async () => {
    const { playerBadges } = await import('../src/engine/badges');
    const { makeGame, runAuction } = await import('./helpers');
    const { g } = makeGame(4) as { g: import('../src/engine/types').GameState };
    runAuction(g);
    // The helper sells every lot at similar prices; make one player clearly the big spender.
    const tx = g.auction!.transactions;
    expect(tx.length).toBeGreaterThan(0);
    tx[0].price *= 4;
    g.auction!.habits = { [g.players[1].id]: { bids: 12, passes: 0, lateBids: 3, outbid: 0 } };
    const b = playerBadges(g);
    const all = Object.values(b).flat();
    expect(all.length).toBeGreaterThan(0);
    expect(b[tx[0].playerId].some((x) => x.id === 'arson' || x.id === 'clown')).toBe(true);
    expect(b[g.players[1].id].some((x) => x.id === 'spam' || x.id === 'rat')).toBe(true);
    for (const list of Object.values(b)) expect(list.length).toBeLessThanOrEqual(3);
  });
});

describe('plot twists', () => {
  it('turn up in roughly a third of fights, with every kind possible', async () => {
    const { makeGame, runAuction, runTournament } = await import('./helpers');
    const kinds = new Set<string>(); let fights = 0, twisted = 0;
    for (let s = 1; s <= 8; s++) {
      const { g, vault } = makeGame(4, 3, 'live', 2000 + s) as never as { g: import('../src/engine/types').GameState; vault: never };
      runAuction(g);
      for (const r of runTournament(g, vault, s * 17)) {
        fights++;
        const t = r.result.events.filter((e) => e.type === 'twist' && String(e.context?.twist).startsWith('plot-'));
        if (t.length) twisted++;
        t.forEach((e) => kinds.add(String(e.context?.twist)));
      }
    }
    expect(twisted / fights).toBeGreaterThan(0.15);
    expect(twisted / fights).toBeLessThan(0.5);
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });
});

describe('live predictions', () => {
  it('asks questions in order whose answers match the fight', async () => {
    const { predictionsFor } = await import('../src/engine/predictions');
    const { makeGame, runAuction, runTournament } = await import('./helpers');
    const { g, vault } = makeGame(4, 3, 'live', 3001) as never as { g: import('../src/engine/types').GameState; vault: never };
    runAuction(g);
    let asked = 0;
    for (const r of runTournament(g, vault, 5)) {
      const qs = predictionsFor(r, ['A', 'B']);
      for (let i = 1; i < qs.length; i++) expect(qs[i].askAt).toBeGreaterThan(qs[i - 1].askAt);
      for (const q of qs) {
        asked++;
        expect(q.revealAt).toBeGreaterThan(q.askAt);
        expect(q.options.some((o) => o.id === q.answer)).toBe(true);
        if (q.id === 'winner') expect(q.answer).toBe(String(r.result.winnerSide));
      }
    }
    expect(asked).toBeGreaterThan(5);
  });
});

describe('new plot twists (engine 2.11)', () => {
  it('fakes, limiters, hidden power and voices from the past all happen, and the booth reacts', async () => {
    const { simulateBattle } = await import('../src/engine/combat/engine');
    const { generateHidden } = await import('../src/engine/hidden');
    const { narrate, validateNarration } = await import('../src/engine/narration');
    const ctx = { prices: {}, playerNames: { p0: 'A', p1: 'B' }, previousLoss: {}, stageName: 'Test' };
    const { ENGINE_VERSION } = await import('../src/engine/types');
    const chars = Object.fromEntries(LEGEND_CHARACTERS.map((c) => [c.id, c]));
    const keys = ['naruto', 'luffy', 'ichigo', 'tanjiro', 'gojo', 'levi', 'killua', 'deku'];
    const seen = new Set<string>();
    let reacted = false;
    for (let seed = 1; seed <= 400 && seen.size < 4; seed++) {
      const snap = (k: string, side: 0 | 1) => {
        const c = chars[`legend:${k}`]; const h = generateHidden(c, seed);
        return { charId: c.id, name: c.name, playerId: 'p' + side, side, archetype: c.archetype, temperament: c.temperament, reach: c.reach, tags: c.tags, stats: h.stats, traits: h.traits, abilities: [...c.knownAbilities, h.hiddenAbility, h.evolution.unlockAbility], position: 'front' as const, fatigue: 0, injuries: [], price: 500, vulnerability: h.vulnerability };
      };
      const side = (i: 0 | 1, k: string) => ({ playerId: 'p' + i, strategy: 'balanced' as const, mental: 'silent' as const, synergies: [], fighters: [snap(k, i)], coach: 'auto' as const, reserves: [] });
      const input = { battleId: 't' + seed, engineVersion: ENGINE_VERSION, seed, mode: 'solo', environmentId: 'colosseum', sides: [side(0, keys[seed % 8]), side(1, keys[(seed * 3 + 1) % 8])], rivalry: null, calls: [] } as never;
      const result = simulateBattle(input);
      const tw = result.events.filter((e) => e.type === 'twist' && ['plot-clone', 'plot-limiter', 'plot-hidden', 'plot-voice'].includes(String(e.context?.twist)));
      tw.forEach((e) => seen.add(String(e.context?.twist)));
      if (tw.length) {
        const lines = narrate(input, result, ctx);
        expect(validateNarration(lines, input, result)).toEqual([]);
        if (lines.some((l) => /fake this whole time|misdirection|never saw it coming|nothing left to lose|All or nothing|underdog has teeth|on their card|still believing|on its feet/.test(l.text))) reacted = true;
      }
    }
    expect([...seen].sort()).toEqual(['plot-clone', 'plot-hidden', 'plot-limiter', 'plot-voice']);
    expect(reacted).toBe(true);
  });
});
