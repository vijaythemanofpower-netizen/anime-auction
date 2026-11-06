// The home page: one unbroken shot of one character, scrubbed by scrolling. The picture is real
// footage (public/film, made by tools/make-film*.ts), so he actually moves as you scroll, forwards
// and backwards. The page around it only decides where in the take we are; the giant words live in
// the WebGL scene, small copy and buttons stay normal HTML. With reduced motion, or without
// WebGL2, the same copy is laid out as stills.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FilmPlayer, type WordDraw } from './FilmPlayer';
import { clipStarts, frameAt, gradeAt, presence, uAt, wordsFor, type Manifest, type Stop } from './timeline';

const ROOT = `${import.meta.env.BASE_URL}film`;
/** Where he is in the frame, per key pose: tall screens keep this part centred. */
const FOCUS = [0.33, 0.4, 0.62, 0.5, 0.72, 0.7, 0.62, 0.5];
const focusAt = (u: number) => {
  const c = Math.max(0, Math.min(FOCUS.length - 1, u)), i = Math.min(FOCUS.length - 2, Math.floor(c));
  return FOCUS[i] + (FOCUS[i + 1] - FOCUS[i]) * (c - i);
};

/** Where the take rests while the fight reel scrolls over it: just after the online scene. */
const PAUSE_AT = 6.2;

export interface Beat {
  at: number;
  /** The words as real text: drawn in the scene, read by screen readers, shown in the stills. */
  title: string;
  kicker?: string;
  body?: ReactNode;
  place: 'hero' | 'left' | 'right' | 'low-left' | 'low-right' | 'low-center' | 'final';
  interactive?: boolean;
}

/** Scroll positions -> key pose, measured from the page (cheap: only on load and resize). */
function measure(root: HTMLElement): Stop[] {
  const top = root.getBoundingClientRect().top + window.scrollY, vh = window.innerHeight;
  const pause = root.querySelector<HTMLElement>('.film-pause');
  const end = top + root.offsetHeight - vh;
  const hold = vh * 0.5;
  if (!pause) return [{ y: top, u: 0 }, { y: end - hold, u: 7 }];
  const a = top + pause.offsetTop - vh, b = top + pause.offsetTop + pause.offsetHeight;
  return [{ y: top, u: 0 }, { y: a, u: PAUSE_AT }, { y: b, u: PAUSE_AT }, { y: end - hold, u: 7 }];
}

export function Film({ beats, motionOk, pause, onScene }: { beats: Beat[]; motionOk: boolean; pause: ReactNode; onScene?: (u: number) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'loading' | 'film' | 'stills'>(motionOk ? 'loading' : 'stills');

  useEffect(() => { setMode(motionOk ? 'loading' : 'stills'); }, [motionOk]);

  useEffect(() => {
    if (!motionOk) return;
    const el = root.current, cv = canvas.current;
    if (!el || !cv) return;
    let alive = true, raf = 0, player: FilmPlayer | null = null;
    let stops: Stop[] = [], u = 0, last = 0, t0 = 0, words: WordDraw[] = [];
    let focusOn = true;
    let px = 0, py = 0, tx = 0, ty = 0, slow = 0, seen = 0, onScreen = true;
    const beatEls = [...el.querySelectorAll<HTMLElement>('.film-beat')];
    const shown = beatEls.map(() => -1);
    const fail = () => { if (alive) setMode('stills'); };

    const build = () => {
      if (!player) return;
      player.resize(window.innerWidth, window.innerHeight);
      player.clearWords();
      const list = wordsFor(window.innerWidth / window.innerHeight);
      words = list.map((w) => player!.makeWord(w, player!.canvas.height));
      stops = measure(el);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!player || !onScreen || document.hidden) { last = 0; return; }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
      // Adaptive: if this device keeps missing frames, render fewer pixels rather than stutter.
      if (last) { seen++; if (dt > 0.024) slow++; }
      if (seen >= 90) {
        if (slow / seen > 0.3 && player.scale > 0.6) { player.scale = player.scale > 0.85 ? 0.8 : 0.62; player.sharpen = 0; build(); }
        seen = 0; slow = 0;
      }
      last = now;
      const time = now / 1000;
      const target = uAt(window.scrollY, stops);
      u += (target - u) * (1 - Math.exp(-dt * 7));
      if (Math.abs(target - u) < 0.0002) u = target;
      tx += (px - tx) * (1 - Math.exp(-dt * 3)); ty += (py - ty) * (1 - Math.exp(-dt * 3));
      const intro = t0 ? Math.min(1, (now - t0) / 1800) : 0;
      const eased = 1 - (1 - intro) ** 3;
      const g = gradeAt(u);
      const { total } = clipStarts(man.clips);
      // A little of the footage is always playing back and forth: he breathes even at rest.
      const breathe = Math.sin(time * 0.9) * 0.55;
      const f = Math.max(0, Math.min(total - 1, frameAt(u, man.clips) + breathe + 0.6));
      const aspect = window.innerWidth / window.innerHeight;
      player.render({
        frame: f,
        zoom: 1.03 + (1 - eased) * 0.09 + Math.sin(time * 0.45) * 0.004,
        panX: tx * 0.012, panY: ty * 0.012,
        focusX: !focusOn || aspect >= 16 / 9 ? 0.5 : focusAt(u),
        exposure: g.exposure * eased,
        accent: g.accent,
        flash: g.flash,
        smoke: g.smoke + (1 - eased) * 0.5,
        words: words.map((w) => {
          const d = u - w.word.at;
          const p = presence(u, w.word.at);
          return { w, x: w.word.x + d * w.word.drift, y: w.word.y, scale: 1 + d * 0.05, burn: (w.word.at === 0 ? p * eased : p) };
        }),
      }, time);
      onScene?.(u);
      beatEls.forEach((b, i) => {
        const at = Number(b.dataset.at);
        const p = Math.round(presence(u, at, 0.22, 0.13, 0.2) * 100) / 100 * (at === 0 ? eased : 1);
        if (p === shown[i]) return;
        const was = shown[i]; shown[i] = p;
        b.style.opacity = String(p);
        b.style.transform = `translate3d(0, ${((1 - p) * (u < at ? 26 : -26)).toFixed(1)}px, 0)`;
        if ((p > 0.5) !== (was > 0.5)) { b.toggleAttribute('inert', p <= 0.5); b.classList.toggle('on', p > 0.5); }
      });
    };

    let man: Manifest = { sizes: [], w: 16, h: 9, clips: [] };
    const start = async () => {
      try {
        // Upright screens get their own vertical take rather than a crop of the wide one.
        const tall = window.innerWidth / window.innerHeight < 0.8;
        const base = tall ? `${ROOT}/tall` : ROOT;
        focusOn = !tall;
        const r = await fetch(`${base}/manifest.json`);
        if (!r.ok) throw new Error('no film');
        man = await r.json() as Manifest;
        await document.fonts.load('400 200px Anton').catch(() => undefined);
        if (!alive) return;
        const want = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2);
        // Slow connections and Data Saver get the lightest set.
        const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
        const light = !!net && (net.saveData || (net.effectiveType !== undefined && net.effectiveType !== '4g'));
        const size = light ? man.sizes[man.sizes.length - 1] : [...man.sizes].reverse().find((s) => s >= want * 0.9) ?? man.sizes[0];
        const keep = window.innerWidth < 700 ? 16 : 28;
        player = new FilmPlayer(cv, `${base}/${size}`, clipStarts(man.clips).total, keep);
        player.onFirstFrame = () => { t0 = performance.now(); setMode('film'); };
        cv.addEventListener('webglcontextlost', fail);
        build();
        void player.loadAll(true);
        raf = requestAnimationFrame(frame);
      } catch { fail(); }
    };
    void start();

    const onMove = (e: PointerEvent) => { if (e.pointerType === 'mouse') { px = e.clientX / window.innerWidth - 0.5; py = e.clientY / window.innerHeight - 0.5; } };
    let resizeT = 0;
    const onResize = () => { window.clearTimeout(resizeT); resizeT = window.setTimeout(build, 150); };
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }, { threshold: 0 });
    const stage = el.querySelector('.film-stage');
    if (stage) io.observe(stage);
    // The page's height changes when the reel loads: keep scroll positions true.
    const ro = new ResizeObserver(() => { stops = measure(el); });
    ro.observe(el);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      cancelAnimationFrame(raf); window.clearTimeout(resizeT); io.disconnect(); ro.disconnect();
      window.removeEventListener('pointermove', onMove); window.removeEventListener('resize', onResize);
      cv.removeEventListener('webglcontextlost', fail);
      player?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionOk]);

  const stills = mode === 'stills';
  return (
    <div ref={root} className={`film${stills ? ' stills' : ''}${mode === 'film' ? ' ready' : ''}`}>
      {!stills && (
        <div className="film-stage">
          <picture>
            <source media="(max-aspect-ratio: 4/5)" srcSet={`${ROOT}/tall/key/0.webp`} />
            <img className="film-poster" src={`${ROOT}/key/0.webp`} alt="" {...{ fetchpriority: 'high' }} />
          </picture>
          <canvas ref={canvas} className="film-canvas" aria-hidden="true" />
          {beats.map((b) => <BeatCopy key={b.at} b={b} />)}
        </div>
      )}
      {stills ? (
        <>
          {beats.filter((b) => b.at < 6).map((b) => <div className="film-still" key={b.at}><img src={`${ROOT}/key/${b.at}.webp`} alt="" loading="lazy" /><BeatCopy b={b} /></div>)}
          {pause}
          {beats.filter((b) => b.at >= 6).map((b) => <div className="film-still" key={b.at}><img src={`${ROOT}/key/${b.at}.webp`} alt="" loading="lazy" /><BeatCopy b={b} /></div>)}
        </>
      ) : (
        <div className="film-track">
          <div className="film-run a" />
          <div className="film-pause">{pause}</div>
          <div className="film-run b" />
        </div>
      )}
    </div>
  );
}

function BeatCopy({ b }: { b: Beat }) {
  const Title = b.at === 0 ? 'h1' : 'h2';
  return (
    <section className={`film-beat at-${b.place}`} data-at={b.at} style={{ opacity: 0 }}>
      {b.kicker && <div className="film-kicker">{b.kicker}</div>}
      <Title className="film-title">{b.title}</Title>
      {b.body && <div className="film-body">{b.body}</div>}
    </section>
  );
}
