// "What decided it": explains a finished battle using only its verified
// inputs and event log, plus re-simulations of the identical matchup with
// different seeds to show how often each side would win.
import { ENGINE_VERSION, type BattleRecord } from './types';
import { simulateBattle } from './combat/engine';
import { truePower } from './hidden';
import { ABILITIES } from './data/abilities';
import { elementMultiplier, getEnvironment, getSynergy } from './data/world';
import { deriveSeed } from './rng';

export interface OutcomeFactor { side: 0 | 1 | null; text: string; weight: number }
export interface OutcomeReport { sims: number; winnerWins: number; verdict: 'expected' | 'toss-up' | 'upset'; factors: OutcomeFactor[] }

export function reSimulate(record: BattleRecord, sims: number): number {
  let wins = 0;
  for (let i = 0; i < sims; i++) {
    // Fresh luck on the current engine (older recorded fights can't be re-run on their own engine).
    const r = simulateBattle({ ...record.input, engineVersion: ENGINE_VERSION, seed: deriveSeed('resim', record.input.seed, i) });
    if (r.winnerSide === record.result.winnerSide) wins++;
  }
  return wins;
}

export function explainOutcome(record: BattleRecord, winnerWins: number, sims: number, names: [string, string]): OutcomeReport {
  const { input, result } = record;
  const w = result.winnerSide;
  const env = getEnvironment(input.environmentId);
  const factors: OutcomeFactor[] = [];
  // Reserves count for their team too, so a reinforcement's knockdown is credited.
  const sideOf = new Map(input.sides.flatMap((s, i) => [...s.fighters, ...(s.reserves ?? [])].map((f) => [f.charId, i as 0 | 1])));

  // Stats on paper (base + training + evolution, before condition)
  const power = input.sides.map((s) => s.fighters.reduce((a, f) => a + truePower(f.stats), 0) / s.fighters.length);
  const gap = Math.round(power[0] - power[1]);
  if (Math.abs(gap) >= 3) factors.push({ side: gap > 0 ? 0 : 1, weight: Math.abs(gap) / 2, text: `Stronger on paper: ${names[gap > 0 ? 0 : 1]}'s fighters averaged ${Math.abs(gap)} more True Power.` });
  else factors.push({ side: null, weight: 1, text: 'On paper the teams were almost even.' });

  // Battle-day form
  for (const f of result.fighters) {
    const snap = input.sides[f.side].fighters.find((x) => x.charId === f.charId)!;
    if (f.form >= 1.06) factors.push({ side: f.side, weight: (f.form - 1) * 60, text: `${snap.name} was in top form (+${Math.round((f.form - 1) * 100)}%).` });
    if (f.form <= 0.94) factors.push({ side: f.side === 0 ? 1 : 0, weight: (1 - f.form) * 60, text: `${snap.name} had an off day (${Math.round((f.form - 1) * 100)}%).` });
  }

  // Luck: critical hits
  const crits = [0, 1].map((s) => result.fighters.filter((f) => f.side === s).reduce((a, f) => a + f.crits, 0));
  if (crits[0] !== crits[1]) {
    const s = crits[0] > crits[1] ? 0 : 1;
    factors.push({ side: s as 0 | 1, weight: Math.abs(crits[0] - crits[1]) * 2, text: `Luck: ${names[s]} landed ${crits[s]} critical hit${crits[s] === 1 ? '' : 's'} to ${crits[1 - s]}.` });
  }

  // Type matchups and arena
  const typeHits = [0, 0], arenaHits = [0, 0];
  for (const e of result.events) {
    if (e.type !== 'attack' || !e.ability || !ABILITIES[e.ability] || !e.actor || !e.target || e.context?.environmental) continue;
    const a = ABILITIES[e.ability];
    const s = sideOf.get(e.actor);
    const target = input.sides.flatMap((x) => x.fighters).find((f) => f.charId === e.target);
    if (s === undefined || !target || !a.element) continue;
    if (elementMultiplier(a.element, target.tags, target.vulnerability) > 1) typeHits[s]++;
    if (env.boost.includes(a.element)) arenaHits[s]++;
  }
  for (const s of [0, 1] as const) {
    if (typeHits[s] >= 2) factors.push({ side: s, weight: typeHits[s] * 1.5, text: `Type advantage: ${names[s]} hit ${typeHits[s]} super-effective moves.` });
    if (arenaHits[s] >= 2) factors.push({ side: s, weight: arenaHits[s], text: `Home arena: ${env.name} powered up ${arenaHits[s]} of ${names[s]}'s moves.` });
  }

  // The exchanges: knockdowns, clashes, parries and injuries
  const kd = [0, 0], clash = [0, 0], parry = [0, 0], inj = [0, 0];
  for (const e of result.events) {
    const s = e.actor ? sideOf.get(e.actor) : undefined;
    if (s === undefined) continue;
    if (e.type === 'knockdown') kd[s]++;
    if (e.type === 'clash' && e.context?.winner) { const ws = sideOf.get(String(e.context.winner)); if (ws !== undefined) clash[ws]++; }
    if (e.type === 'parry') parry[s]++;
    if (e.type === 'injury') inj[s]++;
  }
  for (const s of [0, 1] as const) {
    if (kd[s]) factors.push({ side: s, weight: kd[s] * 5, text: `${names[s]} scored ${kd[s]} knockdown${kd[s] > 1 ? 's' : ''}.` });
    if (clash[s]) factors.push({ side: s, weight: clash[s] * 3, text: `${names[s]} won ${clash[s]} head-on clash${clash[s] > 1 ? 'es' : ''} of techniques.` });
    if (parry[s] >= 2) factors.push({ side: s, weight: parry[s] * 1.5, text: `${names[s]} parried ${parry[s]} attacks and punished the openings.` });
    if (inj[s] >= 2) factors.push({ side: s, weight: inj[s] * 2, text: `${names[s]} inflicted ${inj[s]} injuries that slowed the other side down.` });
  }

  // Corner calls, reinforcements and named combos
  const CALL_NAME: Record<string, string> = { all_out: 'Go all out', defend: 'Guard up', ultimate: 'Use it now', callback: 'Fall back', reinforce: 'Send in backup' };
  for (const e of result.events) {
    if (e.type === 'call' && typeof e.context?.side === 'number') {
      const s = e.context.side as 0 | 1;
      factors.push({ side: s, weight: 2.5, text: `${names[s]}'s corner called "${CALL_NAME[String(e.context.call)] ?? e.context.call}".` });
    }
    if (e.type === 'combo' && e.context?.duo && e.actor) {
      const s = sideOf.get(e.actor);
      if (s !== undefined) factors.push({ side: s, weight: 4, text: `${names[s]} landed the duo combo ${e.context.duo}.` });
    }
  }

  // Turning moments
  for (const e of result.events) {
    const s = e.actor ? sideOf.get(e.actor) : e.target ? sideOf.get(e.target) : undefined;
    if (s === undefined) continue;
    const who = input.sides[s].fighters.find((f) => f.charId === (e.actor ?? e.target))?.name;
    if (e.type === 'awakening') factors.push({ side: s, weight: 6, text: `${who} awakened when close to defeat.` });
    if (e.type === 'iron_will') factors.push({ side: s, weight: 5, text: `${who} got back up from a finishing blow on Iron Will.` });
    if (e.type === 'prebattle' && e.context?.backfire) factors.push({ side: (s === 0 ? 1 : 0) as 0 | 1, weight: 4, text: `A taunt backfired and fired up the opponent.` });
  }

  // Condition and synergies
  const cond = input.sides.map((s) => s.fighters.reduce((a, f) => a + f.fatigue + f.injuries.length * 15, 0) / s.fighters.length);
  if (Math.abs(cond[0] - cond[1]) >= 12) {
    const fresher = cond[0] < cond[1] ? 0 : 1;
    factors.push({ side: fresher, weight: Math.abs(cond[0] - cond[1]) / 8, text: `${names[fresher]}'s fighters came in fresher (less fatigue and injury).` });
  }
  for (const s of [0, 1] as const) for (const id of input.sides[s].synergies) {
    const syn = getSynergy(id);
    if (syn) factors.push({ side: s, weight: 3, text: `Team synergy: ${syn.name} (${syn.description})` });
  }

  const pct = winnerWins / Math.max(1, sims);
  const verdict = pct >= 0.6 ? 'expected' : pct >= 0.4 ? 'toss-up' : 'upset';
  factors.sort((a, b) => (b.side === w ? 1 : 0) - (a.side === w ? 1 : 0) || b.weight - a.weight);
  return { sims, winnerWins, verdict, factors: factors.slice(0, 8) };
}
