// Live auction: sets of lots, timed bidding with extensions, NPC bidders,
// scout tokens, a mystery lot and a returning round for unsold players.
// Pure: every function takes the current time and returns a new state.
import { Rng, deriveSeed } from './rng';
import type { Cricketer, Form } from './types';
import { RULES, canBuy, nextBid, penaltyFill, slotsNeeded, target, type PenaltyFill, type SquadMode } from './squad';

export interface Franchise {
  id: string;
  name: string;
  short: string;
  color: string;
  /** Human player ids who own this franchise (partners share one purse). Empty for computer teams. */
  owners: string[];
  npc: boolean;
  /** The Boss NPC of a 1v4 game: one computer franchise against four friends. */
  boss?: boolean;
  purse: number;
  startPurse: number;
  squad: string[];
  paid: Record<string, number>;
  scouts: number;
  /** Player ids this franchise has scouted (their hidden form is known to it). */
  scouted: string[];
  penalties: PenaltyFill[];
  /** IPL mode: which of the 10 previous teams this franchise stands for (matches players' prev). */
  prev?: number;
  /** IPL mode: Right to Match cards left, and how many may still go on capped / uncapped players. */
  rtm?: { cards: number; capped: number; uncapped: number };
}

export type LotSet = 'Marquee' | 'Batters' | 'Wicketkeepers' | 'All-rounders' | 'Pace' | 'Spin' | 'Uncapped' | 'Mystery' | 'Second chance' | 'Accelerated';

export interface Lot { id: string; set: LotSet; base: number; mystery?: boolean }

export interface Bid { by: string; amount: number; at: number }

/** Right to Match after the hammer: the previous team may match; the winning bidder first gets one final raise. */
export interface RtmState { fid: string; stage: 'ask' | 'raise' | 'match' | 'toBidder' | 'toRtm'; endsAt: number }

export interface LiveLot { lot: Lot; bid: number; bidder: string | null; endsAt: number; history: Bid[]; startedAt: number; rtm?: RtmState }

export interface AuctionState {
  queue: Lot[];
  index: number;
  live: LiveLot | null;
  sold: Array<{ id: string; to: string; price: number; mystery?: boolean }>;
  unsold: string[];
  /** Lots already offered a second time. */
  returned: string[];
  done: boolean;
  /** Seconds per lot and per-bid extension. */
  timer: number;
  extension: number;
  /** Shown between lots: last result. */
  last?: { id: string; to: string | null; price: number; mystery?: boolean };
  /** Lot is paused for this long after a sale (ms), so everyone sees the hammer. */
  gapUntil: number;
  /** IPL accelerated round: each team nominates up to 5 unsold players to bring back (picks[fid] set = submitted). */
  accel?: { stage: 'nominate' | 'running'; endsAt: number; picks: Record<string, string[]> };
}

/** Seconds a team has for each Right to Match step. */
export const RTM_SECONDS = 10;
/** Seconds to nominate players for the accelerated round. */
export const NOMINATE_SECONDS = 25;

export interface AuctionCtx {
  seed: number;
  mode: SquadMode;
  players: Record<string, Cricketer>;
  form: Record<string, Form>;
  franchises: Franchise[];
}

const SET_ORDER: LotSet[] = ['Marquee', 'Batters', 'Wicketkeepers', 'All-rounders', 'Pace', 'Spin', 'Uncapped'];

export function setOf(c: Cricketer): LotSet {
  if (c.tier >= 5) return 'Marquee';
  if (c.uncapped) return 'Uncapped';
  if (c.role === 'keeper') return 'Wicketkeepers';
  if (c.role === 'allrounder') return 'All-rounders';
  if (c.role === 'pace') return 'Pace';
  if (c.role === 'spin') return 'Spin';
  return 'Batters';
}

/** Build the lot queue: sets in order, shuffled inside each set; one mystery lot near the end. */
export function buildQueue(pool: Cricketer[], seed: number, mystery: string | null): Lot[] {
  const rng = new Rng(deriveSeed(seed, 'queue'));
  const out: Lot[] = [];
  for (const set of SET_ORDER) {
    const lots = rng.shuffle(pool.filter((c) => setOf(c) === set && c.id !== mystery));
    for (const c of lots) out.push({ id: c.id, set, base: c.basePrice });
  }
  if (mystery) out.splice(Math.max(0, out.length - 3), 0, { id: mystery, set: 'Mystery', base: 100, mystery: true });
  return out;
}

export function newAuction(queue: Lot[], timer: number, extension: number): AuctionState {
  return { queue, index: 0, live: null, sold: [], unsold: [], returned: [], done: false, timer, extension, gapUntil: 0 };
}

const rules = (ctx: AuctionCtx) => RULES[ctx.mode];
export const squadOf = (ctx: AuctionCtx, f: Franchise) => f.squad.map((id) => ctx.players[id]);

/** Is this franchise allowed to make the next bid on the live lot? Returns a reason when not. */
export function bidBlock(ctx: AuctionCtx, a: AuctionState, fid: string): string | null {
  const live = a.live;
  if (!live) return 'No lot open';
  if (live.bidder === fid) return 'You are the highest bidder';
  const f = ctx.franchises.find((x) => x.id === fid);
  if (!f) return 'Unknown team';
  const amount = nextBid(live.bid, live.lot.base);
  const c = ctx.players[live.lot.id];
  // The mystery lot hides the player's role: only the purse and squad size are checked.
  if (live.lot.mystery) {
    if (f.squad.length >= rules(ctx).size) return 'Squad is full';
    // A hidden player can't be counted on for a compulsory slot: there must be a free one.
    if (slotsNeeded(squadOf(ctx, f), rules(ctx)) > rules(ctx).size - f.squad.length - 1) return 'No free slot: fill your compulsory roles first';
    if (f.purse - amount < Math.max(0, target(rules(ctx)) - f.squad.length - 1) * rules(ctx).minPrice) return 'Not enough purse left for your empty slots';
    return null;
  }
  return canBuy(squadOf(ctx, f), f.purse, c, amount, rules(ctx))?.reason ?? null;
}

export function openNext(ctx: AuctionCtx, a: AuctionState, now: number): AuctionState {
  let index = a.index;
  let queue = a.queue;
  const full = ctx.franchises.every((f) => f.squad.length >= rules(ctx).size);
  // IPL: when every set has been offered, teams nominate unsold players for an accelerated round.
  if (ctx.mode === 'ipl' && index >= queue.length && !full) {
    if (!a.accel) {
      if (!a.unsold.length) return { ...a, live: null, done: true };
      const picks: Record<string, string[]> = {};
      for (const f of ctx.franchises) if (f.npc) picks[f.id] = npcNominations(ctx, a, f);
      return { ...a, live: null, accel: { stage: 'nominate', endsAt: now + NOMINATE_SECONDS * 1000, picks } };
    }
    if (a.accel.stage === 'nominate') {
      const waiting = ctx.franchises.some((f) => !f.npc && !a.accel!.picks[f.id]);
      if (waiting && now < a.accel.endsAt) return { ...a, live: null };
      const ids = [...new Set(Object.values(a.accel.picks).flat())].filter((id) => a.unsold.includes(id));
      const rng = new Rng(deriveSeed(ctx.seed, 'accelerated'));
      const lots = rng.shuffle(ids).map((id) => ({ id, set: 'Accelerated' as LotSet, base: queue.find((l) => l.id === id)?.base ?? ctx.players[id].basePrice }));
      const half = Math.max(4, Math.round(a.timer / 2));
      return openNext(ctx, { ...a, queue: [...queue, ...lots], unsold: a.unsold.filter((id) => !ids.includes(id)), accel: { ...a.accel, stage: 'running' }, timer: half, extension: Math.max(3, Math.round(a.extension / 2)) }, now);
    }
    return { ...a, live: null, done: true };
  }
  // Out of lots: bring unsold players back once at a lower price.
  if (index >= queue.length && !full) {
    const back = a.unsold.filter((id) => !a.returned.includes(id));
    if (back.length) {
      const rng = new Rng(deriveSeed(ctx.seed, 'return', a.returned.length));
      const lots = rng.shuffle(back).map((id) => ({ id, set: 'Second chance' as LotSet, base: Math.max(rules(ctx).minPrice, Math.round(ctx.players[id].basePrice * 0.5 / 5) * 5) }));
      queue = [...queue, ...lots];
      return openNext(ctx, { ...a, queue, returned: [...a.returned, ...back], unsold: a.unsold.filter((id) => !back.includes(id)) }, now);
    }
  }
  if (index >= queue.length || full) return { ...a, live: null, done: true };
  // Skip lots nobody can buy at all (every squad blocked).
  const lot = queue[index];
  const anyone = ctx.franchises.some((f) => bidBlock(ctx, { ...a, live: { lot, bid: 0, bidder: null, endsAt: 0, history: [], startedAt: now } }, f.id) === null);
  if (!anyone) return openNext(ctx, { ...a, index: index + 1, unsold: [...a.unsold, lot.id] }, now);
  index += 1;
  return { ...a, queue, index, live: { lot, bid: 0, bidder: null, endsAt: now + a.timer * 1000, history: [], startedAt: now } };
}

export function placeBid(ctx: AuctionCtx, a: AuctionState, fid: string, now: number): AuctionState {
  if (bidBlock(ctx, a, fid) || !a.live) return a;
  const live = a.live;
  const amount = nextBid(live.bid, live.lot.base);
  const endsAt = Math.max(live.endsAt, now + a.extension * 1000);
  return { ...a, live: { ...live, bid: amount, bidder: fid, endsAt, history: [...live.history, { by: fid, amount, at: now }] } };
}

/** Close the live lot if its timer ran out. Returns updated franchises too. */
export function closeIfDue(ctx: AuctionCtx, a: AuctionState, now: number): { a: AuctionState; franchises: Franchise[] } {
  const live = a.live;
  if (!live) return { a, franchises: ctx.franchises };
  const id = live.lot.id;
  const r = live.rtm;
  if (r) {
    if (r.stage === 'toRtm') return sell(ctx, a, r.fid, now, true);
    if (r.stage !== 'toBidder' && now < r.endsAt) return { a, franchises: ctx.franchises };
    // Timer ran out: no RTM / keep the bid / no match.
    if (r.stage === 'raise') return { a: { ...a, live: { ...live, rtm: { ...r, stage: 'match', endsAt: now + RTM_SECONDS * 1000 } } }, franchises: ctx.franchises };
    return sell(ctx, a, live.bidder!, now, false);
  }
  if (now < live.endsAt) return { a, franchises: ctx.franchises };
  if (live.bidder) {
    const holder = rtmHolder(ctx, live);
    if (holder) return { a: { ...a, live: { ...live, rtm: { fid: holder, stage: 'ask', endsAt: now + RTM_SECONDS * 1000 } } }, franchises: ctx.franchises };
    const bidder = ctx.franchises.find((f) => f.id === live.bidder);
    // The mystery lot hides eligibility details while bidding. Enforce the
    // overseas cap at the hammer, once the hidden player is known to the engine.
    if (live.lot.mystery && ctx.players[id]?.overseas && bidder && squadOf(ctx, bidder).filter((c) => c.overseas).length >= rules(ctx).maxOverseas) {
      return { a: { ...a, live: null, unsold: [...a.unsold, id], last: { id, to: null, price: 0, mystery: true }, gapUntil: now + 1400 }, franchises: ctx.franchises };
    }
    const franchises = ctx.franchises.map((f) => (f.id === live.bidder ? { ...f, purse: f.purse - live.bid, squad: [...f.squad, id], paid: { ...f.paid, [id]: live.bid } } : f));
    return { a: { ...a, live: null, sold: [...a.sold, { id, to: live.bidder, price: live.bid, mystery: live.lot.mystery }], last: { id, to: live.bidder, price: live.bid, mystery: live.lot.mystery }, gapUntil: now + 2200 }, franchises };
  }
  return { a: { ...a, live: null, unsold: [...a.unsold, id], last: { id, to: null, price: 0, mystery: live.lot.mystery }, gapUntil: now + 1400 }, franchises: ctx.franchises };
}

/** Hand the live lot to a team at the current price (via RTM: also use one of its cards). */
function sell(ctx: AuctionCtx, a: AuctionState, to: string, now: number, viaRtm: boolean): { a: AuctionState; franchises: Franchise[] } {
  const live = a.live!;
  const id = live.lot.id;
  const c = ctx.players[id];
  const franchises = ctx.franchises.map((f) => {
    if (f.id !== to) return f;
    const rtm = viaRtm && f.rtm ? { cards: f.rtm.cards - 1, capped: f.rtm.capped - (c.uncapped ? 0 : 1), uncapped: f.rtm.uncapped - (c.uncapped ? 1 : 0) } : f.rtm;
    return { ...f, purse: f.purse - live.bid, squad: [...f.squad, id], paid: { ...f.paid, [id]: live.bid }, rtm };
  });
  return { a: { ...a, live: null, sold: [...a.sold, { id, to, price: live.bid, mystery: live.lot.mystery }], last: { id, to, price: live.bid, mystery: live.lot.mystery }, gapUntil: now + 2200 }, franchises };
}

/** The previous team of the player on the hammer, if it may use a Right to Match card at this price. */
export function rtmHolder(ctx: AuctionCtx, live: LiveLot): string | null {
  if (ctx.mode !== 'ipl' || live.lot.mystery || !live.bidder) return null;
  const c = ctx.players[live.lot.id];
  if (c.prev === undefined) return null;
  const f = ctx.franchises.find((x) => x.prev === c.prev);
  if (!f || f.id === live.bidder || !f.rtm || f.rtm.cards <= 0 || (c.uncapped ? f.rtm.uncapped : f.rtm.capped) <= 0) return null;
  return canBuy(squadOf(ctx, f), f.purse, c, live.bid, rules(ctx)) ? null : f.id;
}

/** RTM team answers "use RTM?" (stage ask) or "match the final price?" (stage match). */
export function rtmAnswer(ctx: AuctionCtx, a: AuctionState, fid: string, yes: boolean, now: number): AuctionState {
  const live = a.live; const r = live?.rtm;
  if (!live || !r || r.fid !== fid || (r.stage !== 'ask' && r.stage !== 'match')) return a;
  if (r.stage === 'ask') return { ...a, live: { ...live, rtm: yes ? { ...r, stage: 'raise', endsAt: now + RTM_SECONDS * 1000 } : { ...r, stage: 'toBidder', endsAt: 0 } } };
  const f = ctx.franchises.find((x) => x.id === fid)!;
  const ok = yes && !canBuy(squadOf(ctx, f), f.purse, ctx.players[live.lot.id], live.bid, rules(ctx));
  return { ...a, live: { ...live, rtm: { ...r, stage: ok ? 'toRtm' : 'toBidder', endsAt: 0 } } };
}

/** The winning bidder's one final raise after an RTM is called (amount = current bid keeps it). */
export function rtmRaise(ctx: AuctionCtx, a: AuctionState, fid: string, amount: number, now: number): AuctionState {
  const live = a.live; const r = live?.rtm;
  if (!live || !r || r.stage !== 'raise' || live.bidder !== fid || !Number.isFinite(amount) || amount < live.bid) return a;
  const f = ctx.franchises.find((x) => x.id === fid)!;
  const want = Math.round(amount / 5) * 5;
  const price = want > live.bid && !canBuy(squadOf(ctx, f), f.purse, ctx.players[live.lot.id], want, rules(ctx)) ? want : live.bid;
  return { ...a, live: { ...live, bid: price, rtm: { ...r, stage: 'match', endsAt: now + RTM_SECONDS * 1000 } } };
}

/** A team's accelerated-round nominations (up to 5 unsold players). */
export function nominate(a: AuctionState, fid: string, ids: string[]): AuctionState {
  if (a.accel?.stage !== 'nominate' || a.accel.picks[fid]) return a;
  const picks = [...new Set(ids)].filter((id) => a.unsold.includes(id)).slice(0, 5);
  return { ...a, accel: { ...a.accel, picks: { ...a.accel.picks, [fid]: picks } } };
}

/** Computer teams bring back the unsold players they value most above base price. */
function npcNominations(ctx: AuctionCtx, a: AuctionState, f: Franchise): string[] {
  if (f.squad.length >= rules(ctx).size) return [];
  const rng = new Rng(deriveSeed(ctx.seed, 'nominate', f.id));
  return a.unsold.map((id) => ({ id, v: npcValue(ctx, f, ctx.players[id], rng) / Math.max(1, ctx.players[id].basePrice) }))
    .filter((x) => x.v > 1.1).sort((x, y) => y.v - x.v).slice(0, 5).map((x) => x.id);
}

// ------------------------------------------------------------------ NPCs

/** What a computer team thinks a player is worth, in lakh. */
export function npcValue(ctx: AuctionCtx, f: Franchise, c: Cricketer, rng: Rng): number {
  const r = rules(ctx);
  const tierWorth = { 1: 45, 2: 130, 3: 330, 4: 750, 5: 1350 }[c.tier];
  const teams = ctx.franchises.length;
  // More teams chasing fewer stars push prices up; purse size scales everything.
  let v = tierWorth * (ctx.mode === 'quick' ? 1.35 : 1) * (0.8 + teams * 0.07) * (f.startPurse / 10000);
  if (f.boss) v *= 0.8;
  const sq = squadOf(ctx, f);
  const roleCount = sq.filter((x) => x.role === c.role).length;
  const want: Record<string, number> = { opener: 2, middle: 2, finisher: 2, keeper: 1, allrounder: 3, pace: 3, spin: 2 };
  if (roleCount >= (want[c.role] ?? 2) + 1) v *= 0.45; else if (roleCount < (want[c.role] ?? 2)) v *= 1.2;
  if (c.uncapped && sq.filter((x) => x.uncapped).length < r.minUncapped) v *= 1.4;
  if (c.potential) v *= 1 + (c.potential - 60) / 200;
  // Scouted form changes the price a team will pay.
  if (f.scouted.includes(c.id)) v *= ctx.form[c.id] === 1 ? 1.25 : ctx.form[c.id] === -1 ? 0.6 : 1;
  const slotsLeft = Math.max(1, target(r) - sq.length);
  // Spend the purse: late in the auction a team with money pays more.
  v *= 1 + Math.max(0, f.purse / slotsLeft / (f.startPurse / target(r)) - 1) * 0.5;
  return Math.max(c.basePrice, v * (0.85 + rng.next() * 0.3));
}

/** Let computer teams react (called every few hundred ms by the host). */
export function npcStep(ctx: AuctionCtx, a: AuctionState, now: number): AuctionState {
  const live = a.live;
  if (!live) return a;
  const r = live.rtm;
  if (r) {
    const c = ctx.players[live.lot.id];
    const val = (fid: string) => npcValue(ctx, ctx.franchises.find((f) => f.id === fid)!, c, new Rng(deriveSeed(ctx.seed, live.lot.id, fid, 'value')));
    const holder = ctx.franchises.find((f) => f.id === r.fid);
    const bidder = ctx.franchises.find((f) => f.id === live.bidder);
    if ((r.stage === 'ask' || r.stage === 'match') && holder?.npc) return rtmAnswer(ctx, a, r.fid, val(r.fid) >= live.bid, now);
    // The bidder raises towards what the player is worth to them, but never past it.
    if (r.stage === 'raise' && bidder?.npc) return rtmRaise(ctx, a, bidder.id, Math.max(live.bid, Math.min(val(bidder.id), live.bid * 1.3)), now);
    return a;
  }
  const elapsed = now - live.startedAt;
  if (elapsed < 900) return a;
  const tick = Math.floor(now / 600);
  for (const f of ctx.franchises) {
    if (!f.npc || live.bidder === f.id || bidBlock(ctx, a, f.id)) continue;
    const rng = new Rng(deriveSeed(ctx.seed, live.lot.id, f.id, 'value'));
    const c = ctx.players[live.lot.id];
    const value = live.lot.mystery ? 260 : npcValue(ctx, f, c, rng);
    const amount = nextBid(live.bid, live.lot.base);
    if (amount > value) continue;
    const act = new Rng(deriveSeed(ctx.seed, live.lot.id, f.id, live.history.length, tick));
    const left = live.endsAt - now;
    if (act.chance(left < 2500 ? 0.75 : 0.28)) return placeBid(ctx, a, f.id, now);
  }
  return a;
}

/** Spend a scout token: the franchise learns the player's hidden form. */
export function scout(fs: Franchise[], fid: string, playerId: string): Franchise[] {
  return fs.map((f) => (f.id === fid && f.scouts > 0 && !f.scouted.includes(playerId) ? { ...f, scouts: f.scouts - 1, scouted: [...f.scouted, playerId] } : f));
}

/** End of auction: penalty fill for every franchise from players nobody bought. */
export function finishAuction(ctx: AuctionCtx, a: AuctionState, poolIds: string[]): Franchise[] {
  const taken = new Set(ctx.franchises.flatMap((f) => f.squad));
  // Unsold auction players first; if a role has run dry, replacement signings from outside the pool.
  const inPool = new Set(poolIds);
  let unsold = [
    ...poolIds.filter((id) => !taken.has(id)).map((id) => ctx.players[id]),
    ...Object.values(ctx.players).filter((c) => !inPool.has(c.id) && !taken.has(c.id)).sort((x, y) => x.id.localeCompare(y.id)),
  ];
  void a;
  const r = rules(ctx);
  return ctx.franchises.map((f) => {
    const target = { ...r, size: r.size + r.autoFill };
    const raw = penaltyFill(squadOf(ctx, f), unsold, ctx.mode === 'quick' ? { ...target, minKeeper: 1, minBowlers: 4, minPace: 2, minSpin: 1, minBatters: 3, minAllrounders: 1 } : r);
    // IPL has no double-price penalty: slots still empty are filled at the lowest base price (the purse reserve covers it).
    const fill = ctx.mode === 'ipl' ? raw.map((x) => ({ ...x, price: r.minPrice, doubled: false })) : raw;
    const ids = new Set(fill.map((x) => x.id));
    unsold = unsold.filter((c) => !ids.has(c.id));
    // Quick mode's shared average players are free; penalties are charged.
    const cost = ctx.mode === 'quick' ? 0 : fill.reduce((s, x) => s + x.price, 0);
    const paid = { ...f.paid };
    for (const x of fill) paid[x.id] = ctx.mode === 'quick' ? 0 : x.price;
    return { ...f, squad: [...f.squad, ...fill.map((x) => x.id)], purse: f.purse - cost, paid, penalties: ctx.mode === 'quick' ? [] : fill };
  });
}
