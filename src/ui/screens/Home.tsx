import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useApp } from '../../store/store';
import { ONLINE_AVAILABLE } from '../../online/client';
import { signInAsGuest, useAuth } from '../../online/auth';
import { openAccountDialog } from '../components/AccountMenu';
import { Film, type Beat } from '../film/Film';
import { useMotionOk } from '../motion/useMotionOk';

/** Sign in right from the start, so your record follows you; or a welcome back with your record. */
function AccountCard() {
  const a = useAuth();
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
  return (
    <div className="account-card">
      <div style={{ flexBasis: '100%' }}><strong>Sign in</strong> <span className="faint">to keep your wins and play online. Email and password, no waiting for links.</span></div>
      <button className="btn primary" onClick={() => openAccountDialog('signin')}>Sign in or create an account</button>
      <button type="button" className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); try { await signInAsGuest(); store.go('online'); } catch (err) { store.toast((err as Error).message, 'error'); } finally { setBusy(false); } }}>Play as guest</button>
    </div>
  );
}

// Real fight scenes: official clips the rights holders publish on YouTube (embedding
// them is how YouTube lets sites show them; nothing is copied into the game).
// Checked with YouTube's oEmbed: owner as listed, embedding allowed.
const CLIPS: Array<[id: string, title: string, show: string, owner: string]> = [
  ['NyPf5ipLFkU', 'Gojo vs Sukuna', 'Jujutsu Kaisen', 'Crunchyroll'],
  ['gr8reTtElqc', 'Luffy Gear 5 vs Kaido', 'One Piece', 'Crunchyroll'],
  ['s3kYr2OVoUc', 'Tanjiro faces Akaza', 'Demon Slayer: Infinity Castle', 'Aniplex USA'],
  ['CNWI9lJZ7aw', "Naruto's best fights", 'Naruto', 'Crunchyroll'],
  ['WnrfPSVtNaY', "Jinwoo's first solo battle", 'Solo Leveling', 'Crunchyroll'],
  ['Gjw-I7HWU10', 'Chainsaw vs Katana', 'Chainsaw Man', 'Crunchyroll'],
  ['nowY_icRZsQ', 'Gear 5 Luffy vs Kizaru', 'One Piece', 'Crunchyroll'],
  ['bLSQgT_So7Y', 'Tanjiro & Giyu vs Akaza', 'Demon Slayer: Infinity Castle', 'Aniplex USA'],
  ['dw3GT6THxnY', 'Jinwoo vs Kang Taeshik', 'Solo Leveling', 'Crunchyroll'],
  ['Cwk0bXiVRao', 'The final attack', 'Black Clover', 'Crunchyroll'],
  ['scPBmrzdD0g', 'Gear 5 for Rob Lucci', 'One Piece', 'Crunchyroll'],
  ['oGF9Zu9AV_Q', 'Denji vs the Bat Devil', 'Chainsaw Man', 'Crunchyroll Dubs'],
  ['xqz6bMgNdGU', 'Special attacks', 'Jujutsu Kaisen', 'Crunchyroll'],
];
const CLIP_MS = 45_000;
// Painted scenes (public/scenes) show behind each clip while it loads.
const POSTERS = ['naruto-sasuke', 'gojo-sukuna', 'goku-vegeta', 'luffy-kaido', 'ichigo-aizen', 'itachi-sasuke', 'deku-bakugo', 'zoro-mihawk', 'levi-titans', 'gon-killua'];

type YTPlayer = { mute(): void; unMute(): void; playVideo(): void; destroy(): void };
type YTApi = { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer };
let ytApi: Promise<YTApi> | null = null;
/** YouTube's player script, loaded once, so the reel can tell when a clip is blocked or ends. */
function loadYouTube(): Promise<YTApi> {
  const w = window as unknown as { YT?: YTApi & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
  ytApi ??= new Promise((resolve) => {
    if (w.YT?.Player) { resolve(w.YT); return; }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(w.YT!); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApi;
}

/** Official fight clips playing muted, in a random order. A clip the owner blocks in this
 *  country (YouTube error 150) is skipped, and the next starts when one ends. */
function FightReel() {
  const order = useMemo(() => CLIPS.map((c) => [Math.random(), c] as const).sort((a, b) => a[0] - b[0]).map(([, c]) => c), []);
  const [i, setI] = useState(0);
  const [sound, setSound] = useState(false);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const playable = order.filter((c) => !blocked.has(c[0]));
  const clip = playable.length ? playable[i % playable.length] : null;
  const next = () => setI((n) => n + 1);

  useEffect(() => {
    if (!clip || !host.current) return;
    let alive = true;
    const el = document.createElement('div');
    host.current.replaceChildren(el);
    const timer = setTimeout(next, CLIP_MS);
    void loadYouTube().then((YT) => {
      if (!alive) return;
      player.current = new YT.Player(el, {
        videoId: clip[0], host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%',
        playerVars: { autoplay: 1, mute: 1, controls: 0, rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: (e: { target: YTPlayer }) => { if (sound) e.target.unMute(); else e.target.mute(); e.target.playVideo(); },
          onStateChange: (e: { data: number }) => { if (e.data === 0) next(); },
          onError: () => { setBlocked((b) => new Set(b).add(clip[0])); },
        },
      });
    });
    return () => { alive = false; clearTimeout(timer); player.current?.destroy(); player.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.[0]]);
  useEffect(() => { if (sound) player.current?.unMute(); else player.current?.mute(); }, [sound]);

  if (!clip) return <div className="fight-reel" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}scenes/${POSTERS[0]}.jpg)` }} />;
  const [id, title, show, owner] = clip;
  return (
    <div className="fight-reel" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}scenes/${POSTERS[i % POSTERS.length]}.jpg)` }}>
      <div className="reel-video" ref={host} />
      <div className="reel-caption" key={`c-${id}`}><b>{title}</b><span>{show} · official clip, {owner}</span></div>
      <div className="reel-controls">
        <button className="btn sm" onClick={() => setSound((x) => !x)} aria-label={sound ? 'Mute' : 'Sound on'}>{sound ? '🔊' : '🔇'}</button>
        <button className="btn sm" onClick={next} aria-label="Next fight">Next ▶</button>
        <a className="btn sm ghost" href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noreferrer">YouTube</a>
      </div>
    </div>
  );
}


const MODES: Array<[title: string, text: string]> = [
  ['Tournament', 'Everyone drafts a team, then a bracket runs to one champion. Prep each match, make corner calls, and watch it play out as a comic or in the arena.'],
  ['Boss Raid', 'Pool your fighters against one to four of 47 anime villains. Bosses usually win, and every fighter’s share of the fight is scored with an MVP.'],
  ['Team Battle', '2v2, 3v3, or two against one. Each player picks their own fighters on their own device.'],
  ['Online rooms', 'Share a six-character code. Chat, react, invite friends, and everyone sees the same fight at the same moment.'],
];

/** The way in: a saved game first if there is one, then a new game, online, saved games. */
function Actions() {
  const game = useApp((s) => s.game);
  const saves = useApp((s) => s.saves);
  const resumable = saves.filter((s) => !s.archived && s.phase !== 'champion');
  return (
    <div className="menu">
      {game && <button className="btn primary lg" onClick={() => store.go('game')}>Return to “{game.config.name}”</button>}
      <button className={`btn lg ${game ? '' : 'primary'}`} onClick={() => store.go('setup')}>Create New Game</button>
      {ONLINE_AVAILABLE && <button className="btn lg" onClick={() => store.go('online')}>Play Online with Friends</button>}
      {saves.length > 0 && <button className="btn" onClick={() => store.go('saves')}>Continue Saved Game {resumable.length ? <span className="tag">{resumable.length}</span> : null}</button>}
    </div>
  );
}

function Links() {
  return (
    <div className="film-links">
      <button onClick={() => store.go('howto')}>How to Play</button>
      <button onClick={() => store.go('explorer')}>Characters</button>
      <button onClick={() => store.go('ranks')}>Leaderboards</button>
      <button onClick={() => store.go('hall')}>Hall of Legends</button>
    </div>
  );
}

/** One unbroken shot, scrubbed by scrolling: the words change, he never cuts away. */
export function Home() {
  const motionOk = useMotionOk();
  // The top bar floats over the film while this page is open.
  useEffect(() => {
    document.documentElement.dataset.film = '1';
    return () => { delete document.documentElement.dataset.film; };
  }, []);

  const beats: Beat[] = [
    { at: 0, title: 'Anime Auction', place: 'hero', interactive: true, kicker: 'A party game for 2 to 6 players',
      body: <><p>Bid on anime fighters with their true power hidden. Build a team. Survive the tournament.</p><Actions /><Links /></> },
    { at: 1, title: 'True power stays hidden', place: 'low-right',
      body: <p>Fighters come up one at a time. You see who they are and hints about their power, never the numbers.</p> },
    { at: 2, title: 'Bid', place: 'low-left', kicker: '01 / The auction',
      body: <><p>Everyone starts with <b>10,000</b> coins. Outbid your friends, or let a lot go cheap and pounce later.</p><ul className="film-facts"><li>Live bids</li><li>Friends or NPCs</li><li>One mystery lot</li></ul></> },
    { at: 3, title: 'Build', place: 'low-center', kicker: '02 / Your team',
      body: <p>A fighter&apos;s real stats unlock the moment you win them. Choose who fights, set tactics, and read the arena: the right element hits harder.</p> },
    { at: 4, title: 'Battle', place: 'low-left', kicker: '03 / The tournament',
      body: <p>A seeded combat engine settles every match: transformations mid-fight, secret moves when a teammate falls, plot twists, and up to five corner calls from you.</p> },
    { at: 5, title: 'One champion', place: 'low-center', kicker: 'Same draft, four ways to settle it',
      body: <ul className="film-modes">{MODES.map(([title, text]) => <li key={title}><h3>{title}</h3><p>{text}</p></li>)}</ul> },
    { at: 6, title: 'Your friends are waiting', place: 'right', kicker: 'Online rooms',
      body: <p>Make a room, share the six-character code, and everyone watches the same fight at the same moment.</p> },
    { at: 7, title: 'Your move', place: 'final', interactive: true,
      body: <><Actions /><AccountCard /><Links /></> },
  ];

  return (
    <div className="home-film">
      <Film beats={beats} motionOk={motionOk} pause={(
        <section className="film-reelwrap">
          <h2 className="film-reelhead">Watch the real fights</h2>
          <p className="film-reelnote">Official clips from the studios&apos; own channels, playing muted.</p>
          <LazyReel />
        </section>
      )} />
      <footer className="film-foot">
        <span className="film-foot-brand">Anime Auction</span>
        <Links />
        <span className="film-foot-note">A fan-made party game. Characters belong to their creators.</span>
      </footer>
    </div>
  );
}

/** The YouTube player is heavy (its script stalls the page for up to a second), so nothing of it
 *  loads until someone asks for it: scrolling past the reel never pays for it. */
function LazyReel() {
  const [playing, setPlaying] = useState(false);
  if (playing) return <div className="reel-slot"><FightReel /></div>;
  return (
    <div className="reel-slot">
      <button className="fight-reel film-reelstart" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}scenes/${POSTERS[0]}.jpg)` }} onClick={() => setPlaying(true)} aria-label="Play the fight reel">
        <span>Play the reel</span>
      </button>
    </div>
  );
}
