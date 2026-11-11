import { useEffect, useMemo, useState } from 'react';
import { PLAYER_MAP, displayName, store, useApp } from '../store/store';
import { PLAYERS } from '../engine/data/players';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { Auction } from './screens/Auction';
import { Prep, Retain, Reveal } from './screens/Squads';
import { Match } from './screens/Match';
import { Champion } from './components/Season';
import { importPhotos } from '../store/photos';
import { Bars, DialogHost, askConfirm } from './components/common';
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
      <div className="options">{g.config.humans.slice(1).map((h) => {
        const f = g.franchises.find((x) => x.owners.includes(h.id));
        const mates = (f?.owners ?? []).filter((o) => o !== h.id).map((o) => g.config.humans.find((x) => x.id === o)?.name).filter(Boolean);
        return <button key={h.id} className="option" onClick={() => store.setMe(h.id)}>{h.name}<small>{f ? `${f.name}${mates.length ? ` · with ${mates.join(' & ')}` : ' · on your own'}` : ''}</small></button>;
      })}</div>
    </div>
  );
  if (g.phase === 'retain') return <Retain g={g} />;
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
      <section className="panel col"><h3>IPL rules (default)</h3><p className="dim">Each team stands for one of last season's 10 sides. Before the auction it may retain up to 6 of its old players (at most 5 capped, 2 uncapped) at ₹18, 14, 11, 18 and 14 Cr for capped players in order and ₹4 Cr for uncapped. Unused slots become Right to Match cards: when one of your old players is sold to another team, you may call RTM; the buyer gets one final raise, then you can match it to take the player back. Bids rise by ₹5 L up to ₹1 Cr, ₹10 L to ₹2 Cr, ₹20 L to ₹5 Cr, then ₹25 L. After every set, teams nominate up to 5 unsold players for a faster accelerated round. Squads hold 18-25 players with at most 8 overseas; purse ₹120 Cr.</p></section>
      <section className="panel col"><h3>2 · The rules</h3><p className="dim">A Standard squad of 13 needs a keeper, 4 batters, 2 all-rounders, 5 bowlers (2 pace, 1 spin) and 2 uncapped players, with at most 5 overseas (4 in the XI). The auction blocks bids that would make that impossible and keeps enough purse for your empty slots. A compulsory slot still empty at the end is filled for you at double price.</p></section>
      <section className="panel col"><h3>3 · Match day</h3><p className="dim">Pick your XI, batting order and game plan. At the ground: the toss, Captain's Calls (attack or consolidate, who bowls), DRS reviews with umpire's call, the Impact Player at the innings break, sledges that can rattle fiery batters or backfire, and secret mind-game balls (yorker, bouncer, slower ball or wide line against defend, drive, slog or ramp) at the biggest moments. Every call has 10 seconds and a sensible default.</p></section>
      <section className="panel col"><h3>Teams</h3><p className="dim">Play solo, as partners sharing a purse, in a handicap game (one against two or three, with a bigger purse and extra scouts), or all together against the Boss NPC (1v4) with its 2.5x war chest.</p></section>
      <div><button className="btn" onClick={() => store.go('home')}>Back</button></div>
    </div>
  );
}

const STEPS: Array<{ key: string; label: string }> = [
  { key: 'retain', label: 'Retain' }, { key: 'auction', label: 'Auction' }, { key: 'reveal', label: 'Squads' },
  { key: 'prep', label: 'Season' }, { key: 'match', label: 'Match' }, { key: 'done', label: 'Champions' },
];

/** Where you are in the game: retain -> auction -> squads -> season -> match -> champions. */
function Steps() {
  const g = useApp((s) => s.game);
  const screen = useApp((s) => s.screen);
  if (!g || screen !== 'game') return null;
  const steps = STEPS.filter((x) => x.key !== 'retain' || g.config.mode === 'ipl');
  const at = steps.findIndex((x) => x.key === g.phase);
  return <nav className="steps" aria-label="Game progress">{steps.map((x, i) => <span key={x.key} className={i === at ? 'now' : i < at ? 'done' : ''} aria-current={i === at ? 'step' : undefined}>{x.label}</span>)}</nav>;
}

/** The one menu: navigation, settings, the online room and abandoning the game. */
function Menu({ onClose }: { onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  const online = useApp((s) => s.online);
  const hasGame = useApp((s) => !!s.game);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const go = (fn: () => void) => () => { fn(); onClose(); };
  const copy = () => { void navigator.clipboard?.writeText(online.code).then(() => store.toast('Room code copied.')); };
  return (
    <div className="sheet-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="row between"><h3>Menu</h3><button className="btn sm ghost" onClick={onClose} aria-label="Close menu">✕</button></div>
        <nav>
          <button className="btn ghost" onClick={go(() => store.go('home'))}>🏠 Home</button>
          {hasGame && <button className="btn ghost" onClick={go(() => store.resume())}>▶ Continue game</button>}
          {online.role !== 'guest' && <button className="btn ghost" onClick={go(() => store.go('setup'))}>＋ New game</button>}
          <button className="btn ghost" onClick={go(() => store.go('roster'))}>👥 The players</button>
          <button className="btn ghost" onClick={go(() => store.go('howto'))}>📖 How to play</button>
        </nav>
        <hr />
        <span className="label">Settings</span>
        <label className="check"><input type="checkbox" checked={settings.sound} onChange={(e) => store.settings({ sound: e.target.checked })} /><span>Sound</span></label>
        <label className="check"><input type="checkbox" checked={settings.realNames} onChange={(e) => store.settings({ realNames: e.target.checked })} /><span>Real player names</span></label>
        <label className="check"><input type="checkbox" checked={settings.reducedMotion} onChange={(e) => store.settings({ reducedMotion: e.target.checked })} /><span>Reduce motion</span></label>
        {online.role !== 'off' && (
          <>
            <hr />
            <div className="room-card">
              <span className="label">{online.role === 'host' ? 'Your online room' : 'Online room'}</span>
              <div className="row between"><span className="room-code">{online.code}</span><button className="btn sm" onClick={copy}>Copy code</button></div>
              {online.role === 'host' && <p className="dim" style={{ margin: 0, fontSize: 13 }}>Friends open Cricket Auction on their phone or PC, type this code under "Join room" and pick their name.</p>}
              {online.error && <p style={{ margin: 0, color: 'var(--warn)', fontSize: 13 }}>{online.error}</p>}
              {online.role === 'host'
                ? <button className="btn danger" onClick={() => { void askConfirm({ title: 'Close the room?', body: 'Everyone else is sent back to their home screen. Your game stays on this device.', ok: 'Close room', danger: true }).then((y) => { if (y) { void store.closeRoom(); onClose(); } }); }}>Close room</button>
                : <button className="btn danger" onClick={() => { void store.leaveRoom(); onClose(); }}>Leave room</button>}
            </div>
          </>
        )}
        {hasGame && online.role !== 'guest' && (
          <>
            <hr />
            <button className="btn danger" onClick={() => { void askConfirm({ title: 'Abandon this game?', body: 'The saved game is deleted for good. This cannot be undone.', ok: 'Abandon game', danger: true }).then((y) => { if (y) { void store.abandon(); onClose(); } }); }}>Abandon game</button>
          </>
        )}
      </aside>
    </div>
  );
}

export function App() {
  const screen = useApp((s) => s.screen);
  const settings = useApp((s) => s.settings);
  const hasGame = useApp((s) => !!s.game);
  const online = useApp((s) => s.online);
  const toast = useApp((s) => s.toast);
  const [menu, setMenu] = useState(false);
  useEffect(() => { document.documentElement.dataset.reducedMotion = String(settings.reducedMotion); }, [settings.reducedMotion]);
  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => store.go('home')} aria-label="Cricket Auction home">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="#ff3d6e" /><path d="M7 9 Q16 16 7 23 M25 9 Q16 16 25 23" stroke="#fff" strokeWidth="1.6" fill="none" strokeDasharray="2 2" /></svg>
          <span className="brand-name">Cricket <em>Auction</em></span>
        </button>
        <a className="btn sm ghost" href={import.meta.env.DEV ? 'http://localhost:5173/' : `${import.meta.env.BASE_URL}../`} aria-label="Switch to Anime Auction">
          ⚔️<span className="hide-sm"> Anime Auction</span>
        </a>
        <span className="spacer" />
        {online.code && <button className="chip live" onClick={() => setMenu(true)} title="Online room: open the menu">{online.error ? '⚠' : '●'} Room {online.code}</button>}
        {hasGame && screen !== 'game' && <button className="btn sm primary" onClick={() => store.resume()}>Back to game</button>}
        <button className="btn sm" onClick={() => setMenu(true)} aria-haspopup="dialog">☰ Menu</button>
      </header>
      <main className="main">
        <Steps />
        {screen === 'home' && <Home />}
        {screen === 'setup' && <Setup />}
        {screen === 'game' && <GameScreen />}
        {screen === 'roster' && <Roster />}
        {screen === 'howto' && <HowTo />}
      </main>
      {menu && <Menu onClose={() => setMenu(false)} />}
      <DialogHost />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
