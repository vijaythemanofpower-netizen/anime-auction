// NPC bidder policy. NPCs see only public information and use the same
// scout advisor as humans; they obey the same budget and roster rules
// because their bids go through the same validated placeBid() path.
import type { ScoutAdvice } from './scout';
import { Rng, hashString } from './rng';

export type NpcDecision = { kind: 'bid'; amount: number } | { kind: 'pass' } | { kind: 'wait' };

export function npcStyle(playerId: string): number {
  // 0.85 (thrifty) .. 1.25 (big spender), stable per NPC
  return 0.85 + (hashString(playerId) % 41) / 100;
}

export function npcDecide(
  playerId: string, advice: ScoutAdvice, minBid: number, maxBid: number, isLeader: boolean, mustBuy: boolean, rng: Rng,
): NpcDecision {
  if (isLeader) return { kind: 'wait' };
  if (maxBid < minBid) return { kind: 'pass' };
  const mult = advice.label === 'TAKE' ? 1.35 : advice.label === 'MIGHT TAKE' ? 1.0 : 0.55;
  const valuation = advice.fairPrice * mult * npcStyle(playerId) * rng.range(0.85, 1.15);
  if (minBid <= valuation || (mustBuy && minBid <= maxBid * 0.6)) {
    // Occasionally jump-bid to pressure rivals.
    const jump = rng.chance(0.2) ? Math.round((valuation - minBid) * 0.4 / 50) * 50 : 0;
    return { kind: 'bid', amount: Math.min(maxBid, minBid + Math.max(0, jump)) };
  }
  return { kind: 'pass' };
}
