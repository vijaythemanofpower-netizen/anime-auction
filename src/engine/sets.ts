// Two reasons to think harder in the auction.
// War Chest: coins left after the auction aren't wasted. Every 1,500 unspent becomes one extra
// preparation point, spent one per match, so saving is a real plan against spending everything.
// Series Sets: fighters from the same series fight better together, so "complete the set" and
// "block their set" become reasons to bid. Bonuses are built into each fighter's snapshot, so a
// recorded battle replays exactly.
import { STAT_KEYS, type GameState, type Stats } from './types';

export const WAR_CHEST_COINS = 1500;

export function warChestFrom(coins: number): number {
  return Math.floor(coins / WAR_CHEST_COINS);
}

/** +1% with two fighters from a series, +2% with three or more. Small on purpose: measured over
 *  500 even 3v3 fights, that takes a team from 53% to about 57% and 61%, while +3% and +6% gave 66%
 *  and 75%, which would make sets the only strategy. */
export function setBonus(count: number): number {
  return count >= 3 ? 0.02 : count === 2 ? 0.01 : 0;
}

export function ownedInSeries(g: GameState, playerId: string, seriesId: string): number {
  const p = g.players.find((x) => x.id === playerId);
  if (!p) return 0;
  return p.roster.filter((id) => g.characters[id]?.seriesId === seriesId).length;
}

export function applySetBonus(stats: Stats, bonus: number): Stats {
  if (!bonus) return stats;
  const out = { ...stats };
  for (const k of STAT_KEYS) out[k] = Math.min(120, Math.round(out[k] * (1 + bonus)));
  return out;
}

export interface SeriesSet { series: string; count: number; bonus: number }
/** A player's active sets, best first. */
export function seriesSets(g: GameState, playerId: string): SeriesSet[] {
  const p = g.players.find((x) => x.id === playerId);
  if (!p) return [];
  const seen = new Map<string, SeriesSet>();
  for (const id of p.roster) {
    const c = g.characters[id];
    if (!c) continue;
    const s = seen.get(c.seriesId) ?? { series: c.series, count: 0, bonus: 0 };
    s.count++;
    s.bonus = setBonus(s.count);
    seen.set(c.seriesId, s);
  }
  return [...seen.values()].filter((s) => s.bonus > 0).sort((a, b) => b.count - a.count);
}

/** Who already owns fighters from this series: the people a lot matters most to. */
export function setInterest(g: GameState, seriesId: string): Array<{ id: string; name: string; count: number }> {
  return g.players.map((p) => ({ id: p.id, name: p.name, count: ownedInSeries(g, p.id, seriesId) })).filter((x) => x.count > 0);
}
