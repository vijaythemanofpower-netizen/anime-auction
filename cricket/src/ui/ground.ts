// Draws the play-mode ground on a canvas: a floodlit stadium seen from behind the near end of the
// pitch, the two players, the ball and any marks on the pitch. Pure drawing: the caller owns time.
export const GW = 640, GH = 400;
const HORIZON = 120, NEAR = 356, K = 2.2;

/** Perspective scale at depth z (0 = near crease, 1 = far crease). */
export const sc = (z: number) => 1 / (1 + K * Math.max(-0.3, z));
const gy = (z: number) => HORIZON + (NEAR - HORIZON) * sc(z);
const gx = (x: number, z: number) => GW / 2 + x * sc(z);

export interface Figure { x: number; z: number; color: string; kind: 'batter' | 'bowler'; back: boolean; /** Batter: bat swing 0..1. Bowler: run-up 0..1 (arm comes over at the end). */ t: number; left?: boolean }
export interface Mark { x: number; z: number; kind: 'bounce' | 'target' | 'aim' }
export interface Scene { near: Figure; far: Figure; ball?: { x: number; z: number; h: number }; trail: { x: number; y: number; r: number }[]; marks: Mark[]; time: number }

let backdrop: HTMLCanvasElement | null = null;

/** Sky, stands, crowd and floodlights never change, so they are painted once. */
function paintBackdrop(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = GW; c.height = GH;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, '#040714'); sky.addColorStop(1, '#16224a');
  g.fillStyle = sky; g.fillRect(0, 0, GW, HORIZON);
  // Stands: two tiers of crowd as rows of small dots.
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tones = ['#f4d9a0', '#e8eefc', '#ff9f43', '#5aa9ff', '#ff5d7a', '#9aa7c7', '#3b4a78', '#2a355c'];
  for (const [y0, y1] of [[34, 68], [76, HORIZON - 9]]) {
    g.fillStyle = '#0b1230'; g.fillRect(0, y0 - 3, GW, y1 - y0 + 6);
    for (let y = y0; y < y1; y += 4) for (let x = (y % 8) / 2; x < GW; x += 4) {
      g.fillStyle = tones[Math.floor(rnd() * tones.length)]; g.globalAlpha = 0.35 + rnd() * 0.5;
      g.fillRect(x, y, 2, 2);
    }
    g.globalAlpha = 1;
  }
  g.fillStyle = '#060a1c'; g.fillRect(0, 68, GW, 8);
  // Boundary boards.
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffc83d' : '#12204a'; g.fillRect(i * 80, HORIZON - 9, 80, 9); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, HORIZON - 2, GW, 2);
  // Floodlights.
  for (const x of [70, 250, 390, 570]) {
    g.fillStyle = '#1b2547'; g.fillRect(x - 2, 14, 4, 22);
    const glow = g.createRadialGradient(x, 12, 0, x, 12, 90);
    glow.addColorStop(0, 'rgba(255,246,214,.95)'); glow.addColorStop(0.08, 'rgba(255,240,190,.55)'); glow.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = glow; g.fillRect(x - 90, -78, 180, 180);
    g.fillStyle = '#fffbe8'; g.fillRect(x - 13, 7, 26, 9);
  }
  // Outfield with mown stripes that shrink into the distance.
  for (let i = 0, z = -0.3; z < 12; i++, z += 0.22 + i * 0.03) {
    g.fillStyle = i % 2 ? '#1f7a3d' : '#23883f';
    const y0 = gy(z + 0.22 + (i + 1) * 0.03), y1 = Math.min(GH, gy(z));
    g.fillRect(0, y0, GW, y1 - y0 + 1);
  }
  g.fillStyle = '#1f7a3d'; g.fillRect(0, HORIZON, GW, gy(12) - HORIZON + 1);
  const haze = g.createLinearGradient(0, HORIZON, 0, GH);
  haze.addColorStop(0, 'rgba(210,255,220,.22)'); haze.addColorStop(0.35, 'rgba(0,0,0,0)'); haze.addColorStop(1, 'rgba(0,10,5,.38)');
  g.fillStyle = haze; g.fillRect(0, HORIZON, GW, GH - HORIZON);
  // The pitch.
  const quad = (hw: number, z0: number, z1: number) => { g.beginPath(); g.moveTo(gx(-hw, z0), gy(z0)); g.lineTo(gx(hw, z0), gy(z0)); g.lineTo(gx(hw, z1), gy(z1)); g.lineTo(gx(-hw, z1), gy(z1)); g.closePath(); };
  const dirt = g.createLinearGradient(0, gy(1.08), 0, GH);
  dirt.addColorStop(0, '#d8bb85'); dirt.addColorStop(1, '#bf9c63');
  g.fillStyle = dirt; quad(100, -0.3, 1.08); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.9)';
  for (const z of [0.05, 0.95]) { g.lineWidth = Math.max(1, 3 * sc(z)); g.beginPath(); g.moveTo(gx(-118, z), gy(z)); g.lineTo(gx(118, z), gy(z)); g.stroke(); }
  for (const z of [-0.02, 1.02]) { g.lineWidth = Math.max(1, 2.5 * sc(z)); g.beginPath(); g.moveTo(gx(-90, z), gy(z)); g.lineTo(gx(90, z), gy(z)); g.stroke(); }
  return c;
}

function stumps(g: CanvasRenderingContext2D, z: number) {
  const s = sc(z) * 1.5, y = gy(z);
  g.fillStyle = '#f6e7bd';
  for (const dx of [-7, 0, 7]) g.fillRect(GW / 2 + dx * s - 1.6 * s, y - 40 * s, 3.2 * s, 40 * s);
  g.fillStyle = '#ff5d7a'; g.fillRect(GW / 2 - 8 * s, y - 42 * s, 16 * s, 2.4 * s);
}

const shade = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`; };
function pill(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) { g.beginPath(); g.roundRect(x, y, w, h, Math.min(w, h) / 2); g.fill(); }

function figure(g: CanvasRenderingContext2D, f: Figure) {
  const s = sc(f.z) * 1.5, x = gx(f.x, f.z), y = gy(f.z);
  const col = /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '#38bdf8';
  const m = f.left ? -1 : 1;
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(0, 0, 26, 6, 0, 0, Math.PI * 2); g.fill();
  const bowler = f.kind === 'bowler';
  const stride = bowler && f.t < 0.8 ? Math.sin(f.t * 22) * 9 : 0;
  // Legs.
  g.fillStyle = bowler ? shade(col, 0.55) : '#f2f4f8';
  pill(g, -13 + stride * 0.6, -44, 11, 44 - Math.max(0, stride)); pill(g, 2 - stride * 0.6, -44, 11, 44 - Math.max(0, -stride));
  // Body.
  g.fillStyle = col; g.beginPath(); g.roundRect(-17, -92, 34, 52, 10); g.fill();
  g.fillStyle = shade(col, 0.72); g.fillRect(-17, -52, 34, 6);
  if (f.back) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(-7, -80, 14, 3); g.fillRect(-7, -74, 14, 3); }
  // Head.
  g.fillStyle = '#c98d63'; g.beginPath(); g.arc(0, -104, 10.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = shade(col, 0.5); g.beginPath();
  if (f.back || !bowler) g.arc(0, -105, 11.5, 0, Math.PI * 2); else g.arc(0, -106, 11.5, Math.PI, 0);
  g.fill();
  if (!bowler && !f.back) { g.fillStyle = '#c98d63'; g.fillRect(-6, -104, 12, 6); g.strokeStyle = '#d7dbe6'; g.lineWidth = 1.2; g.strokeRect(-7, -105, 14, 8); }
  g.lineCap = 'round';
  if (bowler) {
    // Bowling arm comes over the top at the end of the run-up.
    const a = f.t < 0.8 ? 0.5 + Math.sin(f.t * 22) * 0.5 : 0.5 - ((f.t - 0.8) / 0.2) * 3.4;
    g.strokeStyle = col; g.lineWidth = 8;
    g.beginPath(); g.moveTo(13, -84); g.lineTo(13 + Math.sin(a) * 30, -84 + Math.cos(a) * 30); g.stroke();
    g.beginPath(); g.moveTo(-13, -84); g.lineTo(-13 - Math.sin(a) * 22, -84 + Math.cos(a) * 24); g.stroke();
  } else {
    // Bat: rests on the ground beside the pads, swings through and up.
    const e = 1 - (1 - f.t) ** 3;
    g.strokeStyle = col; g.lineWidth = 8;
    g.beginPath(); g.moveTo(-12 * m, -84); g.lineTo(14 * m, -62); g.moveTo(13 * m, -84); g.lineTo(16 * m, -62); g.stroke();
    g.translate(15 * m, -62); g.rotate((0.3 - e * 2.9) * m * (f.back ? 1 : -1));
    g.fillStyle = '#2b2f3a'; pill(g, -2.5, -4, 5, 20);
    g.fillStyle = '#e9c98a'; g.beginPath(); g.roundRect(-5.5, 14, 11, 48, 4); g.fill();
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, 16, 5.5, 44);
  }
  g.restore();
}

export function drawScene(g: CanvasRenderingContext2D, sn: Scene) {
  backdrop ??= paintBackdrop();
  g.drawImage(backdrop, 0, 0);
  stumps(g, 1);
  for (const mk of sn.marks) {
    const s = sc(mk.z), x = gx(mk.x, mk.z), y = gy(mk.z);
    const ring = (r: number, style: string, w: number, fill?: string) => { g.beginPath(); g.ellipse(x, y, r * s, r * s * 0.42, 0, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = style; g.lineWidth = w; g.stroke(); };
    if (mk.kind === 'bounce') ring(13, 'rgba(255,61,110,.95)', 2, 'rgba(255,61,110,.25)');
    else if (mk.kind === 'target') { ring(34 + Math.sin(sn.time / 180) * 3, 'rgba(255,200,61,.9)', 2, 'rgba(255,200,61,.12)'); ring(12, 'rgba(74,222,128,.95)', 2, 'rgba(74,222,128,.35)'); }
    else { ring(15, '#fff', 2.5); g.beginPath(); g.moveTo(x - 22 * s, y); g.lineTo(x + 22 * s, y); g.moveTo(x, y - 10 * s); g.lineTo(x, y + 10 * s); g.stroke(); }
  }
  figure(g, sn.far);
  const b = sn.ball;
  const ball = () => {
    if (!b) return;
    const s = sc(b.z), x = gx(b.x, b.z), y = gy(b.z) - b.h * s, r = Math.max(2.6, 10 * s);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x, gy(b.z), r * 1.1, r * 0.4, 0, 0, Math.PI * 2); g.fill();
    sn.trail.push({ x, y, r }); if (sn.trail.length > 7) sn.trail.shift();
    sn.trail.forEach((t, i) => { g.fillStyle = `rgba(255,255,255,${(i / sn.trail.length) * 0.22})`; g.beginPath(); g.arc(t.x, t.y, t.r * 0.9, 0, Math.PI * 2); g.fill(); });
    const shine = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    shine.addColorStop(0, '#ffffff'); shine.addColorStop(1, '#cfd6e6');
    g.fillStyle = shine; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  // The ball is drawn behind the near player only while it is still up the pitch.
  if (b && b.z > sn.near.z + 0.04) ball();
  stumps(g, 0);
  figure(g, sn.near);
  if (b && b.z <= sn.near.z + 0.04) ball();
}

/** Batting: how well a shot was timed, from how far (ms) the swing was from the ball arriving. `zone` is the batter's skill (0.08 .. 0.3). */
export function timingQ(dtMs: number, zone: number): number {
  const w = 70 + zone * 450, a = Math.abs(dtMs);
  return a <= w * 0.3 ? 3 : a <= w * 0.65 ? 2 : a <= w * 1.2 ? 1 : 0;
}
/** Bowling: how close the sight was to the spot (0 = on it, 1 = edge of its wander). */
export const aimQ = (off: number) => (off <= 0.22 ? 3 : off <= 0.5 ? 2 : off <= 0.85 ? 1 : 0);
