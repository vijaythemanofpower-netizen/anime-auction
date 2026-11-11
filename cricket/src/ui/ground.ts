// Draws the play-mode ground on a canvas. Two views:
//  - the pitch, seen from behind one end (floodlit stands, players, ball, marks on the pitch);
//  - the whole field from above, for following the ball to a fielder or the rope.
// Pure drawing: the caller owns time and decides what is where.
export const GW = 640, GH = 400;
const HORIZON = 120, NEAR = 356, K = 1.8;

/** Perspective scale at depth z (0 = near crease, 1 = far crease). */
export const sc = (z: number) => 1 / (1 + K * Math.max(-0.3, z));
const gy = (z: number) => HORIZON + (NEAR - HORIZON) * sc(z);
const gx = (x: number, z: number) => GW / 2 + x * sc(z);

export type Signal = 'out' | 'six' | 'four' | 'wide';
export interface Fig { x: number; z: number; color: string; kind: 'batter' | 'bowler' | 'keeper' | 'umpire' | 'fielder'; back: boolean; /** Batter: bat swing 0..1. Bowler: run-up 0..1 (arm comes over at the end). */ t?: number; left?: boolean; sig?: Signal }
export interface Mark { x: number; z: number; kind: 'bounce' | 'target' | 'aim' }
export interface PitchScene { figs: Fig[]; ball?: { x: number; z: number; h: number }; trail: { x: number; y: number; r: number }[]; marks: Mark[]; time: number; /** Stumps at this depth are hit: 0..1 how far they have flown. */ broken?: { z: number; t: number } }

const crowdTones = ['#f4d9a0', '#e8eefc', '#ff9f43', '#5aa9ff', '#ff5d7a', '#9aa7c7', '#3b4a78', '#2a355c'];
function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function offscreen(paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = GW * 2; c.height = GH * 2;
  const g = c.getContext('2d')!; g.scale(2, 2); paint(g);
  return c;
}

let pitchBack: HTMLCanvasElement | null = null;
/** Sky, stands, crowd, floodlights and the pitch never change, so they are painted once. */
function paintPitch(g: CanvasRenderingContext2D) {
  const sky = g.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, '#040714'); sky.addColorStop(1, '#16224a');
  g.fillStyle = sky; g.fillRect(0, 0, GW, HORIZON);
  const rnd = seeded(7);
  for (const [y0, y1] of [[34, 68], [76, HORIZON - 9]]) {
    g.fillStyle = '#0b1230'; g.fillRect(0, y0 - 3, GW, y1 - y0 + 6);
    for (let y = y0; y < y1; y += 4) for (let x = (y % 8) / 2; x < GW; x += 4) {
      g.fillStyle = crowdTones[Math.floor(rnd() * crowdTones.length)]; g.globalAlpha = 0.35 + rnd() * 0.5;
      g.fillRect(x, y, 2, 2);
    }
    g.globalAlpha = 1;
  }
  g.fillStyle = '#060a1c'; g.fillRect(0, 68, GW, 8);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffc83d' : '#12204a'; g.fillRect(i * 80, HORIZON - 9, 80, 9); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, HORIZON - 2, GW, 2);
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
  // The rope, far away.
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(GW / 2, gy(5.2), 420, 6, 0, Math.PI, 0); g.stroke();
  const haze = g.createLinearGradient(0, HORIZON, 0, GH);
  haze.addColorStop(0, 'rgba(210,255,220,.22)'); haze.addColorStop(0.35, 'rgba(0,0,0,0)'); haze.addColorStop(1, 'rgba(0,10,5,.38)');
  g.fillStyle = haze; g.fillRect(0, HORIZON, GW, GH - HORIZON);
  const quad = (hw: number, z0: number, z1: number) => { g.beginPath(); g.moveTo(gx(-hw, z0), gy(z0)); g.lineTo(gx(hw, z0), gy(z0)); g.lineTo(gx(hw, z1), gy(z1)); g.lineTo(gx(-hw, z1), gy(z1)); g.closePath(); };
  const dirt = g.createLinearGradient(0, gy(1.08), 0, GH);
  dirt.addColorStop(0, '#d8bb85'); dirt.addColorStop(1, '#bf9c63');
  g.fillStyle = dirt; quad(100, -0.3, 1.08); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.9)';
  for (const z of [0.05, 0.95]) { g.lineWidth = Math.max(1, 3 * sc(z)); g.beginPath(); g.moveTo(gx(-118, z), gy(z)); g.lineTo(gx(118, z), gy(z)); g.stroke(); }
  for (const z of [-0.02, 1.02]) { g.lineWidth = Math.max(1, 2.5 * sc(z)); g.beginPath(); g.moveTo(gx(-90, z), gy(z)); g.lineTo(gx(90, z), gy(z)); g.stroke(); }
}

function stumps(g: CanvasRenderingContext2D, z: number, fly: number) {
  const s = sc(z) * 1.5, y = gy(z);
  g.fillStyle = '#f6e7bd';
  [-7, 0, 7].forEach((dx, i) => {
    g.save(); g.translate(GW / 2 + dx * s, y); g.rotate((i - 1) * fly * 0.9 + (i === 1 ? fly * 0.35 : 0));
    g.fillRect(-1.6 * s, -40 * s, 3.2 * s, 40 * s); g.restore();
  });
  g.fillStyle = '#ff5d7a';
  if (fly <= 0) g.fillRect(GW / 2 - 8 * s, y - 42 * s, 16 * s, 2.4 * s);
  else for (const d of [-1, 1]) g.fillRect(GW / 2 + d * (4 + fly * 26) * s - 4 * s, y - (42 + Math.sin(fly * Math.PI) * 46 + fly * 10) * s, 8 * s, 2.4 * s);
}

const shade = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`; };
const hexOk = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#38bdf8');
function pill(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) { g.beginPath(); g.roundRect(x, y, w, h, Math.min(w, h) / 2); g.fill(); }

function figure(g: CanvasRenderingContext2D, f: Fig, time: number) {
  const s = sc(f.z) * 1.5, x = gx(f.x, f.z), y = gy(f.z);
  const ump = f.kind === 'umpire', bowler = f.kind === 'bowler', batter = f.kind === 'batter', keeper = f.kind === 'keeper';
  const col = ump ? '#f1f3f9' : hexOk(f.color);
  const m = f.left ? -1 : 1, t = f.t ?? 0;
  g.save(); g.translate(x, y); g.scale(s, s * (keeper ? 0.8 : 1));
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(0, 0, 26, 6, 0, 0, Math.PI * 2); g.fill();
  const stride = bowler && t > 0 && t < 0.8 ? Math.sin(t * 22) * 9 : 0;
  // Legs (batters and keepers wear pads).
  g.fillStyle = batter || keeper ? '#f2f4f8' : ump ? '#1a1d29' : shade(col, 0.55);
  pill(g, -13 + stride * 0.6, -44, 11, 44 - Math.max(0, stride)); pill(g, 2 - stride * 0.6, -44, 11, 44 - Math.max(0, -stride));
  // Body.
  g.fillStyle = col; g.beginPath(); g.roundRect(-17, -92, 34, ump ? 60 : 52, 10); g.fill();
  if (!ump) { g.fillStyle = shade(col, 0.72); g.fillRect(-17, -52, 34, 6); }
  if (f.back && !ump) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(-7, -80, 14, 3); g.fillRect(-7, -74, 14, 3); }
  // Head: helmet for batters and keepers, cap for the field, wide hat for the umpire.
  g.fillStyle = '#c98d63'; g.beginPath(); g.arc(0, -104, 10.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = ump ? '#f1f3f9' : shade(col, 0.5); g.beginPath();
  if (ump) { g.ellipse(0, -111, 17, 4, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(0, -111, 10, Math.PI, 0); }
  else if (f.back || batter || keeper) g.arc(0, -105, 11.5, 0, Math.PI * 2); else g.arc(0, -106, 11.5, Math.PI, 0);
  g.fill();
  if ((batter || keeper) && !f.back) { g.fillStyle = '#c98d63'; g.fillRect(-6, -104, 12, 6); g.strokeStyle = '#d7dbe6'; g.lineWidth = 1.2; g.strokeRect(-7, -105, 14, 8); }
  g.lineCap = 'round'; g.strokeStyle = col; g.lineWidth = 8;
  const arm = (side: number, ang: number, len = 28) => { g.beginPath(); g.moveTo(13 * side, -84); g.lineTo(13 * side + Math.sin(ang) * len * side, -84 + Math.cos(ang) * len); g.stroke(); };
  if (bowler) {
    // Bowling arm comes over the top at the end of the run-up.
    const a = t <= 0 ? 0.25 : t < 0.8 ? 0.5 + Math.sin(t * 22) * 0.5 : 0.5 - ((t - 0.8) / 0.2) * 3.4;
    g.beginPath(); g.moveTo(13, -84); g.lineTo(13 + Math.sin(a) * 30, -84 + Math.cos(a) * 30); g.stroke();
    arm(-1, t <= 0 ? 0.25 : a * 0.7, 24);
  } else if (batter) {
    // Bat: rests on the ground beside the pads, swings through and up.
    const e = 1 - (1 - t) ** 3;
    g.beginPath(); g.moveTo(-12 * m, -84); g.lineTo(14 * m, -62); g.moveTo(13 * m, -84); g.lineTo(16 * m, -62); g.stroke();
    g.translate(15 * m, -62); g.rotate((0.3 - e * 2.9) * m * (f.back ? 1 : -1));
    g.fillStyle = '#2b2f3a'; pill(g, -2.5, -4, 5, 20);
    g.fillStyle = '#e9c98a'; g.beginPath(); g.roundRect(-5.5, 14, 11, 48, 4); g.fill();
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, 16, 5.5, 44);
  } else if (ump) {
    // Signals: out (finger up), six (both arms up), four (arm sweeping), wide (arms out).
    const wave = Math.sin(time / 110) * 0.35;
    arm(1, f.sig === 'out' || f.sig === 'six' ? Math.PI : f.sig === 'four' ? 1.5 + wave : f.sig === 'wide' ? 1.57 : 0.15);
    arm(-1, f.sig === 'six' ? Math.PI : f.sig === 'wide' ? 1.57 : 0.15);
  } else {
    arm(1, keeper ? 0.9 : 0.2, 24); arm(-1, keeper ? 0.9 : 0.2, 24);
    if (keeper) { g.fillStyle = '#ffb347'; for (const d of [-1, 1]) { g.beginPath(); g.arc(d * 32, -68, 7, 0, Math.PI * 2); g.fill(); } }
  }
  g.restore();
}

export function drawPitch(g: CanvasRenderingContext2D, sn: PitchScene) {
  pitchBack ??= offscreen(paintPitch);
  g.drawImage(pitchBack, 0, 0, GW, GH);
  for (const mk of sn.marks) {
    const s = sc(mk.z), x = gx(mk.x, mk.z), y = gy(mk.z);
    const ring = (r: number, style: string, w: number, fill?: string) => { g.beginPath(); g.ellipse(x, y, r * s, r * s * 0.42, 0, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = style; g.lineWidth = w; g.stroke(); };
    if (mk.kind === 'bounce') ring(15, 'rgba(255,61,110,.95)', 2, 'rgba(255,61,110,.28)');
    else if (mk.kind === 'target') { ring(38 + Math.sin(sn.time / 180) * 3, 'rgba(255,200,61,.9)', 2, 'rgba(255,200,61,.12)'); ring(14, 'rgba(74,222,128,.95)', 2, 'rgba(74,222,128,.35)'); }
    else { ring(17, '#fff', 2.5); g.beginPath(); g.moveTo(x - 24 * s, y); g.lineTo(x + 24 * s, y); g.moveTo(x, y - 11 * s); g.lineTo(x, y + 11 * s); g.stroke(); }
  }
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
  // Far things first, so nearer ones cover them.
  const items: { z: number; draw: () => void }[] = [
    ...sn.figs.map((f) => ({ z: f.z, draw: () => figure(g, f, sn.time) })),
    ...[0, 1].map((z) => ({ z: z + 0.001, draw: () => stumps(g, z, sn.broken && Math.abs(sn.broken.z - z) < 0.01 ? sn.broken.t : 0) })),
    ...(b ? [{ z: b.z, draw: ball }] : []),
  ];
  items.sort((p, q) => q.z - p.z).forEach((i) => i.draw());
}

// ---------- The field from above

const CX = GW / 2, CY = GH / 2 + 4, RX = 286, RY = 176;
/** The striker's crease, where every shot starts. */
const SX = CX, SY = CY + 27;
/** Distance from the striker to the rope along a direction (0 = straight back past the bowler, 90 = to the right). */
function reach(a: number): number {
  const dx = Math.sin((a * Math.PI) / 180), dy = -Math.cos((a * Math.PI) / 180);
  const px = (SX - CX) / RX, py = (SY - CY) / RY, vx = dx / RX, vy = dy / RY;
  const A = vx * vx + vy * vy, B = 2 * (px * vx + py * vy), C = px * px + py * py - 1;
  return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
}
/** A point on the field: angle from the striker, distance as a share of the way to the rope. */
export function spot(a: number, d: number): { x: number; y: number } {
  const r = reach(a) * d;
  return { x: SX + Math.sin((a * Math.PI) / 180) * r, y: SY - Math.cos((a * Math.PI) / 180) * r };
}

export interface FieldScene { time: number; ball?: { x: number; y: number; h: number }; fielders: { x: number; y: number }[]; field: string; bat: string; /** Batters' progress between the wickets, in runs (1.5 = halfway through the second). */ run: number; zoom: number }

/** Nine fielders (angle, distance) for a right-hander: ring field in the powerplay, spread out after it. */
export function fieldSet(powerplay: boolean, left: boolean): { a: number; d: number }[] {
  const set = powerplay
    ? [[168, 0.2], [95, 0.42], [55, 0.44], [18, 0.44], [-18, 0.44], [-60, 0.44], [-98, 0.42], [140, 0.9], [-142, 0.9]]
    : [[95, 0.42], [72, 0.9], [42, 0.44], [16, 0.9], [-18, 0.9], [-55, 0.9], [-92, 0.44], [-140, 0.9], [140, 0.9]];
  return set.map(([a, d]) => ({ a: left ? -a : a, d }));
}

let fieldBack: HTMLCanvasElement | null = null;
function paintField(g: CanvasRenderingContext2D) {
  g.fillStyle = '#050914'; g.fillRect(0, 0, GW, GH);
  // Stands all the way round.
  const rnd = seeded(11);
  for (let i = 0; i < 5200; i++) {
    const a = rnd() * Math.PI * 2, k = 1.07 + rnd() * 0.3, x = CX + Math.cos(a) * RX * k, y = CY + Math.sin(a) * RY * k;
    g.fillStyle = crowdTones[Math.floor(rnd() * crowdTones.length)]; g.globalAlpha = 0.3 + rnd() * 0.5; g.fillRect(x, y, 2, 2);
  }
  g.globalAlpha = 1;
  g.strokeStyle = '#12204a'; g.lineWidth = 9; g.beginPath(); g.ellipse(CX, CY, RX + 9, RY + 9, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#ffc83d'; g.setLineDash([26, 26]); g.stroke(); g.setLineDash([]);
  // The outfield, mown in stripes.
  g.save(); g.beginPath(); g.ellipse(CX, CY, RX + 4, RY + 4, 0, 0, Math.PI * 2); g.clip();
  for (let i = 0; i < 20; i++) { g.fillStyle = i % 2 ? '#1f7a3d' : '#23883f'; g.fillRect(i * 32, 0, 32, GH); }
  const light = g.createRadialGradient(CX, CY, 20, CX, CY, RX);
  light.addColorStop(0, 'rgba(220,255,225,.2)'); light.addColorStop(1, 'rgba(0,12,6,.3)');
  g.fillStyle = light; g.fillRect(0, 0, GW, GH);
  g.restore();
  g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(CX, CY, RX, RY, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.setLineDash([7, 7]); g.beginPath(); g.ellipse(CX, CY, 128, 96, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#cfae76'; g.beginPath(); g.roundRect(CX - 9, CY - 35, 18, 70, 3); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.2;
  for (const y of [CY - 27, CY + 27]) { g.beginPath(); g.moveTo(CX - 12, y); g.lineTo(CX + 12, y); g.stroke(); }
}

export function drawField(g: CanvasRenderingContext2D, sn: FieldScene) {
  fieldBack ??= offscreen(paintField);
  g.save();
  // A slow push-in on the action.
  const fx = sn.ball?.x ?? CX, fy = sn.ball?.y ?? CY, z = sn.zoom;
  g.translate(GW / 2, GH / 2); g.scale(z, z); g.translate(-(CX + (fx - CX) * (z - 1) * 0.9), -(GH / 2 + (fy - CY) * (z - 1) * 0.9));
  g.drawImage(fieldBack, 0, 0, GW, GH);
  const man = (x: number, y: number, col: string, r = 6.5) => {
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + 1.5, y + 3, r, r * 0.55, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = hexOk(col); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = shade(hexOk(col), 0.5); g.beginPath(); g.arc(x, y, r * 0.45, 0, Math.PI * 2); g.fill();
  };
  for (const f of sn.fielders) man(f.x, f.y, sn.field);
  // The two batters run between the creases and swap ends on every run.
  const whole = Math.floor(sn.run), part = sn.run - whole, p = whole % 2 ? 1 - part : part;
  man(CX - 5, SY - p * 54, sn.bat, 6); man(CX + 5, SY - 54 + p * 54, sn.bat, 6);
  if (sn.ball) {
    const { x, y, h } = sn.ball, r = 3.6 + h * 6;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x, y, 3.6, 2.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y - h * 70, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.stroke();
  }
  g.restore();
}

/** Batting: how well a shot was timed, from how far (ms) the swing was from the ball arriving. `zone` is the batter's skill at that shot (0.06 .. 0.3). */
export function timingQ(dtMs: number, zone: number): number {
  const w = 70 + zone * 450, a = Math.abs(dtMs);
  return a <= w * 0.3 ? 3 : a <= w * 0.65 ? 2 : a <= w * 1.2 ? 1 : 0;
}
/** Bowling: how close the sight was to the spot (0 = on it, 1 = edge of its wander). */
export const aimQ = (off: number) => (off <= 0.22 ? 3 : off <= 0.5 ? 2 : off <= 0.85 ? 1 : 0);
