// Roast badges: playful, slightly mean titles for each player, earned from how
// they bid at the auction and how their tournament went. Everything here is
// public (prices, bids, results), so anyone can see everyone's badges.
import type { GameState } from './types';

export interface Badge { id: string; icon: string; name: string; why: string }

/** Up to three badges per player, the most striking first. */
export function playerBadges(g: GameState): Record<string, Badge[]> {
  const out: Record<string, Badge[]> = Object.fromEntries(g.players.map((p) => [p.id, [] as Badge[]]));
  const a = g.auction;
  if (!a) return out;
  const tx = a.transactions;
  const habits = a.habits ?? {};
  const humans = g.players;
  const add = (pid: string | undefined, b: Badge) => { if (pid && out[pid] && !out[pid].some((x) => x.id === b.id)) out[pid].push(b); };
  const most = (score: (pid: string) => number, min: number): string | undefined => {
    const ranked = humans.map((p) => [p.id, score(p.id)] as const).sort((x, y) => y[1] - x[1]);
    return ranked[0] && ranked[0][1] >= min && (ranked.length < 2 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : undefined;
  };

  const spent = (pid: string) => tx.filter((t) => t.playerId === pid).reduce((s, t) => s + t.price, 0);
  const bought = (pid: string) => tx.filter((t) => t.playerId === pid && t.kind === 'purchase');
  const avgPrice = tx.length ? tx.reduce((s, t) => s + t.price, 0) / tx.length : 0;

  // Champion and finals first: they matter most.
  const t = g.tournament;
  if (t?.championId) add(t.championId, { id: 'champ', icon: '👑', name: 'Undisputed', why: 'Won the whole tournament. Everyone else: take notes.' });

  // Auction habits.
  const priciest = tx.slice().sort((x, y) => y.price - x.price)[0];
  if (priciest && avgPrice && priciest.price >= avgPrice * 1.6) add(priciest.playerId, { id: 'clown', icon: '🤡', name: 'Overpaid Clown', why: `Paid ${priciest.price.toLocaleString()} for ${g.characters[priciest.charId]?.name ?? 'one fighter'}. The seller is still laughing.` });
  add(most(spent, 1), { id: 'arson', icon: '💸', name: 'Wallet Arsonist', why: 'Spent more coins than anyone. Money was not a concern. Sense was not either.' });
  add(most((pid) => -spent(pid) / Math.max(1, bought(pid).length), -Infinity), { id: 'coupon', icon: '🪙', name: 'Coupon Clipper', why: 'Cheapest team in the room. Bargain bin energy.' });
  add(most((pid) => habits[pid]?.bids ?? 0, 8), { id: 'spam', icon: '🔁', name: 'Bid Spammer', why: 'Raised the price more times than anyone. Mostly on things they did not need.' });
  add(most((pid) => habits[pid]?.passes ?? 0, 5), { id: 'popcorn', icon: '🍿', name: 'Professional Spectator', why: 'Passed on more fighters than anyone. Came for the show, apparently.' });
  add(most((pid) => habits[pid]?.lateBids ?? 0, 2), { id: 'rat', icon: '🐀', name: 'Last-Second Rat', why: 'Kept sneaking bids in as the timer died. Nobody trusts them now.' });
  add(most((pid) => habits[pid]?.outbid ?? 0, 3), { id: 'bridesmaid', icon: '💔', name: 'Eternal Bridesmaid', why: 'Outbid more than anyone. Always close, never chosen.' });
  for (const p of humans) {
    const leftovers = tx.filter((x) => x.playerId === p.id && x.kind === 'assignment').length;
    if (leftovers >= 1) add(p.id, { id: 'leftovers', icon: '🗑️', name: 'Leftovers Collector', why: `Ended up with ${leftovers} fighter${leftovers > 1 ? 's' : ''} nobody else wanted.` });
  }
  const cheapest = tx.filter((x) => x.kind === 'purchase').sort((x, y) => x.price - y.price)[0];
  if (cheapest && avgPrice && cheapest.price <= avgPrice * 0.5) add(cheapest.playerId, { id: 'bandit', icon: '🦹', name: 'Daylight Robber', why: `Got ${g.characters[cheapest.charId]?.name ?? 'a fighter'} for just ${cheapest.price.toLocaleString()}. Should be illegal.` });

  for (const pid of Object.keys(out)) out[pid] = out[pid].slice(0, 3);
  return out;
}
