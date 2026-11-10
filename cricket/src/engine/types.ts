// Core domain types for Cricket Auction. Pure data, no DOM.

export const SCHEMA_VERSION = 1;
export const ENGINE_VERSION = '1.0.0';

/** Batting/fielding role used by auction sets and squad rules. */
export type Role = 'opener' | 'middle' | 'finisher' | 'keeper' | 'allrounder' | 'pace' | 'spin';

export type BowlType =
  | 'none'
  | 'fast' | 'fastmed' | 'medium'
  | 'offspin' | 'legspin' | 'slaorth' /* left-arm orthodox */ | 'slachina' /* left-arm wrist */;

export type Temper = 'calm' | 'steady' | 'fiery';

/** All skills are 0-100. */
export interface BatSkill {
  vsPace: number;
  vsSpin: number;
  /** Natural scoring tempo (strike-rate tendency). */
  tempo: number;
  /** Six-hitting power. */
  power: number;
  /** Avoids getting out; long innings. */
  consistency: number;
}

export interface BowlSkill {
  /** Wicket-taking threat. */
  attack: number;
  /** Economy / accuracy (fewer boundaries, fewer wides). */
  control: number;
  powerplay: number;
  death: number;
  /** km/h for pace bowlers, 0 for spinners. */
  speed: number;
}

export interface Cricketer {
  id: string;
  /** Name-alike shown by default (e.g. "V. Kohly"). */
  name: string;
  /** Real-world name, only shown when the host turns on real names. */
  realName: string;
  /** Country code (IND, AUS, ENG, SA, NZ, WI, AFG, SL, BAN, ZIM). */
  country: string;
  overseas: boolean;
  /** Never played international cricket. Uncapped players can grow during a season. */
  uncapped: boolean;
  age: number;
  role: Role;
  bats: 'R' | 'L';
  bowl: BowlType;
  bat: BatSkill;
  /** Present for anyone who can bowl (bowlers, all-rounders, part-timers). */
  bowling?: BowlSkill;
  fielding: number;
  /** Keeping skill, keepers only. */
  keeping?: number;
  temper: Temper;
  clutch: number;
  captaincy: number;
  /** 1 (squad filler) .. 5 (superstar); drives base price and NPC valuation. */
  tier: 1 | 2 | 3 | 4 | 5;
  /** Auction base price in lakh. */
  basePrice: number;
  /** Uncapped growth potential 0-100 (how much they can improve during a season). */
  potential?: number;
}

/** Hidden per-season form, revealed after the auction (or by a scout token). */
export type Form = -1 | 0 | 1;
export const FORM_LABEL: Record<Form, string> = { [-1]: 'Out of form', 0: 'Average form', 1: 'In form' } as Record<Form, string>;

export const isBowler = (c: Cricketer) => c.role === 'pace' || c.role === 'spin';
export const isPace = (c: Cricketer) => c.bowl === 'fast' || c.bowl === 'fastmed' || c.bowl === 'medium';
export const isSpin = (c: Cricketer) => c.bowl === 'offspin' || c.bowl === 'legspin' || c.bowl === 'slaorth' || c.bowl === 'slachina';
export const isBatter = (c: Cricketer) => c.role === 'opener' || c.role === 'middle' || c.role === 'finisher';
export const canBowl = (c: Cricketer) => c.bowl !== 'none' && !!c.bowling;
