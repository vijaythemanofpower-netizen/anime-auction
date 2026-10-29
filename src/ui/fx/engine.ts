// GPU effects layer (PixiJS). A small toolkit of anime-style primitives:
// glowing particles, orbs, beams, lightning, slash arcs, rings, speed lines,
// silhouettes and screen-wide washes, plus time control for hit-stop and
// slow motion. Recipes in recipes.ts compose these into attacks.
import { Application, Container, Graphics, Sprite, Texture, type Ticker } from 'pixi.js';

export type Pt = { x: number; y: number };

interface Particle {
  s: Sprite; vx: number; vy: number; life: number; max: number;
  s0: number; s1: number; a0: number; a1: number; drag: number; grav: number; spin: number;
}
type Task = { at: number; fn: () => void };
type Anim = { t: number; dur: number; step: (p: number, dt: number) => void; done?: () => void };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function hex(c: string): number {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return 0xffffff;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return parseInt(h, 16);
}
export const toColor = hex;

function glowTexture(size = 64, hard = 0.15): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(hard, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

export class FxDirector {
  app: Application | null = null;
  private layer = new Container();
  private overlay = new Container();
  private particles: Particle[] = [];
  private pool: Sprite[] = [];
  private tasks: Task[] = [];
  private anims: Anim[] = [];
  private clock = 0;
  private timeScale = 1;
  private freezeUntil = 0;
  private slowUntil = 0;
  private soft!: Texture;
  private hard!: Texture;
  w = 800;
  h = 500;
  ready = false;

  async mount(el: HTMLElement): Promise<boolean> {
    try {
      const app = new Application();
      await app.init({ backgroundAlpha: 0, resizeTo: el, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1), preference: 'webgl' });
      this.app = app;
      app.canvas.style.position = 'absolute';
      app.canvas.style.inset = '0';
      app.canvas.style.pointerEvents = 'none';
      el.appendChild(app.canvas);
      this.soft = glowTexture(64, 0.12);
      this.hard = glowTexture(32, 0.45);
      this.overlay.blendMode = 'normal';
      this.layer.blendMode = 'add';
      app.stage.addChild(this.overlay, this.layer);
      app.ticker.add((t: Ticker) => this.update(t.deltaMS));
      this.ready = true;
      return true;
    } catch {
      return false;
    }
  }

  destroy() {
    try { this.app?.destroy(true, { children: true }); } catch { /* already gone */ }
    this.app = null;
    this.ready = false;
  }

  resize(w: number, h: number) { this.w = w; this.h = h; }

  clear() {
    for (const p of this.particles) this.release(p.s);
    this.particles = [];
    this.tasks = [];
    for (const a of this.anims) a.done?.();
    this.anims = [];
    this.layer.removeChildren().forEach((c) => { if (!(c instanceof Sprite)) c.destroy(); });
    this.overlay.removeChildren().forEach((c) => c.destroy());
    this.pool = [];
    this.timeScale = 1;
  }

  // ------------------------------------------------------------- time control

  /** Freeze everything for a moment on impact (hit-stop). */
  hitStop(ms: number) { this.freezeUntil = performance.now() + ms; }
  /** Slow motion for a finisher. */
  slowMo(ms: number, scale = 0.3) { this.slowUntil = performance.now() + ms; this.timeScale = scale; }

  at(ms: number, fn: () => void) { this.tasks.push({ at: this.clock + ms, fn }); }

  private update(realDt: number) {
    const now = performance.now();
    if (now < this.freezeUntil) return;
    if (now > this.slowUntil) this.timeScale = 1;
    const dt = Math.min(50, realDt) * this.timeScale;
    this.clock += dt;
    if (this.tasks.length) {
      const due = this.tasks.filter((t) => t.at <= this.clock);
      this.tasks = this.tasks.filter((t) => t.at > this.clock);
      for (const t of due) t.fn();
    }
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const p = Math.min(1, a.t / a.dur);
      a.step(p, dt);
      if (p >= 1) { a.done?.(); this.anims.splice(i, 1); }
    }
    const k = dt / 16.67;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) { this.release(p.s); this.particles.splice(i, 1); continue; }
      p.vx *= Math.pow(p.drag, k); p.vy = p.vy * Math.pow(p.drag, k) + p.grav * k;
      p.s.x += p.vx * k; p.s.y += p.vy * k;
      p.s.rotation += p.spin * k;
      p.s.scale.set(p.s0 + (p.s1 - p.s0) * t);
      p.s.alpha = p.a0 + (p.a1 - p.a0) * t;
    }
  }

  private take(tex: Texture): Sprite {
    const s = this.pool.pop() ?? new Sprite();
    s.texture = tex;
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.visible = true;
    this.layer.addChild(s);
    return s;
  }
  private release(s: Sprite) { s.visible = false; this.layer.removeChild(s); if (this.pool.length < 600) this.pool.push(s); }

  private anim(dur: number, step: Anim['step'], done?: () => void) { this.anims.push({ t: 0, dur, step, done }); }

  // ---------------------------------------------------------------- primitives

  /** A single glowing particle. */
  spark(at: Pt, color: string, o: { vx?: number; vy?: number; life?: number; size?: number; endSize?: number; alpha?: number; drag?: number; grav?: number; hard?: boolean; spin?: number } = {}) {
    if (this.particles.length > 1400) return;
    const s = this.take(o.hard ? this.hard : this.soft);
    s.tint = hex(color);
    s.x = at.x; s.y = at.y;
    const size = (o.size ?? 14) / 32;
    this.particles.push({
      s, vx: o.vx ?? 0, vy: o.vy ?? 0, life: 0, max: o.life ?? 500, s0: size, s1: (o.endSize ?? (o.size ?? 14) * 0.2) / 32,
      a0: o.alpha ?? 1, a1: 0, drag: o.drag ?? 0.94, grav: o.grav ?? 0, spin: o.spin ?? 0,
    });
  }

  burst(at: Pt, color: string, n = 30, speed = 9, o: { life?: number; size?: number; grav?: number; color2?: string; spread?: number; dir?: number } = {}) {
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + rand(-(o.spread ?? 0.6), o.spread ?? 0.6) : rand(0, Math.PI * 2);
      const v = rand(speed * 0.3, speed);
      this.spark(at, i % 3 === 0 && o.color2 ? o.color2 : color, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(300, o.life ?? 750), size: rand(6, o.size ?? 18), grav: o.grav ?? 0.06, drag: 0.92, hard: i % 2 === 0 });
    }
  }

  /** A glowing orb that can grow, pulse and fade. */
  orb(at: Pt, color: string, r: number, dur: number, o: { grow?: number; pulse?: boolean; core?: string; alpha?: number } = {}) {
    const halo = this.take(this.soft), core = this.take(this.soft);
    halo.tint = hex(color); core.tint = hex(o.core ?? '#ffffff');
    halo.x = core.x = at.x; halo.y = core.y = at.y;
    this.anim(dur, (p) => {
      const g = 1 + (o.grow ?? 0) * p;
      const pulse = o.pulse ? 1 + Math.sin(p * 40) * 0.08 : 1;
      halo.scale.set(((r * 2.6) / 32) * g * pulse);
      core.scale.set(((r * 0.9) / 32) * g * pulse);
      const a = (o.alpha ?? 1) * (p > 0.85 ? (1 - p) / 0.15 : Math.min(1, p * 6));
      halo.alpha = a * 0.9; core.alpha = a;
    }, () => { this.release(halo); this.release(core); });
    return { halo, core };
  }

  /** Particles spiralling into a point: charging energy. */
  charge(at: Pt, color: string, dur = 700, radius = 110, n = 40) {
    for (let i = 0; i < n; i++) {
      this.at(rand(0, dur * 0.7), () => {
        const a = rand(0, Math.PI * 2), r = rand(radius * 0.5, radius);
        const start = { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r };
        const life = rand(250, 420);
        const k = 16.67 / life;
        this.spark(start, color, { vx: (at.x - start.x) * k * 1.1, vy: (at.y - start.y) * k * 1.1, life, size: rand(6, 14), endSize: 2, drag: 1, hard: true });
      });
    }
  }

  /** A swirling sphere of energy (Rasengan-like). */
  vortex(at: Pt, color: string, color2: string, r: number, dur: number) {
    this.orb(at, color, r, dur, { pulse: true, core: color2 });
    const n = Math.floor(dur / 16);
    for (let i = 0; i < n; i++) this.at(i * 16, () => {
      for (let j = 0; j < 3; j++) {
        const a = rand(0, Math.PI * 2), rr = rand(r * 0.6, r * 1.2);
        const p = { x: at.x + Math.cos(a) * rr, y: at.y + Math.sin(a) * rr };
        this.spark(p, j ? color : color2, { vx: -Math.sin(a) * 4, vy: Math.cos(a) * 4, life: 260, size: 9, drag: 0.9, hard: true });
      }
    });
  }

  /** Moves an orb from a to b leaving a trail; calls onHit at the end. */
  projectile(from: Pt, to: Pt, color: string, o: { size?: number; dur?: number; color2?: string; trail?: number; wobble?: number; onHit?: () => void } = {}) {
    const dur = o.dur ?? 380, size = o.size ?? 22;
    const halo = this.take(this.soft), core = this.take(this.soft);
    halo.tint = hex(color); core.tint = hex(o.color2 ?? '#ffffff');
    halo.scale.set((size * 2.4) / 32); core.scale.set((size * 0.8) / 32);
    const wob = o.wobble ?? 0;
    this.anim(dur, (p) => {
      const e = p * p * (3 - 2 * p);
      const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e + Math.sin(p * Math.PI) * -wob;
      halo.x = core.x = x; halo.y = core.y = y;
      for (let i = 0; i < (o.trail ?? 2); i++) this.spark({ x: x + rand(-4, 4), y: y + rand(-4, 4) }, color, { life: 260, size: size * 0.8, endSize: 1, drag: 0.85, vx: rand(-1, 1), vy: rand(-1, 1) });
    }, () => { this.release(halo); this.release(core); o.onHit?.(); });
  }

  /** A beam that extends from a to b, holds, then thins out. */
  beam(from: Pt, to: Pt, color: string, o: { width?: number; dur?: number; color2?: string; extend?: number; onHit?: () => void } = {}) {
    const g = new Graphics();
    g.blendMode = 'add';
    this.layer.addChild(g);
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    const width = o.width ?? 26, dur = o.dur ?? 700, ext = o.extend ?? 0.25;
    let hit = false;
    this.anim(dur, (p) => {
      const reach = Math.min(1, p / ext);
      const fade = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      const wj = width * (0.85 + Math.random() * 0.3) * fade;
      g.clear();
      g.position.set(from.x, from.y);
      g.rotation = ang;
      const L = len * reach;
      g.roundRect(0, -wj * 1.3, L, wj * 2.6, wj).fill({ color: hex(color), alpha: 0.35 * fade });
      g.roundRect(0, -wj * 0.6, L, wj * 1.2, wj * 0.6).fill({ color: hex(color), alpha: 0.85 * fade });
      g.roundRect(0, -wj * 0.22, L, wj * 0.44, wj * 0.22).fill({ color: hex(o.color2 ?? '#ffffff'), alpha: fade });
      if (reach >= 1 && !hit) { hit = true; o.onHit?.(); }
      if (Math.random() < 0.8) {
        const t = Math.random() * reach;
        this.spark({ x: from.x + dx * t, y: from.y + dy * t }, color, { vx: rand(-3, 3), vy: rand(-3, 3), life: 300, size: 10, hard: true });
      }
    }, () => g.destroy());
  }

  /** Jagged lightning between two points, re-drawn every frame. */
  bolt(from: Pt, to: Pt, color: string, o: { dur?: number; width?: number; branches?: number } = {}) {
    const g = new Graphics();
    g.blendMode = 'add';
    this.layer.addChild(g);
    const draw = (a: Pt, b: Pt, w: number, alpha: number) => {
      const n = 9;
      g.moveTo(a.x, a.y);
      for (let i = 1; i < n; i++) {
        const t = i / n, jitter = Math.hypot(b.x - a.x, b.y - a.y) * 0.08;
        g.lineTo(a.x + (b.x - a.x) * t + rand(-jitter, jitter), a.y + (b.y - a.y) * t + rand(-jitter, jitter));
      }
      g.lineTo(b.x, b.y);
      g.stroke({ color: hex(color), width: w * 2.4, alpha: alpha * 0.4 });
      g.moveTo(a.x, a.y);
      g.stroke({ color: 0xffffff, width: w * 0.6, alpha });
    };
    this.anim(o.dur ?? 420, (p) => {
      g.clear();
      const alpha = p < 0.8 ? 1 : (1 - p) / 0.2;
      draw(from, to, o.width ?? 6, alpha);
      for (let i = 0; i < (o.branches ?? 2); i++) {
        const t = rand(0.2, 0.8);
        const mid = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
        draw(mid, { x: mid.x + rand(-80, 80), y: mid.y + rand(-80, 80) }, 2.5, alpha * 0.7);
      }
    }, () => g.destroy());
  }

  /** A sweeping slash arc at a point. */
  slash(at: Pt, color: string, o: { angle?: number; radius?: number; dur?: number; width?: number; delay?: number } = {}) {
    this.at(o.delay ?? 0, () => {
      const g = new Graphics();
      g.blendMode = 'add';
      this.layer.addChild(g);
      const r = o.radius ?? 90, a0 = (o.angle ?? -40) * (Math.PI / 180);
      this.anim(o.dur ?? 260, (p) => {
        g.clear();
        const sweep = Math.PI * 0.9 * Math.min(1, p * 1.8);
        const alpha = p < 0.55 ? 1 : (1 - p) / 0.45;
        g.arc(at.x, at.y, r, a0, a0 + sweep).stroke({ color: hex(color), width: (o.width ?? 10) * 2, alpha: alpha * 0.4 });
        g.arc(at.x, at.y, r, a0, a0 + sweep).stroke({ color: 0xffffff, width: o.width ?? 10 * 0.5, alpha });
      }, () => g.destroy());
      for (let i = 0; i < 10; i++) this.spark({ x: at.x + Math.cos(a0 + i * 0.25) * r, y: at.y + Math.sin(a0 + i * 0.25) * r }, color, { vx: rand(-4, 4), vy: rand(-4, 4), life: 350, size: 8, hard: true });
    });
  }

  /** A crescent wave of energy flying from a to b (Getsuga-like). */
  crescent(from: Pt, to: Pt, color: string, o: { size?: number; dur?: number; color2?: string; onHit?: () => void } = {}) {
    const g = new Graphics();
    g.blendMode = 'add';
    this.layer.addChild(g);
    const ang = Math.atan2(to.y - from.y, to.x - from.x), size = o.size ?? 90;
    this.anim(o.dur ?? 420, (p) => {
      const x = from.x + (to.x - from.x) * p, y = from.y + (to.y - from.y) * p;
      g.clear();
      g.position.set(x, y);
      g.rotation = ang;
      const s = size * (0.6 + p * 0.6);
      g.arc(0, 0, s, -1.2, 1.2).stroke({ color: hex(color), width: 26, alpha: 0.5 });
      g.arc(0, 0, s, -1.1, 1.1).stroke({ color: hex(o.color2 ?? '#ffffff'), width: 8, alpha: 0.95 });
      this.spark({ x: x - Math.cos(ang) * 20, y: y - Math.sin(ang) * 20 }, color, { life: 300, size: 16, vx: rand(-2, 2), vy: rand(-2, 2) });
    }, () => { g.destroy(); o.onHit?.(); });
  }

  /** An expanding shockwave ring. */
  ring(at: Pt, color: string, o: { radius?: number; dur?: number; width?: number; delay?: number } = {}) {
    this.at(o.delay ?? 0, () => {
      const g = new Graphics();
      g.blendMode = 'add';
      this.layer.addChild(g);
      const R = o.radius ?? 120;
      this.anim(o.dur ?? 450, (p) => {
        g.clear();
        g.circle(at.x, at.y, R * (0.15 + p * 0.85)).stroke({ color: hex(color), width: (o.width ?? 10) * (1 - p) + 1, alpha: 1 - p });
      }, () => g.destroy());
    });
  }

  /** An explosion: flash, fireball, debris, shockwave. */
  explode(at: Pt, color: string, scale = 1, color2 = '#ffffff') {
    this.orb(at, color, 46 * scale, 520, { grow: 1.2, core: color2 });
    this.burst(at, color, Math.round(40 * scale), 12 * scale, { color2, size: 22 * scale, grav: 0.12 });
    this.ring(at, color2, { radius: 150 * scale, width: 14 });
    this.ring(at, color, { radius: 210 * scale, width: 8, delay: 60 });
  }

  /** Anime focus lines converging on a point. */
  speedLines(center: Pt, color = '#ffffff', dur = 650, n = 46) {
    const g = new Graphics();
    this.overlay.addChild(g);
    const R = Math.hypot(this.w, this.h);
    this.anim(dur, (p) => {
      g.clear();
      const alpha = p < 0.2 ? p / 0.2 : p > 0.75 ? (1 - p) / 0.25 : 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
        const r0 = rand(R * 0.18, R * 0.32), w = rand(1.5, 5);
        g.moveTo(center.x + Math.cos(a) * r0, center.y + Math.sin(a) * r0);
        g.lineTo(center.x + Math.cos(a + 0.012) * R, center.y + Math.sin(a + 0.012) * R);
        g.lineTo(center.x + Math.cos(a - 0.012) * R, center.y + Math.sin(a - 0.012) * R);
        g.closePath().fill({ color: hex(color), alpha: alpha * 0.55 * (w / 5) });
      }
    }, () => g.destroy());
  }

  /** A full-screen colour wash (domains, genjutsu, flashes). */
  wash(color: string, alpha: number, dur: number, o: { radial?: Pt; hold?: number } = {}) {
    const g = new Graphics();
    this.overlay.addChild(g);
    this.anim(dur, (p) => {
      const hold = o.hold ?? 0.6;
      const a = p < 0.12 ? p / 0.12 : p > hold ? Math.max(0, 1 - (p - hold) / (1 - hold)) : 1;
      g.clear();
      g.rect(0, 0, this.w, this.h).fill({ color: hex(color), alpha: alpha * a });
      if (o.radial) {
        for (let i = 0; i < 4; i++) g.circle(o.radial.x, o.radial.y, (this.w * (0.2 + i * 0.25)) * (0.6 + p * 0.6)).stroke({ color: 0xffffff, width: 2, alpha: 0.25 * a });
      }
    }, () => g.destroy());
  }

  /** A giant glowing humanoid rising behind a fighter (Susanoo, Titans, summons). */
  giant(at: Pt, color: string, o: { scale?: number; dur?: number; armed?: boolean } = {}) {
    const g = new Graphics();
    g.blendMode = 'add';
    this.layer.addChild(g);
    const S = (o.scale ?? 1) * Math.min(this.h, 520) / 520;
    this.anim(o.dur ?? 1200, (p) => {
      const rise = Math.min(1, p * 2.2);
      const alpha = (p > 0.8 ? (1 - p) / 0.2 : 1) * 0.55;
      const by = at.y + 140 * S - rise * 40 * S;
      g.clear();
      const c = hex(color);
      g.ellipse(at.x, by - 330 * S, 44 * S, 52 * S).fill({ color: c, alpha });
      g.roundRect(at.x - 95 * S, by - 280 * S, 190 * S, 210 * S, 60 * S).fill({ color: c, alpha: alpha * 0.85 });
      g.roundRect(at.x - 160 * S, by - 265 * S, 60 * S, 190 * S, 30 * S).fill({ color: c, alpha: alpha * 0.7 });
      g.roundRect(at.x + 100 * S, by - 265 * S, 60 * S, 190 * S, 30 * S).fill({ color: c, alpha: alpha * 0.7 });
      g.ellipse(at.x - 18 * S, by - 336 * S, 9 * S, 5 * S).fill({ color: 0xffffff, alpha: alpha * 1.6 });
      g.ellipse(at.x + 18 * S, by - 336 * S, 9 * S, 5 * S).fill({ color: 0xffffff, alpha: alpha * 1.6 });
      if (o.armed) g.roundRect(at.x + 120 * S, by - 420 * S, 18 * S, 260 * S, 9 * S).fill({ color: 0xffffff, alpha: alpha * 1.2 });
      if (Math.random() < 0.7) this.spark({ x: at.x + rand(-160, 160) * S, y: by - rand(0, 340) * S }, color, { vy: -2, life: 500, size: 12 });
    }, () => g.destroy());
  }

  /** Flame jet from a to b. */
  flames(from: Pt, to: Pt, color: string, dur = 500, color2 = '#fde047') {
    const n = Math.floor(dur / 16);
    const ang = Math.atan2(to.y - from.y, to.x - from.x), dist = Math.hypot(to.x - from.x, to.y - from.y);
    for (let i = 0; i < n; i++) this.at(i * 16, () => {
      for (let j = 0; j < 4; j++) {
        const a = ang + rand(-0.12, 0.12), v = dist / 26;
        this.spark(from, j % 2 ? color : color2, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.5, life: 520, size: rand(16, 30), endSize: 40, drag: 0.985, grav: -0.04, alpha: 0.8 });
      }
    });
  }

  /** Ice shards flying from a to b. */
  shards(from: Pt, to: Pt, color: string, n = 10, onHit?: () => void) {
    for (let i = 0; i < n; i++) {
      this.at(i * 35, () => {
        const off = { x: to.x + rand(-30, 30), y: to.y + rand(-40, 40) };
        this.projectile({ x: from.x, y: from.y + rand(-20, 20) }, off, color, { size: 9, dur: 260, color2: '#ffffff', trail: 1 });
      });
    }
    this.at(n * 35 + 260, () => { this.burst(to, color, 26, 7, { color2: '#ffffff', size: 12, grav: 0.15 }); onHit?.(); });
  }
}
