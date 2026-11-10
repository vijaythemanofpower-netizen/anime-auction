import * as G from '../src/engine/game';
import * as A from '../src/engine/auction';
import { Vault } from '../src/engine/hidden';
import { ORIGINAL_CHARACTERS } from '../src/engine/data/originals';
import type { AuctionMode, GameState, PlayerKind } from '../src/engine/types';

export function setup(n: number, rosterSize: 3 | 4 = 3, mode: AuctionMode = 'live', kinds?: PlayerKind[]): G.GameSetup {
  return {
    name: 'Test Cup',
    players: Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, color: '#7c5cff', emblem: '◆', kind: kinds?.[i] ?? 'human' })),
    rosterSize,
    auction: { ...G.DEFAULT_AUCTION, mode },
    tournament: { ...G.DEFAULT_TOURNAMENT },
    privacyScreens: false,
  };
}

export function makeGame(n: number, rosterSize: 3 | 4 = 3, mode: AuctionMode = 'live', secret = 1234, kinds?: PlayerKind[]) {
  const g = G.newGame(setup(n, rosterSize, mode, kinds), secret);
  const vault = new Vault(g.secret);
  G.autoFillPool(g, vault, ORIGINAL_CHARACTERS);
  return { g, vault };
}

const minBid = (g: GameState) => A.minNextBid(g.auction!.lot!, g.auction!.config);

/** Drives an auction to completion, selling each lot to a rotating buyer. */
export function runAuction(g: GameState, start = 1000): number {
  let t = start;
  const r = G.startAuction(g, t);
  if (!r.ok) throw new Error(r.error);
  for (let guard = 0; g.phase === 'auction' && guard < 1000; guard++) {
    const lot = g.auction!.lot!;
    if (lot.status === 'open') {
      const eligible = g.players.filter((p) => A.canBid(g, p));
      const buyer = eligible[lot.lotNumber % Math.max(1, eligible.length)];
      if (g.auction!.config.mode === 'turns') {
        for (let k = 0; k < 30 && g.auction!.lot!.status === 'open'; k++) {
          const active = g.auction!.lot!.activePlayerId;
          if (!active) break;
          if (active === buyer?.id && !g.auction!.lot!.bids.length) A.placeBid(g, active, minBid(g), t);
          else A.passLot(g, active, t);
        }
      } else {
        if (buyer) A.placeBid(g, buyer.id, minBid(g), t);
        t += 60_000;
        A.tick(g, t);
      }
    }
    t += 100;
    G.advanceLot(g, t);
  }
  if (g.phase !== 'reveal') throw new Error(`Auction did not complete (phase ${g.phase})`);
  return t;
}

/** Plays the whole tournament with default preparation. */
export function runTournament(g: GameState, vault: Vault, seedBase = 1) {
  G.startTournament(g);
  const records = [];
  for (let guard = 0; g.phase !== 'champion' && guard < 50; guard++) {
    const s = G.startMatch(g, vault);
    if (!s.ok) throw new Error(s.error);
    const m = G.currentMatch(g)!;
    for (const pid of m.players) if (!g.prep[pid].locked) G.lockPrep(g, pid);
    const rec = G.runMatchBattle(g, vault, seedBase + guard);
    const c = G.completeBattle(g, rec);
    if (!c.ok) throw new Error(c.error);
    records.push(rec);
    G.continueAfterResults(g);
  }
  return records;
}
