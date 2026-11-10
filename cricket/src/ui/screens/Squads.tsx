import { useState } from 'react';
import { PLAYER_MAP, canAct, displayName, store } from '../../store/store';
import { autoLineup, lineupProblems, retainable, retentionCost, retentionProblem, ROLE_LABEL, type GameState, type Lineup } from '../../engine/game';
import { PLAYERS } from '../../engine/data/players';
import { RULES, fmtL } from '../../engine/squad';
import type { Plan } from '../../engine/match';
import { PlayerLine } from '../components/Player';
import { Seg } from '../components/common';
import { SeasonPanel } from '../components/Season';
import { STAGE_LABEL, nextFixture } from '../../engine/season';

const ownersOf = (g: GameState, fid: string) => g.franchises.find((f) => f.id === fid)!.owners.map((o) => g.config.humans.find((h) => h.id === o)?.name ?? '');

export function Reveal({ g }: { g: GameState }) {
  return (
    <div className="col">
      <div>
        <span className="label">The hammer has fallen</span>
        <h1>Squads and form</h1>
        <p className="dim">Hidden form is now revealed. Compulsory slots left empty were filled at double price.</p>
      </div>
      <div className="grid2">
        {g.franchises.map((f) => {
          const spent = f.startPurse - f.purse;
          const pen = f.penalties.filter((p) => p.doubled);
          return (
            <section key={f.id} className="panel col" style={{ borderTop: `3px solid ${f.color}`, gap: 10 }}>
              <div className="panel-head" style={{ marginBottom: 0 }}>
                <div><h3>{f.name}</h3><span className="faint" style={{ fontSize: 13 }}>{f.npc ? (f.boss ? 'Boss NPC' : 'Computer') : ownersOf(g, f.id).join(' & ')}</span></div>
                <div style={{ textAlign: 'right' }}><div className="num gold" style={{ fontSize: 20, fontWeight: 700 }}>{fmtL(spent)}</div><div className="faint" style={{ fontSize: 12 }}>spent · {fmtL(f.purse)} left</div></div>
              </div>
              {pen.length > 0 && <p style={{ fontSize: 13 }} className="bad">Penalty: {pen.length} compulsory slot{pen.length > 1 ? 's' : ''} filled at double price ({fmtL(pen.reduce((s, p) => s + p.price, 0))}).</p>}
              <div className="squad-list">
                {f.squad.map((id) => {
                  const p = f.penalties.find((x) => x.id === id);
                  return <PlayerLine key={id} c={PLAYER_MAP[id]} form={g.form[id]} price={f.paid[id]} right={p ? <span className={`chip ${p.doubled ? 'need' : ''}`}>{p.doubled ? 'Penalty x2' : g.config.mode === 'quick' ? 'Shared' : 'Filled'}</span> : undefined} />;
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary lg" onClick={() => store.toPrep()}>Pick your playing XI</button>
      </div>
    </div>
  );
}

export function Prep({ g }: { g: GameState }) {
  const humans = g.franchises.filter((f) => !f.npc);
  const mineH = humans.filter((h) => canAct(h.id));
  const [tab, setTab] = useState(mineH[0]?.id ?? humans[0]?.id ?? g.franchises[0].id);
  const next = g.season ? nextFixture(g.season) : undefined;
  const f = g.franchises.find((x) => x.id === tab)!;
  const l = g.lineups[f.id];
  const r = RULES[g.config.mode];
  const problems = l ? lineupProblems(l, PLAYER_MAP, r.maxOverseasXI) : [];
  const allOk = humans.every((h) => lineupProblems(g.lineups[h.id], PLAYER_MAP, r.maxOverseasXI).length === 0);
  const nextHuman = g.season?.fixtures.find((x) => !x.result && humans.some((h) => h.id === x.home || h.id === x.away));
  const vs = nextHuman ? g.franchises.find((x) => x.id === (humans.some((h) => h.id === nextHuman.home) ? nextHuman.away : nextHuman.home)) : undefined;
  const set = (next: Partial<Lineup>) => {
    const merged = { ...l, ...next };
    const squad = f.squad;
    merged.bench = squad.filter((id) => !merged.xi.includes(id));
    if (!merged.xi.includes(merged.captain)) merged.captain = merged.xi[0] ?? '';
    if (!merged.xi.includes(merged.keeper)) merged.keeper = merged.xi.find((id) => PLAYER_MAP[id].role === 'keeper') ?? merged.xi[0] ?? '';
    merged.bowlers = merged.bowlers.filter((id) => merged.xi.includes(id));
    store.setLineup(f.id, merged);
  };
  const toggle = (id: string) => set({ xi: l.xi.includes(id) ? l.xi.filter((x) => x !== id) : l.xi.length < 11 ? [...l.xi, id] : l.xi });
  const move = (id: string, d: number) => {
    const i = l.xi.indexOf(id); const j = i + d;
    if (j < 0 || j >= l.xi.length) return;
    const xi = l.xi.slice(); [xi[i], xi[j]] = [xi[j], xi[i]];
    set({ xi });
  };
  const roles = (o: string) => (g.roles[o] ?? []).map((x) => ROLE_LABEL[x]).join(', ');

  return (
    <div className="col">
      <div className="row between">
        <div><span className="label">The season{next && next.stage !== 'league' ? ` · ${STAGE_LABEL[next.stage]}` : ''}</span><h1>Pick your XI</h1></div>
        <div className="row">
          {vs ? <span className="dim">Next: <b style={{ color: vs.color }}>v {vs.name}</b>{nextHuman && nextHuman.stage !== 'league' ? ` (${STAGE_LABEL[nextHuman.stage]})` : ''}</span> : <span className="dim">You are out. Watch the rest of the season.</span>}
          <button className="btn primary" disabled={!allOk} onClick={() => store.playNext()}>{vs ? 'To the ground' : 'Simulate to the end'}</button>
        </div>
      </div>
      <SeasonPanel g={g} />
      {mineH.length > 1 && <div className="seg" role="tablist" aria-label="Franchise">{mineH.map((h) => <button key={h.id} role="tab" aria-pressed={tab === h.id} onClick={() => setTab(h.id)}>{h.name}</button>)}</div>}

      {f.owners.length > 1 && <p className="dim" style={{ fontSize: 14 }}>Captain roles: {f.owners.map((o) => `${g.config.humans.find((h) => h.id === o)?.name} (${roles(o)})`).join(' · ')}</p>}

      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="panel col" style={{ borderTop: `3px solid ${f.color}`, gap: 10 }}>
          <div className="panel-head" style={{ marginBottom: 0 }}><h3>Batting order</h3><span className="faint">{l.xi.length}/11</span></div>
          <div className="squad-list">
            {l.xi.map((id, i) => (
              <div key={id} className="squad-item in">
                <span className="order-num">{i + 1}</span>
                <PlayerLine c={PLAYER_MAP[id]} form={g.form[id]} right={<span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  {l.captain === id && <span className="chip" title="Captain">C</span>}
                  {l.keeper === id && <span className="chip" title="Wicketkeeper">WK</span>}
                </span>} />
                <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <button className="icon-btn" aria-label={`Move ${displayName(PLAYER_MAP[id])} up`} disabled={i === 0} onClick={() => move(id, -1)}>↑</button>
                  <button className="icon-btn" aria-label={`Move ${displayName(PLAYER_MAP[id])} down`} disabled={i === l.xi.length - 1} onClick={() => move(id, 1)}>↓</button>
                  <button className="icon-btn" aria-label={`Drop ${displayName(PLAYER_MAP[id])}`} onClick={() => toggle(id)}>✕</button>
                </span>
              </div>
            ))}
          </div>
          {problems.map((p) => <p key={p} className="bad" style={{ fontSize: 13 }}>{p}</p>)}
        </section>

        <section className="col">
          <div className="panel col" style={{ gap: 12 }}>
            <h3>Game plan</h3>
            <Seg<Plan> label="Game plan" value={l.plan} onChange={(plan) => set({ plan })} options={[{ value: 'aggressive', label: 'Aggressive' }, { value: 'balanced', label: 'Balanced' }, { value: 'defensive', label: 'Defensive' }]} />
            <div className="grid2" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <label className="field"><span>Captain</span><select value={l.captain} onChange={(e) => set({ captain: e.target.value })}>{l.xi.map((id) => <option key={id} value={id}>{displayName(PLAYER_MAP[id])}</option>)}</select></label>
              <label className="field"><span>Wicketkeeper</span><select value={l.keeper} onChange={(e) => set({ keeper: e.target.value })}>{l.xi.map((id) => <option key={id} value={id}>{displayName(PLAYER_MAP[id])}</option>)}</select></label>
            </div>
            <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => store.setLineup(f.id, { ...autoLineup(f.squad.map((id) => PLAYER_MAP[id]), g.form, r.maxOverseasXI), plan: l.plan })}>Let the coach pick</button>
          </div>
          <div className="panel col" style={{ gap: 8 }}>
            <div className="panel-head" style={{ marginBottom: 0 }}><h3>Bench</h3><span className="faint">Impact Player and substitutes</span></div>
            <div className="squad-list">
              {f.squad.filter((id) => !l.xi.includes(id)).map((id) => (
                <div key={id} className="squad-item">
                  <span className="order-num">·</span>
                  <PlayerLine c={PLAYER_MAP[id]} form={g.form[id]} />
                  <button className="btn sm" disabled={l.xi.length >= 11} onClick={() => toggle(id)}>Add</button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="row between">
        <span className="faint" style={{ fontSize: 13 }}>Pitch, weather and the toss are revealed at the ground.</span>
        <button className="btn primary lg" disabled={!allOk} onClick={() => store.playNext()}>{vs ? 'To the ground' : 'Simulate to the end'}</button>
      </div>
    </div>
  );
}


/** IPL retentions: keep up to 6 of your previous players at the official costs, before the auction. */
export function Retain({ g }: { g: GameState }) {
  const mine = g.franchises.filter((f) => !f.npc && canAct(f.id) && !g.retainDone?.includes(f.id));
  const [tab, setTab] = useState(mine[0]?.id);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const f = mine.find((x) => x.id === tab) ?? mine[0];
  if (!f) return <div className="col"><span className="label">Retentions</span><h1>Waiting for the other teams…</h1><p className="dim">The auction starts when every team has chosen its retentions.</p></div>;
  const ids = picked[f.id] ?? [];
  const cost = retentionCost(ids, PLAYER_MAP);
  const total = cost.reduce((x, y) => x + y, 0);
  const problem = retentionProblem(f, ids, PLAYERS);
  const list = retainable(f, PLAYERS).sort((x, y) => y.tier - x.tier);
  const toggle = (id: string) => setPicked({ ...picked, [f.id]: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  return (
    <div className="col">
      <div><span className="label">Before the auction · Retentions</span><h1>Keep your core</h1>
        <p className="dim">{f.name} can keep up to 6 of last season's players: at most 5 capped and 2 uncapped. Capped players cost ₹18 Cr, ₹14 Cr, ₹11 Cr, ₹18 Cr and ₹14 Cr in the order you pick them; uncapped ₹4 Cr each. Every slot you don't use becomes a Right to Match card for the auction.</p></div>
      {mine.length > 1 && <div className="seg" role="tablist" aria-label="Franchise">{mine.map((x) => <button key={x.id} role="tab" aria-pressed={x.id === f.id} onClick={() => setTab(x.id)}>{x.name}</button>)}</div>}
      <section className="panel col" style={{ gap: 8 }}>
        <div className="row between"><b>{ids.length}/6 retained · {fmtL(total)}</b><span className="dim">Purse after: <b className="gold">{fmtL(f.purse - total)}</b> · RTM cards: {6 - ids.length}</span></div>
        {problem && ids.length > 0 && <p style={{ color: 'var(--warn)', margin: 0 }}>{problem}</p>}
        <div className="squad-list">
          {list.map((c) => {
            const at = ids.indexOf(c.id);
            return (
              <button key={c.id} className={`squad-item ${at >= 0 ? 'in' : ''}`} style={{ textAlign: 'left', color: 'inherit', cursor: 'pointer' }} onClick={() => toggle(c.id)} aria-pressed={at >= 0}>
                <PlayerLine c={c} right={<span className="chip">{at >= 0 ? fmtL(cost[at]) : c.uncapped ? 'Uncapped' : 'Capped'}</span>} />
              </button>
            );
          })}
          {!list.length && <p className="faint">No previous players for this team.</p>}
        </div>
      </section>
      <div className="row between">
        <span className="dim">Players you don't keep go into the auction.</span>
        <button className="btn primary lg" disabled={!!problem} onClick={() => store.retain(f.id, ids)}>{ids.length ? `Retain ${ids.length} and continue` : 'Retain nobody'}</button>
      </div>
    </div>
  );
}
