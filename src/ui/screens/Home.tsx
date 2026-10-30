import { useMemo, useState } from 'react';
import { store, useApp } from '../../store/store';
import { LEGEND_CHARACTERS } from '../../engine/data/legends';
import { CharArt } from '../components/Portrait';
import { ONLINE_AVAILABLE } from '../../online/client';
import { sendSignInLink, signInAsGuest, useAuth } from '../../online/auth';

/** Sign in right from the start, so your record follows you; or a welcome back with your record. */
function AccountCard() {
  const a = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ONLINE_AVAILABLE || !a.ready) return null;
  if (a.userId) {
    const p = a.profile;
    return (
      <div className="account-card signed">
        <div><div className="eyebrow">Welcome back</div><strong>{p?.display_name ?? a.email?.split('@')[0] ?? 'Player'}</strong>{a.guest && <span className="tag" style={{ marginLeft: 6 }}>GUEST</span>}
          {p && <div className="faint">{p.games_played} played · {p.wins} won</div>}</div>
        <button className="btn sm" onClick={() => store.go('online')}>Your account</button>
      </div>
    );
  }
  if (sent) return <div className="account-card"><div><strong>Check your email</strong><div className="faint">Open the link we sent to {email} on this device and you&apos;re in, for good.</div></div></div>;
  return (
    <form className="account-card" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      try { await sendSignInLink(email); setSent(true); } catch (err) { store.toast((err as Error).message, 'error'); } finally { setBusy(false); }
    }}>
      <div style={{ flexBasis: '100%' }}><strong>Sign in</strong> <span className="faint">to keep your wins and play online. One email link, then you stay signed in.</span></div>
      <input className="input" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" style={{ flex: '1 1 200px', minHeight: 40 }} />
      <button className="btn primary" disabled={busy}>Send link</button>
      <button type="button" className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); try { await signInAsGuest(); store.go('online'); } catch (err) { store.toast((err as Error).message, 'error'); } finally { setBusy(false); } }}>Play as guest</button>
    </form>
  );
}

// Drifting petals and sparks behind the home page (pure CSS; still with reduced motion).
const PETALS = Array.from({ length: 14 }, (_, i) => ({ left: `${(i * 71) % 100}%`, delay: `${(i * 1.7) % 12}s`, dur: `${11 + (i * 3) % 9}s`, size: 8 + (i * 5) % 10 }));

const TILES = [
  { left: '8%', top: '4%', w: 170, rot: -6, delay: 0 },
  { left: '44%', top: '0%', w: 200, rot: 4, delay: 1.2 },
  { left: '0%', top: '46%', w: 190, rot: 3, delay: 0.6 },
  { left: '38%', top: '42%', w: 220, rot: -3, delay: 1.8 },
  { left: '74%', top: '24%', w: 160, rot: 7, delay: 0.9 },
];

export function Home() {
  const game = useApp((s) => s.game);
  const saves = useApp((s) => s.saves);
  const picks = useMemo(() => {
    const day = Math.floor(Date.now() / 86_400_000);
    return TILES.map((_, i) => LEGEND_CHARACTERS[(day * 5 + i * 7) % LEGEND_CHARACTERS.length]);
  }, []);
  const resumable = saves.filter((s) => !s.archived && s.phase !== 'champion');

  return (
    <section className="hero">
      <div className="anime-fx" aria-hidden="true">
        <div className="speed-burst" />
        {PETALS.map((p, i) => <span key={i} className={i % 3 === 0 ? 'spark' : 'petal'} style={{ left: p.left, animationDelay: p.delay, animationDuration: p.dur, width: p.size, height: p.size }} />)}
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="eyebrow">A party game for 2–6 players</div>
        <h1 className="logo-title" style={{ marginTop: 10 }}>
          <span className="l1">Anime Auction</span>
          <span className="l2">Ultimate Battle Arena</span>
        </h1>
        <div className="logo-sub">Bid · Build · Battle</div>
        <p className="muted" style={{ marginTop: 18, maxWidth: 520 }}>
          Each player gets <span className="coins">10,000</span> coins. Fighters go under the hammer one at a time — but their true power stays hidden
          until you buy them. Build a team, prepare your strategy, and fight through a tournament decided by a real combat simulation.
        </p>
        <AccountCard />
        <div className="menu">
          {game && <button className="btn primary lg" onClick={() => store.go('game')}>▶ Return to “{game.config.name}”</button>}
          <button className={`btn lg ${game ? '' : 'primary'}`} onClick={() => store.go('setup')}>✦ Create New Game</button>
          {ONLINE_AVAILABLE && <button className="btn lg" onClick={() => store.go('online')}>🌐 Play Online with Friends</button>}
          <button className="btn" onClick={() => store.go('saves')} disabled={!saves.length}>⟲ Continue Saved Game {resumable.length ? <span className="tag">{resumable.length}</span> : null}</button>
          <button className="btn" onClick={() => store.go('explorer')}>◎ Character Explorer</button>
          <button className="btn" onClick={() => store.go('howto')}>? How to Play</button>
          <button className="btn" onClick={() => store.go('hall')}>♛ Hall of Legends</button>
          <button className="btn" onClick={() => store.go('settings')}>⚙ Settings</button>
        </div>
      </div>
      <div className="collage" aria-hidden="true">
        {TILES.map((t, i) => (
          <div key={i} className="tile" style={{ left: t.left, top: t.top, width: t.w, aspectRatio: '3 / 4', transform: `rotate(${t.rot}deg)`, animationDelay: `${t.delay}s` }}>
            <CharArt c={picks[i]} />
          </div>
        ))}
      </div>
    </section>
  );
}
