// Attack recipes: how each move looks on screen. Every move type has a
// recipe, and the most iconic signature moves have their own.
import type { BattleEvent, VfxKind } from '../../engine/types';
import type { FxDirector, Pt } from './engine';
import { ABILITIES } from '../../engine/data/abilities';
import { chargeMotif, motifsOf, strikeMotif } from './motifs';

export interface Staging {
  /** Black-and-white inverted flash, the classic anime impact frame. */
  impactFrame(): void;
  /** Push the camera in on a point for a charge-up. */
  zoom(at: Pt): void;
}

export interface PlayCtx {
  e: BattleEvent;
  from?: Pt;
  to?: Pt;
  partnerAt?: Pt;
  kind: VfxKind | null;
  colors: [string, string];
  stage: Staging;
  reduced: boolean;
}

type Strike = (fx: FxDirector, from: Pt, to: Pt, c: string, c2: string, hit: () => void) => void;
type Charge = (fx: FxDirector, at: Pt, c: string, c2: string) => void;
interface Signature { charge?: Charge; strike?: Strike }

const mid = (a: Pt, b: Pt, t = 0.5): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const hand = (from: Pt, to: Pt): Pt => ({ x: from.x + Math.sign(to.x - from.x || 1) * 40, y: from.y + 10 });

// ------------------------------------------------------------ by move type

const KIND: Record<VfxKind, Strike> = {
  beam: (fx, f, t, c, c2, hit) => { fx.orb(hand(f, t), c, 18, 260, { core: c2 }); fx.at(150, () => fx.beam(hand(f, t), t, c, { width: 20, color2: c2, onHit: hit })); },
  projectile: (fx, f, t, c, c2, hit) => fx.projectile(hand(f, t), t, c, { size: 24, color2: c2, onHit: hit }),
  explosion: (fx, f, t, c, c2, hit) => fx.projectile(hand(f, t), t, c, { size: 32, color2: c2, wobble: 60, dur: 480, onHit: () => { fx.explode(t, c, 1.3, c2); hit(); } }),
  barrage: (fx, f, t, c, c2, hit) => { for (let i = 0; i < 9; i++) fx.at(i * 55, () => fx.projectile(hand(f, t), { x: t.x + (Math.random() - 0.5) * 60, y: t.y + (Math.random() - 0.5) * 70 }, c, { size: 12, dur: 200, color2: c2, trail: 1, onHit: () => fx.burst(t, c, 5, 5, { size: 10 }) })); fx.at(9 * 55 + 200, hit); },
  lightning: (fx, f, t, c, _c2, hit) => { fx.orb(hand(f, t), c, 16, 240); fx.at(120, () => { fx.bolt(hand(f, t), t, c, { width: 7, branches: 3 }); hit(); }); },
  fire: (fx, f, t, c, c2, hit) => { fx.flames(hand(f, t), t, c, 420, c2 === '#ffffff' ? '#fde047' : c2); fx.at(380, hit); },
  ice: (fx, f, t, c, _c2, hit) => fx.shards(hand(f, t), t, c, 9, hit),
  wave: (fx, f, t, c, c2, hit) => fx.crescent(hand(f, t), t, c, { color2: c2, onHit: hit }),
  slash: (fx, _f, t, c, _c2, hit) => { fx.slash(t, c, { angle: -50 }); fx.slash(t, c, { angle: 130, delay: 90, radius: 75 }); fx.at(120, hit); },
  punch: (fx, _f, t, c, _c2, hit) => { fx.orb(t, c, 20, 160); hit(); },
  genjutsu: (fx, _f, t, c, c2, hit) => { fx.wash(c, 0.35, 900, { radial: t }); fx.vortex(t, c, c2, 30, 600); fx.at(500, hit); },
  domain: (fx, f, t, c, c2, hit) => { fx.wash('#000000', 0.6, 1300, { radial: f }); fx.wash(c, 0.25, 1300); fx.at(700, () => { fx.explode(t, c, 1.4, c2); hit(); }); },
  summon: (fx, f, t, c, c2, hit) => { fx.giant(f, c, { scale: 0.7, dur: 900 }); fx.at(450, () => fx.projectile({ x: f.x, y: f.y - 80 }, t, c, { size: 30, color2: c2, onHit: hit })); },
  aura: (fx, f, _t, c, c2) => aura(fx, f, c, c2),
  shield: (fx, _f, t, c) => fx.ring(t, c, { radius: 90, width: 14, dur: 600 }),
  heal: (fx, _f, t) => { for (let i = 0; i < 24; i++) fx.at(i * 25, () => fx.spark({ x: t.x + (Math.random() - 0.5) * 90, y: t.y + 60 }, '#4ade80', { vy: -3, life: 700, size: 14 })); },
};

function aura(fx: FxDirector, at: Pt, c: string, c2: string, scale = 1) {
  fx.ring({ x: at.x, y: at.y + 90 }, c, { radius: 110 * scale, width: 10 });
  for (let i = 0; i < 50 * scale; i++) fx.at(i * 18, () => fx.spark({ x: at.x + (Math.random() - 0.5) * 120 * scale, y: at.y + 90 }, i % 3 ? c : c2, { vy: -(4 + Math.random() * 5), vx: (Math.random() - 0.5) * 1.5, life: 700, size: 16, grav: -0.02, drag: 0.98 }));
  fx.orb(at, c, 70 * scale, 1000, { alpha: 0.5 });
}

// ------------------------------------------------------- signature moves

const SIG: Record<string, Signature> = {
  'naruto:rasengan': {
    charge: (fx, at, c, c2) => fx.vortex(hand(at, { x: at.x + 1, y: at.y }), c, c2, 26, 900),
    strike: (fx, f, t, c, c2, hit) => fx.projectile(hand(f, t), t, c, { size: 30, color2: c2, dur: 320, onHit: () => { fx.vortex(t, c, c2, 40, 450); fx.ring(t, c, { radius: 160 }); hit(); } }),
  },
  'sasuke:chidori': {
    charge: (fx, at, c) => { for (let i = 0; i < 6; i++) fx.at(i * 110, () => fx.bolt({ x: at.x + 30, y: at.y + 20 }, { x: at.x + 30 + (Math.random() - 0.5) * 120, y: at.y + 20 + (Math.random() - 0.5) * 120 }, c, { dur: 140, width: 4, branches: 1 })); },
    strike: (fx, f, t, c, _c2, hit) => { fx.bolt(hand(f, t), t, c, { width: 10, branches: 4, dur: 500 }); fx.at(90, () => { fx.burst(t, c, 40, 11, { color2: '#ffffff' }); hit(); }); },
  },
  'goku:kamehameha': {
    charge: (fx, at, c) => { fx.charge(hand(at, { x: at.x + 1, y: at.y }), c, 1000, 130, 60); fx.orb(hand(at, { x: at.x + 1, y: at.y }), c, 24, 1100, { grow: 0.8, pulse: true }); },
    strike: (fx, f, t, c, c2, hit) => fx.beam(hand(f, t), t, c, { width: 40, dur: 1000, color2: c2, extend: 0.2, onHit: () => { fx.explode(t, c, 1.2, c2); hit(); } }),
  },
  'vegeta:finalflash': {
    charge: (fx, at, c) => { fx.charge(at, c, 1100, 160, 70); fx.orb(at, c, 36, 1200, { grow: 0.6, pulse: true }); },
    strike: (fx, f, t, c, c2, hit) => fx.beam(f, t, c, { width: 60, dur: 1100, color2: c2, onHit: () => { fx.explode(t, c, 1.6, c2); hit(); } }),
  },
  'vegeta:galick': { strike: (fx, f, t, _c, c2, hit) => fx.beam(hand(f, t), t, '#a855f7', { width: 34, dur: 850, color2: c2, onHit: () => { fx.explode(t, '#a855f7', 1, c2); hit(); } }) },
  'goku:spiritbomb': {
    charge: (fx, at, c) => { const top = { x: at.x, y: at.y - 170 }; fx.charge(top, c, 1400, 260, 90); fx.orb(top, c, 60, 1500, { grow: 1.2, pulse: true }); },
    strike: (fx, f, t, c, c2, hit) => fx.projectile({ x: f.x, y: f.y - 170 }, t, c, { size: 80, dur: 800, color2: c2, onHit: () => { fx.explode(t, c, 2.2, c2); hit(); } }),
  },
  'gojo:purple': {
    charge: (fx, at) => { fx.orb({ x: at.x - 50, y: at.y }, '#3b82f6', 26, 1000, { pulse: true }); fx.orb({ x: at.x + 50, y: at.y }, '#ef4444', 26, 1000, { pulse: true }); fx.at(700, () => fx.orb(at, '#a855f7', 44, 600, { grow: 0.5 })); },
    strike: (fx, f, t, _c, _c2, hit) => { fx.projectile(f, t, '#a855f7', { size: 70, dur: 600, color2: '#f0abfc', onHit: () => { fx.explode(t, '#a855f7', 2, '#f0abfc'); hit(); } }); },
  },
  'gojo:blue': { strike: (fx, _f, t, _c, _c2, hit) => { fx.vortex(t, '#3b82f6', '#bfdbfe', 50, 700); fx.charge(t, '#93c5fd', 600, 200, 60); fx.at(550, hit); } },
  'gojo:red': { strike: (fx, f, t, _c, _c2, hit) => fx.projectile(hand(f, t), t, '#ef4444', { size: 34, dur: 260, color2: '#fecaca', onHit: () => { fx.explode(t, '#ef4444', 1.3, '#fecaca'); hit(); } }) },
  'sukuna:dismantle': { strike: (fx, _f, t, c, _c2, hit) => { for (let i = 0; i < 6; i++) fx.slash({ x: t.x + (Math.random() - 0.5) * 50, y: t.y + (Math.random() - 0.5) * 60 }, c, { angle: Math.random() * 360, radius: 60 + Math.random() * 40, delay: i * 55, width: 6 }); fx.at(300, hit); } },
  'sukuna:cleave': { strike: (fx, _f, t, c, _c2, hit) => { fx.slash(t, c, { angle: -90, radius: 120, width: 14 }); fx.slash(t, '#ffffff', { angle: 90, radius: 110, width: 8, delay: 70 }); fx.at(150, hit); } },
  'sukuna:fuga': { strike: (fx, f, t, _c, _c2, hit) => { fx.flames(hand(f, t), t, '#f97316', 500, '#fde047'); fx.at(420, () => { fx.explode(t, '#f97316', 1.6, '#fde047'); hit(); }); } },
  'sukuna:shrine': {
    charge: (fx, at) => { fx.wash('#1a0505', 0.75, 1600, { radial: at }); fx.giant(at, '#7f1d1d', { scale: 1, dur: 1500 }); },
    strike: (fx, _f, t, _c, _c2, hit) => { for (let i = 0; i < 14; i++) fx.slash({ x: t.x + (Math.random() - 0.5) * 220, y: t.y + (Math.random() - 0.5) * 160 }, '#ef4444', { angle: Math.random() * 360, radius: 70, delay: i * 45, width: 6 }); fx.at(500, hit); },
  },
  'ichigo:getsuga': { strike: (fx, f, t, _c, _c2, hit) => fx.crescent(f, t, '#111827', { size: 130, dur: 480, color2: '#ef4444', onHit: () => { fx.burst(t, '#ef4444', 40, 11); hit(); } }) },
  'ichigo:mugetsu': {
    charge: (fx, at) => fx.wash('#000000', 0.8, 1400, { radial: at }),
    strike: (fx, f, t, _c, _c2, hit) => fx.crescent(f, t, '#000000', { size: 220, dur: 600, color2: '#7f1d1d', onHit: () => { fx.wash('#000000', 0.9, 700); hit(); } }),
  },
  'itachi:totsuka': { charge: (fx, at) => fx.giant(at, '#dc2626', { armed: true, dur: 1600 }), strike: (fx, _f, t, _c, _c2, hit) => { fx.slash(t, '#fecaca', { angle: -70, radius: 140, width: 16 }); fx.at(140, hit); } },
  'itachi:tsukuyomi': { strike: (fx, _f, t, _c, _c2, hit) => { fx.wash('#7f1d1d', 0.6, 1300, { radial: t }); fx.vortex(t, '#dc2626', '#000000', 40, 900); fx.at(700, hit); } },
  'sasuke:amaterasu': { strike: (fx, _f, t, _c, _c2, hit) => { for (let i = 0; i < 40; i++) fx.at(i * 20, () => fx.spark({ x: t.x + (Math.random() - 0.5) * 70, y: t.y + 50 }, i % 4 ? '#111827' : '#7c3aed', { vy: -3, life: 700, size: 26, endSize: 40, alpha: 0.9 })); fx.at(300, hit); } },
  'sasuke:indra': { charge: (fx, at) => fx.giant(at, '#a855f7', { armed: true, dur: 1500 }), strike: (fx, f, t, _c, _c2, hit) => { fx.bolt(f, t, '#c084fc', { width: 14, branches: 5, dur: 600 }); fx.beam(f, t, '#a855f7', { width: 22, dur: 600, onHit: () => { fx.explode(t, '#a855f7', 1.5); hit(); } }); } },
  'naruto:tbb': { charge: (fx, at) => { fx.giant(at, '#f97316', { scale: 1.1, dur: 1500 }); fx.orb({ x: at.x, y: at.y - 220 }, '#1e1b4b', 50, 1400, { grow: 0.5, core: '#ffffff' }); }, strike: (fx, f, t, _c, _c2, hit) => fx.projectile({ x: f.x, y: f.y - 220 }, t, '#1e1b4b', { size: 70, dur: 600, color2: '#ffffff', onHit: () => { fx.explode(t, '#f97316', 2.2, '#ffffff'); hit(); } }) },
  'luffy:kong': { charge: (fx, at) => aura(fx, at, '#b91c1c', '#111827', 1.3), strike: (fx, f, t, _c, _c2, hit) => fx.projectile(f, t, '#111827', { size: 70, dur: 380, color2: '#ef4444', onHit: () => { fx.explode(t, '#ef4444', 1.8); hit(); } }) },
  'luffy:gatling': { strike: (fx, f, t, c, c2, hit) => KIND.barrage(fx, f, t, c, c2, hit) },
  'jotaro:ora': { strike: (fx, f, t, _c, _c2, hit) => { fx.giant(f, '#8b5cf6', { scale: 0.6, dur: 800 }); for (let i = 0; i < 14; i++) fx.at(i * 40, () => fx.orb({ x: t.x + (Math.random() - 0.5) * 70, y: t.y + (Math.random() - 0.5) * 80 }, '#a78bfa', 16, 120)); fx.at(600, hit); } },
  'dio:muda': { strike: (fx, f, t, _c, _c2, hit) => { fx.giant(f, '#facc15', { scale: 0.6, dur: 800 }); for (let i = 0; i < 14; i++) fx.at(i * 40, () => fx.orb({ x: t.x + (Math.random() - 0.5) * 70, y: t.y + (Math.random() - 0.5) * 80 }, '#fde047', 16, 120)); fx.at(600, hit); } },
  'jotaro:zawarudo': { charge: (fx, at) => fx.wash('#4338ca', 0.45, 1500, { radial: at }), strike: (fx, _f, t, _c, _c2, hit) => { for (let i = 0; i < 20; i++) fx.at(i * 35, () => fx.orb({ x: t.x + (Math.random() - 0.5) * 80, y: t.y + (Math.random() - 0.5) * 90 }, '#a78bfa', 18, 140)); fx.at(750, hit); } },
  'dio:roadroller': { strike: (fx, _f, t, _c, _c2, hit) => fx.projectile({ x: t.x, y: -60 }, t, '#f59e0b', { size: 90, dur: 500, color2: '#fde68a', onHit: () => { fx.explode(t, '#f59e0b', 2); hit(); } }) },
  'saber:excalibur': { charge: (fx, at) => { fx.orb({ x: at.x, y: at.y - 120 }, '#facc15', 40, 1200, { grow: 1 }); fx.charge({ x: at.x, y: at.y - 120 }, '#fde68a', 1100, 200, 70); }, strike: (fx, f, t, _c, _c2, hit) => fx.beam({ x: f.x, y: f.y - 60 }, t, '#facc15', { width: 70, dur: 1100, color2: '#fffbeb', onHit: () => { fx.explode(t, '#facc15', 1.8, '#ffffff'); hit(); } }) },
  'gilgamesh:ea': { charge: (fx, at) => fx.vortex({ x: at.x + 40, y: at.y }, '#dc2626', '#111827', 40, 1200), strike: (fx, f, t, _c, _c2, hit) => { fx.beam(f, t, '#dc2626', { width: 70, dur: 1100, color2: '#fecaca', onHit: () => { fx.explode(t, '#dc2626', 2, '#111827'); hit(); } }); } },
  'gilgamesh:babylon': { strike: (fx, f, t, _c, _c2, hit) => { for (let i = 0; i < 12; i++) fx.at(i * 60, () => { const s = { x: f.x + (Math.random() - 0.5) * 200, y: f.y - 120 - Math.random() * 80 }; fx.orb(s, '#facc15', 14, 200); fx.projectile(s, { x: t.x + (Math.random() - 0.5) * 60, y: t.y }, '#fde68a', { size: 10, dur: 220, trail: 1 }); }); fx.at(12 * 60 + 220, hit); } },
  'saitama:serious': { strike: (fx, f, t, _c, _c2, hit) => { fx.speedLines(t, '#ffffff', 700); fx.at(250, () => { fx.beam(f, { x: t.x + (t.x - f.x) * 3, y: t.y }, '#ffffff', { width: 120, dur: 700, color2: '#fef9c3' }); fx.explode(t, '#facc15', 2.4, '#ffffff'); hit(); }); } },
  'yuji:blackflash': { strike: (fx, _f, t, _c, _c2, hit) => { fx.orb(t, '#000000', 40, 240); for (let i = 0; i < 4; i++) fx.at(i * 30, () => fx.bolt({ x: t.x - 60, y: t.y - 60 }, { x: t.x + 60, y: t.y + 60 }, '#dc2626', { dur: 160, width: 6 })); hit(); } },
  'killua:narukami': { strike: (fx, f, t, _c, _c2, hit) => { fx.bolt({ x: t.x, y: -20 }, t, '#93c5fd', { width: 16, branches: 6, dur: 600 }); fx.bolt(f, t, '#bfdbfe', { width: 8, dur: 400 }); fx.at(80, hit); } },
  'piccolo:sbc': { strike: (fx, f, t, _c, _c2, hit) => { fx.beam(hand(f, t), t, '#facc15', { width: 10, dur: 700 }); fx.bolt(hand(f, t), t, '#a855f7', { width: 3, branches: 0, dur: 700 }); fx.at(160, hit); } },
  'frieza:deathball': { charge: (fx, at) => fx.orb({ x: at.x, y: at.y - 140 }, '#f97316', 50, 1100, { grow: 1, core: '#fde047' }), strike: (fx, f, t, _c, _c2, hit) => fx.projectile({ x: f.x, y: f.y - 140 }, t, '#f97316', { size: 70, dur: 800, color2: '#fde047', onHit: () => { fx.explode(t, '#f97316', 2.2, '#fde047'); hit(); } }) },
  'tanjiro:hinokami': { strike: (fx, f, t, _c, _c2, hit) => { fx.flames(f, t, '#ea580c', 400, '#fde047'); fx.slash(t, '#fb923c', { angle: -60, radius: 110, width: 14, delay: 250 }); fx.at(300, hit); } },
  'rengoku:ninth': { strike: (fx, f, t, _c, _c2, hit) => { fx.flames(f, t, '#dc2626', 600, '#f97316'); fx.at(450, () => { fx.explode(t, '#f97316', 1.8, '#fde047'); hit(); }); } },
  'natsu:roar': { strike: (fx, f, t, c, c2, hit) => KIND.fire(fx, f, t, c, c2, hit) },
  'kirito:starburst': { strike: (fx, _f, t, _c, _c2, hit) => { for (let i = 0; i < 16; i++) fx.slash({ x: t.x + (Math.random() - 0.5) * 40, y: t.y + (Math.random() - 0.5) * 50 }, i % 2 ? '#60a5fa' : '#e0f2fe', { angle: i * 37, radius: 70, delay: i * 45, width: 6 }); fx.at(16 * 45, hit); } },
  'jinwoo:arise': { charge: (fx, at) => { fx.wash('#1e1b4b', 0.4, 1200); for (let i = 0; i < 5; i++) fx.giant({ x: at.x + (i - 2) * 70, y: at.y + 20 }, '#6d28d9', { scale: 0.45, dur: 1200 }); } },
  'asta:blackdivider': { strike: (fx, _f, t, _c, _c2, hit) => { fx.slash(t, '#111827', { angle: -45, radius: 140, width: 22 }); fx.slash(t, '#ef4444', { angle: -45, radius: 130, width: 6, delay: 40 }); fx.at(150, hit); } },
  'mob:ascension': { charge: (fx, at) => { fx.wash('#e0f2fe', 0.6, 1600, { radial: at }); aura(fx, at, '#38bdf8', '#ffffff', 1.6); } },
  'madara:meteor': { strike: (fx, _f, t, _c, _c2, hit) => fx.projectile({ x: t.x - 200, y: -150 }, t, '#78350f', { size: 110, dur: 900, color2: '#f97316', onHit: () => { fx.explode(t, '#f97316', 2.6, '#fde047'); hit(); } }) },
  'pain:shinra': { strike: (fx, f, _t, _c, _c2, hit) => { fx.ring(f, '#ffffff', { radius: 500, width: 30, dur: 600 }); fx.ring(f, '#a78bfa', { radius: 420, width: 14, dur: 600, delay: 80 }); fx.at(250, hit); } },
};

// Moves shared by name across characters reuse the same signature.
SIG['minato:rasengan'] = SIG['naruto:rasengan'];
SIG['kakashi:raikiri'] = SIG['sasuke:chidori'];
SIG['gohan:kamehameha'] = SIG['goku:kamehameha'];

export function hasSignature(abilityId?: string) { return !!abilityId && !!SIG[abilityId]; }

/** Plays the effect for one event. Returns false if nothing was drawn. */
export function playFx(fx: FxDirector, ctx: PlayCtx): boolean {
  const { e, from, to, kind, colors: [c, c2], stage, reduced } = ctx;
  const sig = e.ability ? SIG[e.ability] : undefined;
  const heavy = e.crit || e.context?.impact === 'heavy' || e.context?.impact === 'devastating';
  const impact = () => {
    if (!to) return;
    if (e.type === 'miss') { fx.burst({ x: to.x + 50, y: to.y - 30 }, '#cbd5e1', 10, 6, { size: 8 }); return; }
    if (e.type === 'block') { fx.ring(to, '#93c5fd', { radius: 90, width: 16 }); fx.burst(to, '#bfdbfe', 16, 8, { size: 9 }); return; }
    fx.burst(to, c, heavy ? 46 : 22, heavy ? 14 : 9, { color2: '#ffffff', size: heavy ? 22 : 14 });
    fx.ring(to, '#ffffff', { radius: heavy ? 170 : 100, width: heavy ? 14 : 8 });
    if (heavy && !reduced) { fx.hitStop(e.crit ? 130 : 80); if (e.crit || e.context?.impact === 'devastating') stage.impactFrame(); }
  };

  switch (e.type) {
    case 'ability': case 'desperation': {
      if (!from) return false;
      const ult = e.context?.kind === 'ultimate';
      if (sig?.charge) sig.charge(fx, from, c, c2);
      // The move's own motifs (clones, petals, gravity...) on top of the base charge.
      else if (e.ability && ABILITIES[e.ability] && !reduced) for (const m of motifsOf(ABILITIES[e.ability])) chargeMotif(fx, m, from, c, c2);
      else if (kind === 'aura' || e.context?.kind === 'buff') aura(fx, from, c, c2, ult ? 1.4 : 1);
      else { fx.charge(from, c, 650, 110, ult ? 60 : 30); fx.orb(from, c, ult ? 34 : 20, 700, { alpha: 0.7 }); }
      if (ult && !reduced) { fx.speedLines(from, '#ffffff', 900); stage.zoom(from); }
      return true;
    }
    case 'attack': case 'counter': case 'block': case 'miss': {
      if (!to) return false;
      const start = from ?? { x: to.x, y: -40 };
      const k = kind ?? 'punch';
      const t = e.type === 'miss' ? { x: to.x + 70, y: to.y - 50 } : to;
      if (sig?.strike) sig.strike(fx, start, t, c, c2, impact);
      else {
        KIND[k](fx, start, t, c, c2, impact);
        // The move's own motifs layered on the base effect (not on misses: the move went wide).
        if (e.ability && ABILITIES[e.ability] && e.type !== 'miss' && !reduced) for (const m of motifsOf(ABILITIES[e.ability])) strikeMotif(fx, m, start, t, c, c2);
      }
      return true;
    }
    case 'clash': {
      if (!from || !to) return false;
      const m = mid(from, to);
      fx.beam(hand(from, to), m, c, { width: 26, dur: 900, color2: c2 });
      fx.beam(hand(to, from), m, c2 === '#ffffff' ? '#f472b6' : c2, { width: 26, dur: 900 });
      fx.at(250, () => { fx.orb(m, '#ffffff', 40, 650, { pulse: true }); for (let i = 0; i < 8; i++) fx.at(i * 60, () => fx.burst(m, i % 2 ? c : '#ffffff', 10, 10, { size: 12 })); });
      fx.at(800, () => { fx.explode(m, '#fde047', 1.8); if (!reduced) { fx.hitStop(150); stage.impactFrame(); } });
      return true;
    }
    case 'parry': if (from) { fx.slash(from, '#e5e7eb', { angle: 200, radius: 70, width: 8 }); fx.burst(from, '#ffffff', 18, 9, { size: 9 }); } return true;
    case 'guard_break': if (to) { fx.ring(to, '#93c5fd', { radius: 140, width: 18 }); fx.burst(to, '#bfdbfe', 40, 13, { size: 12, grav: 0.2 }); } return true;
    case 'knockdown': if (to) { fx.explode(to, '#f97316', 1.1); if (!reduced) { fx.hitStop(180); stage.impactFrame(); } } return true;
    case 'injury': if (to) fx.burst(to, '#ef4444', 14, 6, { size: 10, grav: 0.2 }); return true;
    case 'defeat': if (to) { fx.ring(to, '#ef4444', { radius: 260, width: 20, dur: 900 }); fx.burst(to, '#ffffff', 60, 15, { size: 16 }); if (!reduced) { fx.slowMo(1300, 0.3); fx.speedLines(to, '#ffffff', 1100); stage.impactFrame(); } } return true;
    case 'transform': if (from) { const c = String(e.context?.color ?? '#f5c451'); aura(fx, from, c, '#ffffff', 1.8); if (!reduced) fx.speedLines(from, c, 1200); } return true;
    case 'awakening': if (from) { aura(fx, from, '#f5c451', '#fff7d6', 1.6); if (!reduced) fx.speedLines(from, '#fde68a', 1000); } return true;
    case 'heal': if (to) KIND.heal(fx, to, to, c, c2, () => undefined); return true;
    case 'status': case 'status_tick': {
      // Every status shows on the fighter it lands on (applied: a burst; ticking: a smaller pulse).
      const at = to ?? from;
      const st = e.status?.type;
      if (!at || !st || (e.type === 'status' && e.status && !e.status.applied)) return false;
      const big = e.type === 'status' ? 1 : 0.5;
      const rise = (color: string, n: number, o: { vy?: number; size?: number; grav?: number } = {}) => { for (let i = 0; i < n * big; i++) fx.at(i * 25, () => fx.spark({ x: at.x + (Math.random() - 0.5) * 80, y: at.y + 40 + Math.random() * 40 }, color, { vy: o.vy ?? -3, vx: (Math.random() - 0.5) * 1.2, life: 650, size: o.size ?? 14, grav: o.grav ?? -0.02 })); };
      switch (st) {
        case 'burn': rise('#f97316', 26); rise('#fde047', 10, { size: 10 }); break;
        case 'bleed': fx.burst(at, '#b91c1c', Math.round(18 * big), 6, { grav: 0.35, size: 9, color2: '#7f1d1d' }); break;
        case 'freeze': fx.ring(at, '#bae6fd', { radius: 90, width: 12 }); fx.burst(at, '#e0f2fe', Math.round(22 * big), 7, { size: 10, grav: 0.1 }); break;
        case 'stun': for (let i = 0; i < 3; i++) fx.at(i * 120, () => fx.ring({ x: at.x, y: at.y - 70 }, '#fde047', { radius: 40, width: 5, dur: 380 })); rise('#fde68a', 8, { vy: -1, size: 9 }); break;
        case 'weaken': rise('#6b21a8', 18, { vy: 2, grav: 0.05, size: 16 }); break;
        case 'haste': fx.speedLines(at, '#a7f3d0', 380, 20); rise('#6ee7b7', 12, { vy: -5, size: 10 }); break;
        case 'focus': fx.charge(at, '#f5c451', 500, 90, Math.round(20 * big)); break;
        case 'provoked': fx.ring(at, '#ef4444', { radius: 80, width: 8 }); rise('#ef4444', 10, { size: 10 }); break;
        case 'regen': rise('#4ade80', 16, { vy: -2.5 }); break;
        case 'shield': fx.ring(at, '#93c5fd', { radius: 100, width: 14, dur: 600 }); break;
      }
      return true;
    }
    case 'environment': fx.wash(c, 0.3, 700); return true;
    case 'rival': if (!reduced) fx.speedLines({ x: fx.w / 2, y: fx.h / 2 }, '#f9a8d4', 1600); return true;
    case 'combo':
      if (to && e.context?.duo) {
        for (const s of [from, ctx.partnerAt]) if (s) fx.beam(s, to, String(e.context.color ?? c), { width: 30, dur: 800 });
        fx.at(450, () => { fx.explode(to, String(e.context?.color ?? c), 2, '#ffffff'); if (!reduced) stage.impactFrame(); });
        return true;
      }
      return false;
    case 'reinforcement': if (to) { fx.projectile({ x: to.x < fx.w / 2 ? fx.w + 40 : -40, y: to.y - 120 }, to, c, { size: 30, dur: 450, color2: '#ffffff' }); } return true;
  }
  return false;
}
