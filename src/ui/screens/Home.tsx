import { useMemo } from 'react';
import { store, useApp } from '../../store/store';
import { LEGEND_CHARACTERS } from '../../engine/data/legends';
import { CharArt } from '../components/Portrait';
import { ONLINE_AVAILABLE } from '../../online/client';

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
      <div>
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
