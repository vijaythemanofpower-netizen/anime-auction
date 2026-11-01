// Where the damage went: each hit in the fight log is placed on a body area (from the kind
// of attack, the same every replay), and injuries go exactly where the engine put them.
// The arena body chart colours each area by how damaged it is and shows percentages.
import type { BattleEvent, BodyPart } from '../engine/types';
import { ABILITIES, vfxOf } from '../engine/data/abilities';

export type Region = 'head' | 'torso' | 'larm' | 'rarm' | 'lleg' | 'rleg';
export const REGIONS: Region[] = ['head', 'torso', 'larm', 'rarm', 'lleg', 'rleg'];
export const REGION_NAME: Record<Region, string> = { head: 'Head', torso: 'Torso', larm: 'Right arm', rarm: 'Left arm', lleg: 'Right leg', rleg: 'Left leg' };
/** How much of the body each area is, for turning damage into a percentage. */
const SHARE: Record<Region, number> = { head: 0.14, torso: 0.38, larm: 0.1, rarm: 0.1, lleg: 0.14, rleg: 0.14 };

const hash = (n: number) => (Math.imul(n ^ 0x9e3779b9, 2654435761) >>> 0);
const AIM: Record<string, Region[]> = {
  punch: ['head', 'head', 'torso', 'torso', 'torso', 'larm', 'rarm'],
  slash: ['torso', 'torso', 'larm', 'rarm', 'lleg', 'rleg', 'head'],
  barrage: ['torso', 'torso', 'head', 'larm', 'rarm', 'lleg', 'rleg'],
  default: ['torso', 'torso', 'torso', 'head', 'larm', 'rarm', 'lleg', 'rleg'],
};

/** The body area a damaging event landed on. */
export function regionOf(e: BattleEvent): Region {
  const kind = e.ability && ABILITIES[e.ability] ? vfxOf(ABILITIES[e.ability]) : e.action === 'combo' ? 'barrage' : 'punch';
  const list = AIM[kind] ?? AIM.default;
  return list[hash(e.seq * 31 + (e.target?.length ?? 0)) % list.length];
}

/** An injury's side (arm/leg): fixed per fighter and part, so it stays on one side. */
export function injuryRegion(target: string, part: BodyPart): Region {
  if (part === 'head' || part === 'torso') return part;
  let h = 0;
  for (const ch of target + part) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const left = (h & 1) === 0;
  return part === 'arm' ? (left ? 'larm' : 'rarm') : left ? 'lleg' : 'rleg';
}

export type BodyDamage = Record<Region, number>;
export const NO_DAMAGE = (): BodyDamage => ({ head: 0, torso: 0, larm: 0, rarm: 0, lleg: 0, rleg: 0 });

/**
 * Percent damaged per area (0-100). Raw hits per area are scaled so they add up to the
 * health actually lost (healing mends every area a little).
 */
export function damagePercents(raw: BodyDamage, hp: number, maxHp: number): BodyDamage {
  const total = REGIONS.reduce((n, r) => n + raw[r], 0);
  const lost = Math.max(0, maxHp - hp);
  const out = NO_DAMAGE();
  if (!total || !lost) return out;
  for (const r of REGIONS) out[r] = Math.min(100, Math.round(((raw[r] / total) * lost / (maxHp * SHARE[r])) * 100));
  return out;
}
