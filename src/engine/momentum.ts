// What happens around a match, so every player has something at stake in every fight.
// Bargain Bounty: beat a team that cost clearly more and earn a War Chest point.
// Comeback: lose a match and your next one starts with an extra preparation point.
// Fight Bets: players sitting a match out pick a winner; a right call earns a War Chest point.
import { Rng, deriveSeed } from './rng';
import type { BattleInput, GameState, Match } from './types';

/** The winner's team must have cost at least this much less than the loser's. */
export const BOUNTY_MARGIN = 0.9;

export const teamCost = (side: BattleInput['sides'][number]) => side.fighters.reduce((s, f) => s + f.price, 0);

export function isBargainWin(winnerCost: number, loserCost: number): boolean {
  return loserCost > 0 && winnerCost <= loserCost * BOUNTY_MARGIN;
}

/** Everyone not fighting in this match may bet. */
export const canBet = (g: GameState, m: Match, playerId: string) => !m.players.includes(playerId) && g.players.some((p) => p.id === playerId);

export function placeBet(g: GameState, m: Match | null | undefined, playerId: string, winnerId: string): { ok: true } | { ok: false; error: string } {
  if (g.phase !== 'prep' || !m) return { ok: false, error: 'Bets are closed.' };
  if (!canBet(g, m, playerId)) return { ok: false, error: 'Fighters in this match cannot bet on it.' };
  if (!m.players.includes(winnerId)) return { ok: false, error: 'Pick one of the two players in this match.' };
  (g.bets ??= {})[playerId] = winnerId;
  return { ok: true };
}

/** NPCs sitting out take a side, so a human always has someone to bet against. */
export function npcBets(g: GameState, m: Match) {
  for (const p of g.players) {
    if (p.kind !== 'npc' || !canBet(g, m, p.id)) continue;
    (g.bets ??= {})[p.id] = new Rng(deriveSeed('npcbet', g.secret, m.id, p.id)).pick(m.players);
  }
}

/** Pays out a finished match and returns the lines to show on the results screen. */
export function settleMatch(g: GameState, input: BattleInput, winnerId: string): string[] {
  const news: string[] = [];
  const name = (id: string) => g.players.find((p) => p.id === id)?.name ?? id;
  const player = (id: string) => g.players.find((p) => p.id === id)!;
  const win = input.sides.find((s) => s.playerId === winnerId)!, lose = input.sides.find((s) => s.playerId !== winnerId)!;
  const winCost = teamCost(win), loseCost = teamCost(lose);
  if (isBargainWin(winCost, loseCost)) {
    const w = player(winnerId);
    w.warChest = (w.warChest ?? 0) + 1;
    w.bounties = (w.bounties ?? 0) + 1;
    news.push(`Bargain Bounty: ${w.name}'s ${winCost.toLocaleString()}-coin team beat a ${loseCost.toLocaleString()}-coin team. +1 War Chest point.`);
  }
  player(winnerId).comeback = false;
  player(lose.playerId).comeback = true;
  news.push(`Comeback: ${name(lose.playerId)} gets a bonus preparation point next match.`);
  for (const [pid, pick] of Object.entries(g.bets ?? {})) {
    const p = g.players.find((x) => x.id === pid);
    if (!p) continue;
    if (pick === winnerId) p.warChest = (p.warChest ?? 0) + 1;
    if (pick === winnerId) p.betsWon = (p.betsWon ?? 0) + 1;
    else p.betsLost = (p.betsLost ?? 0) + 1;
    news.push(pick === winnerId ? `Fight Bet: ${p.name} called it. +1 War Chest point.` : `Fight Bet: ${p.name} backed ${name(pick)} and lost the bet.`);
  }
  g.bets = {};
  return news;
}
