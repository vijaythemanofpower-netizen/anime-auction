// Live predictions: questions put to the people watching a fight, with answers
// that come from the fight's own event log (the fight is already decided, so a
// question is only asked about what happens *after* the moment it appears).
import type { BattleRecord } from './types';
import { Rng, hashString } from './rng';

export interface Prediction {
  id: string;
  /** Asked when playback reaches this event index. */
  askAt: number;
  /** Answer revealed when playback reaches this index. */
  revealAt: number;
  question: string;
  options: Array<{ id: string; label: string }>;
  answer: string;
  points: number;
}

const isHit = (e: BattleRecord['result']['events'][number]) => (e.type === 'attack' || e.type === 'counter') && (e.damage ?? 0) > 0 && !e.context?.environmental && !!e.actor;

/** Up to four questions for a fight, spread across it. Deterministic per battle. */
export function predictionsFor(record: BattleRecord, sideNames: [string, string]): Prediction[] {
  const ev = record.result.events;
  const n = ev.length;
  if (n < 20) return [];
  const rng = new Rng(hashString(`${record.battleId}:predict`));
  const snaps = record.input.sides.flatMap((s) => [...s.fighters, ...(s.reserves ?? [])]);
  const name = (id: string) => snaps.find((f) => f.charId === id)?.name ?? 'Someone';
  const sideOf = (id: string) => snaps.find((f) => f.charId === id)?.side;
  const out: Prediction[] = [];
  const sides = [{ id: '0', label: sideNames[0] }, { id: '1', label: sideNames[1] }];

  // 1. Who wins? Asked early, revealed at the end.
  const start = ev.findIndex((e) => e.type === 'opening');
  out.push({ id: 'winner', askAt: Math.max(1, start + 1), revealAt: n, question: 'Who wins this fight?', options: sides, answer: String(record.result.winnerSide), points: 3 });

  // 2. Who lands the next clean hit? At a random point in the middle.
  const from = Math.floor(n * (0.25 + rng.next() * 0.3));
  const next = ev.findIndex((e, i) => i > from && isHit(e));
  if (next > 0) out.push({ id: 'nexthit', askAt: from, revealAt: next + 1, question: 'Who lands the next clean hit?', options: sides, answer: String(sideOf(ev[next].actor!)), points: 1 });

  // 3. Will a badly hurt fighter survive? Asked when someone first drops low.
  const maxHp = new Map(record.result.fighters.map((f) => [f.charId, f.maxHp]));
  const low = ev.findIndex((e, i) => i > n * 0.3 && e.target && e.hpAfter !== undefined && e.hpAfter > 0 && e.hpAfter / (maxHp.get(e.target) ?? 1) < 0.3);
  if (low > 0) {
    const who = ev[low].target!;
    const fell = record.result.fighters.find((f) => f.charId === who)?.defeated ?? false;
    out.push({ id: 'survive', askAt: low + 1, revealAt: n, question: `${name(who)} is in trouble. Will they survive this fight?`, options: [{ id: 'yes', label: 'Yes, they hold on' }, { id: 'no', label: 'No, they go down' }], answer: fell ? 'no' : 'yes', points: 2 });
  }

  // 4. A knockdown in the next 15 moves? Late in the fight.
  const late = Math.floor(n * (0.55 + rng.next() * 0.2));
  if (late + 16 < n) {
    const kd = ev.slice(late + 1, late + 16).some((e) => e.type === 'knockdown' || e.type === 'defeat');
    out.push({ id: 'knockdown', askAt: late, revealAt: late + 16, question: 'Will anyone hit the floor in the next 15 moves?', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }], answer: kd ? 'yes' : 'no', points: 1 });
  }

  // Never two questions open at once: keep them in order and spaced out.
  out.sort((a, b) => a.askAt - b.askAt);
  return out.filter((p, i) => i === 0 || p.askAt > out[i - 1].askAt + 3);
}
