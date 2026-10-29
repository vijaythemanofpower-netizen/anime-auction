// End-of-fight coach review: each corner call graded against the options the
// player had, the strategy compared with the alternatives, a coach IQ and titles.
import { useEffect, useState } from 'react';
import { ENGINE_VERSION, type BattleRecord, type GameState } from '../../engine/types';
import { reviewSide, type SideReview } from '../../engine/review';
import { titlesFor, type Title } from '../../engine/titles';
import { store, useApp } from '../../store/store';

const REASON: Record<string, string> = {
  knocked_down: 'was knocked down', opponent_down: 'had the opponent on the floor', guard_broken: 'had their guard broken',
  serious_injury: 'took a serious injury', barely_standing: 'was barely standing', check: 'mid-fight check-in', jump_in: 'had a bench teammate begging to jump in',
};
const VERDICT: Record<SideReview['calls'][number]['verdict'], { label: string; color: string }> = {
  best: { label: '✓ Best call', color: 'var(--good)' },
  good: { label: '✓ Good call', color: '#a3e635' },
  'no difference': { label: '• Any call was fine', color: 'var(--text-dim)' },
  costly: { label: '✗ Costly', color: 'var(--warn)' },
  blunder: { label: '✗✗ Blunder', color: 'var(--bad)' },
};
const STRAT: Record<string, string> = { aggressive: 'All-out aggression', defensive: 'Defensive wall', balanced: 'Balanced', counter: 'Counter fighter', control: 'Control', highrisk: 'High risk' };

export function TitleChips({ titles }: { titles: Title[] }) {
  if (!titles.length) return null;
  return <span className="title-chips">{titles.map((t) => <span key={t.id} className={`title-chip ${t.tone}`} title={t.why}>{t.name}</span>)}</span>;
}

export function CoachReview({ record, g }: { record: BattleRecord; g: GameState }) {
  const battles = useApp((s) => s.battles);
  const [reviews, setReviews] = useState<SideReview[] | null>(null);
  // Calls are replayed from the exact moment they were made, which needs the engine the fight was recorded on.
  const humanSides = record.input.engineVersion !== ENGINE_VERSION ? [] : ([0, 1] as const).filter((s) => record.input.sides[s].coach === 'human');
  const names = Object.fromEntries(record.input.sides.flatMap((s) => [...s.fighters, ...(s.reserves ?? [])]).map((f) => [f.charId, f.name]));

  useEffect(() => {
    setReviews(null);
    if (!humanSides.length) return;
    let cancelled = false;
    const done: SideReview[] = [];
    const step = (i: number) => {
      if (cancelled || i >= humanSides.length) {
        if (!cancelled) {
          setReviews(done);
          for (const r of done) store.saveReview(record.battleId, record.input.sides[r.side].playerId, r.iq);
        }
        return;
      }
      done.push(reviewSide(record, humanSides[i], names));
      setTimeout(() => step(i + 1), 0);
    };
    const t = setTimeout(() => step(0), 120);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.battleId, record.result.hash]);

  if (!humanSides.length) return null;
  if (!reviews) return <div className="panel tight faint">Coach review: replaying every call you could have made…</div>;
  const pname = (side: 0 | 1) => g.players.find((p) => p.id === record.input.sides[side].playerId)?.name ?? '';

  return (
    <div className="col" style={{ gap: 10 }}>
      {reviews.map((r) => {
        const pid = record.input.sides[r.side].playerId;
        const titles = titlesFor(g, Object.values(battles), pid);
        return (
          <div key={r.side} className="panel tight col coach-review" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Coach review: {pname(r.side)}</h3>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <TitleChips titles={titles} />
                <span className="iq-badge" title="Coach IQ: 100 is average">IQ {r.iq}</span>
              </div>
            </div>
            {r.calls.length === 0 && <div className="faint">No corner moments for you this fight.</div>}
            {r.calls.map((c) => (
              <div key={c.corner} className="call-review">
                <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <div><span className="faint">Action {c.turn} · </span>{c.focus} {REASON[c.reason] ?? c.reason}. You chose <b>{c.chosen.label}</b>.</div>
                  <span style={{ color: VERDICT[c.verdict].color, fontWeight: 800, whiteSpace: 'nowrap' }}>{VERDICT[c.verdict].label}</span>
                </div>
                <div className="opt-bars">
                  {c.options.map((o) => (
                    <div key={o.label} className={`opt${o === c.chosen ? ' chosen' : ''}${o === c.best ? ' best' : ''}`}>
                      <span className="ol">{o.label}</span>
                      <span className="ob"><i style={{ width: `${Math.round(o.win * 100)}%` }} /></span>
                      <span className="op">{Math.round(o.win * 100)}%</span>
                    </div>
                  ))}
                </div>
                {c.verdict !== 'best' && c.verdict !== 'no difference' && <div className="faint" style={{ fontSize: 12 }}>Better: <b>{c.best.label}</b> would have won {Math.round(c.best.win * 100)}% of the time from there.</div>}
              </div>
            ))}
            {r.missed > 0 && <div className="faint" style={{ fontSize: 12 }}>{r.missed} corner moment{r.missed > 1 ? 's were' : ' was'} skipped (counted as "Let them fight").</div>}
            {r.strategy && (
              <div className="faint" style={{ fontSize: 13 }}>
                Strategy: <b style={{ color: 'var(--text)' }}>{STRAT[r.strategy.chosen]}</b> wins {Math.round(r.strategy.chosenWin * 100)}% with this lineup.
                {r.strategy.best !== r.strategy.chosen && r.strategy.bestWin - r.strategy.chosenWin > 0.05 ? <> <b style={{ color: 'var(--text)' }}>{STRAT[r.strategy.best]}</b> would win {Math.round(r.strategy.bestWin * 100)}%.</> : ' That was the right plan.'}
              </div>
            )}
            <div className="faint" style={{ fontSize: 11 }}>Each option was replayed from that exact moment with fresh luck, with no further calls. Win % is for {pname(r.side)}.</div>
          </div>
        );
      })}
    </div>
  );
}
