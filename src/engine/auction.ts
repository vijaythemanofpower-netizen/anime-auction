// Auction state machine. All functions mutate a draft GameState in place;
// the store clones state before calling them. Every state-changing entry
// point validates phase, player, and amounts, and returns an error string
// instead of throwing for invalid user input.
import type { AuctionConfig, AuctionState, GameState, Lot, Player } from './types';
import { Rng } from './rng';

export type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const OK: Result = { ok: true };

export function slotsRemaining(p: Player, rosterSize: number): number {
  return Math.max(0, rosterSize - p.roster.length);
}

export function bidIncrement(current: number): number {
  if (current < 1000) return 50;
  if (current < 3000) return 100;
  return 250;
}

/** Highest amount a player may bid while still being able to fill their roster. */
export function maxBidFor(p: Player, rosterSize: number, openingBid: number): number {
  const slots = slotsRemaining(p, rosterSize);
  if (slots === 0) return 0;
  return Math.max(0, p.coins - (slots - 1) * openingBid);
}

/** Minimum coins a player must keep to finish their roster. */
export function reserveNeeded(p: Player, rosterSize: number, openingBid: number): number {
  return slotsRemaining(p, rosterSize) * openingBid;
}

export function leader(lot: Lot): { playerId: string; amount: number } | null {
  const b = lot.bids[lot.bids.length - 1];
  return b ? { playerId: b.playerId, amount: b.amount } : null;
}

export function minNextBid(lot: Lot, cfg: AuctionConfig): number {
  const l = leader(lot);
  return l ? l.amount + bidIncrement(l.amount) : cfg.openingBid;
}

export function canBid(g: GameState, p: Player): boolean {
  const a = g.auction;
  if (!a?.lot || a.lot.status !== 'open') return false;
  if (a.lot.passed.includes(p.id)) return false;
  if (leader(a.lot)?.playerId === p.id) return false;
  return maxBidFor(p, g.config.rosterSize, a.config.openingBid) >= minNextBid(a.lot, a.config);
}

/** Players who still have an open seat at this lot (excluding passed ones). */
function contenders(g: GameState): Player[] {
  const a = g.auction!;
  const lot = a.lot!;
  const lead = leader(lot)?.playerId;
  return g.players.filter((p) => p.id !== lead && !lot.passed.includes(p.id) && canBid(g, p));
}

export function totalSlotsRemaining(g: GameState): number {
  return g.players.reduce((n, p) => n + slotsRemaining(p, g.config.rosterSize), 0);
}

export function createAuction(cfg: AuctionConfig, pool: string[], seed: number): AuctionState {
  const rng = new Rng(seed);
  return {
    config: cfg,
    queue: rng.shuffle(pool),
    lot: null,
    lotCounter: 0,
    bidSeq: 0,
    transactions: [],
    log: [],
    observations: [],
    attempts: {},
    rngState: rng.state,
    complete: false,
    notice: null,
  };
}

function log(a: AuctionState, now: number, text: string) {
  a.log.push({ at: now, text });
  if (a.log.length > 200) a.log.splice(0, a.log.length - 200);
}

function nextActive(g: GameState, from: string | null): string | null {
  const lot = g.auction!.lot!;
  const n = g.players.length;
  const startIdx = from ? g.players.findIndex((p) => p.id === from) : (lot.lotNumber - 1) % n - 1;
  for (let i = 1; i <= n; i++) {
    const p = g.players[(startIdx + i + n) % n];
    if (!lot.passed.includes(p.id) && canBid(g, p)) return p.id;
  }
  return null;
}

/** Auction Director: opens the next lot or completes the auction. */
export function openNextLot(g: GameState, now: number): Result {
  const a = g.auction;
  if (!a) return fail('No auction in progress.');
  if (a.complete) return fail('Auction already complete.');
  if (a.lot && a.lot.status === 'open') return fail('A lot is already open.');
  a.notice = null;

  if (totalSlotsRemaining(g) === 0) {
    a.complete = true;
    a.lot = null;
    log(a, now, 'All rosters are complete. The auction is over!');
    return OK;
  }
  if (a.queue.length === 0) {
    // Should be unreachable because the pool is validated and unsold lots are
    // only withdrawn while there is surplus. Fail safe: finish the auction.
    a.complete = true;
    a.lot = null;
    a.notice = 'The auction pool ran out before every roster was full.';
    return OK;
  }

  const rng = new Rng(a.rngState);
  // Director: mostly in queue order, occasionally pulls a later lot forward to
  // vary pacing. Never reorders when lots are scarce.
  let idx = 0;
  if (a.queue.length > totalSlotsRemaining(g) + 1 && rng.chance(0.2)) idx = rng.int(1, Math.min(3, a.queue.length - 1));
  a.rngState = rng.state;
  const [charId] = a.queue.splice(idx, 1);
  const prevAttempt = a.attempts[charId] ?? 0;

  a.lotCounter += 1;
  const lot: Lot = {
    lotNumber: a.lotCounter,
    charId,
    status: 'open',
    bids: [],
    passed: [],
    activePlayerId: null,
    deadline: now + a.config.timerSeconds * 1000,
    attempt: prevAttempt + 1,
  };
  a.lot = lot;
  // Players who cannot participate are auto-passed.
  for (const p of g.players) if (!canBid(g, p)) lot.passed.push(p.id);
  if (a.config.mode === 'turns') lot.activePlayerId = nextActive(g, null);
  log(a, now, `Lot #${lot.lotNumber}: ${g.characters[charId]?.name ?? charId} enters the stage.`);
  if (contenders(g).length === 0) settleLot(g, now);
  return OK;
}

function habit(a: AuctionState, playerId: string) {
  a.habits ??= {};
  return (a.habits[playerId] ??= { bids: 0, passes: 0, lateBids: 0, outbid: 0 });
}

export function placeBid(g: GameState, playerId: string, amount: number, now: number): Result {
  const a = g.auction;
  if (g.phase !== 'auction' || !a?.lot) return fail('No lot is open.');
  const lot = a.lot;
  if (lot.status !== 'open') return fail('Bidding is closed for this lot.');
  const p = g.players.find((x) => x.id === playerId);
  if (!p) return fail('Unknown player.');
  if (!Number.isInteger(amount) || amount <= 0) return fail('Bid must be a positive whole number.');
  if (a.config.mode === 'turns' && lot.activePlayerId !== playerId) return fail('It is not your turn to bid.');
  if (lot.passed.includes(playerId)) return fail('You already passed on this lot.');
  if (slotsRemaining(p, g.config.rosterSize) === 0) return fail('Your roster is full.');
  if (leader(lot)?.playerId === playerId) return fail('You are already the leading bidder.');
  const min = minNextBid(lot, a.config);
  if (amount < min) return fail(`Minimum bid is ${min}.`);
  const max = maxBidFor(p, g.config.rosterSize, a.config.openingBid);
  if (amount > max) return fail(amount > p.coins ? 'You cannot bid more than your balance.' : `You must keep ${reserveNeeded(p, g.config.rosterSize, a.config.openingBid) - a.config.openingBid} coins to fill your remaining slots. Max bid: ${max}.`);

  const prev = leader(lot)?.playerId;
  const h = habit(a, playerId);
  h.bids += 1;
  if (a.config.mode === 'live' && lot.deadline - now < 3000) h.lateBids += 1;
  if (prev && prev !== playerId) habit(a, prev).outbid += 1;
  a.bidSeq += 1;
  lot.bids.push({ playerId, amount, at: now, seq: a.bidSeq });
  log(a, now, `${p.name} bids ${amount}.`);
  if (a.config.mode === 'live') {
    lot.deadline = Math.max(lot.deadline, now + a.config.antiSnipeSeconds * 1000);
  } else {
    lot.activePlayerId = nextActive(g, playerId);
    lot.deadline = now + a.config.timerSeconds * 1000;
  }
  checkClose(g, now);
  return OK;
}

export function passLot(g: GameState, playerId: string, now: number): Result {
  const a = g.auction;
  if (g.phase !== 'auction' || !a?.lot || a.lot.status !== 'open') return fail('No lot is open.');
  const lot = a.lot;
  if (a.config.mode === 'turns' && lot.activePlayerId !== playerId) return fail('It is not your turn.');
  if (lot.passed.includes(playerId)) return fail('Already passed.');
  if (leader(lot)?.playerId === playerId) return fail('The leading bidder cannot pass.');
  const p = g.players.find((x) => x.id === playerId);
  if (!p) return fail('Unknown player.');
  lot.passed.push(playerId);
  habit(a, playerId).passes += 1;
  log(a, now, `${p.name} passes.`);
  if (a.config.mode === 'turns') {
    lot.activePlayerId = nextActive(g, playerId);
    lot.deadline = now + a.config.timerSeconds * 1000;
  }
  checkClose(g, now);
  return OK;
}

/** Advances timers. Safe to call at any frequency. */
export function tick(g: GameState, now: number): boolean {
  const a = g.auction;
  if (g.phase !== 'auction' || !a?.lot || a.lot.status !== 'open') return false;
  if (now < a.lot.deadline) return false;
  if (a.config.mode === 'live') {
    settleLot(g, now);
  } else if (a.lot.activePlayerId) {
    const pid = a.lot.activePlayerId;
    const name = g.players.find((p) => p.id === pid)?.name;
    a.lot.passed.push(pid);
    log(a, now, `${name} ran out of time and passes.`);
    a.lot.activePlayerId = nextActive(g, pid);
    a.lot.deadline = now + a.config.timerSeconds * 1000;
    checkClose(g, now);
  } else {
    settleLot(g, now);
  }
  return true;
}

function checkClose(g: GameState, now: number) {
  const lot = g.auction!.lot!;
  if (lot.status !== 'open') return;
  if (contenders(g).length === 0) settleLot(g, now);
  else if (g.auction!.config.mode === 'turns' && !lot.activePlayerId) settleLot(g, now);
}

/** Closes the lot and settles it exactly once. */
export function settleLot(g: GameState, now: number): Result {
  const a = g.auction;
  if (!a?.lot) return fail('No lot.');
  const lot = a.lot;
  if (lot.status !== 'open') return fail('Lot already settled.');
  lot.status = 'closed';
  lot.activePlayerId = null;
  const win = leader(lot);
  const name = g.characters[lot.charId]?.name ?? lot.charId;
  a.attempts[lot.charId] = lot.attempt;

  if (win) {
    const p = g.players.find((x) => x.id === win.playerId)!;
    assign(g, p, lot.charId, win.amount, 'purchase', now);
    lot.status = 'sold';
    log(a, now, `SOLD! ${name} goes to ${p.name} for ${win.amount}.`);
    return OK;
  }

  // Recovery policy when nobody bids.
  const lotsLeftIncludingThis = a.queue.length + 1;
  const needed = totalSlotsRemaining(g);
  if (lotsLeftIncludingThis <= needed) {
    // Scarce: assign at the opening price to the player with the most open
    // slots (ties: most coins, then seat order). Reserve rules guarantee they
    // can always afford it.
    const target = g.players
      .filter((p) => slotsRemaining(p, g.config.rosterSize) > 0)
      .sort((x, y) => slotsRemaining(y, g.config.rosterSize) - slotsRemaining(x, g.config.rosterSize) || y.coins - x.coins)[0];
    const price = Math.min(a.config.openingBid, target.coins);
    assign(g, target, lot.charId, price, 'assignment', now);
    lot.status = 'assigned';
    a.notice = `No bids, and only ${lotsLeftIncludingThis} lot(s) remain for ${needed} open slot(s). ${name} is assigned to ${target.name} at the opening price of ${price} so every roster can be completed.`;
    log(a, now, a.notice);
    return OK;
  }
  lot.status = 'unsold';
  if (lot.attempt < 2) {
    a.queue.push(lot.charId);
    log(a, now, `No bids for ${name}. It will return later in the auction.`);
  } else {
    g.pool = g.pool.filter((id) => id !== lot.charId);
    log(a, now, `No bids for ${name} again. Withdrawn from the auction.`);
  }
  return OK;
}

function assign(g: GameState, p: Player, charId: string, price: number, kind: 'purchase' | 'assignment', now: number) {
  if (g.owners[charId]) throw new Error('Duplicate sale prevented: character already owned');
  if (price > p.coins) throw new Error('Settlement exceeds balance');
  if (slotsRemaining(p, g.config.rosterSize) === 0) throw new Error('Roster full at settlement');
  p.coins -= price;
  p.roster.push(charId);
  g.owners[charId] = p.id;
  g.prices[charId] = price;
  const a = g.auction!;
  a.transactions.push({ id: `tx${a.transactions.length + 1}`, lotNumber: a.lot!.lotNumber, charId, playerId: p.id, price, kind, at: now });
}

export function economy(g: GameState, p: Player) {
  const tx = g.auction?.transactions.filter((t) => t.playerId === p.id) ?? [];
  const spent = tx.reduce((s, t) => s + t.price, 0);
  const opening = g.auction?.config.openingBid ?? 100;
  return {
    starting: p.coins + spent,
    spent,
    remaining: p.coins,
    acquired: p.roster.length,
    average: tx.length ? Math.round(spent / tx.length) : 0,
    slots: slotsRemaining(p, g.config.rosterSize),
    minNeeded: reserveNeeded(p, g.config.rosterSize, opening),
    maxBid: maxBidFor(p, g.config.rosterSize, opening),
  };
}
