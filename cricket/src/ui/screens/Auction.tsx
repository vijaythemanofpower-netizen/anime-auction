import { useEffect, useState } from 'react';
import { PLAYER_MAP, canAct, displayName, store, useApp } from '../../store/store';
import type { GameState } from '../../engine/game';
import { RTM_SECONDS, bidBlock, squadOf } from '../../engine/auction';
import { ctxOf } from '../../engine/game';
import { RULES, fmtL, needs, nextBid, counts } from '../../engine/squad';
import { FORM_LABEL } from '../../engine/types';
import { Bars, Modal, useNow } from '../components/common';
import { askConfirm } from '../components/common';
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
  const guest = useApp((s) => s.online.role === 'guest');
  const nameOf = (fid: string | null) => g.franchises.find((f) => f.id === fid)?.name ?? '';
  const owners = (fid: string) => g.franchises.find((f) => f.id === fid)!.owners.map((o) => g.config.humans.find((h) => h.id === o)?.name).join(' & ');

  const lotNo = a.index;
  const total = a.queue.length;
  const c = live ? PLAYER_MAP[live.lot.id] : null;
  const mystery = !!live?.lot.mystery;
  const rtm = live?.rtm;
  const left = live ? Math.max(0, ((rtm ? rtm.endsAt : live.endsAt) - now) / 1000) : 0;
  const frac = live ? Math.min(1, left / (rtm ? RTM_SECONDS : a.timer)) : 0;
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
          {!guest && <button className="btn sm" onClick={() => store.hammer()} disabled={!live}>Hammer now</button>}
          {!guest && <button className="btn sm ghost" onClick={() => { void askConfirm({ title: 'Finish the auction?', body: 'The computer bids for every team, including yours, until the auction ends.', ok: 'Finish it' }).then((y) => { if (y) store.simulateRest(); }); }}>Finish auction automatically</button>}
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
                  <b>{displayName(lastC)}</b>{last.to ? <> to <b style={{ color: g.franchises.find((f) => f.id === last.to)?.color }}>{nameOf(last.to)}</b> for <b className="gold">{fmtL(last.price)}</b></> : g.config.mode === 'ipl' ? ' — teams may bring them back in the accelerated round' : ' — back later at a lower price'}
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
                {humans.some((f) => canAct(f.id) && f.scouts > 0 && !knownForm(f.id, c.id)) && <button className="btn sm ghost" onClick={() => setScoutFor(c.id)}>Use a scout token</button>}
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
              {rtm && <RtmPanel g={g} />}
              <div className="bidders" hidden={!!rtm}>
                {humans.filter((f) => canAct(f.id)).map((f) => {
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
          ) : a.accel?.stage === 'nominate' ? <Nominate g={g} now={now} /> : !showHammer && <p className="dim">Next lot coming up…</p>}
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
                    <div className="faint" style={{ fontSize: 12 }}>{cn.total}/{r.minSize ? `${r.minSize}-${r.size}` : r.size} players · {cn.overseas}/{r.maxOverseas} overseas · {f.scouts} scouts{f.rtm ? ` · ${f.rtm.cards} RTM` : ''}</div>
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
            {humans.filter((f) => canAct(f.id) && f.scouts > 0 && !knownForm(f.id, scoutFor)).map((f) => (
              <button key={f.id} className="btn" onClick={() => { store.scout(f.id, scoutFor); setScoutFor(null); }}>{f.name}: use 1 of {f.scouts}</button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}


/** IPL Right to Match: the old team decides, the winning bidder gets one final raise, then the old team may match. */
function RtmPanel({ g }: { g: GameState }) {
  const live = g.auction.live!;
  const r = live.rtm!;
  const holder = g.franchises.find((f) => f.id === r.fid)!;
  const bidder = g.franchises.find((f) => f.id === live.bidder)!;
  const raises = [1, 2, 3].reduce<number[]>((xs) => [...xs, nextBid(xs[xs.length - 1] ?? live.bid, live.lot.base)], []);
  const text = r.stage === 'ask' ? `${holder.name} can use a Right to Match card.`
    : r.stage === 'raise' ? `${holder.name} called RTM. ${bidder.name} gets one final raise.`
      : r.stage === 'match' ? `${holder.name}: match ${fmtL(live.bid)} to take the player back?` : 'Deciding…';
  return (
    <div className="rtm-panel col" style={{ ['--team' as string]: holder.color }}>
      <span className="label" style={{ color: 'var(--accent)' }}>Right to Match</span>
      <b>{text}</b>
      {(r.stage === 'ask' || r.stage === 'match') && canAct(holder.id) && (
        <div className="row">
          <button className="btn primary" onClick={() => store.rtm(holder.id, true)}>{r.stage === 'ask' ? 'Use RTM' : `Match ${fmtL(live.bid)}`}</button>
          <button className="btn ghost" onClick={() => store.rtm(holder.id, false)}>{r.stage === 'ask' ? 'No' : 'Let it go'}</button>
        </div>
      )}
      {r.stage === 'raise' && canAct(bidder.id) && (
        <div className="row">
          {raises.map((x) => <button key={x} className="btn" onClick={() => store.finalRaise(bidder.id, x)}>Raise to {fmtL(x)}</button>)}
          <button className="btn ghost" onClick={() => store.finalRaise(bidder.id, live.bid)}>Keep {fmtL(live.bid)}</button>
        </div>
      )}
    </div>
  );
}

/** IPL accelerated round: pick up to 5 unsold players to bring back. */
function Nominate({ g, now }: { g: GameState; now: number }) {
  const a = g.auction;
  const mine = g.franchises.filter((f) => !f.npc && canAct(f.id) && !a.accel!.picks[f.id]);
  const [picks, setPicks] = useState<string[]>([]);
  const left = Math.max(0, Math.ceil((a.accel!.endsAt - now) / 1000));
  const list = a.unsold.map((id) => PLAYER_MAP[id]).sort((x, y) => y.tier - x.tier);
  if (!mine.length) return <p className="dim">Accelerated round: waiting for the other teams to nominate… ({left} s)</p>;
  return (
    <div className="col" style={{ gap: 10 }}>
      <span className="label" style={{ color: 'var(--accent)' }}>Accelerated round · {left} s</span>
      <h3>Bring back up to 5 unsold players</h3>
      <p className="dim" style={{ margin: 0 }}>Every team's picks go up again, faster, at their base price. Players nobody nominates are out.</p>
      <div className="nominate-list">
        {list.map((c) => (
          <label key={c.id} className="check"><input type="checkbox" checked={picks.includes(c.id)} disabled={!picks.includes(c.id) && picks.length >= 5}
            onChange={(e) => setPicks(e.target.checked ? [...picks, c.id] : picks.filter((x) => x !== c.id))} /><span>{displayName(c)} <small className="faint">{c.role} · {fmtL(c.basePrice)}</small></span></label>
        ))}
        {!list.length && <p className="faint">Nobody is left unsold.</p>}
      </div>
      <div className="row">{mine.map((f) => <button key={f.id} className="btn primary" onClick={() => store.nominate(f.id, picks)}>Nominate {picks.length} for {f.name}</button>)}</div>
    </div>
  );
}
