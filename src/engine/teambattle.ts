// Team battles: players split into Team A and Team B (2v2, 3v3, or 2 vs 1), each
// sends their own fighters, and the two teams fight it out on the same engine.
// Results crown an MVP from both teams. Like raids, they never change the tournament.
import type { BattleInput, BattleRecord, GameState, RaidContribution, TeamBattleResult } from './types';
import { ENGINE_VERSION } from './types';
import { simulateBattle } from './combat/engine';
import { narrate } from './narration';
import { Rng, uid } from './rng';
import { buildSnapshot } from './game';
import { truePower, type Vault } from './hidden';
import { progressedStats } from './progression';
import { ENVIRONMENTS } from './data/world';

type Team = 'A' | 'B';
type R = { ok: true } | { ok: false; error: string };

/** Current teams: what the host set, or alternating seats by default. */
export function teamsOf(g: GameState): Record<string, Team> {
  const set = g.teamSetup?.teams ?? {};
  return Object.fromEntries(g.players.map((p, i) => [p.id, set[p.id] ?? (i % 2 === 0 ? 'A' : 'B')]));
}

export function teamMembers(g: GameState, team: Team): string[] {
  const t = teamsOf(g);
  return g.players.filter((p) => t[p.id] === team).map((p) => p.id);
}

/** Both teams field the same number of fighters: as many as the bigger team has players. */
export function teamFighterCount(g: GameState): number {
  return Math.max(1, Math.min(4, Math.max(teamMembers(g, 'A').length, teamMembers(g, 'B').length)));
}

/** How many fighters one player sends: a smaller team's players send more to even it out. */
export function teamSlots(g: GameState, playerId: string): number {
  const team = teamsOf(g)[playerId];
  const size = teamMembers(g, team).length;
  return Math.max(1, Math.min(3, Math.ceil(teamFighterCount(g) / Math.max(1, size))));
}

/** Host: puts a player on a team. */
export function setTeam(g: GameState, playerId: string, team: Team): R {
  if (!g.players.some((p) => p.id === playerId)) return { ok: false, error: 'Unknown player.' };
  const teams = { ...teamsOf(g), [playerId]: team };
  g.teamSetup = { teams, picks: g.teamSetup?.picks ?? {} };
  return { ok: true };
}

/** A player chooses who they send (from their own roster). */
export function setTeamPick(g: GameState, playerId: string, ids: string[]): R {
  const p = g.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, error: 'Unknown player.' };
  const mine = [...new Set(ids)].filter((id) => p.roster.includes(id));
  if (mine.length > teamSlots(g, playerId)) return { ok: false, error: `Send at most ${teamSlots(g, playerId)}.` };
  g.teamSetup = { teams: teamsOf(g), picks: { ...(g.teamSetup?.picks ?? {}), [playerId]: mine } };
  return { ok: true };
}

const power = (g: GameState, vault: Vault, id: string) => {
  const c = g.conditions[id];
  return c ? truePower(progressedStats(vault.get(id), c)) : truePower(vault.get(id).stats);
};

/** A team's fighters: each player's picks (or their best), trimmed to the team size. */
export function teamFighters(g: GameState, vault: Vault, team: Team): string[] {
  const out: string[] = [];
  for (const pid of teamMembers(g, team)) {
    const p = g.players.find((x) => x.id === pid)!;
    const chosen = (g.teamSetup?.picks?.[pid] ?? []).filter((id) => p.roster.includes(id));
    const best = p.roster.slice().sort((a, b) => power(g, vault, b) - power(g, vault, a));
    out.push(...(chosen.length ? chosen : best).slice(0, teamSlots(g, pid)));
  }
  return out.slice(0, teamFighterCount(g));
}

export function teamName(g: GameState, team: Team): string {
  const names = teamMembers(g, team).map((id) => g.players.find((p) => p.id === id)?.name ?? id);
  return names.length ? names.join(' & ') : `Team ${team}`;
}

export function buildTeamInput(g: GameState, vault: Vault, seed: number): BattleInput {
  const side = (team: Team, i: 0 | 1) => {
    const ids = teamFighters(g, vault, team);
    const fighters = ids.map((id, k) => ({ ...buildSnapshot(g, vault, id, i, k < 2 ? 'front' : 'back'), injuries: [], fatigue: 0 }));
    return { playerId: `team-${team}`, strategy: 'balanced' as const, mental: 'composure' as const, fighters, synergies: [], coach: 'auto' as const };
  };
  return {
    battleId: uid('team'), engineVersion: ENGINE_VERSION, seed, mode: 'squad', rivalry: null,
    environmentId: new Rng(seed ^ 0x7ea3).pick(ENVIRONMENTS).id, sides: [side('A', 0), side('B', 1)],
  };
}

/** Everyone's share of the fight, both teams, best first. */
export function teamContributions(record: BattleRecord): RaidContribution[] {
  const ev = record.result.events;
  const loser = record.input.sides[1 - record.result.winnerSide].fighters.map((f) => f.charId);
  // The final blow: whoever last hit the last loser to go down.
  const lastDown = [...ev].reverse().find((e) => e.type === 'defeat' && e.target && loser.includes(e.target));
  let finisher: string | undefined;
  if (lastDown) for (let k = ev.indexOf(lastDown) - 1; k >= 0; k--) if (ev[k].target === lastDown.target && ev[k].actor && (ev[k].damage ?? 0) > 0) { finisher = ev[k].actor; break; }
  const all = record.input.sides.flatMap((s) => s.fighters);
  const out = all.map((f) => {
    const r = record.result.fighters.find((x) => x.charId === f.charId);
    const healed = ev.filter((e) => e.type === 'heal' && e.actor === f.charId).reduce((n, e) => n + (e.heal ?? 0), 0);
    const dealt = r?.damageDealt ?? 0, tanked = r?.damageTaken ?? 0, finalBlow = finisher === f.charId;
    const won = f.side === record.result.winnerSide;
    const score = Math.round((dealt + tanked * 0.4 + healed + (finalBlow ? (r?.maxHp ?? 0) * 0.15 : 0)) * (won ? 1.1 : 1));
    return { charId: f.charId, name: f.name, playerId: f.playerId, dealt, tanked, healed, finalBlow, score, role: '' };
  }).sort((a, b) => b.score - a.score);
  const best = (k: 'dealt' | 'tanked' | 'healed') => out.slice().sort((a, b) => b[k] - a[k])[0];
  for (const [c, role] of [[out.find((c) => c.finalBlow), 'Final blow'], [best('dealt'), 'Top damage'], [best('tanked'), 'The wall'], [best('healed')?.healed ? best('healed') : undefined, 'Medic']] as Array<[RaidContribution | undefined, string]>) {
    if (c && !c.role) c.role = role;
  }
  return out;
}

export function runTeamBattle(g: GameState, vault: Vault, seed: number): { record: BattleRecord; result: TeamBattleResult } {
  const a = teamMembers(g, 'A'), b = teamMembers(g, 'B');
  if (!a.length || !b.length) throw new Error('Both teams need at least one player.');
  const input = buildTeamInput(g, vault, seed);
  const result = simulateBattle(input);
  const playerNames = { ...Object.fromEntries(g.players.map((p) => [p.id, p.name])), 'team-A': teamName(g, 'A'), 'team-B': teamName(g, 'B') };
  const narration = narrate(input, result, { prices: g.prices, playerNames, previousLoss: {}, stageName: 'a team battle' });
  const record: BattleRecord = { battleId: input.battleId, input, result, matchId: null, kind: 'team', narration, createdAt: Date.now(), postEffects: [] };
  const contributions = teamContributions(record);
  const tb: TeamBattleResult = { id: input.battleId, battleId: input.battleId, teamA: a, teamB: b, winner: result.winnerSide === 0 ? 'A' : 'B', mvp: contributions[0]?.charId ?? null, contributions, at: Date.now() };
  g.teamBattles = [...(g.teamBattles ?? []), tb];
  return { record, result: tb };
}
