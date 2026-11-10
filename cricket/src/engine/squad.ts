// Squad rules: what a franchise must have, which bids would make a squad
// impossible, and the end-of-auction penalty fill. Pure.
import type { Cricketer } from './types';
import { isBatter } from './types';

export type SquadMode = 'quick' | 'standard' | 'full';

export interface SquadRules {
  /** Players bought in the auction. */
  size: number;
  /** Quick mode: shared average players added after the auction to make 11. */
  autoFill: number;
  minKeeper: number;
  minBatters: number;
  minAllrounders: number;
  minBowlers: number;
  minPace: number;
  minSpin: number;
  minUncapped: number;
  maxOverseas: number;
  maxOverseasXI: number;
  /** Minimum price per player, in lakh. */
  minPrice: number;
}

export const RULES: Record<SquadMode, SquadRules> = {
  // Quick: buy 6 stars; the rules only cap overseas, the shared fill completes the XI.
  quick: { size: 6, autoFill: 5, minKeeper: 0, minBatters: 0, minAllrounders: 0, minBowlers: 0, minPace: 0, minSpin: 0, minUncapped: 0, maxOverseas: 4, maxOverseasXI: 4, minPrice: 20 },
  standard: { size: 13, autoFill: 0, minKeeper: 1, minBatters: 4, minAllrounders: 2, minBowlers: 5, minPace: 2, minSpin: 1, minUncapped: 2, maxOverseas: 5, maxOverseasXI: 4, minPrice: 20 },
  full: { size: 15, autoFill: 0, minKeeper: 1, minBatters: 4, minAllrounders: 2, minBowlers: 5, minPace: 2, minSpin: 1, minUncapped: 2, maxOverseas: 6, maxOverseasXI: 4, minPrice: 20 },
};

/** Purse in lakh per mode (1 crore = 100 lakh). */
export const PURSE: Record<SquadMode, number> = { quick: 6000, standard: 10000, full: 11500 };

export interface Counts { total: number; keeper: number; batters: number; allrounders: number; bowlers: number; pace: number; spin: number; uncapped: number; overseas: number }

export function counts(squad: Cricketer[]): Counts {
  const c: Counts = { total: squad.length, keeper: 0, batters: 0, allrounders: 0, bowlers: 0, pace: 0, spin: 0, uncapped: 0, overseas: 0 };
  for (const p of squad) {
    if (p.role === 'keeper') c.keeper++;
    else if (isBatter(p)) c.batters++;
    else if (p.role === 'allrounder') c.allrounders++;
    else if (p.role === 'pace') { c.bowlers++; c.pace++; }
    else if (p.role === 'spin') { c.bowlers++; c.spin++; }
    if (p.uncapped) c.uncapped++;
    if (p.overseas) c.overseas++;
  }
  return c;
}

export interface Need { key: keyof Counts; label: string; missing: number }

/** Compulsory slots still empty. */
export function needs(squad: Cricketer[], r: SquadRules): Need[] {
  const c = counts(squad);
  const out: Need[] = [];
  const add = (key: keyof Counts, label: string, min: number) => { if (c[key] < min) out.push({ key, label, missing: min - c[key] }); };
  add('keeper', 'Wicketkeeper', r.minKeeper);
  add('batters', 'Batter', r.minBatters);
  add('allrounders', 'All-rounder', r.minAllrounders);
  add('pace', 'Pace bowler', r.minPace);
  add('spin', 'Spin bowler', r.minSpin);
  const otherBowl = Math.max(0, r.minBowlers - Math.max(c.pace, r.minPace) - Math.max(c.spin, r.minSpin));
  if (c.bowlers < r.minBowlers && otherBowl > 0) out.push({ key: 'bowlers', label: 'Bowler (any)', missing: otherBowl });
  add('uncapped', 'Uncapped player', r.minUncapped);
  return out;
}

/** Slots needed to satisfy the role minimums (uncapped players can fill any role slot). */
export function slotsNeeded(squad: Cricketer[], r: SquadRules): number {
  const n = needs(squad, r);
  const role = n.filter((x) => x.key !== 'uncapped').reduce((a, x) => a + x.missing, 0);
  const unc = n.find((x) => x.key === 'uncapped')?.missing ?? 0;
  return Math.max(role, unc);
}

export type BidBlock = null | { reason: string };

/**
 * Would buying `player` for `price` leave this squad impossible to complete?
 * Blocks: squad full, overseas cap, a role the squad can no longer fit,
 * or not enough purse left to buy the remaining slots at the minimum price.
 */
export function canBuy(squad: Cricketer[], purse: number, player: Cricketer, price: number, r: SquadRules): BidBlock {
  if (squad.length >= r.size) return { reason: 'Squad is full' };
  if (price > purse) return { reason: 'Not enough purse' };
  const after = [...squad, player];
  if (player.overseas && counts(after).overseas > r.maxOverseas) return { reason: `Overseas limit (${r.maxOverseas}) reached` };
  const slotsLeft = r.size - after.length;
  const needed = slotsNeeded(after, r);
  if (needed > slotsLeft) {
    const left = needs(squad, r).filter((n) => n.key !== 'uncapped').map((n) => n.label.toLowerCase());
    return { reason: `You still need ${left.join(', ') || 'uncapped players'}: no room for this pick` };
  }
  const reserve = slotsLeft * r.minPrice;
  if (purse - price < reserve) return { reason: `Keep ${fmtL(reserve)} for your ${slotsLeft} empty slot${slotsLeft === 1 ? '' : 's'}` };
  return null;
}

/** Highest bid this squad may legally make on a player (0 = may not bid). */
export function maxBid(squad: Cricketer[], purse: number, player: Cricketer, r: SquadRules): number {
  if (canBuy(squad, purse, player, Math.min(purse, r.minPrice), r)) return 0;
  const slotsLeft = r.size - squad.length - 1;
  return Math.max(0, purse - slotsLeft * r.minPrice);
}

export interface PenaltyFill { id: string; price: number; reason: string; doubled: boolean }

/**
 * End of the auction: compulsory slots still empty are filled from the unsold
 * pool at DOUBLE base price; other empty slots at base price (cheapest first).
 */
export function penaltyFill(squad: Cricketer[], unsold: Cricketer[], r: SquadRules): PenaltyFill[] {
  const out: PenaltyFill[] = [];
  const cur = squad.slice();
  // Keep the caller's order (auction leftovers before outside replacements), cheapest first within each.
  const pool = unsold.slice();
  const take = (pred: (c: Cricketer) => boolean, reason: string, doubled: boolean) => {
    const i = pool.findIndex((c) => pred(c) && (!c.overseas || counts(cur).overseas < r.maxOverseas));
    if (i < 0) return false;
    const [c] = pool.splice(i, 1);
    cur.push(c);
    out.push({ id: c.id, price: Math.max(r.minPrice, c.basePrice) * (doubled ? 2 : 1), reason, doubled });
    return true;
  };
  const pred: Record<string, (c: Cricketer) => boolean> = {
    keeper: (c) => c.role === 'keeper', batters: (c) => isBatter(c), allrounders: (c) => c.role === 'allrounder',
    pace: (c) => c.role === 'pace', spin: (c) => c.role === 'spin', bowlers: (c) => c.role === 'pace' || c.role === 'spin', uncapped: (c) => c.uncapped,
  };
  for (let guard = 0; guard < 40 && cur.length < r.size; guard++) {
    const n = needs(cur, r);
    if (!n.length) break;
    const need = n[0];
    const unc = n.some((x) => x.key === 'uncapped');
    if (!(unc && need.key !== 'uncapped' && take((c) => pred[need.key](c) && c.uncapped, need.label, true)) && !take(pred[need.key], need.label, true)) break;
  }
  while (cur.length < r.size && take(() => true, 'Empty slot', false)) { /* fill */ }
  return out;
}

/** Bid increments by current price, in lakh. */
export function nextBid(current: number, base: number): number {
  if (current <= 0) return base;
  if (current < 100) return current + 5;
  if (current < 200) return current + 10;
  if (current < 500) return current + 20;
  return current + 25;
}

/** 150 -> "₹1.5 Cr", 75 -> "₹75 L". */
export function fmtL(lakh: number): string {
  if (Math.abs(lakh) >= 100) {
    const cr = lakh / 100;
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(cr * 10 === Math.round(cr * 10) ? 1 : 2)} Cr`;
  }
  return `₹${lakh} L`;
}
