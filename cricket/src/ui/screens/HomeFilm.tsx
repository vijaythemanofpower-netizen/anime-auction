// The home page as a scroll-driven film, in the spirit of the anime game's home: one pinned
// stage, scrubbed by scrolling, giant outlined words, short copy per beat. The anime film plays
// real footage; this one draws a night match live on a canvas (no image files): the floodlights
// come on, the scoreboard shouts SOLD, a ball is hit for six into the crowd, fireworks for the
// champions. Reduced motion shows the same beats as stills.
import { useEffect, useRef, type ReactNode } from 'react';

export interface Beat { at: number; word: string; kicker?: string; body?: ReactNode; place: 'hero' | 'low-left' | 'low-right' | 'final' }

const LAST = 6;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
/** How present a beat is at scene position u (0 far away, 1 on screen). */
const presence = (u: number, at: number) => smooth(1 - Math.abs(u - at) / 0.48);

/** Deterministic pseudo-random numbers, so the crowd doesn't jump between frames. */
const rand = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Draw the whole scene for position u at time t (seconds). */
function draw(cx: CanvasRenderingContext2D, w: number, h: number, u: number, t: number) {
  const lights = smooth((u - 0.35) / 0.6);                // floodlights switch on after the title
  const zoom = 1 + clamp(u / LAST) * 0.18;                  // a slow dolly towards the pitch
  cx.save();
  cx.fillStyle = '#03050c'; cx.fillRect(0, 0, w, h);
  // Sky.
  const sky = cx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#060b1f'); sky.addColorStop(0.55, `rgba(16, 30, 74, ${0.5 + lights * 0.5})`); sky.addColorStop(1, '#03050c');
  cx.fillStyle = sky; cx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { cx.globalAlpha = (0.25 + 0.5 * rand(i)) * (1 - lights * 0.6); cx.fillStyle = '#fff'; cx.fillRect(rand(i + 9) * w, rand(i + 99) * h * 0.45, 1.5, 1.5); }
  cx.globalAlpha = 1;
  cx.translate(w / 2, h * 0.62); cx.scale(zoom, zoom); cx.translate(-w / 2, -h * 0.62);

  // Stands: dark tiers with a crowd of tiny coloured dots and camera flashes.
  const bowlY = h * 0.5;
  for (let tier = 0; tier < 5; tier++) {
    cx.fillStyle = `rgba(${10 + tier * 4}, ${16 + tier * 5}, ${40 + tier * 8}, 1)`;
    cx.beginPath(); cx.ellipse(w / 2, bowlY + tier * h * 0.035, w * (0.78 - tier * 0.04), h * (0.2 - tier * 0.02), 0, Math.PI, 0); cx.fill();
  }
  const crowd = Math.round(w / 3.2);
  const flashes = 0.004 + smooth((u - 3.6) / 0.6) * 0.05;
  for (let i = 0; i < crowd; i++) {
    const a = Math.PI + rand(i) * Math.PI, r = 0.62 + rand(i + 7) * 0.34;
    const x = w / 2 + Math.cos(a) * w * 0.74 * r, y = bowlY + Math.sin(a) * h * 0.19 * r + h * 0.02;
    const flash = rand(i * 3 + Math.floor(t * 6)) < flashes;
    cx.fillStyle = flash ? '#fff' : `hsla(${Math.floor(rand(i + 3) * 360)}, 70%, ${35 + lights * 25}%, ${0.5 + lights * 0.5})`;
    cx.fillRect(x, y, flash ? 3 : 2, flash ? 3 : 2);
  }

  // Floodlight towers: lamps light up one after the other; soft beams.
  for (const side of [-1, 1]) {
    const x = w / 2 + side * w * 0.42, top = h * 0.12;
    cx.fillStyle = '#05070f'; cx.fillRect(x - 4, top, 8, bowlY - top + 10);
    for (let k = 0; k < 6; k++) {
      const on = smooth(lights * 6 - k - (side > 0 ? 0.5 : 0));
      cx.fillStyle = `rgba(255, 244, 214, ${0.15 + on * 0.85})`;
      cx.fillRect(x - 30 + (k % 3) * 21, top - 18 + Math.floor(k / 3) * 13, 18, 10);
    }
    if (lights > 0) {
      const beam = cx.createRadialGradient(x, top, 4, x - side * w * 0.2, h * 0.75, h * 0.9);
      beam.addColorStop(0, `rgba(255, 236, 190, ${0.45 * lights})`); beam.addColorStop(1, 'rgba(255, 236, 190, 0)');
      cx.fillStyle = beam; cx.beginPath(); cx.moveTo(x - 30, top); cx.lineTo(x + 30, top); cx.lineTo(x - side * w * 0.55, h * 1.05); cx.lineTo(x - side * w * 0.05, h * 1.05); cx.closePath(); cx.fill();
    }
  }

  // The ground: mown stripes, the strip, the stumps.
  const gy = h * 0.66;
  cx.fillStyle = `rgb(${14 + lights * 14}, ${52 + lights * 40}, ${34 + lights * 18})`;
  cx.beginPath(); cx.ellipse(w / 2, gy + h * 0.2, w * 0.7, h * 0.32, 0, 0, Math.PI * 2); cx.fill();
  for (let s = 0; s < 9; s++) { cx.fillStyle = `rgba(255,255,255,${s % 2 ? 0.025 : 0})`; cx.fillRect(w / 2 - w * 0.7 + s * w * 0.156, gy - h * 0.12, w * 0.078, h * 0.6); }
  cx.fillStyle = `rgba(214, 196, 140, ${0.55 + lights * 0.4})`;
  cx.beginPath(); cx.moveTo(w / 2 - w * 0.025, gy - h * 0.04); cx.lineTo(w / 2 + w * 0.025, gy - h * 0.04); cx.lineTo(w / 2 + w * 0.06, h); cx.lineTo(w / 2 - w * 0.06, h); cx.closePath(); cx.fill();
  const stumpY = h * 0.76;
  cx.fillStyle = '#f2ead6'; for (let k = -1; k <= 1; k++) cx.fillRect(w / 2 + k * 7 - 2, stumpY - 34, 4, 34);

  // BID: the big screen shouts SOLD.
  const sold = presence(u, 3);
  if (sold > 0.01) {
    const sw = Math.min(w * 0.46, 560), sh = sw * 0.36, sx = w / 2 - sw / 2, sy = h * 0.14;
    cx.globalAlpha = sold;
    cx.fillStyle = '#05070f'; cx.fillRect(sx - 8, sy - 8, sw + 16, sh + 16);
    cx.fillStyle = '#0b1230'; cx.fillRect(sx, sy, sw, sh);
    const blink = 0.75 + 0.25 * Math.sin(t * 9);
    cx.fillStyle = `rgba(255, 61, 110, ${blink})`; cx.font = `800 ${sh * 0.42}px "Saira Condensed", Impact, sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('SOLD!', w / 2, sy + sh * 0.36);
    cx.fillStyle = '#ffd766'; cx.font = `800 ${sh * 0.26}px "Saira Condensed", Impact, sans-serif`;
    cx.fillText('₹18.5 CR', w / 2, sy + sh * 0.76);
    cx.globalAlpha = 1;
  }

  // PLAY: bowled, struck, gone for six. Batter silhouette at the near crease.
  const play = clamp((u - 3.5) / 1.4);
  if (play > 0) {
    const bx = w / 2 - 26, by = stumpY;
    const swing = smooth((play - 0.35) / 0.12);
    cx.fillStyle = '#02040b';
    cx.beginPath(); cx.arc(bx, by - 96, 11, 0, Math.PI * 2); cx.fill();         // helmet
    cx.fillRect(bx - 11, by - 84, 22, 46);                                     // body
    cx.fillRect(bx - 11, by - 40, 8, 40); cx.fillRect(bx + 3, by - 40, 8, 40);  // legs
    cx.save(); cx.translate(bx + 8, by - 70); cx.rotate(-1.9 + swing * 2.6); cx.fillRect(-3, 0, 6, 46); cx.restore();
    // The ball: from the bowler's end to the bat, then a long arc into the stands.
    const hit = 0.42;
    const at = (q: number): [number, number] => {
      if (q < hit) { const k = q / hit; return [w / 2 + 6, gy - h * 0.02 + k * (by - 60 - gy)]; }
      const k = clamp((q - hit) / 0.45);
      return [bx + 20 + k * w * 0.42, by - 60 - Math.sin(k * Math.PI * 0.85) * h * 0.55 - k * h * 0.05];
    };
    if (play < 0.9) {
      cx.strokeStyle = 'rgba(255, 90, 110, 0.5)'; cx.lineWidth = 3; cx.beginPath();
      for (let k = 0; k < 10; k++) { const [x, y] = at(Math.max(0, play - k * 0.012)); if (k) cx.lineTo(x, y); else cx.moveTo(x, y); }
      cx.stroke();
      const [px, py] = at(play);
      cx.fillStyle = '#ff3d6e'; cx.beginPath(); cx.arc(px, py, 5, 0, Math.PI * 2); cx.fill();
    }
    const boom = smooth((play - 0.86) / 0.06) * (1 - smooth((play - 0.97) / 0.08));
    if (boom > 0) { const g = cx.createRadialGradient(bx + w * 0.42, by - h * 0.6, 2, bx + w * 0.42, by - h * 0.6, h * 0.35); g.addColorStop(0, `rgba(255,255,255,${boom})`); g.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = g; cx.fillRect(0, 0, w, h); }
  }

  // WIN: fireworks over the stands and a trophy rising.
  const win = smooth((u - 4.6) / 0.6);
  if (win > 0) {
    for (let f = 0; f < 7; f++) {
      const cyc = (t * 0.45 + rand(f)) % 1, fx = w * (0.15 + rand(f + 20) * 0.7), fy = h * (0.12 + rand(f + 40) * 0.25);
      const hue = [45, 340, 170, 200, 30][f % 5];
      for (let s = 0; s < 22; s++) {
        const a = (s / 22) * Math.PI * 2, r = cyc * h * 0.16;
        cx.fillStyle = `hsla(${hue}, 95%, 65%, ${win * (1 - cyc)})`;
        cx.fillRect(fx + Math.cos(a) * r, fy + Math.sin(a) * r + cyc * cyc * 30, 3, 3);
      }
    }
    const ty = h * 0.62 - win * h * 0.1, tw = Math.min(w, h) * 0.09;
    const gold = cx.createLinearGradient(0, ty - tw * 2, 0, ty + tw);
    gold.addColorStop(0, '#fff1b8'); gold.addColorStop(1, '#d99a12');
    cx.globalAlpha = win; cx.fillStyle = gold;
    cx.beginPath(); cx.moveTo(w / 2 - tw, ty - tw * 1.9); cx.lineTo(w / 2 + tw, ty - tw * 1.9); cx.quadraticCurveTo(w / 2 + tw * 0.9, ty - tw * 0.6, w / 2 + tw * 0.18, ty - tw * 0.35);
    cx.lineTo(w / 2 + tw * 0.18, ty + tw * 0.2); cx.lineTo(w / 2 + tw * 0.6, ty + tw * 0.5); cx.lineTo(w / 2 - tw * 0.6, ty + tw * 0.5); cx.lineTo(w / 2 - tw * 0.18, ty + tw * 0.2);
    cx.lineTo(w / 2 - tw * 0.18, ty - tw * 0.35); cx.quadraticCurveTo(w / 2 - tw * 0.9, ty - tw * 0.6, w / 2 - tw, ty - tw * 1.9); cx.fill();
    cx.globalAlpha = 1;
  }
  cx.restore();
  // Title card: black, then the scene fades in under it.
  const card = 1 - smooth((u - 0.15) / 0.5);
  if (card > 0) { cx.fillStyle = `rgba(3, 5, 12, ${card * 0.85})`; cx.fillRect(0, 0, w, h); }
  // Vignette.
  const v = cx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
  cx.fillStyle = v; cx.fillRect(0, 0, w, h);
}

export function HomeFilm({ beats, still }: { beats: Beat[]; still: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    document.documentElement.dataset.film = '';
    return () => { delete document.documentElement.dataset.film; };
  }, []);

  useEffect(() => {
    const el = root.current, cv = canvas.current;
    if (!el || !cv) return;
    const cx = cv.getContext('2d');
    if (!cx) return;
    let raf = 0, u = still ? 1 : 0, alive = true;
    const words = [...el.querySelectorAll<HTMLElement>('.cf-word')];
    const copy = [...el.querySelectorAll<HTMLElement>('.cf-beat')];
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const target = () => {
      const r = el.getBoundingClientRect();
      const run = el.offsetHeight - window.innerHeight;
      return clamp(-r.top / Math.max(1, run)) * LAST;
    };
    const frame = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!still) u += (target() - u) * 0.12;
      draw(cx, cv.clientWidth, cv.clientHeight, u, still ? 2 : now / 1000);
      if (still) return;
      words.forEach((wd, i) => {
        const p = presence(u, beats[i].at), d = u - beats[i].at;
        wd.style.opacity = String(p);
        wd.style.transform = `translate3d(${(-d * 6).toFixed(2)}vw, 0, 0) scale(${(1 + Math.abs(d) * 0.08).toFixed(3)})`;
      });
      copy.forEach((c, i) => {
        const p = presence(u, beats[i].at);
        c.style.opacity = String(p);
        c.style.transform = `translate3d(0, ${((1 - p) * (u < beats[i].at ? 24 : -24)).toFixed(1)}px, 0)`;
        const on = p > 0.5;
        if (c.classList.contains('on') !== on) { c.classList.toggle('on', on); c.toggleAttribute('inert', !on); }
      });
    };
    size();
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(size); ro.observe(cv);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [beats, still]);

  if (still) {
    return (
      <div ref={root} className="cf stills">
        <canvas ref={canvas} className="cf-canvas fixed" aria-hidden="true" />
        {beats.map((b) => <section key={b.at} className={`cf-still cf-beat at-${b.place} on`}><Copy b={b} heading /></section>)}
      </div>
    );
  }
  return (
    <div ref={root} className="cf">
      <div className="cf-stage">
        <canvas ref={canvas} className="cf-canvas" aria-hidden="true" />
        <div className="cf-seam" aria-hidden="true" />
        {beats.map((b) => <div key={b.at} className={`cf-word ${b.at === 0 ? 'cf-title' : ''}`} aria-hidden="true">{b.word}</div>)}
        {beats.map((b) => <section key={b.at} className={`cf-beat at-${b.place}`} style={{ opacity: 0 }}><Copy b={b} /></section>)}
        <div className="cf-scroll" aria-hidden="true">Scroll</div>
      </div>
    </div>
  );
}

function Copy({ b, heading = false }: { b: Beat; heading?: boolean }) {
  const H = b.at === 0 ? 'h1' : 'h2';
  return (
    <>
      {b.kicker && <div className="cf-kicker">{b.kicker}</div>}
      <H className={heading ? 'cf-heading' : 'cf-sr'}>{b.word}</H>
      {b.body && <div className="cf-body">{b.body}</div>}
    </>
  );
}
