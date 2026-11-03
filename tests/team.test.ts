import { describe, expect, it } from 'vitest';
import { runTeamBattle, setTeam, setTeamPick, teamFighters, teamSlots } from '../src/engine/teambattle';
import { makeGame, runAuction } from './helpers';
import type { GameState } from '../src/engine/types';
import type { Vault } from '../src/engine/hidden';

describe('team battles', () => {
  it('pits Team A against Team B with each player\'s picks, crowns an MVP, and leaves the tournament alone', () => {
    const { g, vault } = makeGame(4, 3, 'live', 808) as never as { g: GameState; vault: Vault };
    runAuction(g);
    const before = JSON.stringify({ c: g.conditions, t: g.tournament, coins: g.players.map((p) => p.coins) });
    // Default teams alternate seats: p1+p3 vs p2+p4, one fighter each (2v2).
    expect(teamSlots(g, 'p1')).toBe(1);
    const pick = g.players[0].roster[2];
    expect(setTeamPick(g, 'p1', [pick]).ok).toBe(true);
    expect(setTeamPick(g, 'p1', g.players[0].roster.slice(0, 2)).ok).toBe(false);
    expect(teamFighters(g, vault, 'A')).toContain(pick);
    let aWins = 0;
    for (let k = 0; k < 8; k++) {
      const { record, result } = runTeamBattle(g, vault, 40 + k);
      expect(record.kind).toBe('team');
      expect(record.input.sides[0].fighters).toHaveLength(2);
      expect(record.input.sides[1].fighters).toHaveLength(2);
      expect(result.mvp).toBe(result.contributions[0].charId);
      if (result.winner === 'A') aWins++;
    }
    expect(g.teamBattles?.length).toBe(8);
    expect(JSON.stringify({ c: g.conditions, t: g.tournament, coins: g.players.map((p) => p.coins) })).toBe(before);
    expect(aWins).toBeGreaterThanOrEqual(0);
  });

  it('lets a smaller team send more fighters each', () => {
    const { g, vault } = makeGame(3, 3, 'live', 909) as never as { g: GameState; vault: Vault };
    runAuction(g);
    setTeam(g, 'p1', 'A'); setTeam(g, 'p2', 'B'); setTeam(g, 'p3', 'B');
    expect(teamSlots(g, 'p1')).toBe(2);
    expect(teamSlots(g, 'p2')).toBe(1);
    const pick = g.players[0].roster.slice(0, 2);
    setTeamPick(g, 'p1', pick, [pick[1]]);
    const { record } = runTeamBattle(g, vault, 5);
    expect(record.input.sides[0].fighters).toHaveLength(2);
    expect(record.input.sides[1].fighters).toHaveLength(2);
    expect(record.input.sides[0].fighters.find((f) => f.charId === pick[0])?.position).toBe('back');
    expect(record.input.sides[0].fighters.find((f) => f.charId === pick[1])?.position).toBe('front');
  });

  it('runs a full 3v3 team battle', () => {
    const { g, vault } = makeGame(6, 3, 'live', 1009) as never as { g: GameState; vault: Vault };
    runAuction(g);
    const { record } = runTeamBattle(g, vault, 33);
    expect(record.input.sides[0].fighters).toHaveLength(3);
    expect(record.input.sides[1].fighters).toHaveLength(3);
    expect(record.result.events.length).toBeGreaterThan(0);
  });
});
