// Adaptive tournament for 2–6 players.
// Format: Swiss-style group rounds (solo duels, then an optional tag-team
// round) followed by a squad-battle knockout of the top 2 (2–3 players) or
// top 4 (4–6 players). Odd player counts give one bye per round, never to the
// same player twice while anyone else is still owed one.
import type { BattleMode, Match, Stage, Standing, TournamentConfig, TournamentState } from './types';
import { Rng, deriveSeed } from './rng';

export const POINTS = { win: 3, loss: 0, bye: 2 };

export function knockoutSizeFor(n: number): number {
  return n <= 3 ? 2 : 4;
}

export function describeFormat(n: number, cfg: TournamentConfig): string {
  const ko = knockoutSizeFor(n);
  const rounds = cfg.soloRounds + (cfg.tagRound ? 1 : 0);
  const parts = [
    `${rounds} group round${rounds === 1 ? '' : 's'} (${cfg.soloRounds} solo duel round${cfg.soloRounds === 1 ? '' : 's'}${cfg.tagRound ? ' + 1 tag-team round' : ''}), Swiss pairing`,
    n % 2 === 1 ? 'one rotating bye per round (bye = 2 points)' : 'no byes',
    ko === 2 ? (n === 2 ? 'a squad-battle Grand Final' : `top 2 of ${n} advance to a squad-battle Grand Final`) : `top 4 of ${n} advance to squad-battle Semifinals and a Grand Final`,
  ];
  return parts.join('; ') + '. Win = 3 points.';
}

/** The rounds in play order and how many fighters each one needs, e.g. "Solo duel (pick 1) → Tag team (pick 2) → Grand Final (all 3)". */
export function matchOrder(n: number, cfg: TournamentConfig, rosterSize: number): string {
  const steps: string[] = [];
  for (let i = 0; i < cfg.soloRounds; i++) steps.push('Solo duel (pick 1)');
  if (cfg.tagRound) steps.push('Tag team (pick 2)');
  if (knockoutSizeFor(n) === 4) steps.push(`Semifinals (all ${rosterSize})`);
  steps.push(`Grand Final (all ${rosterSize})`);
  return steps.join(' → ');
}

export function createTournament(playerIds: string[], cfg: TournamentConfig, seed: number): TournamentState {
  if (playerIds.length < 2 || playerIds.length > 6) throw new Error('Tournament needs 2–6 players');
  if (new Set(playerIds).size !== playerIds.length) throw new Error('Duplicate player in tournament');
  const plan: TournamentState['plan'] = [];
  for (let i = 0; i < cfg.soloRounds; i++) plan.push({ name: `Solo Duels — Round ${i + 1}`, kind: 'group', mode: 'solo' });
  if (cfg.tagRound) plan.push({ name: 'Tag-Team Clash', kind: 'group', mode: 'tag' });
  const ko = knockoutSizeFor(playerIds.length);
  if (ko === 4) plan.push({ name: 'Semifinals', kind: 'knockout', mode: 'squad' });
  plan.push({ name: 'Grand Final', kind: 'knockout', mode: 'squad' });

  const standings: Record<string, Standing> = {};
  for (const id of playerIds) standings[id] = { playerId: id, points: 0, wins: 0, losses: 0, byes: 0, hpScore: 0 };
  const t: TournamentState = { config: cfg, stages: [], currentStage: 0, standings, championId: null, finalistIds: [], knockoutSize: ko, seed, plan };
  t.stages.push(buildStage(t, 0, playerIds));
  return t;
}

export function rankedPlayers(t: TournamentState, order: string[]): string[] {
  const rng = new Rng(deriveSeed('rank', t.seed));
  const tieBreak = new Map(rng.shuffle(order).map((id, i) => [id, i]));
  return Object.values(t.standings)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.hpScore - a.hpScore || tieBreak.get(a.playerId)! - tieBreak.get(b.playerId)!)
    .map((s) => s.playerId);
}

function previousOpponents(t: TournamentState, id: string): Set<string> {
  const s = new Set<string>();
  for (const st of t.stages) for (const m of st.matches) if (m.players.includes(id)) s.add(m.players[0] === id ? m.players[1] : m.players[0]);
  return s;
}

function buildStage(t: TournamentState, index: number, playerOrder: string[]): Stage {
  const p = t.plan[index];
  const stage: Stage = { name: p.name, kind: p.kind, mode: p.mode, matches: [], byes: [], complete: false };
  const mk = (a: string, b: string, i: number, label: string): Match => ({
    id: `m${index + 1}-${i + 1}`, stageIndex: index, round: index + 1, mode: p.mode, players: [a, b], winner: null, battleId: null, label,
  });

  if (p.kind === 'group') {
    const rng = new Rng(deriveSeed('pair', t.seed, index));
    let ranked = index === 0 ? rng.shuffle(playerOrder) : rankedPlayers(t, playerOrder);
    if (ranked.length % 2 === 1) {
      // Bye: lowest-ranked player with the fewest byes so far.
      const minByes = Math.min(...ranked.map((id) => t.standings[id].byes));
      const byeId = [...ranked].reverse().find((id) => t.standings[id].byes === minByes)!;
      stage.byes.push(byeId);
      ranked = ranked.filter((id) => id !== byeId);
    }
    const pairs = swissPair(ranked, (id) => previousOpponents(t, id));
    pairs.forEach(([a, b], i) => stage.matches.push(mk(a, b, i, p.mode === 'solo' ? 'Solo Duel' : 'Tag Team')));
  } else if (p.name === 'Semifinals') {
    const r = rankedPlayers(t, playerOrder).slice(0, 4);
    stage.matches.push(mk(r[0], r[3], 0, 'Semifinal 1 (#1 vs #4)'));
    stage.matches.push(mk(r[1], r[2], 1, 'Semifinal 2 (#2 vs #3)'));
  } else {
    const prev = t.stages[index - 1];
    const finalists = prev && prev.kind === 'knockout' ? prev.matches.map((m) => m.winner!) : rankedPlayers(t, playerOrder).slice(0, 2);
    stage.matches.push(mk(finalists[0], finalists[1], 0, 'Grand Final'));
  }
  return stage;
}

/** Pairs neighbours in ranking order, avoiding rematches when possible. */
function swissPair(ranked: string[], prev: (id: string) => Set<string>): Array<[string, string]> {
  const solve = (left: string[]): Array<[string, string]> | null => {
    if (left.length === 0) return [];
    const [a, ...rest] = left;
    const seen = prev(a);
    const candidates = [...rest.filter((b) => !seen.has(b)), ...rest.filter((b) => seen.has(b))];
    for (const b of candidates) {
      const sub = solve(rest.filter((x) => x !== b));
      if (sub) return [[a, b], ...sub];
    }
    return null;
  };
  return solve(ranked) ?? [];
}

export function findMatch(t: TournamentState, matchId: string): Match | undefined {
  for (const s of t.stages) for (const m of s.matches) if (m.id === matchId) return m;
  return undefined;
}

export function nextPendingMatch(t: TournamentState): Match | null {
  const st = t.stages[t.currentStage];
  return st?.matches.find((m) => !m.winner) ?? null;
}

/**
 * Records a result. Idempotent per match: a decided match cannot be changed.
 * Returns true if the tournament advanced to a new stage or finished.
 */
export function recordResult(t: TournamentState, matchId: string, winnerId: string, battleId: string, winnerHpPct: number, playerOrder: string[]): boolean {
  const m = findMatch(t, matchId);
  if (!m) throw new Error('Unknown match');
  if (m.winner) throw new Error('Match already decided');
  if (!m.players.includes(winnerId)) throw new Error('Winner is not in this match');
  if (m.stageIndex !== t.currentStage) throw new Error('Match is not in the current stage');
  m.winner = winnerId;
  m.battleId = battleId;
  const loserId = m.players[0] === winnerId ? m.players[1] : m.players[0];
  const stage = t.stages[m.stageIndex];
  if (stage.kind === 'group') {
    t.standings[winnerId].points += POINTS.win;
    t.standings[winnerId].hpScore += Math.round(winnerHpPct * 100);
  }
  t.standings[winnerId].wins += 1;
  t.standings[loserId].losses += 1;

  if (stage.matches.every((x) => x.winner)) {
    stage.complete = true;
    if (stage.kind === 'group') for (const b of stage.byes) { t.standings[b].points += POINTS.bye; t.standings[b].byes += 1; }
    if (m.label === 'Grand Final') {
      t.championId = winnerId;
      t.finalistIds = [winnerId, loserId];
      return true;
    }
    t.currentStage += 1;
    t.stages.push(buildStage(t, t.currentStage, playerOrder));
    return true;
  }
  return false;
}

export function modeSize(mode: BattleMode, rosterSize: number): number {
  return mode === 'solo' ? 1 : mode === 'tag' ? 2 : rosterSize;
}
