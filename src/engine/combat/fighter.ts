import type { BattleInjury, FighterResult, FighterSnapshot, Stats, StatusType } from '../types';
import { STAT_KEYS } from '../types';
import { kitFor, type Kit } from '../data/kits';

/** A kit's extra moves and its secret, by id. */
const kitMoves = (kit: Kit | null) => (kit ? [...kit.moves, kit.secret].map((m) => m.id) : []);

export interface ActiveStatus {
  type: StatusType;
  duration: number;
  magnitude: number;
}

export interface CombatFighter {
  snap: FighterSnapshot;
  id: string;
  side: 0 | 1;
  eff: Stats;
  /** Endurance: how much punishment the body can still take. Never shown as a
   *  number; it raises knockout odds as it drains, and an empty tank is a collapse. */
  hp: number;
  maxHp: number;
  /** Guard integrity 0-100. Blocking spends it; at 0 the guard breaks. */
  guard: number;
  /** Off-balance after a broken guard or knockdown: the next attack lands clean. */
  staggered: boolean;
  injuries: BattleInjury[];
  knockdowns: number;
  st: number;
  maxSt: number;
  gauge: number;
  cooldowns: Record<string, number>;
  statuses: ActiveStatus[];
  position: 'front' | 'back';
  defeated: boolean;
  awakened: boolean;
  ironWillUsed: boolean;
  /** Healers: turns until they can mend again, and whether their one revive is used. */
  mendCd: number;
  reviveUsed: boolean;
  /** How many times this fighter has healed only themselves. */
  selfHeals: number;
  /** Transformation stage reached (0 = base form), the moves this fighter can use, and their kit. */
  stage: number;
  moves: string[];
  secretUsed: boolean;
  /** The corner told them to stop holding back: the secret move is open now. */
  secretOpen: boolean;
  kit: Kit | null;
  criticalShown: boolean;
  guarding: boolean;
  protecting: string | null;
  forcedTarget: { id: string; turns: number } | null;
  stunImmune: number;
  actionsTaken: number;
  form: number;
  /** Per-attacker record of recent actions used against this fighter. */
  seen: Record<string, string[]>;
  adaptation: Record<string, number>;
  mods: { dmg: number; acc: number; dodge: number; crit: number; def: number; intimidated: number; provokedTurns: number; earlyDodgeTurns: number };
  res: FighterResult;
}

/** Applies fatigue and injury penalties to base stats (temporary modifiers). */
export function effectiveStats(s: FighterSnapshot): Stats {
  const out = { ...s.stats };
  const fatigueFactor = 1 - Math.min(100, Math.max(0, s.fatigue)) / 400;
  for (const k of STAT_KEYS) {
    if (k === 'luck' || k === 'potential') continue;
    out[k] = out[k] * fatigueFactor;
  }
  for (const inj of s.injuries) out[inj.stat] = out[inj.stat] * (1 - inj.penalty);
  for (const k of STAT_KEYS) out[k] = Math.max(1, Math.round(out[k] * 10) / 10);
  return out;
}

/** Endurance pool. Deep enough that fights are decided over many exchanges. */
export function maxHpFor(stats: Stats): number {
  return Math.round((320 + stats.defense * 2.4 + stats.stamina * 2.8) * 1.5);
}

export function maxStFor(stats: Stats): number {
  return Math.round(60 + stats.stamina * 0.6);
}

export function createFighter(snap: FighterSnapshot): CombatFighter {
  const kit = kitFor(snap.charId, snap.name);
  const eff = effectiveStats(snap);
  // Max HP uses base stats so condition shows as reduced effectiveness, not
  // as a phantom HP loss; injuries to stamina still lower stamina pool.
  const maxHp = Math.round(maxHpFor(snap.stats) * (snap.boss?.hpScale ?? 1));
  const maxSt = maxStFor(eff);
  return {
    snap,
    id: snap.charId,
    side: snap.side,
    eff,
    hp: maxHp,
    maxHp,
    guard: 100,
    staggered: false,
    injuries: [],
    knockdowns: 0,
    st: maxSt,
    maxSt,
    gauge: 0,
    cooldowns: {},
    statuses: [],
    position: snap.position,
    defeated: false,
    awakened: false,
    ironWillUsed: false,
    mendCd: 0,
    reviveUsed: false,
    selfHeals: 0,
    stage: 0,
    moves: [...snap.abilities, ...kitMoves(kit)],
    secretUsed: false,
    secretOpen: false,
    kit,
    criticalShown: false,
    guarding: false,
    protecting: null,
    forcedTarget: null,
    stunImmune: 0,
    actionsTaken: 0,
    form: 1,
    seen: {},
    adaptation: {},
    mods: { dmg: snap.boss ? snap.boss.power - 1 : 0, acc: 0, dodge: 0, crit: 0, def: 0, intimidated: 0, provokedTurns: 0, earlyDodgeTurns: 0 },
    res: {
      charId: snap.charId, side: snap.side, hp: maxHp, maxHp, stamina: maxSt, maxStamina: maxSt,
      defeated: false, damageDealt: 0, damageTaken: 0, crits: 0, abilitiesUsed: 0, minHpPct: 1, awakened: false, actions: 0, form: 1,
      cleanHits: 0, knockdowns: 0, injuries: [],
    },
  };
}

export function hasStatus(f: CombatFighter, t: StatusType): ActiveStatus | undefined {
  return f.statuses.find((s) => s.type === t && s.duration > 0);
}

export function hpPct(f: CombatFighter): number {
  return f.hp / f.maxHp;
}

/** Stat penalty from injuries picked up during this battle. */
export function injuryPenalty(f: CombatFighter, stat: 'attack' | 'technique' | 'speed' | 'accuracy'): number {
  let p = 0;
  for (const i of f.injuries) {
    if (i.part === 'arm' && (stat === 'attack' || stat === 'technique')) p += 0.06 * i.severity;
    if (i.part === 'leg' && stat === 'speed') p += 0.08 * i.severity;
    if (i.part === 'head' && stat === 'accuracy') p += 0.04 * i.severity;
  }
  return Math.min(0.4, p);
}

/** Total injury severity; a fighter who reaches the limit cannot continue. */
export const injuryLoad = (f: CombatFighter) => f.injuries.reduce((n, i) => n + i.severity, 0);
export const INJURY_LIMIT = 6;
