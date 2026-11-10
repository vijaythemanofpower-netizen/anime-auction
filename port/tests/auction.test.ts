import { describe, expect, it } from 'vitest';
import * as A from '../src/engine/auction';
import * as G from '../src/engine/game';
import { STARTING_COINS } from '../src/engine/types';
import { makeGame, runAuction } from './helpers';

describe('auction', () => {
  it('every player starts with 10,000 coins', () => {
    for (let n = 2; n <= 6; n++) {
      const { g } = makeGame(n);
      expect(g.players).toHaveLength(n);
      for (const p of g.players) expect(p.coins).toBe(STARTING_COINS);
    }
  });

  it('refuses to start with too small a pool', () => {
    const { g } = makeGame(4, 4);
    g.pool = g.pool.slice(0, 10);
    const r = G.startAuction(g, 0);
    expect(r.ok).toBe(false);
  });

  it('accepts valid bids and rejects invalid ones', () => {
    const { g } = makeGame(3);
    G.startAuction(g, 0);
    const [p1, p2] = g.players;
    expect(A.placeBid(g, p1.id, 50, 1).ok).toBe(false); // below opening
    expect(A.placeBid(g, p1.id, 100.5, 1).ok).toBe(false); // non-integer
    expect(A.placeBid(g, p1.id, 100, 1).ok).toBe(true);
    expect(A.placeBid(g, p1.id, 200, 2).ok).toBe(false); // already leading
    expect(A.placeBid(g, p2.id, 120, 2).ok).toBe(false); // below increment
    expect(A.placeBid(g, p2.id, 150, 2).ok).toBe(true);
    expect(A.placeBid(g, 'nobody', 500, 3).ok).toBe(false);
  });

  it('makes overspending impossible and preserves reserve for remaining slots', () => {
    const { g } = makeGame(2, 3);
    G.startAuction(g, 0);
    const p = g.players[0];
    expect(A.placeBid(g, p.id, STARTING_COINS + 1, 1).ok).toBe(false);
    // 3 slots, opening 100 -> must keep 200
    expect(A.maxBidFor(p, 3, 100)).toBe(STARTING_COINS - 200);
    expect(A.placeBid(g, p.id, STARTING_COINS - 199, 1).ok).toBe(false);
    expect(A.placeBid(g, p.id, STARTING_COINS - 200, 1).ok).toBe(true);
  });

  it('settles a lot exactly once and deducts the correct amount', () => {
    const { g } = makeGame(2);
    G.startAuction(g, 0);
    const p = g.players[0];
    const charId = g.auction!.lot!.charId;
    A.placeBid(g, p.id, 700, 1);
    A.tick(g, 1_000_000);
    expect(g.auction!.lot!.status).toBe('sold');
    expect(p.coins).toBe(STARTING_COINS - 700);
    expect(p.roster).toEqual([charId]);
    expect(A.settleLot(g, 1_000_001).ok).toBe(false);
    expect(g.auction!.transactions).toHaveLength(1);
    expect(p.coins).toBe(STARTING_COINS - 700);
  });

  it('closes early when every rival passes', () => {
    const { g } = makeGame(3);
    G.startAuction(g, 0);
    const [a, b, c] = g.players;
    A.placeBid(g, a.id, 100, 1);
    A.passLot(g, b.id, 2);
    expect(g.auction!.lot!.status).toBe('open');
    A.passLot(g, c.id, 3);
    expect(g.auction!.lot!.status).toBe('sold');
  });

  it('anti-sniping extends the live timer', () => {
    const { g } = makeGame(2);
    G.startAuction(g, 0);
    const deadline = g.auction!.lot!.deadline;
    A.placeBid(g, g.players[0].id, 100, deadline - 500);
    expect(g.auction!.lot!.deadline).toBe(deadline - 500 + g.config.auction.antiSnipeSeconds * 1000);
  });

  it('turn mode enforces the active bidder and auto-passes on timeout', () => {
    const { g } = makeGame(3, 3, 'turns');
    G.startAuction(g, 0);
    const lot = g.auction!.lot!;
    const active = lot.activePlayerId!;
    const other = g.players.find((p) => p.id !== active)!;
    expect(A.placeBid(g, other.id, 100, 1).ok).toBe(false);
    A.tick(g, lot.deadline + 1);
    expect(g.auction!.lot!.passed).toContain(active);
  });

  it('enforces roster limits and completes legal rosters for every size', () => {
    for (const size of [3, 4] as const) for (const n of [2, 3, 4, 5, 6]) for (const mode of ['live', 'turns'] as const) {
      const { g } = makeGame(n, size, mode, 99 + n);
      runAuction(g);
      for (const p of g.players) {
        expect(p.roster).toHaveLength(size);
        expect(p.coins).toBeGreaterThanOrEqual(0);
      }
      const owned = g.players.flatMap((p) => p.roster);
      expect(new Set(owned).size).toBe(owned.length);
    }
  });

  it('assigns at opening price when nobody bids and lots are scarce', () => {
    const { g } = makeGame(2, 3);
    g.pool = g.pool.slice(0, 6); // exactly the requirement
    let t = 0;
    G.startAuction(g, t);
    while (g.phase === 'auction') {
      t += 60_000;
      A.tick(g, t);
      G.advanceLot(g, t + 1);
    }
    for (const p of g.players) {
      expect(p.roster).toHaveLength(3);
      expect(p.coins).toBe(STARTING_COINS - 300);
    }
    expect(g.auction!.transactions.every((x) => x.kind === 'assignment')).toBe(true);
  });

  it('requeues unsold lots once when there is surplus', () => {
    const { g } = makeGame(2, 3);
    G.startAuction(g, 0);
    const first = g.auction!.lot!.charId;
    A.tick(g, 1e9);
    expect(g.auction!.lot!.status).toBe('unsold');
    expect(g.auction!.queue).toContain(first);
  });

  it('player-specific economy summary is consistent', () => {
    const { g } = makeGame(2);
    runAuction(g);
    for (const p of g.players) {
      const e = A.economy(g, p);
      expect(e.spent + e.remaining).toBe(STARTING_COINS);
      expect(e.acquired).toBe(3);
      expect(e.slots).toBe(0);
    }
  });

  it('NPC bidders obey budget and roster rules', () => {
    const { g } = makeGame(4, 3, 'live', 7, ['human', 'npc', 'npc', 'npc']);
    let t = 0;
    G.startAuction(g, t);
    for (let i = 0; i < 2000 && g.phase === 'auction'; i++) {
      t += 700;
      for (const p of g.players) if (p.kind === 'npc') G.npcAct(g, p.id, t);
      A.tick(g, t);
      if (g.auction!.lot && g.auction!.lot.status !== 'open') G.advanceLot(g, t);
    }
    expect(g.phase).toBe('reveal');
    for (const p of g.players) {
      expect(p.roster).toHaveLength(3);
      expect(p.coins).toBeGreaterThanOrEqual(0);
      const spent = g.auction!.transactions.filter((x) => x.playerId === p.id).reduce((s, x) => s + x.price, 0);
      expect(spent + p.coins).toBe(STARTING_COINS);
    }
  });
});
