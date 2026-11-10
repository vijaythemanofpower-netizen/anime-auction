import { useEffect, useMemo, useState } from 'react';
import { PLAYER_MAP, displayName, store, useApp } from '../store/store';
import { PLAYERS } from '../engine/data/players';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { Auction } from './screens/Auction';
import { Prep, Reveal } from './screens/Squads';
import { Match } from './screens/Match';
import { Champion } from './components/Season';
import { importPhotos } from '../store/photos';
import { Bars } from './components/common';
import { Chips, Portrait, ROLE_NAME, skillRows } from './components/Player';
import { fmtL } from '../engine/squad';
import type { Role } from '../engine/types';

function GameScreen() {
  const g = useApp((s) => s.game);
  const online = useApp((s) => s.online);
  if (online.role === 'guest' && !g) return <div className="col" style={{ alignItems: 'center', padding: 40 }}>{online.error ? <><p>{online.error}</p><button className="btn" onClick={() => store.quit()}>Back</button></> : <p className="dim">Joining room {online.code}… (the host's game must be open)</p>}</div>;
  if (!g) return <Home />;
  if (online.role === 'guest' && !online.me) return (
    <div className="col" style={{ maxWidth: 480, margin: '0 auto' }}>
      <h2>Room {online.code}: who are you?</h2>
      <div className="options">{g.config.humans.slice(1).map((h) => <button key={h.id} className="option" onClick={() => store.setMe(h.id)}>{h.name}</button>)}</div>
    </div>
  );
  if (g.phase === 'auction') return <Auction g={g} />;
  if (g.phase === 'reveal') return <Reveal g={g} />;
  if (g.phase === 'prep') return <Prep g={g} />;
  if (g.phase === 'done' && g.season?.champion) return <Champion g={g} />;
  if (!g.match) return <Prep g={g} />;
  return <Match g={g} />;
}

function Roster() {
  useApp((s) => s.settings.realNames);
  const [role, setRole] = useState<Role | 'all'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [imported, setImported] = useState('');
  const list = useMemo(() => PLAYERS.filter((p) => (role === 'all' || p.role === role) && (!q || `${p.name} ${p.realName}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name)), [role, q]);
  const c = open ? PLAYER_MAP[open] : null;
  return (
    <div className="col">
      <div><span className="label">{PLAYERS.length} players · the 2026 season pool</span><h1>The players</h1>
        <p className="dim">Names are playful name-alikes unless you turn on real names in Settings. Ratings are the game's own estimates. No photos are included: use "Set photo" on a player, or "Import a photo folder" with files named after players (e.g. "Virat Kohli.jpg"). Photos stay in this browser.</p></div>
      {imported && <p className="dim" role="status">{imported}</p>}
      <div className="row">
        <button className="btn sm" onClick={() => importPhotos(PLAYERS, (n, skip) => setImported(`${n} photo${n === 1 ? '' : 's'} added.${skip.length ? ` No player matched: ${skip.slice(0, 8).join(', ')}${skip.length > 8 ? ' …' : ''}` : ''}`))}>Import a photo folder</button>
        <input type="text" placeholder="Search" aria-label="Search players" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role | 'all')}>
          <option value="all">All roles</option>
          {Object.entries(ROLE_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
        {list.map((p) => (
          <button key={p.id} className="panel tight pc" style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => setOpen(p.id)}>
            <Portrait c={p} />
            <div style={{ minWidth: 0 }}><div className="pc-name">{displayName(p)}</div><div className="pc-meta">{ROLE_NAME[p.role]} · {p.country} · base {fmtL(p.basePrice)}</div></div>
          </button>
        ))}
      </div>
      {c && (
        <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="modal col" role="dialog" aria-modal="true" aria-label={displayName(c)}>
            <div className="lot-head"><Portrait c={c} size="lg" editable /><div className="col" style={{ gap: 8 }}><div className="lot-name" style={{ fontSize: 32 }}>{displayName(c)}</div><Chips c={c} price={c.basePrice} /><span className="dim" style={{ fontSize: 14 }}>{c.country} · age {c.age} · {c.temper}</span></div></div>
            <Bars rows={skillRows(c)} />
            <button className="btn" onClick={() => setOpen(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function HowTo() {
  return (
    <div className="col" style={{ maxWidth: 760 }}>
      <h1>How to play</h1>
      <section className="panel col"><h3>1 · The auction</h3><p className="dim">Players come up set by set: marquee stars, batters, keepers, all-rounders, pace, spin, uncapped. Tap your bid button to raise; each bid adds a few seconds. Scout tokens reveal a player's hidden form. The mystery lot is a star or a flop. Anyone nobody buys returns at half price.</p></section>
      <section className="panel col"><h3>2 · The rules</h3><p className="dim">A Standard squad of 13 needs a keeper, 4 batters, 2 all-rounders, 5 bowlers (2 pace, 1 spin) and 2 uncapped players, with at most 5 overseas (4 in the XI). The auction blocks bids that would make that impossible and keeps enough purse for your empty slots. A compulsory slot still empty at the end is filled for you at double price.</p></section>
      <section className="panel col"><h3>3 · Match day</h3><p className="dim">Pick your XI, batting order and game plan. At the ground: the toss, Captain's Calls (attack or consolidate, who bowls), DRS reviews with umpire's call, the Impact Player at the innings break, sledges that can rattle fiery batters or backfire, and secret mind-game balls (yorker, bouncer, slower ball or wide line against defend, drive, slog or ramp) at the biggest moments. Every call has 10 seconds and a sensible default.</p></section>
      <section className="panel col"><h3>Teams</h3><p className="dim">Play solo, as partners sharing a purse, in a handicap game (one against two or three, with a bigger purse and extra scouts), or all together against the Boss NPC (1v4) with its 2.5x war chest.</p></section>
      <div><button className="btn" onClick={() => store.go('home')}>Back</button></div>
    </div>
  );
}

export function App() {
  const screen = useApp((s) => s.screen);
  const settings = useApp((s) => s.settings);
  const hasGame = useApp((s) => !!s.game);
  const online = useApp((s) => s.online);
  useEffect(() => { document.documentElement.dataset.reducedMotion = String(settings.reducedMotion); }, [settings.reducedMotion]);
  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => store.go('home')} aria-label="Cricket Auction home">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="#f05252" /><path d="M7 9 Q16 16 7 23 M25 9 Q16 16 25 23" stroke="#fff" strokeWidth="1.6" fill="none" strokeDasharray="2 2" /></svg>
          <span className="brand-name">Cricket <em>Auction</em></span>
        </button>
        <span className="spacer" />
        <label className="check" style={{ alignItems: 'center', fontSize: 13, whiteSpace: 'nowrap' }}><input type="checkbox" checked={settings.realNames} onChange={(e) => store.settings({ realNames: e.target.checked })} />Real<span className="hide-sm">&nbsp;names</span></label>
        {online.code && <span className="chip" title={online.error ?? 'Online room code'}>{online.error ? '⚠ ' : '🌐 '}Room {online.code}</span>}
        {hasGame && screen !== 'game' && <button className="btn sm" onClick={() => store.resume()}>Back to game</button>}
        {screen === 'game' && <button className="btn sm ghost" onClick={() => { if (confirm('Leave this game? It stays saved: use Continue game on the home page.')) store.go('home'); }}>Menu</button>}
      </header>
      <main className="main">
        {screen === 'home' && <Home />}
        {screen === 'setup' && <Setup />}
        {screen === 'game' && <GameScreen />}
        {screen === 'roster' && <Roster />}
        {screen === 'howto' && <HowTo />}
      </main>
    </div>
  );
}
