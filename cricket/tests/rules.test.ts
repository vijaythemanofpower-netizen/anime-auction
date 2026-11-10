import { describe, expect, it } from 'vitest';
import { PLAYERS } from '../src/engine/data/players';
import { applyRetention, createGame, ctxOf, finishRetention, retentionCost, retentionProblem, retainable, type GameState } from '../src/engine/game';
import { closeIfDue, finishAuction, rtmAnswer, rtmRaise, type AuctionState } from '../src/engine/auction';
import { PURSE, RULES, nextBid, toSlab } from '../src/engine/squad';
import { simulateAuction } from '../src/store/store';
import type { Cricketer } from '../src/engine/types';

const P: Record<string, Cricketer> = Object.fromEntries(PLAYERS.map((p) => [p.id, p]));
const iplGame = (seed: number, humans = 1, npcs = 3): GameState =>
  createGame({ humans: Array.from({ length: humans }, (_, i) => ({ id: `h${i}`, name: `P${i}`, color: '#fff' })), teamMode: 'solo', npcs, mode: 'ipl', timer: 10, mystery: false, realNames: false, seed }, PLAYERS, 0);

describe('IPL rules', () => {
  it('uses the mega-auction purse, squad size, overseas cap and base-price slabs', () => {
    expect(PURSE.ipl).toBe(12000);
    expect(RULES.ipl).toMatchObject({ size: 25, minSize: 18, maxOverseas: 8, maxOverseasXI: 4 });
    expect([20, 40, 60, 90, 110, 140, 180].map(toSlab)).toEqual([30, 30, 50, 100, 100, 150, 200]);
    expect([0, 95, 100, 190, 200, 480, 500].map((b) => nextBid(b, 30))).toEqual([30, 100, 110, 200, 220, 500, 525]);
  });

  it('starts with retentions; costs follow the official slabs; limits hold', () => {
    const g = iplGame(11);
    expect(g.phase).toBe('retain');
    const me = g.franchises.find((f) => !f.npc)!;
    const mine = retainable(me, PLAYERS);
    const capped = mine.filter((c) => !c.uncapped).slice(0, 5).map((c) => c.id);
    expect(retentionCost(capped, P)).toEqual([1800, 1400, 1100, 1800, 1400]);
    const unc = mine.filter((c) => c.uncapped).map((c) => c.id);
    if (unc.length >= 3) expect(retentionProblem(me, unc.slice(0, 3), PLAYERS)).toMatch(/uncapped/);
    expect(retentionProblem(me, [PLAYERS.find((c) => c.prev !== me.prev)!.id], PLAYERS)).toMatch(/own/);
    const after = finishRetention(applyRetention(g, PLAYERS, me.id, capped.slice(0, 2)));
    const f = after.franchises.find((x) => x.id === me.id)!;
    expect(f.purse).toBe(12000 - 1800 - 1400);
    expect(f.rtm).toEqual({ cards: 4, capped: 3, uncapped: 2 });
    expect(after.phase).toBe('auction');
    // Retained players never come up in the auction.
    expect(after.auction.queue.some((l) => capped.slice(0, 2).includes(l.id))).toBe(false);
  });

  it('Right to Match: final raise, then the old team matches (or declines)', () => {
    const g = finishRetention(applyRetention(iplGame(12), PLAYERS, 'f0', []));
    const holder = g.franchises.find((f) => f.id !== 'f0' && f.prev !== undefined)!;
    const bidder = g.franchises.find((f) => f.id !== holder.id)!;
    const player = PLAYERS.find((c) => c.prev === holder.prev && !c.uncapped && !holder.squad.includes(c.id))!;
    const ctx = { ...ctxOf(g, P), franchises: g.franchises.map((f) => ({ ...f, npc: false })) };
    const live: AuctionState = { ...g.auction, live: { lot: { id: player.id, set: 'Batters', base: 100 }, bid: 300, bidder: bidder.id, endsAt: 0, history: [], startedAt: 0 } };
    let a = closeIfDue(ctx, live, 1).a;
    expect(a.live?.rtm).toMatchObject({ fid: holder.id, stage: 'ask' });
    a = rtmAnswer(ctx, a, holder.id, true, 2);
    a = rtmRaise(ctx, a, bidder.id, 400, 3);
    expect(a.live?.bid).toBe(400);
    const matched = closeIfDue(ctx, rtmAnswer(ctx, a, holder.id, true, 4), 5);
    const h = matched.franchises.find((f) => f.id === holder.id)!;
    expect(h.squad).toContain(player.id);
    expect(h.paid[player.id]).toBe(400);
    expect(h.rtm!.cards).toBe(holder.rtm!.cards - 1);
    const declined = closeIfDue(ctx, rtmAnswer(ctx, a, holder.id, false, 4), 5);
    expect(declined.franchises.find((f) => f.id === bidder.id)!.squad).toContain(player.id);
  });

  it('a full IPL auction ends with legal 18-25 squads and at most 8 overseas', () => {
    for (const seed of [21, 22]) {
      let g = iplGame(seed, 1, 5);
      for (const f of g.franchises) if (!g.retainDone?.includes(f.id)) g = applyRetention(g, PLAYERS, f.id, []);
      g = finishRetention(g);
      const r = simulateAuction(g, 0);
      expect(r.a.done).toBe(true);
      const fs = finishAuction(ctxOf({ ...g, franchises: r.franchises }, P), r.a, g.poolIds);
      for (const f of fs) {
        expect(f.squad.length).toBeGreaterThanOrEqual(18);
        expect(f.squad.length).toBeLessThanOrEqual(25);
        expect(f.squad.filter((id) => P[id].overseas).length).toBeLessThanOrEqual(8);
        expect(f.purse).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
