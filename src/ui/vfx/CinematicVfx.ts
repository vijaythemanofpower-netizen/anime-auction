// Cinematic VFX engine: one WebGL canvas (PixiJS 8) that brings a character's art to life
// and wraps it in their own effects. The art is drawn as a deformable mesh, so hair and
// cloth sway (more towards the top of the frame) and the figure breathes, while the full
// 2560 px texture keeps it sharp. Around it: layered smoke from procedural turbulence
// textures, an aura in the character's style, flames, branching lightning, water ribbons,
// sword cuts, energy rings and drifting particles, all from the character's profile.
// Particles are pooled, motion is delta-timed, and quality scales with the device.
import { Application, Assets, type BLEND_MODES, Container, Graphics, MeshPlane, MeshRope, Point, Sprite, Texture } from 'pixi.js';
import type { Mote, VfxProfile } from './profiles';

export type Quality = 'high' | 'medium' | 'low';
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const hex = (c: string) => parseInt(c.replace('#', '').padEnd(6, '0').slice(0, 6), 16);

// ------------------------------------------------------------ procedural textures

/** Smooth value noise with fractal octaves, for smoke puffs with turbulent, soft edges. */
function noiseCanvas(size: number, seed: number, octaves = 5): Float32Array {
  const grid = (s: number) => { const g = new Float32Array((s + 1) * (s + 1)); let h = seed * 9301 + s * 49297; for (let i = 0; i < g.length; i++) { h = (h * 9301 + 49297) % 233280; g[i] = h / 233280; } return g; };
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 2 << o, g = grid(cells);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells, ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[iy * (cells + 1) + ix], b = g[iy * (cells + 1) + ix + 1], c = g[(iy + 1) * (cells + 1) + ix], d = g[(iy + 1) * (cells + 1) + ix + 1];
      out[y * size + x] += ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy) * amp;
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function smokeTexture(seed: number): Texture {
  const s = 128, n = noiseCanvas(s, seed);
  const c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d')!, img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (x - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2), r = Math.sqrt(dx * dx + dy * dy);
    // Turbulent density, eaten away towards the edge: wispy borders, never a hard circle.
    const dens = Math.max(0, n[y * s + x] * 1.6 - 0.45) * Math.max(0, 1 - r * r * 1.15);
    const i = (y * s + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, dens * 255);
  }
  g.putImageData(img, 0, 0);
  return Texture.from(c);
}

function radial(size: number, stops: Array<[number, number]>, stretch = 1): Texture {
  const c = document.createElement('canvas'); c.width = size; c.height = Math.round(size * stretch);
  const g = c.getContext('2d')!;
  g.translate(size / 2, (size * stretch) / 2); g.scale(1, stretch);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, size / 2);
  for (const [o, a] of stops) grd.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = grd; g.fillRect(-size / 2, -size / 2, size, size);
  return Texture.from(c);
}

function stripe(): Texture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d')!, grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.5, 'rgba(255,255,255,1)'); grd.addColorStop(0.55, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 64);
  return Texture.from(c);
}

// ------------------------------------------------------------ particles

interface Part { s: Sprite; vx: number; vy: number; life: number; max: number; s0: number; s1: number; a: number; spin: number; drag: number; grav: number; wob: number; }

class Pool {
  readonly layer = new Container();
  private live: Part[] = [];
  private free: Sprite[] = [];
  constructor(blend: BLEND_MODES) { this.layer.blendMode = blend; }
  get count() { return this.live.length; }
  spawn(tex: Texture, color: number, x: number, y: number, o: Partial<Omit<Part, 's'>> & { rot?: number }) {
    const s = this.free.pop() ?? new Sprite();
    s.texture = tex; s.anchor.set(0.5); s.tint = color; s.position.set(x, y); s.rotation = o.rot ?? rand(0, Math.PI * 2); s.visible = true;
    if (!s.parent) this.layer.addChild(s);
    this.live.push({ s, vx: o.vx ?? 0, vy: o.vy ?? 0, life: 0, max: o.max ?? 1, s0: o.s0 ?? 1, s1: o.s1 ?? 1, a: o.a ?? 1, spin: o.spin ?? 0, drag: o.drag ?? 0, grav: o.grav ?? 0, wob: o.wob ?? 0 });
  }
  step(dt: number, wind: number, t: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { p.s.visible = false; this.free.push(p.s); this.live[i] = this.live[this.live.length - 1]; this.live.pop(); continue; }
      p.vx = (p.vx + wind * 18 * dt) * (1 - p.drag * dt); p.vy = (p.vy + p.grav * dt) * (1 - p.drag * dt);
      p.s.x += (p.vx + Math.sin(t * 1.7 + p.s0 * 9) * p.wob) * dt; p.s.y += p.vy * dt;
      p.s.rotation += p.spin * dt;
      p.s.scale.set(p.s0 + (p.s1 - p.s0) * k);
      // Fade in quickly, out slowly: smoke billows rather than pops.
      p.s.alpha = p.a * Math.min(1, k * 5) * (1 - k) * (1 - k * 0.3);
    }
  }
  clear() { for (const p of this.live) { p.s.visible = false; this.free.push(p.s); } this.live = []; }
}

// ------------------------------------------------------------ the engine

export class CinematicVfx {
  /** Two canvases: the living art (under the page's scrim, so text stays readable) and the
   *  effects (over the scrim, under the text), so flames and smoke glow at full strength. */
  private app = new Application();
  private fxApp = new Application();
  private ready: Promise<void>;
  private root = new Container();
  private art: MeshPlane | null = null;
  /** Holds the art; flipped for right-hand layouts, matching the page's mirrored image. */
  private artBox = new Container();
  private mirror = false;
  private artBase: Float32Array | null = null;
  private artKey = '';
  private loaded = '';
  private back = new Pool('normal');     // shading smoke behind effects
  private glow = new Pool('add');        // aura, flames, sparks, glowing smoke
  private front = new Pool('normal');    // thin foreground haze
  private bolts = new Graphics();
  private ribbons = new Container();
  private light = new Sprite();
  private tex: Record<string, Texture> = {};
  private prof: VfxProfile | null = null;
  private acc: Record<string, number> = {};
  private t = 0;
  private w = 0; private h = 0;
  private focus = new Point();
  private boltLife = 0;
  quality: Quality;
  /** Set once destroyed: late async work (art loading, mounting) must stop quietly. */
  private dead = false;
  /** Lifetime frame stats, for the performance probe. */
  stats = { frames: 0, slow: 0 };

  constructor(quality: Quality) {
    this.quality = quality;
    const opts = { backgroundAlpha: 0, antialias: false, preference: 'webgl' as const, resolution: Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.25), autoDensity: true, powerPreference: 'high-performance' as const };
    this.ready = Promise.all([this.app.init(opts), this.fxApp.init({ ...opts, resolution: Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.5 : 1) })]).then(() => {
      const c = this.app.canvas; c.className = 'vfx-canvas'; c.setAttribute('aria-hidden', 'true');
      const fc = this.fxApp.canvas; fc.className = 'vfx-canvas vfx-fx'; fc.setAttribute('aria-hidden', 'true');
      this.tex = {
        smoke0: smokeTexture(3), smoke1: smokeTexture(11), smoke2: smokeTexture(29), smoke3: smokeTexture(47),
        glow: radial(64, [[0, 1], [0.2, 0.8], [0.55, 0.25], [1, 0]]), soft: radial(256, [[0, 0.55], [0.5, 0.18], [1, 0]]),
        flame: radial(64, [[0, 1], [0.3, 0.7], [1, 0]], 2.2), streak: radial(64, [[0, 1], [0.4, 0.5], [1, 0]], 5), stripe: stripe(),
      };
      this.light.texture = this.tex.soft; this.light.anchor.set(0.5); this.light.blendMode = 'add';
      this.bolts.blendMode = 'add'; this.ribbons.blendMode = 'add';
      this.root.addChild(this.back.layer, this.light, this.glow.layer, this.ribbons, this.bolts, this.front.layer);
      this.app.stage.addChild(this.artBox);
      this.fxApp.stage.addChild(this.root);
      this.fxApp.ticker.add((tk) => this.frame(Math.min(0.05, tk.deltaMS / 1000), tk.deltaMS));
    });
  }

  /** Puts the canvases into a container (a home panel or a banner) and sizes them: the art
   *  canvas after `artAfter` (or first), the effects canvas after `fxAfter` (or last). */
  async mount(host: HTMLElement, artAfter?: Element | null, fxAfter?: Element | null) {
    await this.ready;
    if (this.dead) return;
    const art = this.app.canvas, fx = this.fxApp.canvas;
    if (artAfter) artAfter.after(art); else if (art.parentElement !== host) host.prepend(art);
    if (fxAfter) fxAfter.after(fx); else if (fx.parentElement !== host) host.appendChild(fx);
    this.resize(host.clientWidth, host.clientHeight);
  }

  resize(w: number, h: number) {
    if (!w || !h || this.dead || !this.app.renderer) return;
    this.w = w; this.h = h;
    this.app.renderer.resize(w, h);
    this.fxApp.renderer.resize(w, h);
    this.fitArt();
  }

  /** Switches to a character: their art (optional: banners keep the page's own image) and profile. */
  async show(profile: VfxProfile, artUrl?: string, mirror = false) {
    await this.ready;
    if (this.dead) return;
    this.prof = profile;
    this.mirror = mirror;
    this.back.clear(); this.glow.clear(); this.front.clear(); this.ribbons.removeChildren(); this.bolts.clear();
    this.acc = {};
    if (artUrl && artUrl !== this.artKey) {
      this.artKey = artUrl;
      const texture = await Assets.load<Texture>(artUrl).catch(() => null);
      if (this.dead || !texture || this.artKey !== artUrl) return;
      // Release the previous character's art from the GPU: long sessions must not grow.
      const prev = this.art;
      if (prev) { prev.destroy(); const old = this.loaded; this.loaded = artUrl; if (old && old !== artUrl) void Assets.unload(old).catch(() => undefined); } else this.loaded = artUrl;
      // A 28 x 18 grid: enough for smooth hair and cloth motion, cheap to update each frame.
      this.art = new MeshPlane({ texture, verticesX: 28, verticesY: 18 });
      this.artBox.addChild(this.art);
      this.artBase = Float32Array.from(this.art.geometry.positions);
      this.fitArt();
    } else if (!artUrl && this.art) { this.art.destroy(); this.art = null; this.artKey = ''; }
    if (profile.water) this.makeRibbons();
    this.light.tint = hex(profile.primary);
    // Pre-warm smoke so the scene opens already atmospheric.
    for (let i = 0; i < 60; i++) this.frame(0.1, 16);
  }

  /** Places the art exactly where the page's own image sits (story.css .hpanel-art: a box
   *  112% tall starting at -6%, object-fit cover at 60% 28%, settled scale 1.06 about the
   *  centre), so handing a panel over from the image to the canvas never jumps. */
  private fitArt() {
    const p = this.prof;
    if (this.art && this.w) {
      const tw = this.art.texture.width, th = this.art.texture.height;
      const bw = this.w, bh = this.h * 1.12, by = -this.h * 0.06;
      const k = Math.max(bw / tw, bh / th), S = 1.06, cx = this.w / 2, cy = this.h / 2;
      const x = (bw - tw * k) * 0.6, y = by + (bh - th * k) * 0.28;
      this.art.scale.set(k * S);
      this.art.position.set(cx + (x - cx) * S, cy + (y - cy) * S);
      // Mirror the whole art box about the vertical centre line for right-hand layouts.
      this.artBox.scale.x = this.mirror ? -1 : 1;
      this.artBox.x = this.mirror ? this.w : 0;
      if (p) {
        const fx = this.art.x + tw * k * S * p.focus.x;
        this.focus.set(this.mirror ? this.w - fx : fx, this.art.y + th * k * S * p.focus.y);
      }
    } else if (p) this.focus.set(this.w * p.focus.x, this.h * p.focus.y);
    this.light.position.copyFrom(this.focus);
    this.light.scale.set(Math.max(this.w, this.h) / 256 * 0.9);
  }

  private makeRibbons() {
    for (let r = 0; r < (this.quality === 'low' ? 1 : 3); r++) {
      const pts = Array.from({ length: 24 }, () => new Point());
      const rope = new MeshRope({ texture: this.tex.stripe, points: pts });
      rope.tint = hex(r % 2 ? this.prof!.secondary : this.prof!.primary);
      rope.alpha = 0.55;
      (rope as MeshRope & { seed?: number }).seed = r * 1.7;
      this.ribbons.addChild(rope);
    }
  }

  private every(key: string, rate: number, dt: number, fn: () => void) {
    if (rate <= 0) return;
    this.acc[key] = (this.acc[key] ?? 0) + dt * rate;
    while (this.acc[key] >= 1) { this.acc[key] -= 1; fn(); }
  }

  private q(n: number) { return this.quality === 'high' ? n : this.quality === 'medium' ? n * 0.6 : n * 0.3; }

  private frame(dt: number, ms: number) {
    const p = this.prof;
    if (!p || !this.w) return;
    this.stats.frames++; if (ms > 24) this.stats.slow++;
    this.t += dt;
    const t = this.t, W = this.w, H = this.h, f = this.focus;
    const prim = hex(p.primary), sec = hex(p.secondary), smokeC = hex(p.smoke.color);
    const scale = Math.max(W, H) / 1200;

    // The art lives: hair and cloth sway in a travelling wave, stronger towards the top and
    // the outer edges; the body breathes (a slow lift anchored at the bottom).
    if (this.art && this.artBase) {
      const pos = this.art.geometry.positions, base = this.artBase;
      const tw = this.art.texture.width, th = this.art.texture.height, life = p.life * (this.quality === 'low' ? 0.5 : 1);
      const breathe = Math.sin(t * 1.25) * 0.0035 * life;
      for (let i = 0; i < pos.length; i += 2) {
        const u = base[i] / tw, v = base[i + 1] / th;
        const top = Math.pow(1 - v, 1.6), edge = Math.min(1, Math.abs(u - p.focus.x) * 2.2);
        const sway = (Math.sin(t * 1.6 + v * 7 + u * 3) + Math.sin(t * 2.7 + u * 11) * 0.35) * top * (0.35 + edge) * 5 * life;
        pos[i] = base[i] + sway + p.wind * top * 4 * Math.sin(t * 0.9 + v * 5);
        pos[i + 1] = base[i + 1] - (1 - v) * th * breathe + Math.cos(t * 1.3 + u * 8) * top * 2 * life;
      }
      this.art.geometry.getBuffer('aPosition').update();
    }

    // Energy light breathing behind the character.
    this.light.alpha = (p.aura === 'none' ? 0.05 : 0.12) + Math.sin(t * 2.1) * 0.04 + (this.boltLife > 0 ? 0.25 : 0);

    // Smoke: rising, expanding, slowly curling banks from the floor and around the figure.
    const smokeTex = [this.tex.smoke0, this.tex.smoke1, this.tex.smoke2, this.tex.smoke3];
    const smokePool = p.smoke.glow ? this.glow : this.back;
    this.every('smoke', this.q(9 * p.smoke.density), dt, () => {
      // From the floor, or banking up the lower sides of the figure: never across the face.
      const fromFloor = Math.random() < 0.65, side = Math.random() < 0.5 ? -1 : 1;
      const x = fromFloor ? rand(-0.1, 1.1) * W : f.x + side * rand(0.28, 0.5) * W;
      const y = fromFloor ? H + 40 * scale : Math.max(f.y + 0.3 * H, rand(0.7, 1) * H);
      smokePool.spawn(smokeTex[(Math.random() * 4) | 0], p.smoke.glow ? prim : smokeC, x, y,
        { vx: rand(-14, 14), vy: rand(-38, -16), max: rand(5, 9), s0: rand(1.4, 2.4) * scale, s1: rand(3.4, 5.4) * scale, a: (p.smoke.glow ? 0.16 : 0.42) * (0.6 + p.smoke.density * 0.5), spin: rand(-0.12, 0.12), wob: 10 });
    });
    // A thin foreground haze, low and slow, for depth (kept below the face).
    this.every('haze', this.q(1.6 * p.smoke.density), dt, () => {
      this.front.spawn(smokeTex[(Math.random() * 4) | 0], p.smoke.glow ? 0xffffff : smokeC, rand(-0.1, 1.1) * W, H + 60 * scale,
        { vx: rand(-8, 8) + p.wind * 20, vy: rand(-14, -6), max: rand(7, 11), s0: 3 * scale, s1: 6 * scale, a: 0.22, spin: rand(-0.05, 0.05) });
    });

    // Aura in the character's style.
    const auraRate = this.q(p.aura === 'flame' || p.aura === 'ki' ? 46 : p.aura === 'none' ? 0 : 26);
    this.every('aura', auraRate, dt, () => {
      // The aura rises along the figure's outer silhouette (sides and below), framing the
      // character instead of covering the face: art is mostly close-up portraits.
      const a = rand(-0.25, Math.PI + 0.25), rx = 0.4 * W, ry = 0.5 * H;
      const x = f.x + Math.cos(a) * rx * rand(0.85, 1.05), y = f.y + Math.sin(a) * ry * rand(0.85, 1.05);
      const c = Math.random() < 0.7 ? prim : sec;
      switch (p.aura) {
        case 'flame': case 'ki':
          this.glow.spawn(this.tex.flame, c, x, y, { vx: rand(-10, 10), vy: rand(-140, -70) * scale, max: rand(0.6, 1.1), s0: rand(0.8, 1.4) * scale, s1: 0.2 * scale, a: 0.55, rot: 0, wob: 20 });
          break;
        case 'shadow':
          this.back.spawn(smokeTex[(Math.random() * 4) | 0], Math.random() < 0.5 ? 0x050208 : c, x, y, { vx: rand(-20, 20), vy: rand(-60, -25), max: rand(1.4, 2.4), s0: 0.6 * scale, s1: 1.8 * scale, a: 0.5, spin: rand(-0.6, 0.6), wob: 14 });
          break;
        case 'void': {
          // Motes drawn inwards towards the centre: space bending around the character.
          const r = rand(0.25, 0.45) * W;
          this.glow.spawn(this.tex.glow, c, f.x + Math.cos(a) * r * 1.3, f.y + Math.sin(a) * r * 0.9, { vx: -Math.cos(a) * r * 0.3, vy: -Math.sin(a) * r * 0.2, max: 1.6, s0: 0.25 * scale, s1: 0.05 * scale, a: 0.8, drag: 0.4 });
          break;
        }
        case 'electric':
          this.glow.spawn(this.tex.streak, c, x, y, { vx: rand(-60, 60), vy: rand(-60, 60), max: rand(0.15, 0.3), s0: 0.5 * scale, s1: 0.1 * scale, a: 0.9 });
          break;
        case 'water':
          this.glow.spawn(this.tex.glow, c, x, y, { vx: rand(-30, 30), vy: rand(-40, 10), max: rand(1, 1.6), s0: 0.18 * scale, s1: 0.05 * scale, a: 0.7, grav: 40 });
          break;
        case 'cloud':
          this.glow.spawn(smokeTex[(Math.random() * 4) | 0], 0xffffff, x, y, { vx: rand(-30, 30), vy: rand(-50, -20), max: rand(1.6, 2.6), s0: 0.8 * scale, s1: 2.2 * scale, a: 0.35, spin: rand(-0.4, 0.4), wob: 18 });
          break;
        case 'blade':
          this.glow.spawn(this.tex.streak, c, x, y, { vx: rand(-200, 200), vy: rand(-30, 30), max: 0.25, s0: 0.4 * scale, s1: 0.05 * scale, a: 0.6, rot: rand(-0.3, 0.3) });
          break;
      }
    });

    // Flames along the floor with embers above (Rengoku, Madara).
    if (p.fire) this.every('fire', this.q(60), dt, () => {
      const x = rand(-0.05, 1.05) * W;
      this.glow.spawn(this.tex.flame, Math.random() < 0.5 ? prim : sec, x, H + 10, { vx: rand(-15, 15), vy: rand(-220, -120) * scale, max: rand(0.5, 1), s0: rand(1.4, 2.4) * scale, s1: 0.2 * scale, a: 0.6, rot: 0, wob: 30 });
    });

    // Floating particles.
    this.every('motes', this.q(p.motes.rate), dt, () => this.mote(p.motes.kind, hex(p.motes.color), W, H, scale));

    // Energy rings expanding from the character.
    if (p.rings) this.every('rings', p.rings, dt, () => {
      for (let k = 0; k < 2; k++) this.glow.spawn(this.tex.soft, k ? sec : prim, f.x, f.y + 0.38 * H, { max: 1.3 + k * 0.3, s0: 0.2 * scale, s1: 3.2 * scale, a: 0.22 });
    });

    // Sword cuts: a bright diagonal streak with sparks.
    if (p.cuts) this.every('cuts', p.cuts.rate, dt, () => {
      const side = Math.random() < 0.5 ? -1 : 1, x = f.x + side * rand(0.3, 0.45) * W, y = f.y + rand(0.1, 0.4) * H, rot = rand(-0.9, -0.4);
      this.glow.spawn(this.tex.streak, hex(p.cuts!.color), x, y, { max: 0.35, s0: 3.2 * scale, s1: 3.6 * scale, a: 1, rot });
      for (let k = 0; k < 8; k++) this.glow.spawn(this.tex.glow, hex(p.cuts!.color), x, y, { vx: rand(-200, 200), vy: rand(-160, 80), max: rand(0.3, 0.6), s0: 0.12 * scale, s1: 0.02 * scale, a: 1, grav: 300 });
    });

    // Lightning: branching arcs around the character, with a flash of light.
    this.boltLife -= dt;
    if (this.boltLife <= 0 && this.bolts.alpha > 0) { this.bolts.alpha = Math.max(0, this.bolts.alpha - dt * 8); if (this.bolts.alpha === 0) this.bolts.clear(); }
    if (p.lightning) this.every('bolt', p.lightning.rate, dt, () => this.bolt(hex(p.lightning!.color), W, H, scale));

    // Water ribbons flowing around the figure.
    if (p.water) this.ribbons.children.forEach((ch, r) => {
      const rope = ch as MeshRope & { seed?: number }, pts = (rope.geometry as unknown as { points: Point[] }).points ?? [];
      const seed = rope.seed ?? 0, n = pts.length;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1), ang = k * Math.PI * 2.2 + t * 0.9 + seed;
        pts[i].set(f.x + Math.cos(ang) * (0.18 + r * 0.05) * W * (0.8 + 0.2 * Math.sin(t + k * 4)), f.y + 0.12 * H + Math.sin(ang) * 0.22 * H + Math.sin(t * 1.4 + k * 6 + seed) * 18 * scale);
      }
      rope.alpha = 0.35 + 0.2 * Math.sin(t * 1.3 + seed);
    });

    const wind = p.wind;
    this.back.step(dt, wind, t); this.glow.step(dt, wind, t); this.front.step(dt, wind, t);
  }

  private mote(kind: Mote, color: number, W: number, H: number, scale: number) {
    const x = rand(0, W);
    switch (kind) {
      case 'ember': this.glow.spawn(this.tex.glow, color, x, H + 10, { vx: rand(-20, 20), vy: rand(-120, -50), max: rand(2, 4), s0: rand(0.12, 0.22) * scale, s1: 0.03 * scale, a: 1, wob: 30 }); break;
      case 'spark': this.glow.spawn(this.tex.streak, color, x, rand(0.3, 1) * H, { vx: rand(-40, 40), vy: rand(-90, -30), max: rand(0.6, 1.2), s0: 0.22 * scale, s1: 0.05 * scale, a: 1 }); break;
      case 'droplet': this.glow.spawn(this.tex.glow, color, x, rand(0.2, 0.9) * H, { vx: rand(-20, 20), vy: rand(-30, 0), max: rand(1.2, 2), s0: 0.1 * scale, s1: 0.04 * scale, a: 0.9, grav: 60 }); break;
      case 'ash': case 'dust': this.back.spawn(this.tex.glow, color, x, -20, { vx: rand(-20, 20), vy: rand(20, 60), max: rand(5, 9), s0: rand(0.06, 0.14) * scale, s1: 0.05 * scale, a: 0.8, wob: 25 }); break;
      case 'leaf': case 'petal': this.back.spawn(this.tex.flame, color, x, -20, { vx: rand(-40, 10), vy: rand(30, 70), max: rand(6, 10), s0: 0.18 * scale, s1: 0.16 * scale, a: 0.9, spin: rand(-2, 2), wob: 40 }); break;
      default: this.glow.spawn(this.tex.glow, color, x, rand(0, H), { vx: rand(-10, 10), vy: rand(-25, -8), max: rand(3, 6), s0: rand(0.05, 0.12) * scale, s1: 0.02 * scale, a: 0.8, wob: 12 });
    }
  }

  /** A branching lightning arc (midpoint displacement), drawn as glow, body and white core. */
  private bolt(color: number, W: number, H: number, scale: number) {
    const f = this.focus, a = rand(0, Math.PI * 2);
    const from = { x: f.x + Math.cos(a) * 0.3 * W, y: f.y + Math.sin(a) * 0.32 * H };
    const to = { x: f.x + Math.cos(a) * rand(0.5, 0.7) * W, y: f.y + Math.sin(a) * rand(0.45, 0.65) * H };
    const path = (p0: { x: number; y: number }, p1: { x: number; y: number }, depth: number): Array<{ x: number; y: number }> => {
      if (depth === 0) return [p0, p1];
      const mx = (p0.x + p1.x) / 2 + rand(-1, 1) * Math.hypot(p1.x - p0.x, p1.y - p0.y) * 0.22, my = (p0.y + p1.y) / 2 + rand(-1, 1) * Math.hypot(p1.x - p0.x, p1.y - p0.y) * 0.22;
      return [...path(p0, { x: mx, y: my }, depth - 1).slice(0, -1), ...path({ x: mx, y: my }, p1, depth - 1)];
    };
    const main = path(from, to, 5);
    const branches = [main];
    for (let b = 0; b < 3; b++) { const s = main[2 + ((Math.random() * (main.length - 4)) | 0)]; branches.push(path(s, { x: s.x + rand(-0.12, 0.12) * W, y: s.y + rand(-0.12, 0.12) * H }, 3)); }
    const g = this.bolts; g.clear();
    for (const [width, alpha, c] of [[10, 0.18, color], [4, 0.6, color], [1.6, 1, 0xffffff]] as Array<[number, number, number]>) {
      for (const br of branches) { g.moveTo(br[0].x, br[0].y); for (const q of br.slice(1)) g.lineTo(q.x, q.y); g.stroke({ width: width * scale * (br === main ? 1 : 0.6), color: c, alpha }); }
    }
    g.alpha = 1; this.boltLife = 0.12;
    for (let k = 0; k < 6; k++) this.glow.spawn(this.tex.glow, color, to.x, to.y, { vx: rand(-120, 120), vy: rand(-120, 120), max: 0.4, s0: 0.15 * scale, s1: 0.02 * scale, a: 1 });
  }

  /** Average and slow-frame share since the last call (for adaptive quality). */
  takeStats() { const s = { ...this.stats }; this.stats = { frames: 0, slow: 0 }; return s; }

  setQuality(q: Quality) { this.quality = q; }
  pause(on: boolean) { for (const a of [this.app, this.fxApp]) { if (!a.ticker) continue; if (on) a.ticker.stop(); else a.ticker.start(); } }
  /** The canvas, once the renderer has started (null before). */
  get canvas(): HTMLCanvasElement | null { return this.app.renderer ? this.app.canvas : null; }
  get fxCanvas(): HTMLCanvasElement | null { return this.fxApp.renderer ? this.fxApp.canvas : null; }

  destroy() {
    this.dead = true;
    this.ready.then(() => { this.app.destroy(true, { children: true, texture: true }); this.fxApp.destroy(true, { children: true }); }).catch(() => undefined);
  }
}

/** Device tier from cores, memory and screen size; refined at runtime by frame times. */
export function deviceQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const small = window.matchMedia?.('(max-width: 760px)').matches;
  if ((nav.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4) return 'low';
  if (small) return 'medium';
  return 'high';
}
