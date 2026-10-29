// Coach review: after a fight, every corner call is tested against the other
// options. The fight is identical up to that corner; from there each option is
// played out many times with fresh luck, so we can say which call was best.
import type { BattleInput, BattleRecord, CallKind, CoachCall, Strategy } from './types';
import { simulateBattle } from './combat/engine';
import { deriveSeed } from './rng';

export interface OptionResult { kind: CallKind; reserveId?: string; label: string; win: number }
export interface CallReview {
  side: 0 | 1; corner: number; turn: number; reason: string; focus: string;
  chosen: OptionResult; best: OptionResult; options: OptionResult[];
  verdict: 'best' | 'good' | 'costly' | 'blunder' | 'no difference';
  score: number;
}
export interface StrategyReview { chosen: Strategy; chosenWin: number; best: Strategy; bestWin: number }
export interface SideReview { side: 0 | 1; calls: CallReview[]; strategy: StrategyReview | null; iq: number; missed: number }

export const CALL_LABEL: Record<CallKind, string> = {
  all_out: 'Go all out', defend: 'Guard up', ultimate: 'Use it NOW', callback: 'Call back / fall back', reinforce: 'Send backup', none: 'Let them fight',
};

const STRATS: Strategy[] = ['aggressive', 'defensive', 'balanced', 'counter', 'control', 'highrisk'];

function winRate(base: BattleInput, side: 0 | 1, calls: CoachCall[], corner: number, sims: number): number {
  let wins = 0;
  for (let i = 0; i < sims; i++) {
    const r = simulateBattle({ ...base, calls, branch: { side, corner, salt: i + 1 } });
    if (r.winnerSide === side) wins++;
  }
  return wins / sims;
}

/** Reviews one side's corner calls and strategy. `sims` per option. */
export function reviewSide(record: BattleRecord, side: 0 | 1, names: Record<string, string>, sims = 12): SideReview {
  const { input, result } = record;
  const recorded = input.calls ?? [];
  const calls: CallReview[] = [];
  let missed = 0;
  for (const e of result.events) {
    if (e.type !== 'corner' || e.context?.side !== side) continue;
    const corner = Number(e.context.corner);
    const opts = String(e.context.options).split(',') as CallKind[];
    const made = recorded.find((c) => c.side === side && c.corner === corner);
    if (!made) missed++;
    const before = recorded.filter((c) => !(c.side === side && c.corner >= corner));
    const candidates: Array<{ kind: CallKind; reserveId?: string; label: string }> = [];
    if (e.context.reason === 'jump_in') {
      const rid = String(e.context.reserve);
      candidates.push({ kind: 'reinforce', reserveId: rid, label: `Let ${names[rid] ?? 'them'} jump in` }, { kind: 'none', label: 'Keep them on the bench' });
    } else for (const k of opts) {
      if (k === 'reinforce') for (const r of input.sides[side].reserves ?? []) candidates.push({ kind: k, reserveId: r.charId, label: `Send backup: ${r.name}` });
      else candidates.push({ kind: k, label: CALL_LABEL[k] });
    }
    const options = candidates.map((c) => ({ ...c, win: winRate(input, side, [...before, { side, corner, kind: c.kind, reserveId: c.reserveId }], corner, sims) }));
    const chosenKind = made?.kind ?? 'none';
    const chosen = options.find((o) => o.kind === chosenKind && (chosenKind !== 'reinforce' || !made?.reserveId || o.reserveId === made.reserveId)) ?? options.find((o) => o.kind === 'none')!;
    const best = options.slice().sort((a, b) => b.win - a.win)[0];
    const worst = options.slice().sort((a, b) => a.win - b.win)[0];
    const spread = best.win - worst.win;
    const gap = best.win - chosen.win;
    const verdict: CallReview['verdict'] = spread < 0.09 ? 'no difference' : gap <= 0.04 ? 'best' : gap <= 0.12 ? 'good' : gap <= 0.25 ? 'costly' : 'blunder';
    const score = spread < 0.09 ? 85 : Math.round(100 * (chosen.win - worst.win) / spread);
    calls.push({ side, corner, turn: e.turn, reason: String(e.context.reason), focus: names[e.actor ?? ''] ?? '', chosen, best, options: options.sort((a, b) => b.win - a.win), verdict, score });
  }

  // Strategy: same lineup, every strategy, fresh luck.
  let strategy: StrategyReview | null = null;
  const chosenStrat = input.sides[side].strategy;
  const rates = STRATS.map((st) => {
    let wins = 0;
    const n = Math.max(6, Math.round(sims / 2));
    for (let i = 0; i < n; i++) {
      const sides = structuredClone(input.sides) as BattleInput['sides'];
      sides[side].strategy = st;
      const r = simulateBattle({ ...input, sides, calls: [], seed: deriveSeed('strategy-review', input.seed, i) });
      if (r.winnerSide === side) wins++;
    }
    return { st, win: wins / n };
  });
  const bestS = rates.slice().sort((a, b) => b.win - a.win)[0];
  const mine = rates.find((r) => r.st === chosenStrat)!;
  strategy = { chosen: chosenStrat, chosenWin: mine.win, best: bestS.st, bestWin: bestS.win };

  // Coach IQ: 100 is average; great calls and strategy push it up, blunders down.
  const callScore = calls.length ? calls.reduce((a, c) => a + c.score, 0) / calls.length : 70;
  const stratScore = bestS.win - mine.win <= 0.05 ? 100 : Math.max(0, 100 - (bestS.win - mine.win) * 250);
  const iq = Math.round(70 + callScore * 0.42 + stratScore * 0.18);
  return { side, calls, strategy, iq, missed };
}
