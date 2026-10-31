import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useApp } from '../../store/store';
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
      <FightReel />
    </section>
  );
}
