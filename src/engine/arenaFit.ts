// How well a fighter suits an arena: their elements (tags and moves) against what the
// arena empowers or weakens, plus fighting styles the terrain favours. The engine turns
// this into a small edge (engine.ts), so a well-suited fighter wins more often, not always.
import type { Archetype } from './types';
import { getAbility } from './data/abilities';
import { getEnvironment } from './data/world';

/** Fighting styles each arena's terrain favours or hinders. */
const STYLE_FIT: Record<string, { good: Archetype[]; bad: Archetype[] }> = {
  volcano: { good: ['Berserker'], bad: ['Support'] },
  tundra: { good: ['Tank'], bad: ['Assassin'] },
  storm: { good: ['Ranger', 'Mage'], bad: ['Tank'] },
  temple: { good: ['Mage', 'Support'], bad: ['Berserker'] },
  rooftops: { good: ['Assassin', 'Ranger'], bad: ['Tank'] },
  forest: { good: ['Assassin', 'Summoner'], bad: ['Ranger'] },
  ocean: { good: ['Controller', 'Tank'], bad: ['Berserker'] },
  desert: { good: ['Berserker', 'Ranger'], bad: ['Mage'] },
  ruins: { good: ['Assassin', 'Controller'], bad: ['Support'] },
  colosseum: { good: ['Duelist', 'Strategist'], bad: [] },
};

export interface FitInput { tags: readonly string[]; archetype: Archetype; abilities?: readonly string[] }

/** -2..3: above 0 suits the arena, below 0 struggles there. */
export function arenaFit(f: FitInput, envId: string): number {
  const env = getEnvironment(envId);
  const elems = new Set<string>(f.tags);
  for (const id of f.abilities ?? []) { try { const el = getAbility(id)?.element; if (el) elems.add(el); } catch { /* unknown move */ } }
  let fit = 0;
  if (env.boost.some((t) => elems.has(t))) fit += 1;
  if (env.hazard?.spares.some((t) => elems.has(t))) fit += 1;
  if (env.weaken.some((t) => elems.has(t))) fit -= 1;
  const style = STYLE_FIT[env.id];
  if (style?.good.includes(f.archetype)) fit += 1;
  if (style?.bad.includes(f.archetype)) fit -= 1;
  return Math.max(-2, Math.min(3, fit));
}

/** Arena edge per fit point: hits 15% harder and takes about 7% less. Measured: an even fight goes from about 55% to 60% per point. */
export const fitEdge = (fit: number) => 1 + 0.15 * fit;
