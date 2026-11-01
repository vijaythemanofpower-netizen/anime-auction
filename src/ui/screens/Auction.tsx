import { BadgeChips, useBadges } from '../components/Badges';
import { useEffect, useState } from 'react';
import type { GameState, Player } from '../../engine/types';
import * as A from '../../engine/auction';
import * as G from '../../engine/game';
import { store, useApp } from '../../store/store';
import { CharArt } from '../components/Portrait';
import { Coins, Emblem, Modal, PlayerChip, PrivacyGate, PublicProfile, SourceBadge, TagChip } from '../components/common';

function useNow(interval = 200) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(t); }, [interval]);
  return now;
}

/** Drives timers, NPC bidding and auto-advance. */
function useAuctionDriver(g: GameState) {
  const lot = g.auction?.lot;
  const lotKey = `${lot?.lotNumber}-${lot?.status}-${lot?.bids.length}-${lot?.passed.length}-${lot?.activePlayerId}`;
  useEffect(() => {
    const t = setInterval(() => store.tick((d) => A.tick(d, Date.now())), 250);
    return () => clearInterval(t);
  }, []);
  // NPCs think for a moment, then act through the validated bid path.
  useEffect(() => {
    if (!lot || lot.status !== 'open') return;
    const npcs = g.players.filter((p) => p.kind === 'npc' && !lot.passed.includes(p.id));
    if (!npcs.length) return;
    const delay = 900 + Math.random() * 1600;
    const t = setTimeout(() => {
      const order = g.auction!.config.mode === 'turns' ? npcs.filter((p) => p.id === lot.activePlayerId) : npcs.sort(() => Math.random() - 0.5);
      for (const p of order) {
        let acted = false;
        store.tick((d) => (acted = G.npcAct(d, p.id, Date.now())));
        if (acted) break;
      }
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotKey]);
  // Auto-advance after the sold animation.
  useEffect(() => {
    if (!lot || lot.status === 'open') return;
    const t = setTimeout(() => store.act((d) => G.advanceLot(d, Date.now()), { silent: true }), 3200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotKey]);
}

export function AuctionPhase() {
  const g = useApp((s) => s.game)!;
  const viewer = useApp((s) => s.viewer);
  const now = useNow();
  const [profile, setProfile] = useState(false);
  const [advisorFor, setAdvisorFor] = useState<string | null>(null);
  useAuctionDriver(g);
  const a = g.auction!;
  const lot = a.lot;
  if (!lot) return <div className="panel empty"><div className="spinner" /><p>Preparing next lot…</p></div>;
  const c = g.characters[lot.charId];
  const lead = A.leader(lot);
  const leadP = lead ? g.players.find((p) => p.id === lead.playerId) : null;
  const min = A.minNextBid(lot, a.config);
  const remaining = Math.max(0, lot.deadline - now);
  const totalMs = a.config.mode === 'live' ? Math.max(a.config.timerSeconds, a.config.antiSnipeSeconds) * 1000 : a.config.timerSeconds * 1000;
  const urgent = remaining < 5000 && lot.status === 'open';
  const sold = lot.status !== 'open';
  const humans = g.players.filter((p) => store.isLocalPlayer(p));
  const guest = store.isGuest();
  const active = lot.activePlayerId ? g.players.find((p) => p.id === lot.activePlayerId) : null;

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="section-head">
        <div>
          <div className="eyebrow">Lot #{lot.lotNumber} · {a.queue.length} remaining in queue · {A.totalSlotsRemaining(g)} open roster slots{lot.attempt > 1 ? ' · second chance' : ''}</div>
          <h2>The Auction Floor</h2>
        </div>
        <div className="faint">{a.config.mode === 'live' ? 'Live bidding — late bids extend the clock.' : 'Turn-based bidding — pass the device to the active bidder.'}</div>
      </div>
      {a.notice && <div className="panel" style={{ borderColor: 'var(--warn)' }}>⚖ Director: {a.notice}</div>}

      <div className="lot-stage">
        {/* A new lot arrives like an anime title card: number, name and series cut across the stage. */}
        <div className="lot-intro" key={`intro-${lot.lotNumber}-${lot.attempt}`} aria-hidden="true">
          <span className="li-no">LOT {String(lot.lotNumber).padStart(2, '0')}</span>
          <span className="li-name">{c.name}</span>
          <span className="li-series">{c.series}</span>
        </div>
        <div className="col">
          <div className={`lot-art${sold ? '' : ' reveal-anim'}`} key={lot.lotNumber}>
            <CharArt c={c} />
            {sold && (
              <div className="sold-stamp">
                <span>{lot.status === 'sold' ? 'SOLD' : lot.status === 'assigned' ? 'ASSIGNED' : 'NO SALE'}</span>
              </div>
            )}
          </div>
          <div className="panel tight col" style={{ gap: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{c.name}</h3><SourceBadge c={c} /></div>
            <div className="faint">{c.archetype} · {c.series} · {c.weapon}</div>
            <div className="row" style={{ gap: 4 }}>{c.tags.map((t) => <TagChip key={t} t={t} />)}</div>
            <button className="btn sm" onClick={() => setProfile(true)}>Full public profile</button>
          </div>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <div className="panel col" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div className="label">{lead ? 'Current bid' : 'Opening bid'}</div>
                <div className="bid-big" aria-live="polite" key={lead?.amount ?? 'open'}>{(lead?.amount ?? a.config.openingBid).toLocaleString()}</div>
                <div className="muted">{leadP ? <>Leading: <PlayerChip p={leadP} /></> : 'No bids yet'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="label">Time left</div>
                <div className={`timer-num${urgent ? ' urgent' : ''}`} aria-live="off">{sold ? '—' : `${Math.ceil(remaining / 1000)}s`}</div>
                <div className="faint">Next min: <Coins n={min} /></div>
              </div>
            </div>
            <div className={`timer${urgent ? ' urgent' : ''}`}><span style={{ width: `${sold ? 0 : Math.min(100, (remaining / totalMs) * 100)}%` }} /></div>
            {sold && (
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{lot.status === 'sold' && leadP ? `${c.name} goes to ${leadP.name} for ${lead!.amount.toLocaleString()}!` : lot.status === 'assigned' ? `${c.name} assigned by the Director.` : `No bids. ${c.name} ${a.queue.includes(c.id) ? 'will return later' : 'is withdrawn'}.`}</strong>
                {guest ? <span className="faint">Next lot coming up…</span>
                  : <button className="btn primary" onClick={() => store.act((d) => G.advanceLot(d, Date.now()))}>{a.complete || A.totalSlotsRemaining(g) === 0 ? 'Finish auction' : 'Next lot →'}</button>}
              </div>
            )}
          </div>

          {a.config.mode === 'live' ? (
            <div className="bidder-grid">
              {g.players.map((p) => <BidderCard key={p.id} g={g} p={p} onAdvice={store.isLocalPlayer(p) ? () => setAdvisorFor(p.id) : undefined} />)}
            </div>
          ) : active && !sold ? (
            !store.isLocalPlayer(active) ? (
              <div className="panel row"><Emblem p={active} /> <strong>{active.name}</strong> <span className="muted">is deciding…</span></div>
            ) : (
              <PrivacyGate player={active} enabled={g.config.privacyScreens && humans.length > 1} viewer={viewer} reason="Your turn to bid. Your scout report is private.">
                <div className="grid grid-2">
                  <BidderCard g={g} p={active} big />
                  <ScoutPanel g={g} playerId={active.id} />
                </div>
              </PrivacyGate>
            )
          ) : null}
          {a.config.mode === 'turns' && (
            <div className="row" style={{ gap: 8 }}>
              {g.players.map((p) => (
                <span key={p.id} className="player-chip" style={{ opacity: lot.passed.includes(p.id) ? 0.4 : 1, borderColor: p.id === lot.activePlayerId ? 'var(--cyan)' : undefined }}>
                  <Emblem p={p} />{p.name} <Coins n={p.coins} /> · {p.roster.length}/{g.config.rosterSize}{lot.passed.includes(p.id) ? ' · passed' : ''}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-2">
            <div className="panel">
              <h3>Recent bids</h3>
              <div className="bid-log" aria-live="polite">
                {[...lot.bids].reverse().slice(0, 12).map((b) => {
                  const p = g.players.find((x) => x.id === b.playerId)!;
                  return <div key={b.seq}><span style={{ color: p.color, fontWeight: 700 }}>{p.name}</span> bids <Coins n={b.amount} /></div>;
                })}
                {!lot.bids.length && <div className="faint">No bids on this lot yet.</div>}
              </div>
            </div>
            <div className="panel">
              <h3>Auction log</h3>
              <div className="bid-log">{[...a.log].reverse().slice(0, 14).map((l, i) => <div key={i} className="faint">{l.text}</div>)}</div>
            </div>
          </div>
          <EconomyTable g={g} />
        </div>
      </div>

      {profile && <Modal title={c.name} onClose={() => setProfile(false)}><PublicProfile c={c} /></Modal>}
      {advisorFor && (
        <Modal title="Scout Advisor" onClose={() => setAdvisorFor(null)}>
          <PrivacyGate player={g.players.find((p) => p.id === advisorFor)!} enabled={g.config.privacyScreens && humans.length > 1} viewer={viewer} reason="Scout reports are private to each player.">
            <ScoutPanel g={g} playerId={advisorFor} />
          </PrivacyGate>
        </Modal>
      )}
    </div>
  );
}

/**
 * "Should you bid?" right on your bidding card, always visible. When several people
 * share one screen with privacy on, it stays behind the button instead (it can use
 * your private scouting).
 */
function InlineAdvice({ g, p, onMore }: { g: GameState; p: Player; onMore?: () => void }) {
  const shared = g.config.privacyScreens && g.players.filter((x) => x.kind === 'human' && store.isLocalPlayer(x)).length > 1;
  const advice = shared ? null : G.scoutFor(g, p.id);
  if (!advice) return null;
  const label = advice.label === 'TAKE' ? '✓ RECOMMENDED' : advice.label === 'LEAVE' ? '✕ NOT RECOMMENDED' : '~ MAYBE';
  const cls = advice.label === 'MIGHT TAKE' ? 'MIGHT' : advice.label;
  return (
    <button type="button" className={`inline-advice ${cls}`} onClick={onMore} title="Based on price, your budget and your team. Not on how strong the fighter is.">
      <b>{label}</b>
      <span>{advice.reasons[0] ?? ''}{advice.label !== 'TAKE' ? ' (about price and fit, not strength)' : ''}</span>
      <span className="faint">Fair price ~{advice.fairPrice.toLocaleString()}</span>
    </button>
  );
}

function BidderCard({ g, p, onAdvice, big }: { g: GameState; p: Player; onAdvice?: () => void; big?: boolean }) {
  const a = g.auction!;
  const lot = a.lot!;
  const [custom, setCustom] = useState('');
  const lead = A.leader(lot);
  const min = A.minNextBid(lot, a.config);
  const max = A.maxBidFor(p, g.config.rosterSize, a.config.openingBid);
  const can = A.canBid(g, p) && (a.config.mode === 'live' || lot.activePlayerId === p.id);
  const passed = lot.passed.includes(p.id);
  const leading = lead?.playerId === p.id;
  const full = p.roster.length >= g.config.rosterSize;
  const bid = (amt: number) => store.move(p.id, { t: 'bid', amount: amt });
  const steps = [min, min + 250, min + 1000].filter((v, i, arr) => v <= max && arr.indexOf(v) === i);
  return (
    <div className={`bidder${store.isLocalPlayer(p) ? ' mine' : ''}${leading ? ' leading' : ''}${passed && !leading ? ' passed' : ''}${lot.activePlayerId === p.id ? ' active' : ''}`} style={{ borderLeft: `3px solid ${p.color}` }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <PlayerChip p={p} />
        <Coins n={p.coins} />
      </div>
      <div className="faint">Roster {p.roster.length}/{g.config.rosterSize} · max bid {max.toLocaleString()}{full ? ' · FULL' : ''}{leading ? ' · LEADING' : passed ? ' · passed' : ''}</div>
      {!store.isLocalPlayer(p) ? (
        <div className="faint">{passed ? 'Out on this lot.' : leading ? 'Holding the lead.' : p.kind === 'npc' ? 'Watching the bidding…' : 'Bidding from their own device…'}</div>
      ) : lot.status === 'open' && !passed && !full ? (
        <>
          <div className="row" style={{ gap: 6 }}>
            {steps.map((v) => <button key={v} className={`btn sm ${v === min ? 'gold' : ''}`} disabled={!can} onClick={() => bid(v)}>{v.toLocaleString()}</button>)}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <input className="input" style={{ minHeight: 34, flex: 1, minWidth: 0 }} type="number" inputMode="numeric" min={min} max={max} step={50} placeholder="Custom" value={custom}
              onChange={(e) => setCustom(e.target.value)} aria-label={`Custom bid for ${p.name}`}
              onKeyDown={(e) => { if (e.key === 'Enter' && custom) { bid(Math.round(Number(custom))); setCustom(''); } }} />
            <button className="btn sm primary" disabled={!can || !custom} onClick={() => { bid(Math.round(Number(custom))); setCustom(''); }}>Bid</button>
            <button className="btn sm" disabled={leading || (a.config.mode === 'turns' && lot.activePlayerId !== p.id)} onClick={() => store.move(p.id, { t: 'pass' })}>Pass</button>
          </div>
          <InlineAdvice g={g} p={p} onMore={onAdvice} />
          <div className="row" style={{ gap: 6 }}>
            {onAdvice && <button className="btn sm ghost" onClick={onAdvice}>Why?</button>}
            {!big && p.scoutTokens > 0 && <span className="faint">{p.scoutTokens} scout token{p.scoutTokens > 1 ? 's' : ''}</span>}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ScoutPanel({ g, playerId }: { g: GameState; playerId: string }) {
  const advice = G.scoutFor(g, playerId);
  const p = g.players.find((x) => x.id === playerId)!;
  const lot = g.auction!.lot!;
  const obs = g.auction!.observations.filter((o) => o.playerId === playerId && o.charId === lot.charId);
  if (!advice) return null;
  const cls = advice.label === 'MIGHT TAKE' ? 'MIGHT' : advice.label;
  const e = A.economy(g, p);
  return (
    <div className="scout col" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label">Should you bid? · {p.name}</span>
        <span className="faint">Confidence: {advice.confidence}</span>
      </div>
      <div className={`scout-label ${cls}`}>{advice.label === 'TAKE' ? '✓ RECOMMENDED' : advice.label === 'LEAVE' ? '✕ NOT RECOMMENDED' : '~ MAYBE'}</div>
      {advice.label !== 'TAKE' && <div className="faint" style={{ fontSize: 13 }}>This is about <b>your</b> budget, price and team fit right now, not how strong {lot.charId && g.characters[lot.charId] ? g.characters[lot.charId].name : 'this fighter'} is. A strong fighter can still be a bad buy at this price.</div>}
      <ul>{advice.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      <div className="faint">Estimated fair price: ~{advice.fairPrice.toLocaleString()} · You need ≥ {e.minNeeded.toLocaleString()} for your remaining {e.slots} slot(s).</div>
      <div className="faint">The advisor uses only public information and your own scouting. It cannot see hidden stats or the future.</div>
      {obs.length > 0 && <div className="col" style={{ gap: 4 }}>{obs.map((o, i) => <div key={i} style={{ fontSize: 13 }}>🔍 {o.text}</div>)}</div>}
      <button className="btn sm" disabled={p.scoutTokens <= 0 || obs.length >= 2 || lot.status !== 'open'}
        onClick={() => store.move(playerId, { t: 'scout' })}>Send scouts ({p.scoutTokens} left)</button>
    </div>
  );
}

function EconomyTable({ g }: { g: GameState }) {
  const badges = useBadges(g);
  return (
    <div className="panel table-wrap">
      <h3>Economy</h3>
      <table className="standings">
        <thead><tr><th>Player</th><th>Spent</th><th>Remaining</th><th>Avg price</th><th>Fighters</th><th>Min to finish</th></tr></thead>
        <tbody>
          {g.players.map((p) => {
            const e = A.economy(g, p);
            return (
              <tr key={p.id}>
                <td><PlayerChip p={p} /> <BadgeChips badges={badges[p.id]} /></td>
                <td>{e.spent.toLocaleString()}</td>
                <td><Coins n={e.remaining} /></td>
                <td>{e.average ? e.average.toLocaleString() : '—'}</td>
                <td>{p.roster.map((id) => g.characters[id].name.split(' ')[0]).join(', ') || '—'} ({e.acquired}/{g.config.rosterSize})</td>
                <td>{e.minNeeded.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
