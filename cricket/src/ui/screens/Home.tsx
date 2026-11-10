import { store, useApp } from '../../store/store';

/** An original floodlit-stadium illustration for the hero (pure SVG, no photos). */
function Stadium() {
  return (
    <svg viewBox="0 0 640 520" aria-hidden="true">
      <defs>
        <radialGradient id="flood" cx="0.5" cy="0" r="0.9">
          <stop offset="0" stopColor="rgba(255,214,140,0.55)" />
          <stop offset="1" stopColor="rgba(255,214,140,0)" />
        </radialGradient>
        <linearGradient id="turf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d5a39" />
          <stop offset="1" stopColor="#0a2418" />
        </linearGradient>
      </defs>
      {[110, 530].map((x) => (
        <g key={x}>
          <polygon points={`${x - 6},40 ${x + 6},40 ${x + 3},300 ${x - 3},300`} fill="#0c1a14" />
          <rect x={x - 26} y="22" width="52" height="22" rx="3" fill="#f6e7c1" />
          <polygon points={`${x - 26},44 ${x + 26},44 ${x + 200 * (x < 320 ? 1 : -1)},460 ${x - 60 * (x < 320 ? 1 : -1)},460`} fill="url(#flood)" opacity="0.55" />
        </g>
      ))}
      <path d="M0 250 Q320 170 640 250 L640 300 Q320 225 0 300 Z" fill="#0b1712" />
      {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M0 ${262 + i * 7} Q320 ${184 + i * 7} 640 ${262 + i * 7}`} stroke="rgba(255,255,255,0.05)" fill="none" />)}
      <ellipse cx="320" cy="430" rx="420" ry="170" fill="url(#turf)" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <ellipse key={i} cx="320" cy="430" rx={400 - i * 50} ry={160 - i * 20} fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="22" />)}
      <polygon points="300,330 340,330 366,500 274,500" fill="#c9b98a" opacity="0.9" />
      <rect x="312" y="318" width="16" height="14" fill="none" stroke="#f1f0e6" strokeWidth="2" />
      <g transform="translate(330 300)" fill="#030806">
        <circle cx="0" cy="-58" r="11" />
        <path d="M-12 -46 Q2 -50 14 -44 L18 -6 L-14 -6 Z" />
        <path d="M14 -40 L52 -92 L58 -88 L20 -36 Z" />
        <path d="M-14 -6 L-22 34 L-12 34 L-2 2 L4 2 L14 34 L24 34 L16 -6 Z" />
      </g>
      <circle cx="470" cy="120" r="6" fill="#f05252" />
      <path d="M392 196 Q430 150 466 124" stroke="rgba(240,82,82,0.4)" strokeWidth="2" fill="none" strokeDasharray="4 6" />
    </svg>
  );
}

export function Home() {
  const game = useApp((s) => s.game);
  return (
    <div className="col" style={{ gap: 28 }}>
      <section className="home-hero">
        <div className="hero-art" aria-hidden="true"><Stadium /></div>
        <div className="hero-copy">
          <span className="kicker label"><i className="dot" /> IPL-style auction · T20 season · 1 to 6 friends</span>
          <h1>Cricket <em>Auction</em></h1>
          <p className="lede">Retain your core, fight for stars with Right to Match, then bat and bowl every ball yourself through a full season and the final.</p>
          <div className="home-actions">
            {game ? <button className="btn primary lg" onClick={() => store.resume()}>Continue game</button> : <button className="btn primary lg" onClick={() => store.go('setup')}>New game</button>}
            {game && <button className="btn lg" onClick={() => store.go('setup')}>New game</button>}
            <form className="join" onSubmit={(e) => { e.preventDefault(); const c = new FormData(e.currentTarget).get('code'); if (typeof c === 'string' && c.trim().length === 5) void store.joinRoom(c); }}>
              <input name="code" type="text" placeholder="CODE" aria-label="Room code from a friend" maxLength={5} autoComplete="off" />
              <button className="btn" type="submit">Join room</button>
            </form>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost" onClick={() => store.go('roster')}>The players</button>
            <button className="btn ghost" onClick={() => store.go('howto')}>How to play</button>
          </div>
        </div>
      </section>
      <div className="features">
        <div className="panel feature"><b>IPL auction</b><p>Retentions, Right to Match, official bid steps, an accelerated round. ₹120 Cr, 18-25 players.</p></div>
        <div className="panel feature"><b>Play every ball</b><p>Pick the delivery or shot, then nail the timing meter. Partners split batting and bowling.</p></div>
        <div className="panel feature"><b>A full season</b><p>League table with net run rate, IPL playoffs, the final, Orange and Purple Caps.</p></div>
        <div className="panel feature"><b>Play online</b><p>Share a 5-letter room code; friends join from their own phones.</p></div>
      </div>
    </div>
  );
}
