import { describe, expect, it } from 'vitest';
import { ORIGINAL_CHARACTERS } from '../src/engine/data/originals';
import { ABILITIES } from '../src/engine/data/abilities';
import { ARCHETYPES } from '../src/engine/data/archetypes';
import { activeSynergies } from '../src/engine/data/world';
import { generateHidden, Vault } from '../src/engine/hidden';
import { searchLocal } from '../src/engine/providers/local';
import { mapAniListCharacter, cleanDescription } from '../src/engine/providers/anilist';
import { scoutAdvice, type ScoutInput } from '../src/engine/scout';
import { STAT_KEYS } from '../src/engine/types';
import * as G from '../src/engine/game';
import { makeGame } from './helpers';

describe('character data', () => {
  it('has valid, unique records', () => {
    const ids = ORIGINAL_CHARACTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(40);
    for (const c of ORIGINAL_CHARACTERS) {
      expect(c.source).toBe('original');
      expect(ARCHETYPES[c.archetype]).toBeTruthy();
      expect(c.knownAbilities).toHaveLength(2);
      for (const a of c.knownAbilities) expect(ABILITIES[a]).toBeTruthy();
      expect(c.name && c.series && c.bio).toBeTruthy();
    }
  });

  it('public records carry no hidden stats', () => {
    const forbidden = [...STAT_KEYS, 'stats', 'traits', 'hiddenAbility', 'evolution', 'vulnerability', 'truePower'];
    for (const c of ORIGINAL_CHARACTERS) for (const k of forbidden) expect(Object.keys(c)).not.toContain(k);
  });

  it('hidden stats are stable per game and differ between games', () => {
    const c = ORIGINAL_CHARACTERS[0];
    expect(generateHidden(c, 1)).toEqual(generateHidden(c, 1));
    const differ = [2, 3, 4, 5].some((s) => JSON.stringify(generateHidden(c, s).stats) !== JSON.stringify(generateHidden(c, 1).stats));
    expect(differ).toBe(true);
    for (const k of STAT_KEYS) {
      const v = generateHidden(c, 9).stats[k];
      expect(v).toBeGreaterThanOrEqual(15);
      expect(v).toBeLessThanOrEqual(99);
    }
  });

  it('vault encodes without plain-text stats and round-trips', () => {
    const v = new Vault(777);
    for (const c of ORIGINAL_CHARACTERS.slice(0, 5)) v.ensure(c);
    const enc = v.encode();
    expect(enc).not.toContain('attack');
    expect(enc).not.toContain('Iron Will');
    const back = Vault.decode(777, enc);
    expect(back.get(ORIGINAL_CHARACTERS[0].id)).toEqual(v.get(ORIGINAL_CHARACTERS[0].id));
  });

  it('searches the full local catalog with pagination and no repeats', () => {
    const q = { text: '', field: 'name' as const, sort: 'name' as const, page: 1, perPage: 12 };
    const seen = new Set<string>();
    let page = 1, hasNext = true;
    while (hasNext) {
      const r = searchLocal(ORIGINAL_CHARACTERS, { ...q, page });
      for (const c of r.items) { expect(seen.has(c.id)).toBe(false); seen.add(c.id); }
      hasNext = r.hasNext; page++;
    }
    expect(seen.size).toBe(ORIGINAL_CHARACTERS.length);
    const last = ORIGINAL_CHARACTERS.slice().sort((a, b) => a.name.localeCompare(b.name)).at(-1)!;
    const byName = searchLocal(ORIGINAL_CHARACTERS, { ...q, text: last.name.slice(0, 5) });
    expect(byName.items.map((c) => c.id)).toContain(last.id);
    const bySeries = searchLocal(ORIGINAL_CHARACTERS, { ...q, field: 'series', text: 'neon ronin', perPage: 50 });
    expect(bySeries.items.length).toBe(5);
    const filtered = searchLocal(ORIGINAL_CHARACTERS, { ...q, archetype: 'Tank', perPage: 50 });
    expect(filtered.items.every((c) => c.archetype === 'Tank')).toBe(true);
  });

  it('maps AniList records defensively and labels generated data', () => {
    const c = mapAniListCharacter({ id: 5, name: { full: 'Test Hero', alternative: ['TH', null] }, image: { large: 'https://x/y.png' }, description: 'A swordsman who wields ~!secret!~ fire.', favourites: 1, media: { nodes: [{ id: 9, title: { romaji: 'R', english: 'E' } }] } });
    expect(c.id).toBe('anilist:5');
    expect(c.series).toBe('E');
    expect(c.verifiedFields).toContain('name');
    expect(c.verifiedFields).not.toContain('archetype');
    expect(c.bio).not.toContain('secret');
    expect(() => mapAniListCharacter({ id: 1, name: null } as never)).toThrow();
    expect(cleanDescription('<b>Hi</b> __there__')).toBe('Hi there');
  });

  it('synergies require distinct members', () => {
    expect(activeSynergies([{ tags: ['FIRE', 'DRAGON'], archetype: 'Mage' }])).not.toContain('dragonfire');
    expect(activeSynergies([{ tags: ['FIRE'], archetype: 'Mage' }, { tags: ['DRAGON'], archetype: 'Tank' }])).toContain('dragonfire');
  });
});

describe('scout advisor', () => {
  const base = (over: Partial<ScoutInput> = {}): ScoutInput => ({
    char: ORIGINAL_CHARACTERS[2], roster: [], coins: 10000, maxBid: 9800, rosterSize: 3, nextBid: 100, openingBid: 100,
    upcoming: ORIGINAL_CHARACTERS.slice(10, 20), competitionSlots: 9, rivalPurse: 19600, observations: [], ...over,
  });

  it('uses only TAKE / MIGHT TAKE / LEAVE', () => {
    for (const c of ORIGINAL_CHARACTERS) for (const bid of [100, 2000, 6000]) {
      expect(['TAKE', 'MIGHT TAKE', 'LEAVE']).toContain(scoutAdvice(base({ char: c, nextBid: bid })).label);
    }
  });

  it('accounts for budget and roster state', () => {
    expect(scoutAdvice(base({ maxBid: 50 })).label).toBe('LEAVE');
    expect(scoutAdvice(base({ roster: ORIGINAL_CHARACTERS.slice(0, 3) })).label).toBe('LEAVE');
    expect(scoutAdvice(base({ nextBid: 100 })).label).not.toBe('LEAVE');
    expect(scoutAdvice(base({ nextBid: 8000 })).label).toBe('LEAVE');
  });

  it('gives different players different advice for the same character', () => {
    const tank = ORIGINAL_CHARACTERS.find((c) => c.archetype === 'Tank')!;
    const tanks = ORIGINAL_CHARACTERS.filter((c) => c.archetype === 'Tank' && c.id !== tank.id).slice(0, 2);
    const dps = ORIGINAL_CHARACTERS.filter((c) => c.archetype === 'Berserker').slice(0, 2);
    const a = scoutAdvice(base({ char: tank, roster: tanks, nextBid: 1500, coins: 5000, maxBid: 4900 }));
    const b = scoutAdvice(base({ char: tank, roster: dps, nextBid: 1500, coins: 5000, maxBid: 4900 }));
    expect(a.score).toBeLessThan(b.score);
    expect(a.label).not.toBe(b.label);
  });

  it('does not depend on hidden stats', () => {
    const { g } = makeGame(3, 3, 'live', 1);
    const { g: g2 } = makeGame(3, 3, 'live', 1);
    g2.secret = 999999; // different hidden profiles
    G.startAuction(g, 0); G.startAuction(g2, 0);
    g2.auction = structuredClone(g.auction);
    for (const p of g.players) expect(G.scoutFor(g, p.id)).toEqual(G.scoutFor(g2, p.id));
  });

  it('scout tokens give coarse hints and are limited', () => {
    const { g, vault } = makeGame(2);
    G.startAuction(g, 0);
    const p = g.players[0];
    expect(G.useScoutToken(g, vault, p.id).ok).toBe(true);
    expect(G.useScoutToken(g, vault, p.id).ok).toBe(true);
    expect(G.useScoutToken(g, vault, p.id).ok).toBe(false); // max 2 per lot
    const obs = g.auction!.observations.filter((o) => o.playerId === p.id);
    expect(obs).toHaveLength(2);
    for (const o of obs) expect(o.text).not.toMatch(/\d/);
  });
});
