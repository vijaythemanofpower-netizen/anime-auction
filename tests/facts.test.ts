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
