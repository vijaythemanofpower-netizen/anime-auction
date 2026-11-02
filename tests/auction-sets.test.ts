import { describe, expect, it } from 'vitest';
import * as G from '../src/engine/game';
import * as A from '../src/engine/auction';
import { truePower } from '../src/engine/hidden';
import { healerKind, roleOf } from '../src/engine/data/roles';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import type { GameState, Lot } from '../src/engine/types';
import { makeGame } from './helpers';

/** Runs an auction where `decide` picks a buyer for each open lot (or nobody), recording every lot opened. */
function drive(g: GameState, vault: Parameters<typeof G.startAuction>[2], decide: (lot: Lot) => string | null) {
  let t = 1000;
  const r = G.startAuction(g, t, vault);
  if (!r.ok) throw new Error(r.error);
  const lots: Lot[] = [];
  for (let guard = 0; g.phase === 'auction' && guard < 2000; guard++) {
    const lot = g.auction!.lot!;
    if (lot.status === 'open') {
      lots.push(structuredClone(lot));
      const buyer = decide(lot);
      if (buyer) A.placeBid(g, buyer, A.minNextBid(lot, g.auction!.config), t);
      t += 60_000;
      A.tick(g, t);
    }
    t += 100;
    G.advanceLot(g, t);
  }
  expect(g.phase).toBe('reveal');
  for (const p of g.players) expect(p.roster.length).toBe(g.config.rosterSize);
  return lots;
}

const rotating = (g: GameState) => (lot: Lot) => {
  const eligible = g.players.filter((p) => A.canBid(g, p));
  return eligible[lot.lotNumber % Math.max(1, eligible.length)]?.id ?? null;
};

describe('auction sets', () => {
  it('present the pool set by set, in order, each lot numbered within its set', () => {
    const { g, vault } = makeGame(4, 3, 'live', 4242);
    const lots = drive(g, vault, rotating(g));
    expect(g.auction!.setOrder!.length).toBeGreaterThan(1);
    const firsts = lots.filter((l) => l.set && !l.set.second && !l.set.open);
    // Set indexes never go backwards for first-time lots.
    for (let i = 1; i < firsts.length; i++) expect(firsts[i].set!.index).toBeGreaterThanOrEqual(firsts[i - 1].set!.index);
    for (const l of firsts) {
      expect(l.set!.role).toBe(roleOf(g.characters[l.charId]));
      expect(l.set!.pos).toBeGreaterThanOrEqual(1);
      expect(l.set!.pos).toBeLessThanOrEqual(l.set!.size);
    }
    expect(g.auction!.log.some((x) => /^SET 1 of/.test(x.text))).toBe(true);
  });

  it('keep every set short (only part of the pool), with the rest in an open round at the end', async () => {
    const { g, vault } = makeGame(3, 3, 'live', 31337);
    // A big pool: more of every role than the sets can hold.
    G.autoFillPool(g, vault, (await import('../src/engine/data/originals')).ORIGINAL_CHARACTERS, 40);
    G.startAuction(g, 0, vault);
    const a = g.auction!;
    const cap = Math.max(3, g.players.length + 1);
    for (const r of a.setOrder!) expect(a.setSize![r]).toBeLessThanOrEqual(cap);
    const inSets = a.setOrder!.reduce((n, r) => n + a.setSize![r], 0);
    expect(inSets).toBeLessThan(g.pool.length);
    expect(a.setSize!.open).toBeGreaterThan(0);
    // Open-round lots come after every set lot in the queue.
    const firstOpen = a.queue.findIndex((id) => a.setOf![id] === 'open');
    expect(a.queue.slice(firstOpen).every((id) => a.setOf![id] === 'open')).toBe(true);
  });

  it('put healers in their own set and tell medics from revivers', () => {
    const c = (k: string) => LEGEND_CHARACTERS.find((x) => x.id === `legend:${k}`)!;
    expect(roleOf(c('shinobu'))).toBe('healer');
    expect(healerKind(c('shinobu'))).toBe('medic');
    expect(healerKind(c('rimuru'))).toBe('reviver');
    // Regenerating only yourself does not make you a team healer.
    expect(healerKind(c('akaza'))).toBeNull();
    expect(roleOf(c('kenpachi'))).toBe('berserker');
    expect(healerKind({ name: 'Orihime Inoue', archetype: 'Support' })).toBe('reviver');
    expect(healerKind({ name: 'Tony Tony Chopper', archetype: 'Tank' })).toBe('medic');
  });
});

describe('mystery lot', () => {
  it('goes up near the end, hidden, at a higher opening bid, and is really elite or a dud', () => {
    let seen = 0;
    for (const seed of [11, 22, 33, 44, 55, 66]) {
      const { g, vault } = makeGame(4, 3, 'live', seed);
      const lots = drive(g, vault, rotating(g));
      const m = g.auction!.mystery!;
      expect(m).toBeTruthy();
      const lot = lots.find((l) => l.mystery);
      if (!lot) continue;
      seen++;
      expect(lot.charId).toBe(m.charId);
      expect(lot.opening).toBe(g.config.auction.openingBid * A.MYSTERY_OPENING);
      expect(lot.set).toBeUndefined();
      // It comes in the last round: about one open seat per player, or fewer.
      const idx = lots.indexOf(lot);
      expect(lots.length - idx).toBeLessThanOrEqual(g.players.length + 4);
      // Elite means top fifth by hidden power, dud bottom fifth.
      const ranked = g.pool.slice().sort((x, y) => truePower(vault.get(y).stats) - truePower(vault.get(x).stats) || x.localeCompare(y));
      const band = Math.max(1, Math.round(ranked.length / 5));
      expect(m.tier === 'elite' ? ranked.slice(0, band) : ranked.slice(-band)).toContain(m.charId);
      expect(g.auction!.log.some((x) => /MYSTERY REVEALED|Nobody took the gamble|mystery lot is cancelled/.test(x.text))).toBe(true);
    }
    expect(seen).toBeGreaterThan(3);
  });

  it('cannot be scouted, gives no hints, and shuts out players without money and a free seat', () => {
    const { g, vault } = makeGame(4, 3, 'live', 77);
    let checked = false;
    drive(g, vault, (lot) => {
      if (lot.mystery && !checked) {
        checked = true;
        const name = g.characters[lot.charId].name;
        const advice = G.scoutFor(g, g.players[0].id)!;
        expect(advice.confidence).toBe('Low');
        expect(advice.reasons.join(' ')).not.toContain(name);
        g.players[0].scoutTokens = 2;
        expect(G.useScoutToken(g, vault, g.players[0].id).ok).toBe(false);
        for (const p of g.players) {
          const able = A.maxBidFor(p, g.config.rosterSize, g.config.auction.openingBid) >= lot.opening!;
          expect(A.canBid(g, p)).toBe(able);
        }
      }
      return rotating(g)(lot);
    });
    expect(checked).toBe(true);
  });

  it('returns as an ordinary lot when nobody gambles, and the auction still completes', () => {
    const { g, vault } = makeGame(4, 3, 'live', 909);
    const lots = drive(g, vault, (lot) => (lot.mystery ? null : rotating(g)(lot)));
    const m = g.auction!.mystery!;
    if (lots.some((l) => l.mystery)) {
      expect(g.auction!.log.some((x) => x.text.startsWith('Nobody took the gamble'))).toBe(true);
      // Revealed and back among the regular lots (offered again, or still waiting when the rosters filled).
      expect(lots.some((l) => !l.mystery && l.charId === m.charId) || g.auction!.queue.includes(m.charId)).toBe(true);
    }
  });

  it('works in turn-based auctions and with older saves that have no sets', () => {
    const { g, vault } = makeGame(3, 3, 'turns', 515);
    G.startAuction(g, 0, vault);
    expect(g.auction!.setOrder?.length).toBeGreaterThan(0);
    const old = makeGame(3, 3, 'live', 516);
    old.g.config.auction = { ...old.g.config.auction, sets: undefined, mystery: undefined };
    G.startAuction(old.g, 0, old.vault);
    expect(old.g.auction!.setOf).toBeUndefined();
    expect(old.g.auction!.mystery).toBeUndefined();
    expect(old.g.auction!.lot?.set).toBeUndefined();
  });
});
