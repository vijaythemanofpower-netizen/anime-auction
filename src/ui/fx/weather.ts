// Real-time weather on the GPU: rain with splashes, thunderstorms, snow and
// blizzards, wind streaks and leaves, ash, embers, heat haze, falling petals,
// spirit lights, dust storms and drifting fog. One pooled sprite set inside the
// arena's PixiJS canvas; the director decides WHAT the weather is (the same for
// every viewer), this only decides where each drop falls.
import { Container, Sprite, Texture } from 'pixi.js';
import type { WeatherKind } from '../battlefield/climate';

export interface WeatherInput { kind: WeatherKind; intensity: number; wind: number; wet: number }

type PKind = 'drop' | 'splash' | 'flake' | 'streak' | 'leaf' | 'ash' | 'ember' | 'haze' | 'petal' | 'firefly' | 'fog' | 'dust';
interface P { s: Sprite; k: PKind; vx: number; vy: number; life: number; max: number; ph: number; a: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  return Texture.from(c);
}
function radial(size: number, stops: Array<[number, string]>): Texture {
  return canvasTex(size, size, (g) => {
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, c] of stops) grd.addColorStop(o, c);
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
  });
}

/** Particles per second at full intensity, and the most alive at once. */
const RATE: Record<WeatherKind, Array<[PKind, number, number]>> = {
  clear: [['dust', 1.5, 12]],
  rain: [['drop', 260, 320]],
  storm: [['drop', 480, 560], ['streak', 6, 14]],
  snow: [['flake', 60, 220]],
  blizzard: [['flake', 220, 520], ['streak', 26, 40], ['fog', 1.2, 6]],
  wind: [['streak', 30, 50], ['leaf', 6, 22]],
  fog: [['fog', 1.6, 9]],
  ash: [['ash', 50, 200], ['ember', 6, 30]],
  embers: [['ember', 45, 160], ['ash', 10, 50]],
  heat: [['haze', 6, 26], ['ember', 4, 20]],
  petals: [['petal', 14, 70]],
  fireflies: [['firefly', 5, 40]],
  dust: [['dust', 50, 140], ['streak', 16, 30]],
};

export class WeatherSystem {
  readonly root = new Container();
  private glow = new Container();
  private soft = new Container();
  private ps: P[] = [];
  private pool: Sprite[] = [];
  private tex!: Record<PKind, Texture>;
  private carry: Record<string, number> = {};
  private target: WeatherInput = { kind: 'clear', intensity: 0, wind: 0, wet: 0 };
  /** Fade between kinds: the old one drains while the new one fills. */
  private level = 0;
  w = 800;
  h = 500;
  /** Fraction of the height where the fighters' feet are. */
  groundY = 0.86;
  /** Particle budget multiplier (performance tier). */
  quality = 1;

  init() {
    this.tex = {
      drop: canvasTex(3, 34, (g) => { const grd = g.createLinearGradient(0, 0, 0, 34); grd.addColorStop(0, 'rgba(210,225,255,0)'); grd.addColorStop(1, 'rgba(225,235,255,0.9)'); g.fillStyle = grd; g.fillRect(0, 0, 3, 34); }),
      splash: radial(16, [[0, 'rgba(230,240,255,0.9)'], [0.5, 'rgba(200,220,255,0.35)'], [1, 'rgba(200,220,255,0)']]),
      flake: radial(16, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]),
      streak: canvasTex(90, 3, (g) => { const grd = g.createLinearGradient(0, 0, 90, 0); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 90, 3); }),
      leaf: canvasTex(14, 8, (g) => { g.fillStyle = '#6b8e23'; g.beginPath(); g.ellipse(7, 4, 6.5, 3, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#3f5e14'; g.beginPath(); g.moveTo(1, 4); g.lineTo(13, 4); g.stroke(); }),
      ash: radial(10, [[0, 'rgba(120,115,110,0.95)'], [1, 'rgba(90,85,80,0)']]),
      ember: radial(16, [[0, 'rgba(255,240,200,1)'], [0.3, 'rgba(255,140,50,0.9)'], [1, 'rgba(255,80,20,0)']]),
      haze: radial(96, [[0, 'rgba(255,170,90,0.18)'], [1, 'rgba(255,140,60,0)']]),
      petal: canvasTex(12, 8, (g) => { g.fillStyle = '#f9a8d4'; g.beginPath(); g.ellipse(6, 4, 5.5, 3, 0.3, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fbcfe8'; g.beginPath(); g.ellipse(5, 3.5, 2.5, 1.4, 0.3, 0, Math.PI * 2); g.fill(); }),
      firefly: radial(24, [[0, 'rgba(250,255,200,1)'], [0.25, 'rgba(190,242,100,0.8)'], [1, 'rgba(160,220,80,0)']]),
      fog: radial(256, [[0, 'rgba(220,225,235,0.32)'], [0.6, 'rgba(210,215,230,0.12)'], [1, 'rgba(200,205,220,0)']]),
      dust: radial(20, [[0, 'rgba(214,180,130,0.6)'], [1, 'rgba(200,160,110,0)']]),
    };
    this.glow.blendMode = 'add';
    this.root.addChild(this.soft, this.glow);
  }

  resize(w: number, h: number) { this.w = w; this.h = h; }

  set(t: WeatherInput) {
    if (t.kind !== this.target.kind) this.level = Math.min(this.level, 0.999);
    this.target = t;
  }

  clear() {
    for (const p of this.ps) this.release(p.s);
    this.ps = [];
  }

  /** Rain bouncing off the ground around a point (impacts in the wet). */
  splashAt(x: number, y: number, n = 14) {
    for (let i = 0; i < n; i++) this.spawn('splash', x + rand(-40, 40), y + rand(-6, 6), rand(-3, 3), rand(-6, -2), rand(300, 600));
  }

  /** Snow, sand or dust kicked up from the ground. */
  puffAt(x: number, y: number, kind: 'snow' | 'dust' | 'water', n = 10) {
    const k: PKind = kind === 'snow' ? 'flake' : kind === 'water' ? 'splash' : 'dust';
    for (let i = 0; i < n; i++) this.spawn(k, x + rand(-30, 30), y + rand(-4, 4), rand(-2.5, 2.5), rand(-3.5, -1), rand(400, 800));
  }

  private take(k: PKind): Sprite {
    const s = this.pool.pop() ?? new Sprite();
    s.texture = this.tex[k];
    s.anchor.set(0.5);
    s.visible = true;
    s.rotation = 0;
    s.scale.set(1);
    s.tint = 0xffffff;
    (k === 'ember' || k === 'firefly' || k === 'haze' ? this.glow : this.soft).addChild(s);
    return s;
  }
  private release(s: Sprite) { s.visible = false; s.parent?.removeChild(s); if (this.pool.length < 900) this.pool.push(s); }

  private spawn(k: PKind, x: number, y: number, vx: number, vy: number, max: number) {
    if (this.ps.length > 1600 * this.quality) return;
    const s = this.take(k);
    s.x = x; s.y = y;
    const p: P = { s, k, vx, vy, life: 0, max, ph: rand(0, Math.PI * 2), a: 1 };
    switch (k) {
      case 'drop': s.scale.set(rand(0.6, 1.1), rand(0.7, 1.3)); p.a = rand(0.35, 0.8); break;
      case 'splash': s.scale.set(rand(0.25, 0.6)); p.a = 0.8; break;
      case 'flake': s.scale.set(rand(0.18, 0.55)); p.a = rand(0.6, 1); break;
      case 'streak': s.scale.set(rand(0.8, 2.2), rand(0.5, 1)); p.a = rand(0.2, 0.5); break;
      case 'leaf': s.scale.set(rand(0.7, 1.3)); p.a = 0.95; break;
      case 'ash': s.scale.set(rand(0.3, 0.8)); p.a = rand(0.5, 0.9); break;
      case 'ember': s.scale.set(rand(0.2, 0.55)); p.a = 1; break;
      case 'haze': s.scale.set(rand(1.5, 3)); p.a = rand(0.5, 1); break;
      case 'petal': s.scale.set(rand(0.8, 1.4)); p.a = 0.95; break;
      case 'firefly': s.scale.set(rand(0.4, 0.8)); p.a = 0; break;
      case 'fog': s.scale.set(rand(2.2, 4), rand(1, 1.6)); p.a = 0; break;
      case 'dust': s.scale.set(rand(0.4, 1.4)); p.a = rand(0.3, 0.7); break;
    }
    s.alpha = p.a;
    this.ps.push(p);
  }

  /** Spawns new particles for the current weather. dt in ms. */
  private emit(dt: number) {
    const t = this.target;
    const lv = this.level;
    if (lv <= 0.01) return;
    const W = this.w, H = this.h, wind = t.wind;
    for (const [k, rate, cap] of RATE[t.kind]) {
      const alive = this.ps.reduce((n, p) => n + (p.k === k ? 1 : 0), 0);
      if (alive >= cap * this.quality * Math.max(0.15, t.intensity)) continue;
      const key = `${t.kind}:${k}`;
      this.carry[key] = (this.carry[key] ?? 0) + rate * t.intensity * lv * this.quality * (dt / 1000);
      while (this.carry[key] >= 1) {
        this.carry[key] -= 1;
        const top = -20, x = rand(-W * 0.2, W * 1.2);
        switch (k) {
          case 'drop': { const sp = rand(16, 24) * (t.kind === 'storm' ? 1.25 : 1); this.spawn(k, x, rand(-60, top), wind * 7 + rand(-0.5, 0.5), sp, 2000); break; }
          case 'flake': { const sp = t.kind === 'blizzard' ? rand(2.5, 5) : rand(0.8, 2); this.spawn(k, x, rand(-40, top), wind * (t.kind === 'blizzard' ? 9 : 2.5), sp, 9000); break; }
          case 'streak': { const dir = Math.sign(wind || 1); this.spawn(k, dir > 0 ? rand(-160, -60) : W + rand(60, 160), rand(0, H * 0.9), dir * rand(18, 30), rand(-0.5, 0.5), 1400); break; }
          case 'leaf': { const dir = Math.sign(wind || 1); this.spawn(k, dir > 0 ? -20 : W + 20, rand(H * 0.1, H * 0.8), dir * rand(5, 9), rand(-1, 1.5), 4000); break; }
          case 'ash': this.spawn(k, x, rand(-30, top), wind * 1.5 + rand(-0.4, 0.4), rand(0.6, 1.4), 9000); break;
          case 'ember': this.spawn(k, rand(0, W), H + rand(0, 20), wind * 1.2 + rand(-0.6, 0.6), -rand(1.2, 3.2), rand(2500, 5000)); break;
          case 'haze': this.spawn(k, rand(0, W), H * rand(0.7, 1), rand(-0.3, 0.3), -rand(0.3, 0.8), rand(3000, 5000)); break;
          case 'petal': this.spawn(k, x, rand(-30, top), wind * 2 + rand(0.3, 1.2), rand(0.7, 1.6), 9000); break;
          case 'firefly': this.spawn(k, rand(0, W), rand(H * 0.25, H * 0.9), rand(-0.4, 0.4), rand(-0.4, 0.4), rand(3500, 7000)); break;
          case 'fog': this.spawn(k, rand(-W * 0.2, W), rand(H * 0.35, H * 0.95), (wind || 0.3) * rand(0.4, 1), 0, rand(9000, 15000)); break;
          case 'dust': this.spawn(k, Math.sign(wind || 1) > 0 ? rand(-60, 0) : W + rand(0, 60), rand(H * 0.5, H), (wind || 1) * rand(6, 12), rand(-0.6, 0.3), 3000); break;
        }
      }
    }
  }

  update(dt: number) {
    if (!this.tex) return;
    // Cross-fade weather kinds: drain the old particles' spawn rate, then fill the new.
    this.level = Math.min(1, this.level + dt / 1800);
    this.emit(dt);
    const k = dt / 16.67, H = this.h, W = this.w, ground = this.h * this.groundY;
    const wet = this.target.wet;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life += dt;
      const s = p.s;
      let dead = p.life >= p.max;
      switch (p.k) {
        case 'drop':
          s.x += p.vx * k; s.y += p.vy * k;
          s.rotation = -Math.atan2(p.vx, p.vy);
          // Drops that reach the ground splash (more of them once puddles form).
          if (s.y > ground + Math.random() * H * 0.12) { if (Math.random() < 0.25 + wet * 0.5) this.spawn('splash', s.x, s.y, rand(-1.5, 1.5), rand(-2.5, -0.8), rand(220, 420)); dead = true; }
          break;
        case 'splash': s.x += p.vx * k; s.y += p.vy * k; p.vy += 0.25 * k; s.alpha = p.a * (1 - p.life / p.max); break;
        case 'flake': s.x += (p.vx + Math.sin(p.ph + p.life / 600) * 0.8) * k; s.y += p.vy * k; if (s.y > ground + rand(0, H * 0.1)) dead = true; break;
        case 'streak': s.x += p.vx * k; s.y += p.vy * k; s.alpha = p.a * Math.sin(Math.min(1, p.life / p.max) * Math.PI); break;
        case 'leaf': s.x += p.vx * k; s.y += (p.vy + Math.sin(p.ph + p.life / 250) * 1.2) * k; s.rotation += 0.12 * k; break;
        case 'ash': s.x += (p.vx + Math.sin(p.ph + p.life / 900) * 0.4) * k; s.y += p.vy * k; s.rotation += 0.02 * k; if (s.y > ground + rand(0, H * 0.1)) dead = true; break;
        case 'ember': s.x += (p.vx + Math.sin(p.ph + p.life / 300) * 0.6) * k; s.y += p.vy * k; s.alpha = Math.max(0, 1 - p.life / p.max) * (0.7 + 0.3 * Math.sin(p.life / 60)); break;
        case 'haze': s.x += p.vx * k; s.y += p.vy * k; s.scale.x = s.scale.y * (1 + 0.15 * Math.sin(p.life / 200)); s.alpha = p.a * Math.sin(Math.min(1, p.life / p.max) * Math.PI); break;
        case 'petal': s.x += (p.vx + Math.sin(p.ph + p.life / 500) * 1.2) * k; s.y += p.vy * k; s.rotation = Math.sin(p.ph + p.life / 300) * 1.2; s.scale.x = Math.abs(Math.cos(p.ph + p.life / 400)) * 1.2 + 0.2; if (s.y > ground + rand(0, H * 0.1)) dead = true; break;
        case 'firefly': p.vx += rand(-0.08, 0.08); p.vy += rand(-0.08, 0.08); p.vx *= 0.98; p.vy *= 0.98; s.x += p.vx * k; s.y += p.vy * k; s.alpha = Math.max(0, Math.sin(Math.min(1, p.life / p.max) * Math.PI)) * (0.5 + 0.5 * Math.sin(p.ph + p.life / 180)); break;
        case 'fog': s.x += p.vx * k; s.alpha = 0.9 * Math.sin(Math.min(1, p.life / p.max) * Math.PI) * Math.max(0.3, this.target.intensity); break;
        case 'dust': s.x += p.vx * k; s.y += p.vy * k; s.alpha = p.a * (1 - p.life / p.max); break;
      }
      // Particles of a weather that has ended fade out instead of popping.
      const current = RATE[this.target.kind].some(([kk]) => kk === p.k) || p.k === 'splash';
      if (!current) { s.alpha *= Math.pow(0.95, k); if (s.alpha < 0.02) dead = true; }
      if (s.x < -W * 0.4 || s.x > W * 1.4 || s.y > H + 60 || s.y < -200) dead = true;
      if (dead) { this.release(s); this.ps.splice(i, 1); }
    }
  }

  get count() { return this.ps.length; }
}
