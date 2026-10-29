import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as G from '../src/engine/game';
import * as A from '../src/engine/auction';
import { Persistence } from '../src/store/persistence';
import { validateGameState } from '../src/engine/validation';
import { buildHallEntries } from '../src/engine/hall';
import { makeGame, runAuction, runTournament } from './helpers';

describe('full game flow', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    it(`plays a complete game with ${n} players`, () => {
      const { g, vault } = makeGame(n, n % 2 ? 3 : 4, n % 2 ? 'turns' : 'live', 50 + n);
      runAuction(g);
      expect(g.phase).toBe('reveal');
      const records = runTournament(g, vault, n * 100);
      expect(g.phase).toBe('champion');
      expect(g.tournament!.championId).toBeTruthy();
      expect(validateGameState(g)).toEqual([]);
      for (const r of records) {
        const m = g.tournament!.stages.flatMap((s) => s.matches).find((x) => x.id === r.matchId)!;
        expect(m.winner).toBe(r.input.sides[r.result.winnerSide].playerId);
      }
      const hall = buildHallEntries(g, records);
      expect(hall.some((h) => h.category === 'champion')).toBe(true);
      // Comebacks only count fighters who survived, so a knocked-out teammate never reads as "0% HP"
      for (const h of hall.filter((x) => x.category === 'comeback')) expect(h.detail).not.toMatch(/ 0% HP/);
    });
  }

  it('a tag-team round needs two fighters, and a pick can be undone before locking in', () => {
    const { g, vault } = makeGame(2, 3, 'live', 3);
    runAuction(g);
    G.startTournament(g);
    // Play the solo rounds, then prepare for the tag round.
    for (let i = 0; i < 6; i++) {
      G.startMatch(g, vault);
      if (G.currentMatch(g)!.mode === 'tag') break;
      for (const pid of G.currentMatch(g)!.players) if (!g.prep[pid].locked) G.lockPrep(g, pid);
      G.completeBattle(g, G.runMatchBattle(g, vault, 5 + i));
      G.continueAfterResults(g);
    }
    const m = G.currentMatch(g)!;
    expect(m.mode).toBe('tag');
    const a = m.players[0];
    const pa = g.players.find((p) => p.id === a)!;
    expect(G.setPrep(g, a, { fighters: [pa.roster[0]] }).ok).toBe(true); // one picked so far
    expect(G.lockPrep(g, a).ok).toBe(false); // but locking in needs two
    expect(G.setPrep(g, a, { fighters: [pa.roster[0], pa.roster[1]] }).ok).toBe(true);
    expect(G.setPrep(g, a, { fighters: pa.roster.slice(0, 3) }).ok).toBe(false); // never more than two
    expect(G.lockPrep(g, a).ok).toBe(true);
  });

  it('battle preparation changes the battle input', () => {
    const { g, vault } = makeGame(2, 3, 'live', 3);
    runAuction(g);
    G.startTournament(g);
    G.startMatch(g, vault);
    const [a, b] = G.currentMatch(g)!.players;
    G.lockPrep(g, b);
    const pa = g.players.find((p) => p.id === a)!;
    const choice = pa.roster[2];
    expect(G.setPrep(g, a, { fighters: [choice], strategy: 'highrisk', mental: 'taunt' }).ok).toBe(true);
    const before = structuredClone(g.conditions[choice].training);
    expect(G.prepAction(g, a, { kind: 'train', charId: choice, stat: 'attack' }).ok).toBe(true);
    expect(g.conditions[choice].training.attack).toBe((before.attack ?? 0) + 3);
    const opp = g.players.find((p) => p.id === b)!;
    expect(G.prepAction(g, a, { kind: 'scout', charId: opp.roster[0] }).ok).toBe(true);
    expect(G.canSeeHidden(g, a, opp.roster[0])).toBe(true);
    expect(G.canSeeHidden(g, a, opp.roster[1])).toBe(false);
    expect(G.prepAction(g, a, { kind: 'recover', charId: choice }).ok).toBe(false); // no points left or no fatigue
    expect(G.setPrep(g, a, { fighters: [opp.roster[0]] }).ok).toBe(false); // can't field opponent's
    G.lockPrep(g, a);
    expect(G.setPrep(g, a, { strategy: 'defensive' }).ok).toBe(false);
    const rec = G.runMatchBattle(g, vault, 5);
    const side = rec.input.sides.find((s) => s.playerId === a)!;
    expect(side.strategy).toBe('highrisk');
    expect(side.mental).toBe('taunt');
    expect(side.fighters[0].charId).toBe(choice);
    expect(side.fighters[0].stats.attack).toBe(vault.get(choice).stats.attack + 3);
  });

  it('exact replay reproduces the result; rematch uses a new seed', () => {
    const { g, vault } = makeGame(2, 3, 'live', 4);
    runAuction(g);
    const records = runTournament(g, vault, 7);
    const rec = records[0];
    const { identical, record } = G.exactReplay(rec);
    expect(identical).toBe(true);
    expect(record.result.events).toEqual(rec.result.events);
    const rm = G.freshRematch(g, rec, 123456);
    expect(rm.input.seed).not.toBe(rec.input.seed);
    expect(rm.kind).toBe('rematch');
    expect(rm.postEffects).toEqual([]);
  });

  it('completing a battle twice is refused', () => {
    const { g, vault } = makeGame(2, 3, 'live', 8);
    runAuction(g);
    G.startTournament(g);
    G.startMatch(g, vault);
    for (const pid of G.currentMatch(g)!.players) G.lockPrep(g, pid);
    const rec = G.runMatchBattle(g, vault, 1);
    expect(G.completeBattle(g, rec).ok).toBe(true);
    expect(G.completeBattle(g, rec).ok).toBe(false);
  });

  it('save, reload and resume through IndexedDB, including mid-auction', async () => {
    const db = new Persistence(indexedDB);
    const { g, vault } = makeGame(3, 3, 'live', 11);
    G.startAuction(g, 0);
    G.useScoutToken(g, vault, g.players[0].id);
    await db.saveGame(g, vault);
    const loaded = await db.loadGame(g.id);
    expect(loaded.game).toEqual(g);
    expect(loaded.game.auction!.lot!.charId).toBe(g.auction!.lot!.charId);
    expect(loaded.vault.get(g.pool[0])).toEqual(vault.get(g.pool[0]));
    // continue auction with loaded state
    runAuctionFromLoaded(loaded.game);
    expect(loaded.game.phase).toBe('reveal');
    const records = runTournament(loaded.game, loaded.vault, 1);
    for (const r of records) await db.saveBattle(loaded.game.id, r);
    await db.saveGame(loaded.game, loaded.vault);
    const again = await db.loadGame(g.id);
    expect(again.battles).toHaveLength(records.length);
    expect(again.game.tournament!.championId).toBe(loaded.game.tournament!.championId);
    // export/import round trip
    const json = await db.exportGame(g.id);
    await db.deleteGame(g.id);
    expect((await db.listSaves()).find((s) => s.id === g.id)).toBeUndefined();
    const imported = await db.importGame(json);
    expect(imported.id).toBe(g.id);
  });

  it('rejects tampered or invalid saves', async () => {
    const db = new Persistence(indexedDB);
    const { g, vault } = makeGame(2, 3, 'live', 12);
    runAuction(g);
    const tampered = structuredClone(g);
    tampered.players[0].coins = 10000;
    expect(validateGameState(tampered).length).toBeGreaterThan(0);
    const json = JSON.stringify({ format: 'anime-auction-save', game: tampered, vault: vault.encode(), battles: [] });
    await expect(db.importGame(json)).rejects.toThrow(/rejected/);
    await expect(db.importGame('not json')).rejects.toThrow();
    await expect(db.importGame('{"format":"other"}')).rejects.toThrow();
  });
});

function runAuctionFromLoaded(g: Parameters<typeof runAuction>[0]) {
  // Auction is already started: drive the remaining lots like runAuction does.
  const startPhase = g.phase;
  if (startPhase !== 'auction') return;
  let t = 10_000;
  for (let i = 0; i < 1000 && g.phase === 'auction'; i++) {
    const lot = g.auction!.lot!;
    if (lot.status === 'open') {
      const buyer = g.players.find((p) => A.canBid(g, p));
      if (buyer) A.placeBid(g, buyer.id, A.minNextBid(lot, g.auction!.config), t);
      t += 60_000;
      A.tick(g, t);
    }
    G.advanceLot(g, t + 1);
  }
}
