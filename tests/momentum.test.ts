import { describe, expect, it } from 'vitest';
import * as G from '../src/engine/game';
import { applyMove, isPlayerMove } from '../src/engine/actions';
import { canBet, isBargainWin, npcBets, placeBet, settleMatch } from '../src/engine/momentum';
import type { BattleInput, GameState, Match } from '../src/engine/types';
import { makeGame, runAuction, runTournament } from './helpers';

const players = (...ids: string[]) => ids.map((id) => ({ id, name: id, kind: 'human', warChest: 0 }));
const match = { id: 'm1', players: ['a', 'b'] } as unknown as Match;
const game = (extra: Partial<GameState> = {}) => ({ phase: 'prep', secret: 5, players: players('a', 'b', 'c', 'd'), bets: {}, ...extra }) as unknown as GameState;
const input = (a: number, b: number) => ({ sides: [{ playerId: 'a', fighters: [{ price: a }] }, { playerId: 'b', fighters: [{ price: b }] }] }) as unknown as BattleInput;
const chest = (g: GameState, id: string) => g.players.find((p) => p.id === id)!.warChest ?? 0;

describe('Bargain Bounty', () => {
  it('needs a clear price gap', () => {
    expect(isBargainWin(900, 1000)).toBe(true);
    expect(isBargainWin(901, 1000)).toBe(false);
    expect(isBargainWin(1200, 1000)).toBe(false);
    expect(isBargainWin(0, 0)).toBe(false);
  });

  it('pays the cheaper winner only', () => {
    const g = game();
    expect(settleMatch(g, input(500, 2000), 'a').join()).toContain('Bargain Bounty');
    expect(chest(g, 'a')).toBe(1);
    const h = game();
    expect(settleMatch(h, input(2000, 500), 'a').join()).not.toContain('Bargain Bounty');
    expect(chest(h, 'a')).toBe(0);
  });
});

describe('Comeback', () => {
  it('marks the loser and clears the winner', () => {
    const g = game();
    g.players[0].comeback = true;
    settleMatch(g, input(1000, 1000), 'a');
    expect(g.players[0].comeback).toBe(false);
    expect(g.players[1].comeback).toBe(true);
  });
});

describe('Fight Bets', () => {
  it('lets only players sitting out bet, and only on the two fighting', () => {
    const g = game();
    expect(canBet(g, match, 'a')).toBe(false);
    expect(placeBet(g, match, 'a', 'b').ok).toBe(false);
    expect(placeBet(g, match, 'c', 'd').ok).toBe(false);
    expect(placeBet(g, match, 'c', 'a').ok).toBe(true);
    expect(g.bets).toEqual({ c: 'a' });
  });

  it('closes when the fight starts', () => {
    expect(placeBet(game({ phase: 'battle' }), match, 'c', 'a').ok).toBe(false);
  });

  it('pays a right call, not a wrong one, and clears the book', () => {
    const g = game({ bets: { c: 'a', d: 'b' } });
    settleMatch(g, input(1000, 1000), 'a');
    expect(chest(g, 'c')).toBe(1);
    expect(chest(g, 'd')).toBe(0);
    expect(g.bets).toEqual({});
  });

  it('has NPCs sitting out take a repeatable side', () => {
    const make = () => { const g = game(); g.players[2].kind = 'npc'; npcBets(g, match); return g.bets; };
    expect(make()).toEqual(make());
    expect(match.players).toContain(make()!.c);
  });

  it('accepts bets as moves and rejects malformed ones', () => {
    expect(isPlayerMove({ t: 'bet', winnerId: 'a' })).toBe(true);
    expect(isPlayerMove({ t: 'bet', winnerId: 3 })).toBe(false);
    expect(isPlayerMove({ t: 'autoPrep' })).toBe(true);
  });
});

describe('over a whole game', () => {
  it('starts a loser\'s next match with a bonus point', () => {
    const { g, vault } = makeGame(2, 3, 'live', 77, ['human', 'human']);
    runAuction(g);
    for (const p of g.players) p.warChest = 0;
    G.startTournament(g);
    g.players[0].comeback = true;
    expect(G.startMatch(g, vault).ok).toBe(true);
    expect(g.players[0].prepPoints).toBe(G.PREP_POINTS_PER_MATCH + 1);
    expect(g.players[1].prepPoints).toBe(G.PREP_POINTS_PER_MATCH);
    expect(g.players[0].comeback).toBe(false);
  });

  it('auto-prepare spends every point and locks nothing', () => {
    const { g, vault } = makeGame(2, 3, 'live', 78, ['human', 'human']);
    runAuction(g);
    G.startTournament(g);
    G.startMatch(g, vault);
    const id = G.currentMatch(g)!.players[0];
    const p = g.players.find((x) => x.id === id)!;
    expect(applyMove(g, vault, id, { t: 'autoPrep' }, 0).ok).toBe(true);
    expect(p.prepPoints).toBe(0);
    expect(g.prep[id].locked).toBe(false);
    expect(g.prep[id].fighters.length).toBeGreaterThan(0);
  });

  it('runs to a champion with sane payouts', () => {
    for (const seed of [11, 12, 13]) {
      const { g, vault } = makeGame(4, 3, 'live', seed);
      runAuction(g);
      runTournament(g, vault, seed);
      expect(g.tournament?.championId).toBeTruthy();
      for (const p of g.players) expect(p.warChest ?? 0).toBeGreaterThanOrEqual(0);
    }
  });
});
