// The living background behind every page: one canvas whose atmosphere follows
// where you are in the universe. The opening burns with embers under drifting
// ink smoke and far-off lightning; the auction house sweeps crimson spotlights
// through dust; the character archive floats in electric motes; the hall of
// legends rains gold; quiet pages (settings, saves) get a slow, calm drift.
// Battles have their own living arena, so the page behind them stays dim.
// Canvas 2D, pooled particles, capped resolution, paused when the tab is hidden;
// with reduced motion it paints one still frame.
import { useEffect, useRef } from 'react';
import { useApp } from '../../store/store';
import { useMotionOk } from '../motion/useMotionOk';

type Kind = 'ember' | 'mote' | 'gold' | 'snow' | 'petal' | 'spark';
interface Mood {
  particles: Array<[Kind, number]>;
  smoke: number;
  /** Spotlight cones sweeping (auction house). */
  spots: number;
  /** Chance per second of a far lightning flash. */
  flash: number;
  /** Colour of the light pooling at the bottom of the page. */
  glow: string;
  glowAlpha: number;
}

const MOODS: Record<string, Mood> = {
  home: { particles: [['ember', 70], ['spark', 14]], smoke: 5, spots: 0, flash: 0.06, glow: '232, 23, 58', glowAlpha: 0.22 },
  auction: { particles: [['mote', 60], ['gold', 18]], smoke: 3, spots: 2, flash: 0, glow: '242, 177, 52', glowAlpha: 0.12 },
  explorer: { particles: [['mote', 70], ['spark', 10]], smoke: 2, spots: 0, flash: 0.02, glow: '43, 210, 255', glowAlpha: 0.14 },
  hall: { particles: [['gold', 60], ['petal', 12]], smoke: 2, spots: 1, flash: 0, glow: '242, 177, 52', glowAlpha: 0.16 },
  tournament: { particles: [['ember', 40], ['gold', 16]], smoke: 3, spots: 2, flash: 0.03, glow: '232, 23, 58', glowAlpha: 0.14 },
  prep: { particles: [['mote', 50], ['spark', 8]], smoke: 3, spots: 0, flash: 0.02, glow: '43, 210, 255', glowAlpha: 0.12 },
  battle: { particles: [['ember', 18]], smoke: 2, spots: 0, flash: 0, glow: '232, 23, 58', glowAlpha: 0.08 },
  champion: { particles: [['gold', 80], ['petal', 30], ['spark', 20]], smoke: 2, spots: 2, flash: 0, glow: '242, 177, 52', glowAlpha: 0.22 },
  online: { particles: [['mote', 60], ['spark', 18]], smoke: 2, spots: 0, flash: 0.03, glow: '43, 210, 255', glowAlpha: 0.14 },
  calm: { particles: [['snow', 40]], smoke: 2, spots: 0, flash: 0, glow: '240, 236, 228', glowAlpha: 0.05 },
};

function moodFor(screen: string, phase?: string): Mood {
  if (screen === 'game') {
    if (phase === 'auction' || phase === 'pool') return MOODS.auction;
    if (phase === 'battle') return MOODS.battle;
    if (phase === 'champion') return MOODS.champion;
    if (phase === 'prep' || phase === 'reveal') return MOODS.prep;
    return MOODS.tournament;
  }
  if (screen === 'home' || screen === 'setup') return MOODS.home;
  if (screen === 'explorer') return MOODS.explorer;
  if (screen === 'hall') return MOODS.hall;
  if (screen === 'online') return MOODS.online;
  return MOODS.calm;
}

interface P { k: Kind; x: number; y: number; vx: number; vy: number; s: number; a: number; ph: number; life: number }
interface Puff { x: number; y: number; r: number; vx: number; a: number }

const COLORS: Record<Kind, string[]> = {
  ember: ['255,90,60', '255,140,60', '232,23,58'], mote: ['154,234,255', '43,210,255', '240,236,228'], gold: ['242,177,52', '255,211,122'],
  snow: ['240,236,228'], petal: ['255,150,180', '232,23,58'], spark: ['255,255,255', '154,234,255'],
};

export function Atmosphere() {
  const ok = useMotionOk();
  const screen = useApp((s) => s.screen);
  const phase = useApp((s) => s.game?.phase);
  const canvas = useRef<HTMLCanvasElement>(null);
  const moodRef = useRef<Mood>(moodFor(screen, phase));
  moodRef.current = moodFor(screen, phase);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const cores = navigator.hardwareConcurrency || 4;
    const small = window.innerWidth < 700;
    const budget = (cores <= 4 ? 0.55 : 1) * (small ? 0.6 : 1);
    let W = 0, H = 0, dpr = 1;
    const resize = () => { dpr = Math.min(1.5, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight; c.width = W * dpr; c.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    window.addEventListener('resize', resize);
    const ps: P[] = [];
    const puffs: Puff[] = [];
    let flash = 0, t = 0, raf = 0, last = performance.now();
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const spawn = (k: Kind, anywhere: boolean): P => {
      const rising = k === 'ember' || k === 'spark' || k === 'mote' || k === 'gold';
      return {
        k, x: rand(0, W), y: anywhere ? rand(0, H) : rising ? H + 10 : -10,
        vx: rand(-0.15, 0.15), vy: k === 'ember' ? -rand(0.3, 1.1) : k === 'spark' ? -rand(1, 2.4) : k === 'mote' ? -rand(0.05, 0.3) : k === 'gold' ? -rand(0.1, 0.5) : rand(0.3, 0.9),
        s: k === 'petal' ? rand(4, 7) : k === 'snow' ? rand(1, 2.4) : k === 'spark' ? rand(0.6, 1.4) : rand(1, 2.6), a: rand(0.25, 0.9), ph: rand(0, 6.28), life: 0,
      };
    };
    const target = () => moodRef.current.particles.flatMap(([k, n]) => Array.from({ length: Math.round(n * budget) }, () => k));
    for (const k of target()) ps.push(spawn(k, true));
    for (let i = 0; i < 6; i++) puffs.push({ x: rand(0, W), y: rand(H * 0.4, H), r: rand(180, 380), vx: rand(-0.12, 0.12), a: rand(0.03, 0.07) });

    const draw = (dt: number) => {
      const mood = moodRef.current;
      t += dt;
      g.clearRect(0, 0, W, H);
      // Light pooling from the bottom.
      const grd = g.createLinearGradient(0, H, 0, H * 0.35);
      grd.addColorStop(0, `rgba(${mood.glow}, ${mood.glowAlpha})`);
      grd.addColorStop(1, `rgba(${mood.glow}, 0)`);
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      // Spotlights sweeping across (auction house, hall).
      for (let i = 0; i < mood.spots; i++) {
        const sx = W * (i ? 0.78 : 0.22), ang = Math.sin(t / 2600 + i * 2.1) * 0.35;
        const ex = sx + Math.sin(ang) * H * 1.2, ey = H * 1.05;
        const cone = g.createLinearGradient(sx, -20, ex, ey);
        cone.addColorStop(0, 'rgba(255, 236, 200, 0.10)'); cone.addColorStop(1, 'rgba(255, 236, 200, 0)');
        g.fillStyle = cone;
        g.beginPath(); g.moveTo(sx - 18, -20); g.lineTo(sx + 18, -20); g.lineTo(ex + 170, ey); g.lineTo(ex - 170, ey); g.closePath(); g.fill();
      }
      // Ink smoke drifting low.
      for (let i = 0; i < Math.min(puffs.length, mood.smoke + 1); i++) {
        const p = puffs[i];
        p.x += p.vx * dt * 0.06;
        if (p.x < -p.r) p.x = W + p.r; if (p.x > W + p.r) p.x = -p.r;
        const sg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        sg.addColorStop(0, `rgba(30, 28, 36, ${p.a * 2.4})`); sg.addColorStop(1, 'rgba(30, 28, 36, 0)');
        g.fillStyle = sg; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
      }
      // Particles; drift the population toward this page's mix.
      const want = target();
      while (ps.length > want.length) ps.pop();
      for (let i = 0; i < want.length; i++) if (!ps[i] || (ps[i].k !== want[i] && Math.random() < 0.02)) ps[i] = spawn(want[i], !ps[i]);
      const k = dt / 16.67;
      for (const p of ps) {
        p.life += dt;
        p.x += (p.vx + Math.sin(p.ph + p.life / 900) * (p.k === 'petal' ? 0.6 : 0.15)) * k;
        p.y += p.vy * k;
        if (p.y < -20 || p.y > H + 20 || p.x < -20 || p.x > W + 20) Object.assign(p, spawn(p.k, false));
        const col = COLORS[p.k][Math.floor(p.ph * 10) % COLORS[p.k].length];
        const tw = p.k === 'spark' || p.k === 'gold' ? 0.55 + 0.45 * Math.sin(p.life / 140 + p.ph) : 1;
        g.fillStyle = `rgba(${col}, ${p.a * tw})`;
        if (p.k === 'petal') { g.save(); g.translate(p.x, p.y); g.rotate(p.life / 600 + p.ph); g.beginPath(); g.ellipse(0, 0, p.s, p.s * 0.5, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
        else if (p.k === 'ember' || p.k === 'spark') { g.shadowBlur = p.k === 'ember' ? 8 : 4; g.shadowColor = `rgba(${col}, 0.9)`; g.beginPath(); g.arc(p.x, p.y, p.s, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; }
        else { g.beginPath(); g.arc(p.x, p.y, p.s, 0, Math.PI * 2); g.fill(); }
      }
      // Far-off lightning lights the whole sky for a moment.
      if (mood.flash && Math.random() < mood.flash * (dt / 1000)) flash = 1;
      if (flash > 0.01) { g.fillStyle = `rgba(154, 234, 255, ${flash * 0.10})`; g.fillRect(0, 0, W, H); flash *= 0.86; }
    };

    if (!ok) { draw(16); return () => window.removeEventListener('resize', resize); }
    const loop = (now: number) => {
      const dt = Math.min(50, now - last); last = now;
      if (!document.hidden) draw(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [ok]);

  return <canvas ref={canvas} className="atmosphere" aria-hidden="true" />;
}
