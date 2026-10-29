import { useApp, store } from '../../store/store';
import type { HallEntry } from '../../engine/types';

const ICON: Record<HallEntry['category'], string> = {
  champion: '♛', finalist: '✦', upset: '⚡', comeback: '↺', mvp: '★', expensive: '◈', value: '◇', rivalry: '⚔', streak: '🔥', battle: '✺',
};
const ORDER: HallEntry['category'][] = ['champion', 'finalist', 'upset', 'comeback', 'mvp', 'expensive', 'value', 'rivalry', 'streak', 'battle'];
const TITLES: Record<HallEntry['category'], string> = {
  champion: 'Champions', finalist: 'Finalists', upset: 'Biggest Upsets', comeback: 'Best Comebacks', mvp: 'Most Valuable Fighters',
  expensive: 'Most Expensive Purchases', value: 'Best-Value Purchases', rivalry: 'Longest Rivalries', streak: 'Winning Streaks', battle: 'Historic Battles',
};

export function Hall() {
  const hall = useApp((s) => s.hall);
  const groups = ORDER.map((c) => ({ c, items: hall.filter((h) => h.category === c) })).filter((g) => g.items.length);
  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="section-head">
        <div><div className="eyebrow">Records from finished tournaments</div><h1>Hall of Legends</h1></div>
        <button className="btn primary" onClick={() => store.go('setup')}>Start a new legend</button>
      </div>
      {!hall.length && <div className="panel empty">No legends yet. Finish a tournament and its champions, upsets and record purchases will be enshrined here.</div>}
      {groups.map((g) => (
        <div key={g.c}>
          <h3 style={{ marginBottom: 10 }}>{TITLES[g.c]}</h3>
          <div className="grid grid-2">
            {g.items.slice(0, 8).map((h) => (
              <div key={h.id} className="panel hall-card">
                <div className="hall-icon" aria-hidden="true">{ICON[h.category]}</div>
                <div>
                  <strong>{h.title}</strong>
                  <div className="muted" style={{ fontSize: 14 }}>{h.detail}</div>
                  <div className="faint">{h.gameName} · {new Date(h.at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
