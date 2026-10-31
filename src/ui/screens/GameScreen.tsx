import { RaidHub } from '../components/Raid';
import { BadgeChips, HallOfShame, useBadges } from '../components/Badges';
import { useEffect, useMemo, useState } from 'react';
import type { GameState, Player } from '../../engine/types';
import * as G from '../../engine/game';
import { describeFormat, matchOrder, rankedPlayers } from '../../engine/tournament';
import { LEGEND_CHARACTERS } from '../../engine/data/legends';
import { randomPopular } from '../../engine/providers/anilist';
import { withAiMoves } from '../ai/moveWriter';
import { getEnvironment } from '../../engine/data/world';
import { progressedStats } from '../../engine/progression';
import { store, useApp } from '../../store/store';
import { Coins, Emblem, HiddenDetails, PhaseBar, PlayerChip, PowerRing, PrivacyGate, Seg, StatBars, TagChip } from '../components/common';
import { CharArt } from '../components/Portrait';
import { RosterView } from '../components/Roster';
import { Explorer } from './Explorer';
import { AuctionPhase } from './Auction';
import { PrepPhase } from './Prep';
import { BattleView } from './Battle';
import { TitleChips } from '../components/CoachReview';
import { coachIq, titlesFor } from '../../engine/titles';

export function GameScreen() {
  const g = useApp((s) => s.game)!;
  const exhibition = useApp((s) => s.exhibition);
  const online = useApp((s) => s.online);
  const battles = useApp((s) => s.battles);
  // Online players watch each fight at their own pace: if the host moves on
  // first, the fight stays on screen until they're done with it.
  const [watching, setWatching] = useState<string | null>(null);
  useEffect(() => {
    if (online?.role === 'guest' && g.lastBattleId && (g.phase === 'battle' || g.phase === 'results')) setWatching(g.lastBattleId);
  }, [online?.role, g.lastBattleId, g.phase]);
  const stillWatching = watching && !(g.phase === 'battle' || g.phase === 'results') ? battles[watching] : null;
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow">{g.players.length} players · roster {g.config.rosterSize}</div>
          <h2>{g.config.name}</h2>
        </div>
        <div className="row">
          {online && <span className="tag" title="Online room code">ROOM {online.code} · {online.role === 'host' ? 'you host' : 'online'}</span>}
          {online?.role !== 'guest' && <button className="btn sm" onClick={() => { store.flushSave(); store.toast('Game saved.', 'success'); }}>Save</button>}
          {online ? <button className="btn sm ghost" onClick={() => store.go('online')}>Room</button>
            : <button className="btn sm ghost" onClick={() => store.closeGame()}>Save &amp; exit</button>}
        </div>
      </div>
      <PhaseBar phase={g.phase} />
      {exhibition ? <BattleView record={exhibition} exhibition />
        : stillWatching ? (
          <div className="col" style={{ gap: 12 }}>
            <div className="panel row" style={{ justifyContent: 'space-between', borderColor: 'var(--cyan)' }}>
              <span>The tournament has moved on. Finish watching, then head back.</span>
              <button className="btn sm primary" onClick={() => setWatching(null)}>Back to the tournament</button>
            </div>
            <BattleView record={stillWatching} exhibition />
          </div>
        ) : <Phase g={g} />}
    </div>
  );
}

function Phase({ g }: { g: GameState }) {
  switch (g.phase) {
    case 'setup':
    case 'pool': return <PoolPhase g={g} />;
    case 'auction': return <AuctionPhase />;
    case 'reveal': return <RevealPhase g={g} />;
    case 'hub': return <HubPhase g={g} />;
    case 'prep': return <PrepPhase />;
    case 'battle':
    case 'results': return <CurrentBattle g={g} />;
    case 'champion': return <ChampionPhase g={g} />;
  }
}

// ------------------------------------------------------------------ pool

function PoolPhase({ g }: { g: GameState }) {
  if (store.isGuest()) return <GuestPool g={g} />;
  return <HostPool g={g} />;
}

/** Online players watch the host build the pool. */
function GuestPool({ g }: { g: GameState }) {
  return (
    <div className="panel col" style={{ gap: 12 }}>
      <div><div className="eyebrow">Step 1</div><h3 style={{ marginTop: 4 }}>The host is choosing the fighters</h3>
        <p className="muted">The auction starts when the pool is ready. {g.pool.length} fighter{g.pool.length === 1 ? '' : 's'} so far.</p></div>
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {g.pool.map((id) => (
          <div key={id} className="panel tight col" style={{ gap: 6 }}>
            <div style={{ aspectRatio: '3 / 4', borderRadius: 10, overflow: 'hidden' }}><CharArt c={g.characters[id]} /></div>
            <strong style={{ fontSize: 14 }}>{g.characters[id].name}</strong>
            <span className="faint">{g.characters[id].series}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HostPool({ g }: { g: GameState }) {
  const need = G.poolRequirement(g);
  const ok = g.pool.length >= need;
  const settings = useApp((s) => s.settings);
  const [filling, setFilling] = useState(false);
  const fillAllAnime = async () => {
    setFilling(true);
    try {
      const picks = (await randomPopular(Math.max(25, G.poolRecommended(g) * 2))).map(withAiMoves);
      store.act((d, v) => G.autoFillPool(d, v, picks));
    } catch (e) { store.toast((e as Error).message, 'error'); }
    finally { setFilling(false); }
  };
  return (
    <div className="split">
      <div className="col">
        <div className="panel">
          <div className="eyebrow">Step 1</div>
          <h3 style={{ marginTop: 4 }}>Build this game&apos;s auction pool</h3>
          <p className="muted">Browse the character database below and add fighters to the pool. The pool needs at least <strong>{need}</strong> characters ({g.players.length} players × {g.config.rosterSize}); a few extras make the auction more strategic.</p>
        </div>
        <Explorer embedded />
      </div>
      <aside className="panel col" style={{ position: 'sticky', top: 76 }}>
        <div className="panel-title"><h3 style={{ margin: 0 }}>Auction pool</h3><span className={`tag`} style={{ color: ok ? 'var(--good)' : 'var(--warn)' }}>{g.pool.length} / {need}+</span></div>
        <div className="col" style={{ gap: 6, maxHeight: 420, overflowY: 'auto' }}>
          {g.pool.map((id) => {
            const c = g.characters[id];
            return (
              <div key={id} className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}><CharArt c={c} /></div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div><div className="faint">{c.archetype}</div></div>
                <button className="btn sm ghost" onClick={() => store.act((d) => G.removeFromPool(d, id))} aria-label={`Remove ${c.name}`}>✕</button>
              </div>
            );
          })}
          {!g.pool.length && <div className="faint">Empty. Add fighters or auto-fill.</div>}
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => store.act((d, v) => G.autoFillPool(d, v, LEGEND_CHARACTERS))} title="Fill with characters that have signature moves">Auto-fill</button>
          {settings.useOnlineProvider && <button className="btn sm" disabled={filling} onClick={fillAllAnime} title="Fill with random popular characters from any anime">{filling ? 'Loading…' : 'Auto-fill: any anime'}</button>}
          <button className="btn sm danger" disabled={!g.pool.length} onClick={() => { if (confirm('Remove every character from the pool?')) store.act((d) => { for (const id of [...d.pool]) G.removeFromPool(d, id); return { ok: true }; }); }}>Clear</button>
        </div>
        <button className="btn primary lg" disabled={!ok} onClick={() => store.act((d) => G.startAuction(d, Date.now()))}>Start auction</button>
        {!ok && <div className="faint">Add {need - g.pool.length} more to start.</div>}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- reveal

function RevealPhase({ g }: { g: GameState }) {
  const viewer = useApp((s) => s.viewer);
  const humans = g.players.filter((p) => store.isLocalPlayer(p));
  const next = humans.find((p) => !g.revealSeen.includes(p.id));
  const waitingFor = g.players.filter((p) => p.kind === 'human' && !g.revealSeen.includes(p.id));
  if (!next && waitingFor.length) {
    return (
      <div className="panel col" style={{ alignItems: 'center', textAlign: 'center', padding: 32 }}>
        <div className="spinner" />
        <h3>Waiting for {waitingFor.map((p) => p.name).join(', ')} to see their fighters…</h3>
      </div>
    );
  }
  if (!next) {
    return (
      <div className="panel col reveal-anim" style={{ alignItems: 'center', textAlign: 'center', padding: 32 }}>
        <div className="eyebrow">All rosters revealed</div>
        <h2>The Ultimate Battle Arena awaits</h2>
        <p style={{ maxWidth: 640, margin: '4px 0' }}><strong>Match order:</strong> {matchOrder(g.players.length, g.config.tournament, g.config.rosterSize)}</p>
        <p className="muted" style={{ maxWidth: 640 }}>{describeFormat(g.players.length, g.config.tournament)}</p>
        <div className="row" style={{ justifyContent: 'center' }}>{g.players.map((p) => <PlayerChip key={p.id} p={p} suffix={<span className="faint">· {p.roster.length} fighters</span>} />)}</div>
        {store.isGuest() ? <p className="faint">Waiting for the host to begin the tournament…</p>
          : <button className="btn primary lg" onClick={() => { store.setViewer(null); store.act((d) => G.startTournament(d)); }}>Begin tournament</button>}
      </div>
    );
  }
  return (
    <PrivacyGate player={next} enabled={g.config.privacyScreens && humans.length > 1} viewer={viewer} reason="Your fighters' true power is about to be revealed — for your eyes only.">
      <RevealSequence g={g} player={next} key={next.id} />
    </PrivacyGate>
  );
}

function RevealSequence({ g, player }: { g: GameState; player: Player }) {
  const [shown, setShown] = useState(0);
  const ids = player.roster;
  const cur = ids[Math.min(shown, ids.length - 1)];
  const c = g.characters[cur];
  const h = store.hiddenFor(cur, player.id);
  const done = shown >= ids.length - 1;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><div className="eyebrow">Character reveal · {player.name}</div><h2>Fighter {shown + 1} of {ids.length}</h2></div>
        <div className="row" style={{ gap: 6 }}>{ids.map((id, i) => <button key={id} className={`btn sm ${i === shown ? 'active' : ''}`} disabled={i > shown} onClick={() => setShown(i)}>{g.characters[id].name.split(' ')[0]}</button>)}</div>
      </div>
      {h && (
        <div className="panel reveal-card reveal-anim" key={cur}>
          <div className="col">
            <div className="lot-art flash"><CharArt c={c} /></div>
            <div className="faint">Purchased for <Coins n={g.prices[cur] ?? 0} /></div>
          </div>
          <div className="col">
            <div className="row" style={{ alignItems: 'center' }}>
              <PowerRing stats={h.stats} />
              <div>
                <h2>{c.name}</h2>
                <div className="faint">{c.archetype} · {c.series}</div>
                <div className="row" style={{ gap: 4, marginTop: 4 }}>{c.tags.map((t) => <TagChip key={t} t={t} />)}</div>
              </div>
            </div>
            <StatBars stats={progressedStats(h, g.conditions[cur])} base={h.stats} />
            <HiddenDetails h={h} />
          </div>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {!done ? <button className="btn primary lg" onClick={() => setShown(shown + 1)}>Reveal next fighter</button>
          : <button className="btn gold lg" onClick={() => { store.move(player.id, { t: 'revealed' }); store.setViewer(null); }}>Done — hide my roster</button>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- hub

function HubPhase({ g }: { g: GameState }) {
  const t = g.tournament!;
  const viewer = useApp((s) => s.viewer);
  const battles = useApp((s) => s.battles);
  const [tab, setTab] = useState<string>('bracket');
  const next = t.stages[t.currentStage]?.matches.find((m) => !m.winner) ?? null;
  const pname = (id: string) => g.players.find((p) => p.id === id)!;
  const humans = g.players.filter((p) => p.kind === 'human');
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="panel row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow">{t.stages[t.currentStage]?.name ?? 'Tournament'}</div>
          {next ? <h3 style={{ margin: '4px 0' }}>Next: {pname(next.players[0]).name} vs {pname(next.players[1]).name} <span className="tag">{next.label}</span></h3> : <h3>Stage complete</h3>}
          {next && <div className={`format-badge ${next.mode}`}>{next.mode === 'solo' ? '1 vs 1 · you pick 1 fighter' : next.mode === 'tag' ? '2 vs 2 tag team · you pick 2 fighters' : `${g.config.rosterSize} vs ${g.config.rosterSize} squad · everyone fights`}</div>}
          <div style={{ marginTop: 6 }}><strong>Match order:</strong> {matchOrder(g.players.length, g.config.tournament, g.config.rosterSize)}</div>
          <div className="faint">{describeFormat(g.players.length, g.config.tournament)}</div>
        </div>
        {store.isGuest() ? <span className="faint">The host starts each match.</span>
          : <button className="btn primary lg" disabled={!next} onClick={() => { store.setViewer(null); store.act((d, v) => G.startMatch(d, v)); }}>Prepare match</button>}
      </div>
      <Seg value={tab} onChange={setTab} label="Hub view" options={[{ v: 'bracket', label: 'Bracket & standings' }, { v: 'rosters', label: 'Rosters' }, { v: 'history', label: 'Battle history' }, { v: 'rivalries', label: 'Rivalries' }, { v: 'raid', label: '⚔ Raid Boss' }]} />
      {tab === 'bracket' && <Bracket g={g} />}
      {tab === 'rosters' && <RosterTabs g={g} viewer={viewer} privacy={g.config.privacyScreens && humans.length > 1} />}
      {tab === 'history' && <History g={g} battles={battles} />}
      {tab === 'rivalries' && <Rivalries g={g} />}
      {tab === 'raid' && <RaidHub g={g} />}
    </div>
  );
}

export function Bracket({ g }: { g: GameState }) {
  const battles = useApp((s) => s.battles);
  const t = g.tournament!;
  const p = (id: string) => g.players.find((x) => x.id === id)!;
  const badges = useBadges(g);
  const ranked = rankedPlayers(t, g.players.map((x) => x.id));
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel">
        <h3>Championship path</h3>
        <div className="bracket">
          {t.plan.map((stage, i) => {
            const st = t.stages[i];
            return (
              <div key={i} className="bracket-col">
                <h4>{stage.name} <span className="faint">({stage.mode})</span></h4>
                {!st && <div className="match-box"><div className="meta">Pairings decided when the stage begins{stage.kind === 'knockout' ? ` — top ${i === t.plan.length - 1 ? 2 : t.knockoutSize} advance` : ''}.</div></div>}
                {st?.matches.map((m) => (
                  <div key={m.id} className={`match-box${!m.winner && i === t.currentStage ? ' current' : ''}`}>
                    {m.players.map((pid) => (
                      <div key={pid} className={`slot${m.winner ? (m.winner === pid ? ' win' : ' lose') : ''}`}>
                        <span className="row" style={{ gap: 6 }}><Emblem p={p(pid)} size={18} />{p(pid).name}</span>
                        <span>{m.winner === pid ? 'WIN' : ''}</span>
                      </div>
                    ))}
                    <div className="meta">{m.label}{m.winner ? ' · complete' : i === t.currentStage ? ' · upcoming' : ''}</div>
                  </div>
                ))}
                {st?.byes.map((b) => <div key={b} className="match-box"><div className="slot"><span>{p(b).name}</span><span className="faint">BYE +2</span></div></div>)}
              </div>
            );
          })}
        </div>
      </div>
      <div className="panel table-wrap">
        <h3>Standings</h3>
        <table className="standings">
          <thead><tr><th>#</th><th>Player</th><th>Pts</th><th>W</th><th>L</th><th>Byes</th><th>Condition</th><th>Coach IQ</th><th>Coins left</th></tr></thead>
          <tbody>
            {ranked.map((id, i) => {
              const s = t.standings[id];
              return <tr key={id} style={i < t.knockoutSize ? { color: 'var(--text)' } : { color: 'var(--text-dim)' }}><td>{i + 1}</td><td><PlayerChip p={p(id)} /> <TitleChips titles={titlesFor(g, Object.values(battles), id)} /> <BadgeChips badges={badges[id]} /></td><td><strong>{s.points}</strong></td><td>{s.wins}</td><td>{s.losses}</td><td>{s.byes}</td><td>{s.hpScore}</td><td>{coachIq(Object.values(battles), id) ?? '—'}</td><td><Coins n={p(id).coins} /></td></tr>;
            })}
          </tbody>
        </table>
        <div className="faint" style={{ marginTop: 6 }}>Top {t.knockoutSize} after the group rounds advance to the squad knockout. Tiebreakers: wins, then how fresh the winners finished, then a seeded draw.</div>
      </div>
    </div>
  );
}

function RosterTabs({ g, viewer, privacy }: { g: GameState; viewer: string | null; privacy: boolean }) {
  const [pid, setPid] = useState(g.players[0].id);
  const player = g.players.find((p) => p.id === pid)!;
  const [peek, setPeek] = useState(false);
  return (
    <div className="col">
      <div className="row">{g.players.map((p) => <button key={p.id} className={`btn sm ${p.id === pid ? 'active' : ''}`} onClick={() => { setPid(p.id); setPeek(false); }}><Emblem p={p} size={18} /> {p.name}</button>)}</div>
      {player.kind === 'human' && viewer !== player.id && !peek && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPeek(true)}>View as {player.name} (shows private stats)</button>}
      {peek && viewer !== player.id
        ? <PrivacyGate player={player} enabled={privacy} viewer={viewer}>{null}</PrivacyGate>
        : <RosterView g={g} player={player} viewer={viewer} />}
      {viewer && <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => store.setViewer(null)}>Hide private info</button>}
    </div>
  );
}

function History({ g, battles }: { g: GameState; battles: Record<string, import('../../engine/types').BattleRecord> }) {
  const list = Object.values(battles).sort((a, b) => b.createdAt - a.createdAt);
  const p = (id: string) => g.players.find((x) => x.id === id)?.name ?? id;
  if (!list.length) return <div className="panel empty">No battles yet.</div>;
  return (
    <div className="col">
      {list.map((b) => (
        <div key={b.battleId} className="panel row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>{p(b.input.sides[0].playerId)} vs {p(b.input.sides[1].playerId)}</strong> <span className="tag">{b.kind}</span> <span className="tag">{b.input.mode}</span>
            <div className="faint">{b.input.sides.map((s) => s.fighters.map((f) => f.name).join(' & ')).join(' vs ')} · {getEnvironment(b.input.environmentId).name} · winner {p(b.input.sides[b.result.winnerSide].playerId)} ({b.result.decision === 'ko' ? 'KO' : 'judges'}, {b.result.turns} actions) · seed {b.input.seed}</div>
          </div>
          <div className="row">
            <button className="btn sm" onClick={() => store.replay(b.battleId)}>Exact replay</button>
            <button className="btn sm" onClick={() => store.rematch(b.battleId)}>Fresh rematch</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Rivalries({ g }: { g: GameState }) {
  const list = Object.values(g.rivalries).sort((a, b) => b.intensity - a.intensity);
  const p = (id: string) => g.players.find((x) => x.id === id)!;
  if (!list.length) return <div className="panel empty">Rivalries form after players meet in battle.</div>;
  return (
    <div className="grid grid-2">
      {list.map((r) => (
        <div key={r.key} className="panel">
          <h3>{p(r.a).name} vs {p(r.b).name}</h3>
          <div className="muted">{r.encounters} encounter{r.encounters > 1 ? 's' : ''} · record {r.winsA}–{r.winsB} · intensity {'🔥'.repeat(Math.max(1, r.intensity))}</div>
          {r.moments.length > 0 && <div className="faint" style={{ marginTop: 6 }}>Turning points: {r.moments.join(' · ')}</div>}
          <div className="faint" style={{ marginTop: 6 }}>At intensity 2+, both sides fight slightly harder (+3% damage) and awaken more often. Rivalries never decide the winner.</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- battle

function CurrentBattle({ g }: { g: GameState }) {
  const battles = useApp((s) => s.battles);
  const rec = g.lastBattleId ? battles[g.lastBattleId] : null;
  if (!rec) {
    return (
      <div className="panel empty">
        <p>The battle record could not be found.</p>
        {g.phase === 'results' && !store.isGuest() && <button className="btn primary" onClick={() => store.act((d) => G.continueAfterResults(d))}>Continue</button>}
      </div>
    );
  }
  return <BattleView record={rec} />;
}

// -------------------------------------------------------------- champion

function ChampionPhase({ g }: { g: GameState }) {
  const t = g.tournament!;
  const allHall = useApp((s) => s.hall);
  const hall = allHall.filter((h) => h.gameId === g.id);
  const champ = g.players.find((p) => p.id === t.championId)!;
  const confetti = useMemo(() => Array.from({ length: 40 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 4, dur: 3 + Math.random() * 3, color: ['#f5c451', '#a78bfa', '#22d3ee', '#f472b6'][i % 4] })), []);
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="confetti" aria-hidden="true">{confetti.map((c, i) => <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s` }} />)}</div>
      <div className="panel champion-hero reveal-anim">
        <div className="trophy" aria-hidden="true">🏆</div>
        <div className="eyebrow">Champion of “{g.config.name}”</div>
        <h1 style={{ color: 'var(--gold)', margin: '8px 0' }}>{champ.name}</h1>
        <div className="row" style={{ justifyContent: 'center' }}>{champ.roster.map((id) => <span key={id} className="player-chip">{g.characters[id].name}</span>)}</div>
        <p className="muted" style={{ marginTop: 10 }}>Spent {(10000 - champ.coins).toLocaleString()} coins · {t.standings[champ.id].wins} wins</p>
      </div>
      <HallOfShame g={g} />
      <Bracket g={g} />
      {hall.length > 0 && (
        <div className="panel">
          <h3>Enshrined in the Hall of Legends</h3>
          <div className="grid grid-2">{hall.map((h) => <div key={h.id}><strong>{h.title}</strong><div className="faint">{h.detail}</div></div>)}</div>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={() => store.go('hall')}>Hall of Legends</button>
        <button className="btn primary lg" onClick={() => { store.closeGame(); store.go('setup'); }}>New game</button>
        <button className="btn" onClick={() => store.closeGame()}>Home</button>
      </div>
    </div>
  );
}
