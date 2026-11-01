import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/engine/combat/engine';
import { narrate, validateNarration } from '../src/engine/narration';
import { LEGEND_CHARACTERS as LEGENDS } from '../src/engine/data/legends';
import { generateHidden } from '../src/engine/hidden';
import { LEGEND_MOVESETS } from '../src/engine/data/legendMoves';
import { ENGINE_VERSION, type BattleInput, type BattleMode, type FighterSnapshot } from '../src/engine/types';
import { ENVIRONMENTS } from '../src/engine/data/world';

// Legends with their own signature moves, so repeated moves and their "look" lines show up.
function snap(i: number, side: 0 | 1, pos: 'front' | 'back'): FighterSnapshot {
  const c = LEGENDS[i % LEGENDS.length];
  const h = generateHidden(c, 42);
  return {
    charId: c.id + (side ? '#b' : ''), name: c.name + (side ? ' II' : ''), playerId: 'p' + side, side, archetype: c.archetype, temperament: c.temperament, reach: c.reach,
    tags: c.tags, stats: h.stats, traits: h.traits, abilities: [...c.knownAbilities, h.hiddenAbility], position: pos, fatigue: 0, injuries: [], price: 100, vulnerability: h.vulnerability,
  };
}
function battle(mode: BattleMode, n: number, seed: number) {
  const ids = (o: number) => Array.from({ length: n }, (_, j) => (o + j * 7 + seed * 3) % LEGENDS.length);
  const input: BattleInput = {
    battleId: `rep-${seed}`, engineVersion: ENGINE_VERSION, seed, mode, environmentId: ENVIRONMENTS[seed % ENVIRONMENTS.length].id,
    sides: [
      { playerId: 'p0', strategy: 'balanced', mental: 'silent', fighters: ids(0).map((i, j) => snap(i, 0, j ? 'back' : 'front')), synergies: [] },
      { playerId: 'p1', strategy: 'aggressive', mental: 'silent', fighters: ids(5).map((i, j) => snap(i, 1, j ? 'back' : 'front')), synergies: [] },
    ],
    rivalry: null,
  };
  const result = simulateBattle(input);
  const lines = narrate(input, result, { prices: {}, playerNames: { p0: 'Ana', p1: 'Ben' }, previousLoss: {}, stageName: 'the test cup' });
  return { input, result, lines };
}
const BATTLES = Array.from({ length: 18 }, (_, i) => battle((['solo', 'tag', 'squad'] as const)[i % 3], (i % 3) + 1, 100 + i));

describe('commentary repetition', () => {
  it('stays valid', () => {
    for (const b of BATTLES) { const v = validateNarration(b.lines, b.input, b.result); if (v.length) console.log('VAL', JSON.stringify(v.slice(0, 3))); expect(v).toEqual([]); }
  });
  it('never says the same commentator line twice within a dozen lines', () => {
    let worst = 0;
    for (const b of BATTLES) {
      const nar = b.lines.filter((l) => l.speaker === 'narrator').map((l) => l.text);
      for (let i = 0; i < nar.length; i++) for (let j = Math.max(0, i - 12); j < i; j++) if (nar[i] === nar[j]) worst++;
    }
    expect(worst).toBe(0);
  });
  it('describes how a move looks once per fighter per fight, not every time it is used', () => {
    for (const b of BATTLES) {
      const counts = new Map<string, number>();
      for (const l of b.lines) if (l.tone === 'tense' && l.speaker === 'narrator') counts.set(l.text, (counts.get(l.text) ?? 0) + 1);
      const looks = new Set(b.input.sides.flatMap((s) => s.fighters.flatMap((f) => f.abilities.map((a) => LEGEND_MOVESETS[f.charId.replace('#b', '').replace('legend:', '')]?.find((m) => m.id === a)?.look))).filter(Boolean) as string[]);
      for (const look of looks) expect(counts.get(look) ?? 0, look).toBeLessThanOrEqual(2);
    }
  });
});
