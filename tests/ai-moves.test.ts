import { describe, expect, it } from 'vitest';
import { movesFromResult } from '../src/ui/ai/moveWriter';
import { mapAniListCharacter } from '../src/engine/providers/anilist';
import { missingFrom } from '../src/engine/providers/jikan';
import { generateHidden } from '../src/engine/hidden';
import { registerCharacterMoves } from '../src/engine/data/abilities';
import { simulateBattle } from '../src/engine/combat/engine';
import { ENGINE_VERSION, type FighterSnapshot, type PublicCharacter } from '../src/engine/types';

const raw = (id: number, name: string) => ({ id, name: { full: name, alternative: [] }, image: { large: null }, description: 'A swordsman who fights with fire.', favourites: 1, media: null });
const move = (name: string, role: 'strike' | 'area' | 'power_up' | 'disable' | 'heal' | 'defend' | 'summon', strength: 'light' | 'medium' | 'heavy' = 'medium') =>
  ({ name, role, strength, element: 'FIRE' as const, visual: 'fire' as const, color: '#ff8800', effect: 'burn' as const, look: `${name} looks amazing.` });

describe('AI-written moves', () => {
  const pc = mapAniListCharacter(raw(424242, 'Test Hero'));
  const { moves, kit } = movesFromResult(pc, {
    known: [move('Blazing Cut', 'strike', 'heavy'), move('Flame Wall', 'area')], hidden: move('Ember Focus', 'power_up'), ultimate: move('Inferno Finale', 'strike'),
    evolvedForm: 'Phoenix Mode', confidence: 'canon',
  });
  const hero: PublicCharacter = { ...pc, customMoves: moves, customKit: kit, knownAbilities: [moves[0].id, moves[1].id] };

  it('balances whatever Claude describes into engine moves in the normal range', () => {
    expect(moves.map((m) => m.kind)).toEqual(['attack', 'aoe', 'buff', 'ultimate']);
    for (const m of moves) {
      expect(m.id.startsWith('ai-anilist-424242:')).toBe(true);
      expect(m.power).toBeLessThanOrEqual(2.8);
      expect(m.cost).toBeGreaterThan(0);
    }
    expect(moves[3].trigger).toBe('hp_below_50');
    expect(kit.form).toBe('Phoenix Mode');
  });

  it('the character fights with its written moves, including the hidden one', () => {
    registerCharacterMoves(hero);
    const h = generateHidden(hero, 7);
    expect(h.hiddenAbility).toBe(kit.hidden);
    expect(h.evolution.unlockAbility).toBe(kit.ultimate);
    const snap = (c: PublicCharacter, side: 0 | 1): FighterSnapshot => {
      const hh = generateHidden(c, 7);
      return { charId: c.id + (side ? '#b' : ''), name: c.name, playerId: 'p' + side, side, archetype: c.archetype, temperament: c.temperament, reach: c.reach, tags: c.tags, stats: hh.stats, traits: hh.traits, abilities: [...c.knownAbilities, hh.hiddenAbility], position: 'front', fatigue: 0, injuries: [], price: 100, vulnerability: hh.vulnerability };
    };
    let used = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = simulateBattle({ battleId: 'ai' + seed, engineVersion: ENGINE_VERSION, seed, mode: 'solo', environmentId: 'colosseum', rivalry: null,
        sides: [{ playerId: 'p0', strategy: 'balanced', mental: 'silent', synergies: [], fighters: [snap(hero, 0)] }, { playerId: 'p1', strategy: 'balanced', mental: 'silent', synergies: [], fighters: [snap(mapAniListCharacter(raw(7, 'Rival')), 1)] }] });
      used += r.events.filter((e) => e.ability?.startsWith('ai-anilist-424242:')).length;
    }
    expect(used).toBeGreaterThan(0);
  });

  it('MyAnimeList only adds characters AniList does not already have', () => {
    const a = [mapAniListCharacter(raw(1, 'Naruto Uzumaki'))];
    const m = [{ ...mapAniListCharacter(raw(2, 'Uzumaki, Naruto')), source: 'mal' as const }, { ...mapAniListCharacter(raw(3, 'Someone Else')), source: 'mal' as const }];
    expect(missingFrom(a, m).map((c) => c.name)).toEqual(['Someone Else']);
  });
});

describe('AI-rated stats', () => {
  it('keeps stats in range and uses them like a canon sheet', async () => {
    const { cleanStats } = await import('../src/ui/ai/moveWriter');
    const { generateHidden } = await import('../src/engine/hidden');
    const { LEGEND_CHARACTERS } = await import('../src/engine/data/legends');
    const s = cleanStats({ attack: 120, defense: 5, speed: 80.6, technique: 70, battleIQ: 60, stamina: 50, adaptability: 40, luck: 30, potential: 99 })!;
    expect(s.attack).toBe(99);
    expect(s.defense).toBe(15);
    expect(s.speed).toBe(81);
    expect(cleanStats({ attack: Number.NaN } as never)).toBeUndefined();
    const pc = { ...LEGEND_CHARACTERS[0], id: 'anilist:999', source: 'anilist' as const, canonStats: s };
    const h = generateHidden(pc, 42);
    expect(Math.abs(h.stats.speed - 81)).toBeLessThanOrEqual(5);
    expect(Math.abs(h.stats.potential - 99)).toBeLessThanOrEqual(5);
  });
});
