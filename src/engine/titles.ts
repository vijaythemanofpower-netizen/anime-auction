// Player titles: earned from how someone bids, builds a team and coaches.
import type { BattleRecord, GameState } from './types';
import { duoOf, rivalryBetween } from './data/rivals';

export interface Title { id: string; name: string; why: string; tone: 'good' | 'bad' | 'fun' }

export function coachIq(battles: BattleRecord[], playerId: string): number | null {
  const iqs = battles.flatMap((b) => (b.reviews ?? []).filter((r) => r.playerId === playerId).map((r) => r.iq));
  return iqs.length ? Math.round(iqs.reduce((a, b) => a + b, 0) / iqs.length) : null;
}

export function titlesFor(g: GameState, battles: BattleRecord[], playerId: string): Title[] {
  const out: Title[] = [];
  const add = (id: string, name: string, why: string, tone: Title['tone'] = 'fun') => out.push({ id, name, why, tone });

  // Coaching
  const mine = battles.filter((b) => b.kind === 'tournament' && b.input.sides.some((s) => s.playerId === playerId));
  const calls = mine.flatMap((b) => {
    const side = b.input.sides.findIndex((s) => s.playerId === playerId);
    return (b.input.calls ?? []).filter((c) => c.side === side);
  });
  const made = calls.filter((c) => c.kind !== 'none');
  const share = (...kinds: string[]) => (made.length ? made.filter((c) => kinds.includes(c.kind)).length / made.length : 0);
  const iq = coachIq(mine, playerId);
  const reviews = mine.flatMap((b) => (b.reviews ?? []).filter((r) => r.playerId === playerId)).length;
  if (iq !== null && reviews >= 1) {
    if (iq >= 122) add('mastermind', 'Mastermind', `Coach IQ ${iq}: nearly every call was the right one.`, 'good');
    else if (iq >= 112) add('knows', 'Knows What They\'re Doing', `Coach IQ ${iq}: reads fights well.`, 'good');
    else if (iq < 88) add('panic', 'Panic Button', `Coach IQ ${iq}: the calls often made things worse.`, 'bad');
  }
  if (made.length >= 3 && share('all_out', 'ultimate') >= 0.5) add('gambler', 'The Gambler', 'Goes all out or fires the ultimate whenever the corner can.');
  if (made.length >= 3 && share('defend', 'callback') >= 0.6) add('coward', 'Certified Coward', 'Guard up, fall back, guard up again.', 'bad');
  if (made.filter((c) => c.kind === 'reinforce').length >= 2) add('benchboss', 'Bench Boss', 'Loves sending in backup from the bench.');
  if (calls.length >= 4 && calls.filter((c) => c.kind === 'none').length / calls.length >= 0.7) add('handsoff', 'Hands Off', 'Lets the fighters sort it out themselves.');

  // Auction and roster
  const owned = Object.keys(g.owners).filter((id) => g.owners[id] === playerId);
  const prices = owned.map((id) => g.prices[id] ?? 0);
  const spentBy = (pid: string) => Object.keys(g.owners).filter((id) => g.owners[id] === pid).reduce((a, id) => a + (g.prices[id] ?? 0), 0);
  const spent = spentBy(playerId);
  const others = g.players.filter((p) => p.id !== playerId).map((p) => spentBy(p.id));
  if (prices.length && (Math.max(...prices) >= 3500 || (others.length && spent > Math.max(...others) * 1.25))) add('spender', 'Big Spender', `Paid up to ${Math.max(...prices)} coins for one fighter.`);
  if (prices.length >= 2 && others.length && spent < Math.min(...others) * 0.8) add('bargain', 'Bargain Hunter', `Built a whole team for ${spent} coins.`, 'good');
  const chars = owned.map((id) => g.characters[id]).filter(Boolean);
  const pairs = chars.flatMap((a, i) => chars.slice(i + 1).map((b) => [a.id, b.id] as const));
  if (pairs.some(([a, b]) => duoOf(a, b) || rivalryBetween(a, b))) add('fan', 'Fan Favourite', 'Assembled a duo or rivalry straight out of the series.');
  if (chars.length >= 3 && (new Set(chars.map((c) => c.archetype)).size === 1 || new Set(chars.map((c) => c.series)).size === 1)) add('specialist', 'Specialist', 'Every fighter is the same type or from the same series.');
  if (chars.filter((c) => c.archetype === 'Berserker' || c.archetype === 'Assassin').length >= 2) add('glass', 'Glass Cannon Collector', 'All offense, very little defense.');
  if (chars.filter((c) => c.archetype === 'Tank' || c.archetype === 'Support').length >= 2) add('wall', 'Wall Builder', 'Picks fighters who simply refuse to fall.');

  const order = { good: 0, bad: 1, fun: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 3);
}
