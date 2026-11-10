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
    <div className="col" style={{ gap: 24 }}>
      <section className="hero">
        <div className="hero-art"><Stadium /></div>
        <div className="hero-copy">
          <span className="label">A party game for friends · 1 to 6 players</span>
          <h1>Cricket <em>Auction</em></h1>
          <p className="lede">Bid for the season's stars with a live hammer and a hard purse, build a squad that obeys the rules, then captain it ball by ball through a T20 full of DRS calls, mind games and sledges.</p>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary lg" onClick={() => store.go('setup')}>New game</button>
            {game && <button className="btn lg" onClick={() => store.resume()}>Continue game</button>}
            <button className="btn ghost lg" onClick={() => store.go('roster')}>The players</button>
            <button className="btn ghost lg" onClick={() => store.go('howto')}>How to play</button>
          </div>
        </div>
      </section>
      <div className="feature-strip">
        <div><b>Live auction</b><span className="dim">Timer, extensions, scout tokens, a mystery lot and a second-chance round for the unsold.</span></div>
        <div><b>Squad rules</b><span className="dim">Keeper, bowlers, uncapped players, overseas caps. Miss a slot and you pay double.</span></div>
        <div><b>Captain's calls</b><span className="dim">Toss, bowling changes, DRS, Impact Player and secret yorker-or-slog mind games.</span></div>
        <div><b>1v4 Boss</b><span className="dim">Four friends share one franchise against a Boss NPC with a 2.5x war chest.</span></div>
      </div>
    </div>
  );
}
