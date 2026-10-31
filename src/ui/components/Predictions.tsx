// Live predictions during a fight (engine/predictions.ts): a question pops up with
// a countdown while the fight keeps playing, the answer is revealed when that moment
// arrives, and an "Oracle" score builds up over the whole game on this device.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { BattleRecord } from '../../engine/types';
import { predictionsFor, preFightPoll, type PollQuestion, type Prediction } from '../../engine/predictions';
import { guesses, sendGuess, useRoom, type Guess } from '../../online/room';

const ANSWER_MS = 7000;
interface Oracle { points: number; correct: number; total: number; streak: number; scored: string[] }

function readOracle(key: string): Oracle {
  try { return { points: 0, correct: 0, total: 0, streak: 0, scored: [], ...JSON.parse(localStorage.getItem(key) ?? '{}') }; } catch { return { points: 0, correct: 0, total: 0, streak: 0, scored: [] }; }
}
function saveOracle(key: string, o: Oracle) { try { localStorage.setItem(key, JSON.stringify({ ...o, scored: o.scored.slice(-300) })); } catch { /* storage unavailable */ } }

export function Predictions({ record, idx, done, active, sideNames, gameId }: {
  record: BattleRecord; idx: number; done: boolean; active: boolean; sideNames: [string, string]; gameId: string;
}) {
  const questions = useMemo(() => predictionsFor(record, sideNames), [record, sideNames]);
  const key = `aa-oracle:${gameId}`;
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [oracle, setOracle] = useState<Oracle>(() => readOracle(key));
  const shownAt = useRef<Record<string, number>>({});
  const [, tick] = useState(0);
  useEffect(() => { setPicks({}); shownAt.current = {}; }, [record.battleId]);

  // The question in play: the latest one that has been asked.
  const pos = done ? Infinity : idx;
  const q: Prediction | undefined = [...questions].reverse().find((p) => p.askAt <= pos);
  if (q && !shownAt.current[q.id]) shownAt.current[q.id] = Date.now();
  const left = q ? Math.max(0, ANSWER_MS - (Date.now() - shownAt.current[q.id])) : 0;
  const pick = q ? picks[q.id] : undefined;
  const revealed = !!q && pos >= q.revealAt;
  useEffect(() => { if (!q || pick || revealed || left <= 0) return; const t = setInterval(() => tick((n) => n + 1), 250); return () => clearInterval(t); }, [q?.id, pick, revealed, left]); // eslint-disable-line react-hooks/exhaustive-deps

  // Score each answered question once, when its answer is revealed.
  useEffect(() => {
    for (const p of questions) {
      const mine = picks[p.id];
      const id = `${record.battleId}:${p.id}`;
      if (!mine || pos < p.revealAt || oracle.scored.includes(id)) continue;
      const right = mine === p.answer;
      setOracle((o) => {
        const next = { ...o, total: o.total + 1, correct: o.correct + (right ? 1 : 0), points: o.points + (right ? p.points + (o.streak >= 2 ? 1 : 0) : 0), streak: right ? o.streak + 1 : 0, scored: [...o.scored, id] };
        saveOracle(key, next);
        return next;
      });
    }
  }, [pos, picks, questions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active || !questions.length) return null;
  const mineThisFight = questions.filter((p) => picks[p.id]);
  const rightThisFight = mineThisFight.filter((p) => pos >= p.revealAt && picks[p.id] === p.answer).length;
  const chip = <span className="oracle-chip" title="Your prediction score this game">🔮 {oracle.points} pts{oracle.streak >= 2 ? ` · 🔥${oracle.streak}` : ''}</span>;

  if (done) {
    return mineThisFight.length ? <div className="predict done">{chip}<span>You called <b>{rightThisFight}</b> of {mineThisFight.length} this fight.</span></div> : null;
  }
  if (!q) return <div className="predict idle">{chip}<span className="faint">Predictions pop up during the fight.</span></div>;

  const label = (id?: string) => q.options.find((o) => o.id === id)?.label ?? '';
  if (revealed) {
    const right = pick === q.answer;
    return (
      <div className={`predict ${pick ? (right ? 'right' : 'wrong') : ''}`}>{chip}
        <span>{q.question} <b>{label(q.answer)}</b>{pick ? (right ? ` ✓ +${q.points}` : ' ✕') : ' (no pick)'}</span>
      </div>
    );
  }
  if (pick) return <div className="predict locked">{chip}<span>{q.question} You picked <b>{label(pick)}</b>. Wait for it…</span></div>;
  if (left <= 0) return <div className="predict locked">{chip}<span className="faint">Too slow for that one. Next question soon.</span></div>;
  return (
    <div className="predict ask" role="group" aria-label="Prediction">
      <div className="predict-head">{chip}<b>{q.question}</b><span className="faint">+{q.points} pt{q.points > 1 ? 's' : ''}</span></div>
      <div className="predict-options">
        {q.options.map((o) => <button key={o.id} className="btn sm" onClick={() => setPicks((p) => ({ ...p, [q.id]: o.id }))}>{o.label}</button>)}
      </div>
      <div className="predict-timer"><span style={{ width: `${(left / ANSWER_MS) * 100}%` }} /></div>
    </div>
  );
}

/** While the comic draws: everyone calls the fight (shared with the room), revealed at the end. */
export function PreFightPoll({ record, sideNames, done }: { record: BattleRecord; sideNames: [string, string]; done: boolean }) {
  const qs = useMemo(() => preFightPoll(record, sideNames), [record, sideNames]);
  const all = useSyncExternalStore(guesses.subscribe, guesses.get);
  const room = useRoom();
  if (!qs.length) return null;
  const picks = (q: string) => Object.values(all[`${record.battleId}:${q}`] ?? {});
  const anyPick = qs.some((q) => picks(q.id).length);
  if (done && !anyPick) return null;
  return (
    <div className="panel col prepoll" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>🔮 {done ? 'Who called it?' : 'Call the fight'}</strong>
        <span className="faint">{done ? 'Answers are in.' : room?.connected ? 'Everyone in the room sees your picks. Answers at the end.' : 'Answers at the end.'}</span>
      </div>
      {qs.map((q) => {
        const ps = picks(q.id);
        const mine = ps.find((p) => p.mine)?.pick;
        const label = (id: string) => q.options.find((o) => o.id === id)?.label ?? id;
        return (
          <div key={q.id} className="col" style={{ gap: 6 }}>
            <span><b>{q.question}</b> <span className="faint">+{q.points}</span>{done && <> · <b className="prepoll-answer">{label(q.answer)}</b></>}</span>
            {!done && (
              <div className="predict-options">
                {q.options.map((o) => <button key={o.id} className={`btn sm${mine === o.id ? ' primary' : ''}`} aria-pressed={mine === o.id} onClick={() => sendGuess(record.battleId, q.id, o.id)}>{o.label}</button>)}
              </div>
            )}
            {ps.length > 0 && (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {ps.map((p) => <span key={p.from} className={`player-chip${done ? (p.pick === q.answer ? ' ready' : ' missed') : ''}`}>{p.name}: {label(p.pick)}{done ? (p.pick === q.answer ? ' ✓' : ' ✕') : ''}</span>)}
              </div>
            )}
          </div>
        );
      })}
      {done && <PollScores qs={qs} picks={picks} />}
    </div>
  );
}

function PollScores({ qs, picks }: { qs: PollQuestion[]; picks: (q: string) => Guess[] }) {
  const score: Record<string, { name: string; pts: number }> = {};
  for (const q of qs) for (const p of picks(q.id)) {
    score[p.from] ??= { name: p.name, pts: 0 };
    if (p.pick === q.answer) score[p.from].pts += q.points;
  }
  const rows = Object.values(score).sort((a, b) => b.pts - a.pts);
  if (rows.length < 2) return null;
  return <div className="faint">🏆 {rows.map((r) => `${r.name} ${r.pts}`).join(' · ')}</div>;
}
