// Plays the home page film: one continuous take stored as numbered frames, scrubbed by scrolling.
// A single WebGL2 canvas (no PixiJS: it is one full-screen picture plus a few quads) draws the two
// frames around the current position blended together, so motion stays smooth between stored frames,
// then the giant words (they can pass behind him through a per-frame cut-out mask), then smoke
// and grain over everything. destroy() hands the WebGL context straight back to the browser.
import type { Word } from './timeline';

const VS = `#version 300 es
in vec2 p; uniform vec4 uRect; out vec2 v; out vec2 s;
void main(){ v=p; vec2 q=uRect.xy+p*uRect.zw; s=q; gl_Position=vec4(q.x*2.-1.,1.-q.y*2.,0.,1.); }`;

/** The picture: two frames blended, a light sharpen (the frames are upscaled) and the grade. */
const FRAME = `#version 300 es
precision mediump float; in vec2 v; out vec4 o;
uniform sampler2D uA,uB; uniform float uMix,uExposure,uSharp,uFlash; uniform vec2 uTexel; uniform vec3 uTint;
void main(){
  vec3 a=texture(uA,v).rgb; vec3 b=texture(uB,v).rgb; vec3 c=mix(a,b,uMix);
  if(uSharp>0.){ vec3 n=texture(uA,v+vec2(uTexel.x,0.)).rgb+texture(uA,v-vec2(uTexel.x,0.)).rgb+texture(uA,v+vec2(0.,uTexel.y)).rgb+texture(uA,v-vec2(0.,uTexel.y)).rgb; c+=(a-n*.25)*uSharp; }
  c*=uExposure;
  float l=dot(c,vec3(.299,.587,.114));
  c=mix(c,c*(.92+.16*uTint),.5)*(1.+.06*(l-.5));
  vec2 q=(v-.5)*vec2(1.,1.15); float vg=1.-dot(q,q)*.75; c*=clamp(vg,0.,1.);
  o=vec4(mix(c,vec3(1.,.98,.96),uFlash*.92),1.);
}`;

/** A word: burns in and out through noise instead of fading, and hides behind him through the mask. */
const WORD = `#version 300 es
precision mediump float; in vec2 v; in vec2 s; out vec4 o;
uniform sampler2D uTex,uNoise,uMask; uniform vec4 uMaskRect; uniform float uBurn,uBehind,uTime; uniform vec3 uColor,uEdge;
void main(){
  float a=texture(uTex,v).a; if(a<.003) discard;
  float n=texture(uNoise,s*vec2(1.7,1.)+vec2(uTime*.012,0.)).r*.7+texture(uNoise,s*vec2(5.,3.)).g*.3;
  float cut=uBurn*1.3-.15; float show=1.-smoothstep(cut-.05,cut+.05,n);
  float edge=smoothstep(.0,.5,show)*smoothstep(1.,.5,show);
  float m=texture(uMask,(s-uMaskRect.xy)/uMaskRect.zw).r; m=smoothstep(.35,.65,m);
  a*=show*(1.-uBehind*m);
  vec3 c=mix(uColor,uEdge,edge*.9);
  o=vec4(c*a,a);
}`;

/** Smoke and film grain over everything. */
const SMOKE = `#version 300 es
precision mediump float; in vec2 v; out vec4 o;
uniform sampler2D uNoise; uniform float uTime,uDensity,uGrain,uAspect; uniform vec3 uColor; uniform vec2 uGrainAt;
void main(){
  vec2 p=v*vec2(uAspect,1.);
  float a=texture(uNoise,p*.34+vec2(uTime*.011,-uTime*.006)).r;
  float b=texture(uNoise,p*.8+vec2(-uTime*.018,uTime*.009)+a*.25).g;
  float d=smoothstep(.34,.86,a*.62+b*.38);
  float floorFog=smoothstep(.45,1.,v.y)*.65+.35;
  d*=uDensity*floorFog;
  float g=(texture(uNoise,p*5.+uGrainAt).b-.5)*uGrain;
  vec3 c=uColor*.55+.08;
  float al=clamp(d,0.,.85);
  o=vec4(c*al+vec3(max(g,0.)),al+abs(g)*.5);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const mk = (t: number, src: string) => {
    const s = gl.createShader(t)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  const u: Record<string, WebGLUniformLocation | null> = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i)!.name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

/** Coarse first, then finer: every 16th frame, every 8th, and so on, so early scrolling always has something. */
export function loadOrder(total: number): number[] {
  const seen = new Set<number>(), out: number[] = [];
  for (const step of [16, 8, 4, 2, 1]) for (let i = 0; i < total; i += step) {
    if (!seen.has(i)) { seen.add(i); out.push(i); }
  }
  return out;
}

export interface WordDraw { word: Word; tex: WebGLTexture; w: number; h: number }
export interface Scene {
  frame: number;
  zoom: number;
  panX: number; panY: number;
  /** Which part of the frame stays centred when the screen is narrower than the frame (0-1). */
  focusX: number;
  exposure: number;
  accent: [number, number, number];
  smoke: number;
  /** White-out, 0-1. */
  flash: number;
  /** One per word on screen. burn: 0 gone, 1 fully there. */
  words: Array<{ w: WordDraw; x: number; y: number; scale: number; burn: number }>;
}

export class FilmPlayer {
  readonly gl: WebGL2RenderingContext;
  private frameP; private wordP; private smokeP; private quad: WebGLBuffer;
  private texA: WebGLTexture; private texB: WebGLTexture; private texMask: WebGLTexture; private noise: WebGLTexture;
  private blobs: Array<Blob | undefined> = []; private masks: Array<Blob | undefined> = [];
  private bitmaps = new Map<number, ImageBitmap>(); private maskBitmaps = new Map<number, ImageBitmap>();
  private pending = new Set<number>();
  private shownA = -1; private shownB = -1; private shownMask = -1;
  private alive = true; private abort = new AbortController();
  private fw = 16; private fh = 9;
  private wordsMade: WebGLTexture[] = [];
  /** Render size, as a share of the screen's real pixels (lowered when frames run long). */
  scale = 1;
  sharpen = 0.55;
  loaded = 0;
  onFirstFrame?: () => void;
  private first = false;
  private lastAt = 0;

  constructor(readonly canvas: HTMLCanvasElement, private base: string, readonly total: number, private keep = 28) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl2');
    this.gl = gl;
    this.frameP = compile(gl, VS, FRAME); this.wordP = compile(gl, VS, WORD); this.smokeP = compile(gl, VS, SMOKE);
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const tex = (repeat = false) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const w = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      return t;
    };
    this.texA = tex(); this.texB = tex(); this.texMask = tex();
    this.noise = tex(true);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, makeNoise(256));
  }

  private url(i: number, kind: string) { return `${this.base}/${kind}/${String(i).padStart(4, '0')}.webp`; }

  /** Fetches every frame in the background, coarse to fine, a few at a time. */
  async loadAll(hasMasks: boolean) {
    const order = loadOrder(this.total);
    let at = 0;
    const worker = async () => {
      while (this.alive && at < order.length) {
        const i = order[at++];
        try {
          this.blobs[i] = await (await fetch(this.url(i, 'f'), { signal: this.abort.signal })).blob();
          if (hasMasks) this.masks[i] = await (await fetch(this.url(i, '../m'), { signal: this.abort.signal })).blob();
          this.loaded++;
        } catch { return; }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  private async decode(i: number) {
    if (this.bitmaps.has(i) || this.pending.has(i) || !this.blobs[i]) return;
    this.pending.add(i);
    try {
      const b = await createImageBitmap(this.blobs[i]!);
      if (!this.alive) { b.close(); return; }
      this.bitmaps.set(i, b);
      const mb = this.masks[i];
      if (mb && !this.maskBitmaps.has(i)) { const m = await createImageBitmap(mb); if (this.alive) this.maskBitmaps.set(i, m); else m.close(); }
    } catch { /* a bad frame: its neighbours stand in */ } finally { this.pending.delete(i); }
  }

  /** Keeps decoded frames near the position and frees the rest, so memory stays bounded on phones. */
  private window(at: number, dir: number) {
    const clamp = (x: number) => Math.max(0, Math.min(this.total - 1, Math.round(x)));
    for (let d = 0; d < this.keep / 2; d++) {
      void this.decode(clamp(at + d * dir));
      if (d < 6) void this.decode(clamp(at - d * dir));
    }
    for (const map of [this.bitmaps, this.maskBitmaps]) {
      if (map.size > this.keep) for (const [k, b] of map) if (Math.abs(k - at) > this.keep * 0.6) { b.close(); map.delete(k); }
    }
  }

  private nearest(map: Map<number, ImageBitmap>, i: number): number {
    if (map.has(i)) return i;
    for (let d = 1; d < 40; d++) { if (map.has(i - d)) return i - d; if (map.has(i + d)) return i + d; }
    return -1;
  }

  private upload(t: WebGLTexture, b: ImageBitmap) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, b);
  }

  /** Draws a word to a texture, big enough for its letter height on this screen. */
  makeWord(word: Word, screenH: number): WordDraw {
    const gl = this.gl;
    const px = Math.ceil(word.size * screenH);
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    const font = `400 ${px}px Anton, Impact, sans-serif`;
    g.font = font;
    const pad = Math.ceil(px * 0.14);
    c.width = Math.ceil(g.measureText(word.text).width) + pad * 2;
    c.height = Math.ceil(px * 1.5);
    g.font = font; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    if (word.outline) { g.lineWidth = Math.max(2, px * 0.016); g.strokeText(word.text, pad, c.height / 2); } else g.fillText(word.text, pad, c.height / 2);
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    this.wordsMade.push(t);
    return { word, tex: t, w: c.width, h: c.height };
  }
  clearWords() { for (const t of this.wordsMade) this.gl.deleteTexture(t); this.wordsMade = []; }

  resize(w: number, h: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.scale;
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
  }

  render(s: Scene, time: number) {
    if (!this.alive) return;
    const gl = this.gl;
    const a = Math.floor(s.frame), b = Math.min(this.total - 1, a + 1), t = s.frame - a;
    this.window(s.frame, s.frame >= this.lastAt ? 1 : -1);
    this.lastAt = s.frame;
    const na = this.nearest(this.bitmaps, a), nb = this.nearest(this.bitmaps, b);
    if (na < 0) return;
    if (na !== this.shownA) {
      // Stepping forward: the texture already holding this frame just swaps places.
      if (na === this.shownB) { [this.texA, this.texB] = [this.texB, this.texA]; [this.shownA, this.shownB] = [this.shownB, this.shownA]; } else { this.upload(this.texA, this.bitmaps.get(na)!); this.shownA = na; }
      const bm = this.bitmaps.get(na)!; this.fw = bm.width; this.fh = bm.height;
    }
    if (nb >= 0 && nb !== this.shownB) { this.upload(this.texB, this.bitmaps.get(nb)!); this.shownB = nb; }
    const nm = this.nearest(this.maskBitmaps, a);
    if (nm >= 0 && nm !== this.shownMask) { this.upload(this.texMask, this.maskBitmaps.get(nm)!); this.shownMask = nm; }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    // Cover the screen. (cx, cy, cw, ch) is the part of the frame on screen; the whole frame is
    // drawn scaled up around it and the screen clips the rest.
    const sa = this.canvas.width / this.canvas.height, fa = this.fw / this.fh;
    let cw = 1, ch = 1;
    if (sa > fa) ch = fa / sa; else cw = sa / fa;
    cw /= s.zoom; ch /= s.zoom;
    const cx = Math.max(cw / 2, Math.min(1 - cw / 2, s.focusX + s.panX * 0.5)), cy = Math.max(ch / 2, Math.min(1 - ch / 2, 0.5 + s.panY * 0.5));
    const fullW = 1 / cw, fullH = 1 / ch, ox = -(cx - cw / 2) * fullW, oy = -(cy - ch / 2) * fullH;
    const fp = this.frameP;
    gl.useProgram(fp.p);
    gl.uniform4f(fp.u.uRect, ox, oy, fullW, fullH);
    this.bind(0, this.texA, fp.u.uA); this.bind(1, this.texB, fp.u.uB);
    gl.uniform1f(fp.u.uMix, this.shownB === nb && nb !== na ? t : 0);
    gl.uniform1f(fp.u.uExposure, s.exposure);
    gl.uniform1f(fp.u.uSharp, this.sharpen);
    gl.uniform1f(fp.u.uFlash, s.flash);
    gl.uniform2f(fp.u.uTexel, 1 / this.fw, 1 / this.fh);
    gl.uniform3f(fp.u.uTint, s.accent[0], s.accent[1], s.accent[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const wp = this.wordP;
    gl.useProgram(wp.p);
    this.bind(1, this.noise, wp.u.uNoise); this.bind(2, this.texMask, wp.u.uMask);
    gl.uniform1f(wp.u.uTime, time);
    gl.uniform4f(wp.u.uMaskRect, ox, oy, fullW, fullH);
    const hsc = this.canvas.height;
    for (const d of s.words) {
      if (d.burn <= 0.001) continue;
      const w = d.w, sc = (d.scale * (hsc * w.word.size)) / (w.h / 1.5);
      const qw = (w.w * sc) / this.canvas.width, qh = (w.h * sc) / this.canvas.height;
      const left = w.word.align === 'left' ? d.x : w.word.align === 'right' ? d.x - qw : d.x - qw / 2;
      gl.uniform4f(wp.u.uRect, left, d.y - qh / 2, qw, qh);
      this.bind(0, w.tex, wp.u.uTex);
      gl.uniform1f(wp.u.uBurn, d.burn);
      gl.uniform1f(wp.u.uBehind, w.word.behind);
      const c = w.word.accent ? s.accent : [0.96, 0.94, 0.9];
      gl.uniform3f(wp.u.uColor, c[0], c[1], c[2]);
      gl.uniform3f(wp.u.uEdge, 1, 0.95, 0.85);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    const sp = this.smokeP;
    gl.useProgram(sp.p);
    gl.uniform4f(sp.u.uRect, 0, 0, 1, 1);
    this.bind(0, this.noise, sp.u.uNoise);
    gl.uniform1f(sp.u.uTime, time); gl.uniform1f(sp.u.uDensity, s.smoke);
    gl.uniform1f(sp.u.uGrain, 0.05); gl.uniform1f(sp.u.uAspect, sa);
    gl.uniform3f(sp.u.uColor, s.accent[0], s.accent[1], s.accent[2]);
    gl.uniform2f(sp.u.uGrainAt, Math.random(), Math.random());
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!this.first) { this.first = true; this.onFirstFrame?.(); }
  }

  private bind(unit: number, t: WebGLTexture, loc: WebGLUniformLocation | null) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(loc, unit);
  }

  destroy() {
    this.alive = false;
    this.abort.abort();
    for (const b of this.bitmaps.values()) b.close();
    for (const b of this.maskBitmaps.values()) b.close();
    this.bitmaps.clear(); this.maskBitmaps.clear(); this.blobs = []; this.masks = [];
    const gl = this.gl;
    try { if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* nothing to release */ }
  }
}

/** Tileable noise in three channels: soft smoke in r and g, fine grain in b. */
function makeNoise(n: number): Uint8Array {
  const out = new Uint8Array(n * n * 4);
  let h = 12345;
  const rnd = () => ((h = (Math.imul(h, 1103515245) + 12345) | 0) >>> 0) / 4294967296;
  const octave = (cells: number) => {
    const g = Array.from({ length: cells * cells }, rnd);
    return (x: number, y: number) => {
      const fx = (x / n) * cells, fy = (y / n) * cells, ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (a: number, b: number) => g[((a + cells) % cells) + ((b + cells) % cells) * cells];
      const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx, bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      return top + (bot - top) * sy;
    };
  };
  const r = [octave(5), octave(11), octave(23), octave(47)], gg = [octave(7), octave(13), octave(29), octave(61)];
  const fbm = (o: Array<(x: number, y: number) => number>, x: number, y: number) => o[0](x, y) * 0.5 + o[1](x, y) * 0.27 + o[2](x, y) * 0.15 + o[3](x, y) * 0.08;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (x + y * n) * 4;
    out[i] = fbm(r, x, y) * 255; out[i + 1] = fbm(gg, x, y) * 255; out[i + 2] = rnd() * 255; out[i + 3] = 255;
  }
  return out;
}
