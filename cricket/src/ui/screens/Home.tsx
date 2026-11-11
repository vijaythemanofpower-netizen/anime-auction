import { useMemo } from 'react';
import { store, useApp } from '../../store/store';
import { HomeFilm, type Beat } from './HomeFilm';

function JoinRoom() {
  return (
    <form className="join" onSubmit={(e) => { e.preventDefault(); const c = new FormData(e.currentTarget).get('code'); if (typeof c === 'string' && c.trim().length === 5) void store.joinRoom(c); }}>
      <input name="code" type="text" placeholder="CODE" aria-label="Room code from a friend" maxLength={5} autoComplete="off" />
      <button className="btn" type="submit">Join room</button>
    </form>
  );
}

export function Home() {
  const hasGame = useApp((s) => !!s.game);
  const still = useApp((s) => s.settings.reducedMotion) || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const beats = useMemo<Beat[]>(() => [
    { at: 0, word: 'Cricket Auction', place: 'hero', kicker: 'Auction · Season · Glory',
      body: <p>Ten franchises. One purse each. Every ball is yours. Scroll down.</p> },
    { at: 1, word: 'Lights on', place: 'low-right', kicker: 'A night at the auction',
      body: <p><b>315 real players</b> from the 2026 season, rated from their actual T20 numbers. You run the franchise.</p> },
    { at: 2, word: 'Retain', place: 'low-left', kicker: '01 / Before the auction',
      body: <p>Keep up to <b>6</b> of last season's stars at the real IPL costs. Every slot you skip becomes a <b>Right to Match</b> card.</p> },
    { at: 3, word: 'Bid', place: 'low-right', kicker: '02 / The auction',
      body: <p><b>₹120 Cr</b> purse, the live hammer, official bid steps. Lose a favourite? Call RTM and steal him back.</p> },
    { at: 4, word: 'Play', place: 'low-left', kicker: '03 / Match day',
      body: <p>You bowl and you bat: pick the yorker or the slog, then nail the timing meter. Friends split the roles.</p> },
    { at: 5, word: 'Win', place: 'low-right', kicker: '04 / The season',
      body: <p>League table, net run rate, IPL playoffs, the final. Orange and Purple Caps for the best of the lot.</p> },
    { at: 6, word: 'Your move', place: 'final', kicker: '1 to 6 friends · on one screen or online',
      body: (
        <>
          <div className="home-actions">
            {hasGame && <button className="btn primary lg" onClick={() => store.resume()}>Continue game</button>}
            <button className={`btn lg ${hasGame ? '' : 'primary'}`} onClick={() => store.go('setup')}>New game</button>
            <JoinRoom />
          </div>
          <div className="cf-links">
            <button onClick={() => store.go('roster')}>The players</button>
            <button onClick={() => store.go('howto')}>How to play</button>
          </div>
        </>
      ) },
  ], [hasGame]);
  return <HomeFilm beats={beats} still={still} />;
}
