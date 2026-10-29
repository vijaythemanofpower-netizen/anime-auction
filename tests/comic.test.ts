import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/engine/combat/engine';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import { generateHidden } from '../src/engine/hidden';
import { buildComic, characterTags, MAX_PANELS } from '../src/engine/comic';
import { paginate } from '../src/ui/comic/ComicStage';
import { workflow } from '../src/ui/comic/drawing';
import { ENGINE_VERSION, type BattleInput, type BattleRecord, type FighterSnapshot, type PublicCharacter } from '../src/engine/types';

const byKey = (k: string) => LEGEND_CHARACTERS.find((c) => c.id === `legend:${k}`)!;
const characters: Record<string, PublicCharacter> = Object.fromEntries(LEGEND_CHARACTERS.map((c) => [c.id, c]));

function snap(key: string, side: 0 | 1, pos: 'front' | 'back'): FighterSnapshot {
  const c = byKey(key);
  const h = generateHidden(c, 7);
  return {
    charId: c.id, name: c.name, playerId: 'p' + side, side, archetype: c.archetype, temperament: c.temperament, reach: c.reach,
    tags: c.tags, stats: h.stats, traits: h.traits, abilities: [...c.knownAbilities, h.hiddenAbility, h.evolution.unlockAbility], position: pos,
    fatigue: 0, injuries: [], price: 500, vulnerability: h.vulnerability,
  };
}

function record(seed: number, a: string[], b: string[]): BattleRecord {
  const side = (i: 0 | 1, keys: string[]) => ({
    playerId: 'p' + i, strategy: 'balanced' as const, mental: 'silent' as const, synergies: [],
    fighters: keys.map((k, j) => snap(k, i, j === 0 ? 'front' : 'back')), coach: 'auto' as const, reserves: [],
  });
  const input: BattleInput = { battleId: 'comic' + seed, engineVersion: ENGINE_VERSION, seed, mode: a.length === 1 ? 'solo' : 'tag', environmentId: 'storm', sides: [side(0, a), side(1, b)], rivalry: null, calls: [] };
  const result = simulateBattle(input);
  return { battleId: input.battleId, kind: 'tournament', input, result, narration: [], postEffects: [] } as unknown as BattleRecord;
}

describe('comic director', () => {
  it('is deterministic for a battle', () => {
    const r = record(11, ['gojo'], ['sukuna']);
    expect(buildComic(r, characters)).toEqual(buildComic(r, characters));
  });

  it('draws a different comic for a rematch of the same fighters', () => {
    const a = buildComic(record(11, ['gojo'], ['sukuna']), characters);
    const b = buildComic(record(12, ['gojo'], ['sukuna']), characters);
    expect(a.panels.flatMap((p) => p.drawings.map((d) => d.prompt + d.seed))).not.toEqual(b.panels.flatMap((p) => p.drawings.map((d) => d.prompt + d.seed)));
  });

  it('opens with both fighters, ends on the winner, and stays within the panel budget', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = record(seed, ['naruto', 'kakashi'], ['sasuke', 'itachi']);
      const c = buildComic(r, characters);
      expect(c.panels.length).toBeLessThanOrEqual(MAX_PANELS);
      expect(c.panels.length).toBeGreaterThanOrEqual(10);
      expect(c.panels[0].shot).toBe('establish');
      expect(c.panels[1].shot).toBe('establish');
      const last = c.panels[c.panels.length - 1];
      expect(last.shot).toBe('victory');
      expect(r.result.fighters.find((f) => f.charId === last.focus)?.side).toBe(r.result.winnerSide);
      // Panels follow the fight in order.
      for (let i = 1; i < c.panels.length; i++) expect(c.panels[i].seq).toBeGreaterThanOrEqual(c.panels[i - 1].seq);
    }
  });

  it('writes safe prompts that name the characters the way the model knows them', () => {
    const c = buildComic(record(3, ['gojo'], ['sukuna']), characters);
    const prompts = c.panels.flatMap((p) => p.drawings.map((d) => d.prompt));
    expect(prompts.some((p) => p.includes('gojou satoru'))).toBe(true);
    expect(prompts.some((p) => p.includes('ryoumen sukuna'))).toBe(true);
    for (const p of prompts) { expect(p).toContain('safe'); expect(p).not.toMatch(/nsfw|nude|gore/); }
  });

  it('guesses tags for characters found online, surname first', () => {
    const tag = characterTags({ ...byKey('gojo'), id: 'anilist:1', source: 'anilist', name: 'Tanjiro Kamado', series: 'Demon Slayer' } as PublicCharacter, '');
    expect(tag).toContain('kamado tanjiro');
    expect(tag).toContain('kimetsu no yaiba');
  });

  it('packs panels onto pages without overlaps, in reading order', () => {
    for (const seed of [9, 10, 11]) {
      const c = buildComic(record(seed, ['luffy'], ['zoro']), characters);
      const pages = paginate(c.panels);
      expect(pages.flat().map((p) => p.panel)).toEqual(c.panels);
      expect(pages.length).toBeLessThanOrEqual(8);
      for (const pg of pages) {
        const cells = new Set<string>();
        for (const p of pg) for (let y = p.row; y < p.row + p.h; y++) for (let x = p.col; x < p.col + p.w; x++) {
          expect(x).toBeLessThan(6); expect(y).toBeLessThan(3);
          expect(cells.has(`${x},${y}`)).toBe(false); cells.add(`${x},${y}`);
        }
      }
    }
  });

  it('builds a valid drawing graph with and without the speed add-on', () => {
    const d = buildComic(record(5, ['goku'], ['vegeta']), characters).panels[0].drawings[0];
    const fast = workflow(d, 'animagine-xl-4.0-opt.safetensors', 'dmd2.safetensors') as Record<string, { inputs: Record<string, unknown> }>;
    expect(fast.sample.inputs.steps).toBe(8);
    expect(fast.lora).toBeDefined();
    const slow = workflow(d, 'animagine-xl-4.0-opt.safetensors', '') as Record<string, { inputs: Record<string, unknown> }>;
    expect(slow.lora).toBeUndefined();
    expect(slow.sample.inputs.model).toEqual(['ckpt', 0]);
  });
});
