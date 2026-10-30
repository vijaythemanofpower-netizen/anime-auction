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

/** Two fighters dash in, clash with a flash and a shockwave, and break apart; then a new pair. */
function BackgroundDuel() {
  const [round, setRound] = useState(() => Math.floor(Math.random() * 1000));
  const pair = useMemo(() => {
    const n = LEGEND_CHARACTERS.length;
    const a = (round * 7) % n, b = (round * 13 + 5) % n;
    return [LEGEND_CHARACTERS[a], LEGEND_CHARACTERS[b === a ? (b + 1) % n : b]];
  }, [round]);
  return (
    <div className="duel" aria-hidden="true" key={round} onAnimationEnd={(e) => { if (e.animationName === 'duel-round') setRound((r) => r + 1); }}>
      <div className="duel-round" />
      <div className="duel-fighter left"><CharArt c={pair[0]} /></div>
      <div className="duel-fighter right"><CharArt c={pair[1]} /></div>
      <div className="duel-flash" />
      <div className="duel-ring" />
      <div className="duel-names"><span>{pair[0].name}</span><b>VS</b><span>{pair[1].name}</span></div>
    </div>
  );
}


export function Home() {
  const game = useApp((s) => s.game);
  const saves = useApp((s) => s.saves);
  const resumable = saves.filter((s) => !s.archived && s.phase !== 'champion');

  return (
    <section className="hero">
      <div className="anime-fx" aria-hidden="true"><div className="speed-burst" /></div>
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
      <BackgroundDuel />
    </section>
  );
}
