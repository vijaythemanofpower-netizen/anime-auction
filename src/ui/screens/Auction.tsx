import { useEffect, useState } from 'react';
import { PLAYER_MAP, displayName, store } from '../../store/store';
import type { GameState } from '../../engine/game';
import { bidBlock, squadOf } from '../../engine/auction';
import { ctxOf } from '../../engine/game';
import { RULES, fmtL, needs, nextBid, counts } from '../../engine/squad';
import { FORM_LABEL } from '../../engine/types';
import { Bars, Modal, useNow } from '../components/common';
import { Chips, PlayerLine, Portrait, skillRows } from '../components/Player';

export function Auction({ g }: { g: GameState }) {
  const now = useNow(200);
  useEffect(() => { const t = setInterval(() => store.tick(), 200); return () => clearInterval(t); }, []);
  const [scoutFor, setScoutFor] = useState<string | null>(null);
  const a = g.auction;
  const live = a.live;
  const ctx = ctxOf(g, PLAYER_MAP);
  const r = RULES[g.config.mode];
  const humans = g.franchises.filter((f) => !f.npc);
  const nameOf = (fid: string | null) => g.franchises.find((f) => f.id === fid)?.name ?? '';
  const owners = (fid: string) => g.franchises.find((f) => f.id === fid)!.owners.map((o) => g.config.humans.find((h) => h.id === o)?.name).join(' & ');

  const lotNo = a.index;
  const total = a.queue.length;
  const c = live ? PLAYER_MAP[live.lot.id] : null;
  const mystery = !!live?.lot.mystery;
  const left = live ? Math.max(0, (live.endsAt - now) / 1000) : 0;
  const frac = live ? Math.min(1, left / a.timer) : 0;
  const knownForm = (fid: string, id: string) => g.franchises.find((f) => f.id === fid)?.scouted.includes(id);
  const myScouted = c ? humans.find((f) => knownForm(f.id, c.id)) : undefined;
  const last = a.last;
  const showHammer = !live && last && now < a.gapUntil;
  const lastC = last ? PLAYER_MAP[last.id] : null;

  return (
    <div className="col">
      <div className="row between">
        <div>
          <span className="label">Auction · {live ? live.lot.set : 'Next lot'} · lot {Math.min(lotNo, total)} of {total}</span>
          <h1>The auction</h1>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => store.hammer()} disabled={!live}>Hammer now</button>
          <button className="btn sm ghost" onClick={() => { if (confirm('Let the computer bid for everyone and finish the auction now?')) store.simulateRest(); }}>Finish auction automatically</button>
        </div>
      </div>

      <div className="auction">
        <section className="panel lot" aria-live="polite">
          {showHammer && lastC && (
            <div className="hammer">
              <div className="col" style={{ alignItems: 'center', gap: 12 }}>
                <span className="stamp" style={{ color: last.to ? 'var(--gold)' : 'var(--text-faint)' }}>{last.to ? 'Sold!' : 'Unsold'}</span>
                <div style={{ fontSize: 18 }}>
                  {last.mystery && <div className="label" style={{ color: 'var(--accent)' }}>Mystery lot revealed</div>}
                  <b>{displayName(lastC)}</b>{last.to ? <> to <b style={{ color: g.franchises.find((f) => f.id === last.to)?.color }}>{nameOf(last.to)}</b> for <b className="gold">{fmtL(last.price)}</b></> : ' — back later at a lower price'}
                </div>
              </div>
            </div>
          )}
          {live && c ? (
            <>
              <div className="lot-head">
                {mystery ? <div className="portrait lg" style={{ display: 'grid', placeItems: 'center', background: 'var(--surface-3)' }}><span style={{ fontFamily: 'var(--font-display)', fontSize: 64, color: 'var(--accent)' }}>?</span></div> : <Portrait c={c} size="lg" editable />}
                <div className="col grow" style={{ gap: 8 }}>
                  <span className="label">{live.lot.set}{live.lot.set === 'Second chance' ? ' · reduced base' : ''}</span>
                  <div className="lot-name">{mystery ? 'Mystery lot' : displayName(c)}</div>
                  {mystery ? <p className="dim">A hidden player. Could be a star, could be a flop. Revealed when the hammer falls.</p> : <Chips c={c} form={myScouted ? g.form[c.id] : undefined} />}
                  {!mystery && <div className="dim" style={{ fontSize: 14 }}>{c.country} · age {c.age} · bats {c.bats === 'L' ? 'left' : 'right'} · {c.temper}</div>}
                </div>
              </div>
              {!mystery && <div style={{ marginTop: 16 }}><Bars rows={skillRows(c)} /></div>}
              {!mystery && <div className="row" style={{ marginTop: 10 }}>
                <span className="dim" style={{ fontSize: 13 }}>Form this season: {myScouted ? <b>{FORM_LABEL[g.form[c.id]]}</b> : 'hidden'}</span>
                {humans.some((f) => f.scouts > 0 && !knownForm(f.id, c.id)) && <button className="btn sm ghost" onClick={() => setScoutFor(c.id)}>Use a scout token</button>}
              </div>}
              <div className="lot-bid">
                <div>
                  <div className="label">{live.bidder ? `Highest bid · ${nameOf(live.bidder)}` : `Base price`}</div>
                  <div className="big-num">{fmtL(live.bid || live.lot.base)}</div>
                </div>
                <div className={`timer ${left < 3 ? 'low' : ''}`} role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
                  <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="none" stroke="var(--surface-3)" strokeWidth="3" /><circle cx="18" cy="18" r="16" fill="none" stroke={left < 3 ? 'var(--bad)' : 'var(--accent)'} strokeWidth="3" strokeDasharray={`${frac * 100.5} 100.5`} strokeLinecap="round" /></svg>
                  <b>{Math.ceil(left)}</b>
                </div>
              </div>
              <div className="bidders">
                {humans.map((f) => {
                  const block = bidBlock(ctx, a, f.id);
                  const amt = nextBid(live.bid, live.lot.base);
                  return (
                    <button key={f.id} className="bid-btn" style={{ ['--team' as string]: f.color }} disabled={!!block} onClick={() => store.bid(f.id)} title={block ?? undefined}>
                      <b>{live.bidder === f.id ? 'Leading' : `Bid ${fmtL(amt)}`}</b>
                      <small>{f.name}{f.owners.length > 1 || humans.length > 1 ? ` · ${owners(f.id)}` : ''}</small>
                      {block && live.bidder !== f.id && <small style={{ color: 'var(--warn)' }}>{block}</small>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : !showHammer && <p className="dim">Next lot coming up…</p>}
        </section>

        <aside className="col">
          <div className="teams">
            {g.franchises.map((f) => {
              const sq = squadOf(ctx, f);
              const cn = counts(sq);
              const nd = needs(sq, r);
              return (
                <div key={f.id} className={`team-row ${live?.bidder === f.id ? 'lead' : ''}`} style={{ ['--team' as string]: f.color }}>
                  <span className="swatch" />
                  <div className="col" style={{ gap: 4, minWidth: 0 }}>
                    <div className="row" style={{ gap: 6 }}><b>{f.name}</b>{f.npc ? <span className="chip">{f.boss ? 'Boss NPC' : 'Computer'}</span> : <span className="faint" style={{ fontSize: 13 }}>{owners(f.id)}</span>}</div>
                    <div className="faint" style={{ fontSize: 12 }}>{cn.total}/{r.size} players · {cn.overseas} overseas · {f.scouts} scouts</div>
                    {nd.length > 0 && <div className="row" style={{ gap: 4 }}>{nd.slice(0, 4).map((x) => <span key={x.key} className="chip need">{x.missing} {x.label.toLowerCase()}</span>)}</div>}
                  </div>
                  <div className="num gold" style={{ fontSize: 20, fontWeight: 700 }}>{fmtL(f.purse)}</div>
                </div>
              );
            })}
          </div>
          <section className="panel tight">
            <div className="panel-head"><h3>Hammer log</h3><span className="faint">{a.sold.length} sold</span></div>
            <div className="feed">
              {a.sold.slice().reverse().slice(0, 30).map((s) => (
                <PlayerLine key={s.id} c={PLAYER_MAP[s.id]} right={<span className="num" style={{ color: g.franchises.find((f) => f.id === s.to)?.color, fontWeight: 700 }}>{fmtL(s.price)}</span>} />
              ))}
              {!a.sold.length && <p className="faint">Nobody bought yet.</p>}
            </div>
          </section>
        </aside>
      </div>

      {scoutFor && (
        <Modal title="Scout this player" onClose={() => setScoutFor(null)}>
          <p className="dim">Spend a scout token to see {displayName(PLAYER_MAP[scoutFor])}'s hidden form for this season. Only your franchise learns it.</p>
          <div className="col" style={{ gap: 8 }}>
            {humans.filter((f) => f.scouts > 0 && !knownForm(f.id, scoutFor)).map((f) => (
              <button key={f.id} className="btn" onClick={() => { store.scout(f.id, scoutFor); setScoutFor(null); }}>{f.name}: use 1 of {f.scouts}</button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
