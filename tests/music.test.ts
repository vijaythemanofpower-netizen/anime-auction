import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/engine/combat/engine';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import { generateHidden } from '../src/engine/hidden';
import { chooseMusic, TRACKS } from '../src/ui/music';
import { musicKey, seriesMusicKey } from '../src/store/media';
import { ENGINE_VERSION, type BattleInput, type BattleRecord, type PublicCharacter } from '../src/engine/types';

const chars: Record<string, PublicCharacter> = Object.fromEntries(LEGEND_CHARACTERS.map((c) => [c.id, c]));

function record(seed: number, a: string, b: string, rivalry = false): BattleRecord {
  const snap = (k: string, side: 0 | 1, price: number) => {
    const c = chars[`legend:${k}`]; const h = generateHidden(c, 7);
    return { charId: c.id, name: c.name, playerId: 'p' + side, side, archetype: c.archetype, temperament: c.temperament, reach: c.reach, tags: c.tags, stats: h.stats, traits: h.traits, abilities: [...c.knownAbilities, h.hiddenAbility, h.evolution.unlockAbility], position: 'front' as const, fatigue: 0, injuries: [], price, vulnerability: h.vulnerability };
  };
  const side = (i: 0 | 1, k: string, price: number) => ({ playerId: 'p' + i, strategy: 'balanced' as const, mental: 'silent' as const, synergies: [], fighters: [snap(k, i, price)], coach: 'auto' as const, reserves: [] });
  const input: BattleInput = { battleId: 'm' + seed, engineVersion: ENGINE_VERSION, seed, mode: 'solo', environmentId: 'colosseum', sides: [side(0, a, 900), side(1, b, 400)], rivalry: rivalry ? { intensity: 1, encounters: 1, winsA: 0, winsB: 0 } : null, calls: [] };
  return { battleId: input.battleId, input, result: simulateBattle(input), narration: [], postEffects: [] } as unknown as BattleRecord;
}

describe('battle music', () => {
  it("plays a fighter's own music first, then their series' music", () => {
    const r = record(1, 'naruto', 'sasuke');
    expect(chooseMusic(r, chars, new Set([musicKey('legend:sasuke')]))).toMatchObject({ kind: 'own', key: musicKey('legend:sasuke') });
    expect(chooseMusic(r, chars, new Set([seriesMusicKey('Naruto')]))).toMatchObject({ kind: 'own', key: seriesMusicKey('Naruto') });
    // Both have their own: the bigger star (higher price) wins.
    expect(chooseMusic(r, chars, new Set([musicKey('legend:naruto'), musicKey('legend:sasuke')]))).toMatchObject({ key: musicKey('legend:naruto') });
  });

  it('otherwise picks a built-in track that suits the fight, the same one on replay', () => {
    const r = record(2, 'bakugo', 'deku');
    const a = chooseMusic(r, chars, new Set());
    expect(a.kind).toBe('builtin');
    expect(chooseMusic(r, chars, new Set())).toEqual(a);
    const epic = chooseMusic(record(3, 'gojo', 'sukuna', true), chars, new Set());
    expect(epic.kind === 'builtin' && epic.track.moods).toContain('epic');
  });

  it('varies between fights', () => {
    const files = new Set(Array.from({ length: 30 }, (_, i) => chooseMusic(record(100 + i, 'goku', 'vegeta'), chars, new Set())).map((c) => (c.kind === 'builtin' ? c.track.file : '')));
    expect(files.size).toBeGreaterThan(1);
    for (const f of files) expect(TRACKS.some((t) => t.file === f)).toBe(true);
  });
});
