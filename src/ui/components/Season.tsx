import type { GameState } from '../../engine/game';
import { STAGE_LABEL, caps, nextFixture, table, type Fixture } from '../../engine/season';
import { PLAYER_MAP, displayName, store } from '../../store/store';

const team = (g: GameState, id: string) => g.franchises.find((f) => f.id === id)!;

function FixtureLine({ g, f }: { g: GameState; f: Fixture }) {
  const h = team(g, f.home); const a = team(g, f.away);
  const r = f.result;
  return (
    <div className="row between" style={{ fontSize: 14, gap: 8 }}>
      <span><span className="faint">{f.stage === 'league' ? f.id : STAGE_LABEL[f.stage]}</span> <b style={{ color: h.color }}>{h.short}</b> v <b style={{ color: a.color }}>{a.short}</b></span>
      <span className="faint">{r ? (r.winner ? `${team(g, r.winner).short} ${r.margin}` : r.margin) : 'to play'}</span>
    </div>
  );
}

/** Points table, the next fixture, results, and the cap races. */
export function SeasonPanel({ g }: { g: GameState }) {
  const s = g.season;
  if (!s) return null;
  const ids = g.franchises.map((f) => f.id);
  const rows = table(s, ids);
  const next = nextFixture(s);
  const c = caps(s);
  const played = s.fixtures.filter((f) => f.result);
  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <section className="panel tight col" style={{ gap: 8 }}>
        <div className="panel-head"><h3>Points table</h3><span className="faint">{played.length}/{s.fixtures.length} played</span></div>
        <div className="table-wrap"><table className="scorecard">
          <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>Pts</th><th>NRR</th></tr></thead>
          <tbody>{rows.map((r, i) => { const f = team(g, r.id); return (
            <tr key={r.id} style={i < (ids.length >= 4 ? 4 : 2) ? { background: 'rgba(255,182,39,.07)' } : undefined}>
              <td>{i + 1}</td><td><b style={{ color: f.color }}>{f.name}</b>{!f.npc && <span className="faint"> (you)</span>}</td>
              <td>{r.p}</td><td>{r.w}</td><td>{r.l}</td><td><b>{r.pts}</b></td><td>{r.nrr >= 0 ? '+' : ''}{r.nrr.toFixed(2)}</td>
            </tr>); })}</tbody>
        </table></div>
        <p className="faint" style={{ fontSize: 12, margin: 0 }}>Top {ids.length >= 4 ? 'four reach the playoffs: Qualifier 1 (1 v 2), Eliminator (3 v 4), Qualifier 2, Final' : 'two meet in the Final'}.</p>
      </section>
      <section className="panel tight col" style={{ gap: 8 }}>
        <span className="label">Next up</span>
        {next ? <FixtureLine g={g} f={next} /> : <span className="dim">Season complete</span>}
        <span className="label" style={{ marginTop: 6 }}>🟠 Orange Cap · 🟣 Purple Cap</span>
        <div className="row between" style={{ alignItems: 'start', fontSize: 13 }}>
          <div className="col" style={{ gap: 2 }}>{c.orange.slice(0, 3).map(([id, n]) => <span key={id}>{displayName(PLAYER_MAP[id])} <b>{n}</b></span>)}{!c.orange.length && <span className="faint">No runs yet</span>}</div>
          <div className="col" style={{ gap: 2, textAlign: 'right' }}>{c.purple.slice(0, 3).map(([id, n]) => <span key={id}>{displayName(PLAYER_MAP[id])} <b>{n}</b></span>)}{!c.purple.length && <span className="faint">No wickets yet</span>}</div>
        </div>
        {played.length > 0 && <><span className="label" style={{ marginTop: 6 }}>Results</span>{played.slice(-5).reverse().map((f) => <FixtureLine key={f.id} g={g} f={f} />)}</>}
      </section>
    </div>
  );
}

/** End of the season: the trophy, the final table and the caps. */
export function Champion({ g }: { g: GameState }) {
  const s = g.season!;
  const champ = team(g, s.champion!);
  const c = caps(s);
  return (
    <div className="col" style={{ maxWidth: 900, margin: '0 auto' }}>
      <section className="panel result-hero" style={{ ['--team' as string]: champ.color }}>
        <span className="label">Champions</span>
        <div style={{ fontSize: 64 }} aria-hidden="true">🏆</div>
        <h1>{champ.name}</h1>
        <p className="dim" style={{ fontSize: 18 }}>{champ.npc ? 'The computer takes the trophy this time.' : `${champ.owners.map((o) => g.config.humans.find((h) => h.id === o)?.name).join(' & ')} lift the trophy!`}</p>
        <div className="row" style={{ justifyContent: 'center', gap: 30 }}>
          {c.orange[0] && <span>🟠 Orange Cap: <b>{displayName(PLAYER_MAP[c.orange[0][0]])}</b> ({c.orange[0][1]} runs)</span>}
          {c.purple[0] && <span>🟣 Purple Cap: <b>{displayName(PLAYER_MAP[c.purple[0][0]])}</b> ({c.purple[0][1]} wickets)</span>}
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => store.quit()}>New game</button>
        </div>
      </section>
      <SeasonPanel g={g} />
    </div>
  );
}
