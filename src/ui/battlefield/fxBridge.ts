// Plays the battlefield side of a frame on the GPU layer: sets the weather,
// keeps transformed fighters' auras alive, and draws the arena's own hazards
// (lightning from the sky, lava bombs, a riptide, a blizzard gust), rain
// splashing up from impacts, and debris when a prop is hit.
import type { FxDirector, Pt } from '../fx/engine';
import type { Frame } from './director';
import type { GroundKind } from './climate';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export interface BridgeCtx {
  frame: Frame;
  ground: GroundKind;
  /** Where each fighter stands (centre) and where their feet are. */
  pos: Record<string, Pt & { foot: number }>;
  /** Pixel positions of props that were hit. */
  propAt: (id: string) => Pt | undefined;
  actor?: string;
  target?: string;
  auras: Array<{ at: Pt; color: string; power: number }>;
  reduced: boolean;
}

const DEBRIS: Record<GroundKind, string[]> = {
  rock: ['#3f2a22', '#ff6a3d', '#1c1210'], snow: ['#ffffff', '#e0f2fe', '#bae6fd'], stone: ['#4b5563', '#9ca3af', '#1f2937'],
  tile: ['#c8961e', '#6b4a14', '#fde68a'], concrete: ['#6b7280', '#d1d5db', '#22d3ee'], earth: ['#3f2d1d', '#14532d', '#a3e635'],
  water: ['#7dd3fc', '#e0f2fe', '#38bdf8'], sand: ['#d6b98a', '#a8865b', '#f5e6c8'],
};

export function playFrame(fx: FxDirector, c: BridgeCtx) {
  const { frame, pos } = c;
  const w = frame.weather;
  fx.weather.set({ kind: c.reduced ? 'clear' : w.kind, intensity: c.reduced ? 0 : w.intensity, wind: w.wind, wet: w.wet });
  fx.setAuras(c.reduced ? [] : c.auras);
  if (c.reduced) return;

  const foot = (id?: string): Pt | undefined => (id && pos[id] ? { x: pos[id].x, y: pos[id].foot } : undefined);
  const deb = DEBRIS[c.ground];

  // Water and snow answer the impact.
  const t = foot(c.target);
  if (frame.splash && t) fx.weather.splashAt(t.x, t.y, 22);
  const kickUp = (p: Pt | undefined, n = 10) => {
    if (!p) return;
    if (c.ground === 'snow' || w.snow > 0.4) fx.weather.puffAt(p.x, p.y, 'snow', n);
    else if (c.ground === 'water' || w.wet > 0.5) fx.weather.puffAt(p.x, p.y, 'water', n);
    else fx.weather.puffAt(p.x, p.y, 'dust', n);
  };
  for (const [id, m] of Object.entries(frame.motion)) {
    if (m.clip === 'strike' || m.clip === 'dashin' || m.clip === 'dodge' || m.clip === 'clash') kickUp(foot(id), m.power > 0.7 ? 14 : 8);
    if (m.clip === 'knockdown' || m.clip === 'defeated' || m.clip === 'knockback') fx.at(180, () => kickUp(foot(id), 20));
    if (m.clip === 'transform' || m.clip === 'ultimate' || m.clip === 'powerup') { const f = foot(id); if (f) { fx.ring(f, '#ffffff', { radius: 160, width: 6, dur: 700 }); fx.burst(f, deb[0], 24, 9, { dir: -Math.PI / 2, spread: 1.2, grav: 0.3, size: 12, color2: deb[1] }); } }
  }

  // Props that took the hit throw debris.
  for (const id of frame.propHits) {
    const at = c.propAt(id);
    if (!at) continue;
    fx.at(220, () => { fx.burst(at, deb[0], 30, 10, { grav: 0.4, size: 13, color2: deb[1], dir: -Math.PI / 2, spread: 1.4 }); fx.ring(at, deb[2], { radius: 70, width: 6 }); });
  }

  // The arena's own hazards.
  const hz = frame.hazard;
  if (hz) {
    const targets = hz.targets.map((id) => pos[id]).filter(Boolean) as Pt[];
    const spots = targets.length ? targets : [{ x: fx.w * rand(0.25, 0.75), y: fx.h * 0.6 }];
    switch (hz.kind) {
      case 'lightning':
        spots.forEach((s, i) => fx.at(i * 120, () => { fx.bolt({ x: s.x + rand(-60, 60), y: -30 }, s, '#fde047', { width: 12, branches: 5, dur: 520 }); fx.wash('#e0e7ff', 0.45, 260); fx.burst(s, '#fde68a', 30, 11, { color2: '#ffffff' }); }));
        break;
      case 'eruption':
        for (let i = 0; i < 9; i++) fx.at(i * 90, () => { const s = spots[i % spots.length]; fx.projectile({ x: s.x + rand(-200, 200), y: -40 }, { x: s.x + rand(-50, 50), y: s.y + rand(-10, 40) }, '#ff6a3d', { size: rand(14, 26), dur: rand(380, 560), color2: '#fde047', wobble: 80, onHit: () => fx.burst({ x: s.x, y: s.y + 40 }, '#f97316', 14, 7, { grav: 0.3 }) }); });
        fx.wash('#ff6a3d', 0.18, 1200);
        break;
      case 'blizzard':
        fx.wash('#e0f2fe', 0.35, 1400);
        for (const s of spots) fx.at(200, () => fx.burst(s, '#ffffff', 40, 12, { dir: Math.PI * (w.wind < 0 ? 1 : 0), spread: 0.5, size: 10 }));
        break;
      case 'sandstorm':
        fx.wash('#d6a96b', 0.32, 1500);
        for (const s of spots) fx.at(150, () => fx.burst(s, '#e7c58f', 46, 13, { dir: Math.PI * (w.wind < 0 ? 1 : 0), spread: 0.45, size: 12, color2: '#a8865b' }));
        break;
      case 'collapse':
        for (let i = 0; i < 12; i++) fx.at(i * 70, () => { const s = spots[i % spots.length]; fx.projectile({ x: s.x + rand(-160, 160), y: -50 }, { x: s.x + rand(-60, 60), y: s.y + rand(0, 50) }, '#57534e', { size: rand(16, 34), dur: rand(420, 600), color2: '#a8a29e', onHit: () => fx.burst({ x: s.x, y: s.y + 50 }, '#78716c', 16, 8, { grav: 0.35, size: 11 }) }); });
        break;
      case 'riptide':
        fx.crescent({ x: w.wind < 0 ? fx.w + 60 : -60, y: fx.h * 0.75 }, { x: w.wind < 0 ? -60 : fx.w + 60, y: fx.h * 0.72 }, '#38bdf8', { size: 140, dur: 1100, color2: '#e0f2fe' });
        for (const s of spots) fx.at(450, () => fx.weather.splashAt(s.x, s.y + 60, 30));
        break;
    }
  } else if (w.flash) {
    // Storm lightning in the distance, not aimed at anyone.
    const x = fx.w * rand(0.1, 0.9);
    fx.bolt({ x, y: -20 }, { x: x + rand(-80, 80), y: fx.h * rand(0.25, 0.45) }, '#c7d2fe', { width: 5, branches: 3, dur: 300 });
  }
}
