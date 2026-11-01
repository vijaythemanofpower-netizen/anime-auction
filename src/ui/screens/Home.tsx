import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useApp } from '../../store/store';
import { ONLINE_AVAILABLE } from '../../online/client';
import { signInAsGuest, useAuth } from '../../online/auth';
import { openAccountDialog } from '../components/AccountMenu';
import { Portrait } from '../components/Portrait';
import { LEGEND_CHARACTERS } from '../../engine/data/legends';
import { canonStats } from '../../engine/data/canonStats';
import { STAT_LABELS } from '../../engine/hidden';
import type { StatKey } from '../../engine/types';
import { motion } from 'framer-motion';
import { Chapter, HeroKanji, HeroScenes, KineticTitle, NameBand, useHeroParallax } from '../motion/HomeMotion';

const BAND_A = LEGEND_CHARACTERS.slice(0, 38).map((c) => c.name);
const BAND_B = LEGEND_CHARACTERS.slice(38).map((c) => c.name);

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


// The hero's lot card: a built-in fighter goes under the hammer with their stats blacked
// out, a few bids land, SOLD slams down and one stat is revealed. Then the next lot.
const LOT_STATS: StatKey[] = ['attack', 'speed', 'technique', 'battleIQ'];
const LOT_BIDDERS = ['Ren', 'Aiko', 'Kai', 'Mio'];
const BID_MS = 520;
const HOLD_MS = 3800;
const LOT_POOL = LEGEND_CHARACTERS.filter((c) => canonStats(c.id));

function makeLot(prev?: number) {
  let n = Math.floor(Math.random() * LOT_POOL.length);
  if (n === prev) n = (n + 1) % LOT_POOL.length;
  const c = LOT_POOL[n];
  const stats = canonStats(c.id)!;
  // Stronger fighters go for more; bids climb in uneven steps to the final price.
  const price = Math.round((1200 + (stats.attack + stats.technique - 140) * 45) / 50) * 50;
  const bids = [0.22, 0.41, 0.58, 0.79, 1].map((f, i) => ({ who: LOT_BIDDERS[(n + i) % LOT_BIDDERS.length], amount: Math.round((price * f) / 50) * 50 }));
  return { n, c, stats, bids, reveal: LOT_STATS[n % LOT_STATS.length], number: 3 + (n % 21) };
}

function useMotionOk() {
  const setting = useApp((s) => s.settings.reducedMotion);
  const [systemReduce, setSystemReduce] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const q = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSystemReduce(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return setting === 'off' || (setting === 'system' && !systemReduce);
}

function LotCard() {
  const motionOk = useMotionOk();
  const [lot, setLot] = useState(() => makeLot());
  const [step, setStep] = useState(0); // bids shown so far; bids.length + 1 = sold
  const [imgFailed, setImgFailed] = useState(false);
  const sold = step > lot.bids.length;
  const shownStep = motionOk ? step : lot.bids.length + 1;

  useEffect(() => {
    if (!motionOk) return;
    const t = setTimeout(() => {
      if (sold) { setLot((l) => makeLot(l.n)); setImgFailed(false); setStep(0); }
      else setStep((s) => s + 1);
    }, sold ? HOLD_MS : step === 0 ? 900 : BID_MS);
    return () => clearTimeout(t);
  }, [step, sold, motionOk]);

  const { c, stats, bids, reveal } = lot;
  const done = shownStep > bids.length;
  const top = bids[Math.min(shownStep, bids.length) - 1];
  return (
    <aside className={`lot-card${done ? ' sold' : ''}`} aria-label="Example lot" key={lot.n}>
      <header className="lot-head">
        <span className="lot-no">Lot {String(lot.number).padStart(2, '0')}</span>
        <span className="lot-series">{c.series}</span>
      </header>
      <div className="lot-pic">
        {c.imageUrl && !imgFailed
          ? <img src={c.imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
          : <Portrait c={c} />}
        <div className="lot-stamp" aria-hidden={!done}>Sold</div>
      </div>
      <div className="lot-body">
        <div className="lot-name">{c.name}</div>
        <div className="lot-role">{c.archetype} · {c.specialty}</div>
        <ul className="lot-stats">
          {LOT_STATS.map((k) => {
            const open = done && k === reveal;
            return (
              <li key={k} className={open ? 'open' : ''}>
                <span>{STAT_LABELS[k]}</span>
                <span className="lot-bar" aria-label={open ? `${STAT_LABELS[k]} ${stats[k]}` : `${STAT_LABELS[k]} hidden`}><i style={{ width: open ? `${stats[k]}%` : undefined }} /></span>
                <b>{open ? stats[k] : '??'}</b>
              </li>
            );
          })}
        </ul>
      </div>
      <footer className="lot-bid" aria-live="polite">
        <span className="lot-who">{done ? `Sold to ${top.who}` : top ? `${top.who} bids` : 'Opening bid'}</span>
        <span className="coins" key={shownStep}>{(top?.amount ?? 0).toLocaleString()}</span>
      </footer>
    </aside>
  );
}

const MODES: Array<[title: string, text: string, wide?: boolean]> = [
  ['Tournament', 'Everyone drafts a team, then a bracket runs to one champion. Prep each match, make corner calls, and watch it play out as a comic or in the arena.', true],
  ['Boss Raid', 'Pool your fighters against one to four of 47 anime villains. Bosses usually win, and every fighter’s share of the fight is scored with an MVP.'],
  ['Team Battle', '2v2, 3v3, or two against one. Each player picks their own fighters on their own device.'],
  ['Online rooms', 'Share a six-character code. Chat, react, invite friends, and everyone sees the same fight at the same moment.'],
];

export function Home() {
  const game = useApp((s) => s.game);
  const saves = useApp((s) => s.saves);
  const resumable = saves.filter((s) => !s.archived && s.phase !== 'champion');
  const heroRef = useRef<HTMLElement>(null);
  const px = useHeroParallax(heroRef);

  return (
    <>
      <section className="hero home-hero" ref={heroRef}>
        <div className="anime-fx" aria-hidden="true"><div className="speed-burst" /></div>
        <HeroScenes y={px.kanji} />
        <HeroKanji y={px.kanji} />
        <motion.div className="hero-copy" style={{ y: px.copy, opacity: px.fade }}>
          <KineticTitle lines={[{ text: 'Anime Auction', className: 'l1' }, { text: 'Ultimate Battle Arena', className: 'l2' }]} />
          <div className="logo-sub">Bid · Build · Battle</div>
          <p className="hero-pitch">
            Anime fighters go under the hammer with their true power hidden. Spend <span className="coins">10,000</span> wisely,
            build a team, and survive a tournament settled by a real combat simulation.
          </p>
          <p className="hero-meta">2–6 players, on one screen or online.</p>
          <div className="menu">
            {game && <button className="btn primary lg" onClick={() => store.go('game')}>▶ Return to “{game.config.name}”</button>}
            <button className={`btn lg ${game ? '' : 'primary'}`} onClick={() => store.go('setup')}>✦ Create New Game</button>
            {ONLINE_AVAILABLE && <button className="btn lg" onClick={() => store.go('online')}>🌐 Play Online with Friends</button>}
            {saves.length > 0 && <button className="btn" onClick={() => store.go('saves')}>⟲ Continue Saved Game {resumable.length ? <span className="tag">{resumable.length}</span> : null}</button>}
          </div>
          <AccountCard />
          {/* Everything else lives in the top bar (Characters, Hall, Settings) or here, once. */}
          <div className="row home-links">
            <button className="btn sm ghost" onClick={() => store.go('howto')}>? How to Play</button>
            <button className="btn sm ghost" onClick={() => store.go('explorer')}>◎ Characters</button>
            <button className="btn sm ghost" onClick={() => store.go('hall')}>♛ Hall of Legends</button>
          </div>
        </motion.div>
        <motion.div className="lot-wrap" style={{ y: px.card, rotate: px.cardRot }}><LotCard /></motion.div>
      </section>

      <NameBand names={BAND_A} />

      <section className="home-section">
        <Chapter n={1} kana="流れ">How a game goes</Chapter>
        <ol className="home-steps">
          <li><b>Bid</b><p>Fighters come up one at a time. You see who they are and hints about their power, never the numbers. Outbid your friends, or let a lot go cheap.</p></li>
          <li><b>Build</b><p>A fighter's real stats unlock the moment you win them. Choose who fights, set tactics, and check the arena: some fighters suit it better.</p></li>
          <li><b>Battle</b><p>A seeded combat engine settles every match, with forms, secret moves and plot twists. Call shots from the corner while it plays.</p></li>
        </ol>
      </section>

      <section className="home-section">
        <Chapter n={2} kana="戦い方">Ways to fight</Chapter>
        <div className="home-modes">
          {MODES.map(([title, text, wide]) => (
            <div key={title} className={`mode-panel${wide ? ' wide' : ''}`}><h3>{title}</h3><p>{text}</p></div>
          ))}
        </div>
      </section>

      <NameBand names={BAND_B} reverse />

      <section className="home-section">
        <Chapter n={3} kana="名勝負">Watch the real fights</Chapter>
        <p className="muted home-note">Official clips from the studios' own channels, playing muted. Turn the sound on or skip to the next.</p>
        <FightReel />
      </section>
    </>
  );
}
