// Post-battle consequences: fatigue, injuries, experience, evolution and
// rivalries. All rolls use an RNG derived from the battle seed, so the same
// battle always produces the same consequences.
import type { BattleInput, BattleResult, Condition, GameState, HiddenProfile, Injury, PostBattleEffect, Rivalry, Stats } from './types';
import { STAT_KEYS } from './types';
import { Rng, deriveSeed } from './rng';
import { INJURY_TABLE } from './data/world';
import type { BodyPart } from './types';

const CARRY_OVER: Record<BodyPart, string> = { arm: 'Fractured Arm', leg: 'Sprained Ankle', head: 'Concussion', torso: 'Cracked Ribs' };

export const MAX_TRAINING_PER_STAT = 6;
export const TRAIN_AMOUNT = 3;

export function emptyCondition(charId: string): Condition {
  return { charId, fatigue: 0, injuries: [], xp: 0, evolved: false, training: {}, wins: 0, losses: 0, discoveredSynergies: [], unlockedAbilities: [] };
}

/** Stats used in battle: hidden base + training + evolution (fatigue/injury applied later by the engine). */
export function progressedStats(h: HiddenProfile, c: Condition): Stats {
  const out = { ...h.stats };
  for (const k of STAT_KEYS) {
    out[k] += c.training[k] ?? 0;
    if (c.evolved) out[k] += h.evolution.statBoost[k] ?? 0;
    out[k] = Math.max(1, Math.min(120, out[k]));
  }
  return out;
}

export function rivalryKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

export function computeEffects(g: GameState, input: BattleInput, result: BattleResult, getHidden: (id: string) => HiddenProfile): PostBattleEffect[] {
  const rng = new Rng(deriveSeed('post', input.seed, input.battleId));
  const persistent = g.config.tournament.persistentConditions;
  const effects: PostBattleEffect[] = [];
  for (const fr of result.fighters) {
    const won = fr.side === result.winnerSide;
    const cond = g.conditions[fr.charId];
    const h = getHidden(fr.charId);
    const fatigueDelta = persistent ? Math.round(10 + fr.actions * 0.5 + (fr.damageTaken / fr.maxHp) * 15) : 0;
    let injury: Injury | null = null;
    if (persistent) {
      // A serious injury from the fight itself (broken arm, concussion...) may carry over.
      const serious = (fr.injuries ?? []).find((i) => i.severity === 2);
      const carried = serious && INJURY_TABLE.find((t) => t.name === CARRY_OVER[serious.part]);
      const chance = fr.defeated ? 0.3 : fr.minHpPct < 0.2 ? 0.12 : 0;
      if (carried && rng.chance(0.5)) {
        injury = { id: `${input.battleId}-${fr.charId}`, name: carried.name, stat: carried.stat, penalty: carried.penalty, matchesRemaining: carried.duration };
      } else if (chance && rng.chance(chance)) {
        const t = rng.pick(INJURY_TABLE);
        injury = { id: `${input.battleId}-${fr.charId}`, name: t.name, stat: t.stat, penalty: t.penalty, matchesRemaining: t.duration };
      }
    }
    const xpGain = 1 + (won ? 1 : 0) + (fr.minHpPct < 0.15 && !fr.defeated ? 1 : 0);
    let evolved = false;
    if (cond && !cond.evolved) {
      const ev = h.evolution;
      const newXp = cond.xp + xpGain;
      const rv = g.rivalries[rivalryKey(input.sides[0].playerId, input.sides[1].playerId)];
      if (ev.trigger === 'xp' && newXp >= ev.threshold) evolved = true;
      if (ev.trigger === 'survive_critical' && won && !fr.defeated && fr.minHpPct < 0.15) evolved = true;
      if (ev.trigger === 'rivalry_win' && won && (rv?.encounters ?? 0) >= 1) evolved = true;
      if (ev.trigger === 'synergy' && input.sides[fr.side].synergies.length > 0 && won) evolved = true;
    }
    effects.push({ charId: fr.charId, fatigueDelta, injury, xpGain, evolved, unlocked: evolved ? h.evolution.unlockAbility : null });
  }
  return effects;
}

export function applyEffects(g: GameState, input: BattleInput, result: BattleResult, effects: PostBattleEffect[]) {
  const fought = new Set(result.fighters.map((f) => f.charId));
  // Owners' benched characters rest; existing injuries heal one match.
  for (const side of input.sides) {
    const p = g.players.find((x) => x.id === side.playerId);
    if (!p) continue;
    for (const id of p.roster) {
      const c = (g.conditions[id] ??= emptyCondition(id));
      for (const inj of c.injuries) inj.matchesRemaining -= 1;
      c.injuries = c.injuries.filter((i) => i.matchesRemaining > 0);
      if (!fought.has(id)) c.fatigue = Math.max(0, c.fatigue - 20);
    }
  }
  for (const e of effects) {
    const c = (g.conditions[e.charId] ??= emptyCondition(e.charId));
    const fr = result.fighters.find((f) => f.charId === e.charId)!;
    c.fatigue = Math.max(0, Math.min(100, c.fatigue + e.fatigueDelta));
    if (e.injury) c.injuries.push(e.injury);
    c.xp += e.xpGain;
    if (fr.side === result.winnerSide) c.wins++; else c.losses++;
    if (e.evolved) { c.evolved = true; if (e.unlocked && !c.unlockedAbilities.includes(e.unlocked)) c.unlockedAbilities.push(e.unlocked); }
    for (const s of input.sides[fr.side].synergies) if (!c.discoveredSynergies.includes(s)) c.discoveredSynergies.push(s);
  }
  // Rivalry between the two players
  const [a, b] = [input.sides[0].playerId, input.sides[1].playerId];
  const key = rivalryKey(a, b);
  const r: Rivalry = (g.rivalries[key] ??= { key, a: [a, b].sort()[0], b: [a, b].sort()[1], encounters: 0, winsA: 0, winsB: 0, intensity: 0, moments: [] });
  r.encounters++;
  const winner = input.sides[result.winnerSide].playerId;
  if (winner === r.a) r.winsA++; else r.winsB++;
  const close = Math.min(...result.fighters.filter((f) => f.side === result.winnerSide).map((f) => f.hp / f.maxHp)) < 0.25;
  r.intensity = Math.min(5, r.intensity + 1 + (close ? 1 : 0));
  if (result.turningPoint) r.moments.push(result.turningPoint);
  if (r.moments.length > 6) r.moments.shift();
}
