// Move motifs: what makes each character's move look like itself. Every
// signature move has a written "look" line ("dozens of orange-clad clones
// dog-pile every enemy", "a crescent of black energy"...). The words in it,
// its name and description pick up to two motifs that are layered on top of the
// move's base effect, so 300+ moves get their own look without each one being
// drawn by hand. The hand-made signature recipes in recipes.ts still win.
import type { Ability } from '../../engine/types';
import type { FxDirector, Pt } from './engine';

export type Motif =
  | 'clones' | 'blade' | 'rush' | 'kick' | 'serpent' | 'volley' | 'bind' | 'sand' | 'petals' | 'gravity'
  | 'time' | 'blood' | 'shadow' | 'radiant' | 'rock' | 'water' | 'tornado' | 'flare' | 'thunder' | 'shatter'
  | 'pierce' | 'blast' | 'beast' | 'pressure' | 'venom' | 'stars' | 'moon' | 'bones' | 'smoke' | 'mirror';

const RULES: Array<[Motif, RegExp]> = [
  ['clones', /\b(clones?|copies|afterimages?|doubles|duplicates?|army|legion)\b/],
  ['petals', /\b(petals?|flowers?|sakura|blossoms?|roses?)\b/],
  ['sand', /\b(sand|dust|desert|grains?)\b/],
  ['gravity', /\b(gravity|repel|pull|push|attract|crush(?:es|ing)?|almighty|weight)\b/],
  ['time', /\b(time|clock|stops?|frozen moment|seconds?)\b/],
  ['blood', /\b(blood|bleed|crimson tide|haemo|hemo)\b/],
  ['bones', /\b(bones?|skeletal|skull)\b/],
  ['serpent', /\b(dragons?|serpents?|snakes?|wyrm|hydra)\b/],
  ['beast', /\b(dogs?|hounds?|wolf|wolves|beast|summons?|toad|creature|demon fox|tailed|bird|phoenix|titan|giant (?:toad|snake|beast|creature|warrior|hand|fist))\b/],
  ['volley', /\b(arrows?|needles?|bullets?|shots?|guns?|rain of|barrage of|volley|shuriken|kunai|feathers?)\b/],
  ['bind', /\b(chains?|threads?|strings?|wires?|ropes?|binds?|vines?|tendrils?)\b/],
  ['mirror', /\b(mirror|illusion|reflection|genjutsu|eyes?)\b/],
  ['smoke', /\b(smoke|mist|fog|steam|vapou?r)\b/],
  ['venom', /\b(poison|venom|acid|toxic)\b/],
  ['stars', /\b(stars?|starlight|cosmic|galax\w*|constellation)\b/],
  ['moon', /\b(moon|lunar|crescent)\b/],
  ['shadow', /\b(shadows?|darkness|void|abyss|black hole|shade)\b/],
  ['radiant', /\b(light|holy|radiant|divine|heaven\w*|sun|solar|golden)\b/],
  ['rock', /\b(rocks?|boulders?|meteors?|stone|earth|mountain|quake)\b/],
  ['water', /\b(water|waves?|tide|tidal|ocean|sea|rain|torrent)\b/],
  ['tornado', /\b(wind|tornado|gale|cyclone|whirlwind|vortex|spiral)\b/],
  ['thunder', /\b(thunder|lightning|bolts?|electric\w*|volts?)\b/],
  ['flare', /\b(fire|flames?|blaze|burn\w*|inferno|ember|magma|lava)\b/],
  ['shatter', /\b(ice|frost|freez\w*|glacier|snow|crystal)\b/],
  ['pierce', /\b(spears?|lances?|pierc\w*|thrusts?|stab\w*|impale\w*|drill)\b/],
  ['kick', /\b(kicks?|heel|legs?|stomp)\b/],
  ['blade', /\b(swords?|blades?|katanas?|slash\w*|cuts?|scythes?|axes?|draw-cut|zanpakuto)\b/],
  ['rush', /\b(punch\w*|fists?|rush|barrage|flurry|blows|combo|pummel\w*)\b/],
  ['blast', /\b(explo\w*|bombs?|ball of|destruction|blast|detonat\w*|nuke|annihilat\w*)\b/],
  ['pressure', /\b(aura|pressure|presence|intent|haki|spirit\w*|chakra|ki)\b/],
];

const cache = new Map<string, Motif[]>();

/** Up to two motifs for a move, strongest words first. */
export function motifsOf(a: Ability): Motif[] {
  const hit = cache.get(a.id);
  if (hit) return hit;
  const text = `${a.name} ${a.look ?? ''} ${a.description}`.toLowerCase();
  const out: Motif[] = [];
  for (const [m, re] of RULES) if (re.test(text) && !out.includes(m)) { out.push(m); if (out.length === 2) break; }
  cache.set(a.id, out);
  return out;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Extra layers while the move is being charged (on the attacker). */
export function chargeMotif(fx: FxDirector, m: Motif, at: Pt, c: string, c2: string) {
  switch (m) {
    case 'clones': for (let i = 0; i < 4; i++) fx.at(i * 120, () => fx.giant({ x: at.x + (i % 2 ? 1 : -1) * (40 + i * 22), y: at.y + 30 }, c, { scale: 0.32, dur: 700 })); break;
    case 'petals': for (let i = 0; i < 40; i++) fx.at(i * 15, () => fx.spark({ x: at.x + rand(-90, 90), y: at.y + rand(-80, 60) }, i % 2 ? '#f9a8d4' : '#fbcfe8', { vx: rand(-2, 2), vy: rand(-2, 1), life: 900, size: 10, spin: 0.2 })); break;
    case 'gravity': fx.ring(at, c, { radius: 160, width: 6, dur: 700 }); fx.charge(at, '#ffffff', 700, 170, 30); break;
    case 'time': fx.wash('#93c5fd', 0.18, 900, { radial: at }); break;
    case 'shadow': for (let i = 0; i < 30; i++) fx.at(i * 20, () => fx.spark({ x: at.x + rand(-70, 70), y: at.y + 90 }, '#111827', { vy: -rand(2, 4), life: 700, size: 24, endSize: 30, alpha: 0.8 })); break;
    case 'radiant': fx.orb({ x: at.x, y: at.y - 140 }, '#fde68a', 30, 800, { grow: 0.6 }); fx.charge({ x: at.x, y: at.y - 140 }, '#fff7d6', 700, 140, 30); break;
    case 'thunder': for (let i = 0; i < 4; i++) fx.at(i * 140, () => fx.bolt({ x: at.x + rand(-40, 40), y: at.y - 160 }, { x: at.x + rand(-30, 30), y: at.y }, c, { dur: 150, width: 4, branches: 1 })); break;
    case 'tornado': fx.vortex({ x: at.x, y: at.y + 40 }, c, c2, 50, 800); break;
    case 'flare': for (let i = 0; i < 30; i++) fx.at(i * 22, () => fx.spark({ x: at.x + rand(-60, 60), y: at.y + 80 }, i % 3 ? '#f97316' : '#fde047', { vy: -rand(3, 6), life: 600, size: 16, grav: -0.03 })); break;
    case 'water': fx.ring({ x: at.x, y: at.y + 80 }, '#38bdf8', { radius: 120, width: 8 }); fx.burst({ x: at.x, y: at.y + 80 }, '#7dd3fc', 20, 7, { dir: -Math.PI / 2, spread: 0.7, grav: 0.2 }); break;
    case 'pressure': for (let i = 0; i < 3; i++) fx.ring(at, c, { radius: 120 + i * 50, width: 6, delay: i * 160, dur: 600 }); break;
    case 'stars': for (let i = 0; i < 24; i++) fx.at(i * 25, () => fx.spark({ x: at.x + rand(-120, 120), y: at.y + rand(-140, 40) }, i % 2 ? '#e0e7ff' : c, { life: 600, size: 9, hard: true })); break;
    case 'smoke': for (let i = 0; i < 16; i++) fx.at(i * 30, () => fx.spark({ x: at.x + rand(-50, 50), y: at.y + rand(0, 80) }, '#9ca3af', { vy: -1, vx: rand(-1, 1), life: 900, size: 30, endSize: 60, alpha: 0.35 })); break;
    case 'beast': fx.giant({ x: at.x, y: at.y + 10 }, c, { scale: 0.5, dur: 900 }); break;
    default: break;
  }
}

/** Extra layers on the way to and at the target. `hit` is called once by the base recipe. */
export function strikeMotif(fx: FxDirector, m: Motif, from: Pt, to: Pt, c: string, c2: string) {
  const dir = Math.sign(to.x - from.x || 1);
  switch (m) {
    case 'clones': for (let i = 0; i < 5; i++) fx.at(i * 70, () => { const s = { x: to.x - dir * rand(60, 140), y: to.y + rand(-60, 60) }; fx.orb(s, c, 18, 200, { alpha: 0.7 }); fx.projectile(s, { x: to.x + rand(-20, 20), y: to.y + rand(-30, 30) }, c, { size: 14, dur: 140, trail: 1 }); }); break;
    case 'blade': [-60, 30, -15].forEach((ang, i) => fx.slash({ x: to.x + rand(-15, 15), y: to.y + rand(-20, 20) }, i === 2 ? '#ffffff' : c, { angle: ang + rand(-15, 15), radius: rand(70, 110), delay: 80 + i * 60, width: 7 })); break;
    case 'rush': fx.speedLines(to, '#ffffff', 450, 30); for (let i = 0; i < 8; i++) fx.at(i * 40, () => fx.orb({ x: to.x + rand(-35, 35), y: to.y + rand(-45, 45) }, c, 14, 110)); break;
    case 'kick': fx.slash({ x: to.x, y: to.y + 50 }, c, { angle: 160, radius: 80, width: 10 }); fx.at(60, () => fx.burst({ x: to.x, y: to.y + 70 }, '#d6c7a1', 12, 6, { dir: -Math.PI / 2, spread: 1, grav: 0.2, size: 10 })); break;
    case 'serpent': { const n = 14; for (let i = 0; i < n; i++) fx.at(i * 28, () => { const t = i / n; fx.orb({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t + Math.sin(t * Math.PI * 3) * 40 }, i % 2 ? c : c2, 22 - t * 6, 260); }); break; }
    case 'volley': for (let i = 0; i < 12; i++) fx.at(i * 32, () => fx.projectile({ x: from.x + rand(-20, 20), y: from.y + rand(-50, 30) }, { x: to.x + rand(-40, 40), y: to.y + rand(-50, 50) }, i % 2 ? c : '#ffffff', { size: 6, dur: 180, trail: 1 })); break;
    case 'bind': for (let i = 0; i < 3; i++) fx.at(i * 60, () => fx.bolt({ x: from.x, y: from.y + (i - 1) * 25 }, { x: to.x, y: to.y + (i - 1) * 25 }, c, { width: 2.5, branches: 0, dur: 600 })); break;
    case 'sand': fx.flames(from, to, '#d6a96b', 450, '#f5deb3'); break;
    case 'petals': fx.at(250, () => { for (let i = 0; i < 40; i++) fx.spark(to, i % 2 ? '#f9a8d4' : '#fce7f3', { vx: rand(-7, 7), vy: rand(-7, 4), life: 900, size: 11, spin: 0.25, grav: 0.05 }); }); break;
    case 'gravity': fx.at(150, () => { fx.ring(to, '#e5e7eb', { radius: 40, width: 18, dur: 300 }); fx.ring(to, c, { radius: 200, width: 6, dur: 600 }); fx.burst({ x: to.x, y: to.y + 70 }, '#78716c', 18, 6, { grav: 0.3 }); }); break;
    case 'time': fx.hitStop(160); fx.wash('#e0e7ff', 0.25, 500); break;
    case 'blood': fx.at(200, () => fx.burst(to, '#b91c1c', 26, 8, { grav: 0.35, size: 10, color2: '#7f1d1d' })); break;
    case 'bones': fx.at(200, () => fx.burst(to, '#f5f5f4', 18, 9, { grav: 0.3, size: 9 })); break;
    case 'shadow': for (let i = 0; i < 6; i++) fx.at(i * 40, () => fx.projectile({ x: to.x + rand(-60, 60), y: to.y + 110 }, { x: to.x + rand(-20, 20), y: to.y }, '#1f1235', { size: 18, dur: 200, color2: c })); break;
    case 'radiant': fx.beam({ x: to.x, y: -30 }, to, '#fde68a', { width: 26, dur: 500, color2: '#ffffff' }); break;
    case 'rock': fx.projectile({ x: to.x - dir * 80, y: -60 }, to, '#78350f', { size: 34, dur: 420, color2: '#a8a29e', onHit: () => fx.burst(to, '#a8a29e', 24, 9, { grav: 0.35, size: 12 }) }); break;
    case 'water': fx.at(220, () => { fx.burst(to, '#38bdf8', 30, 10, { grav: 0.3, color2: '#e0f2fe', size: 14 }); fx.ring(to, '#7dd3fc', { radius: 130, width: 10 }); }); break;
    case 'tornado': fx.at(150, () => fx.vortex(to, c, '#ffffff', 46, 600)); break;
    case 'flare': fx.at(250, () => { for (let i = 0; i < 20; i++) fx.spark({ x: to.x + rand(-40, 40), y: to.y + rand(-20, 60) }, i % 2 ? '#f97316' : '#fde047', { vy: -rand(2, 5), life: 700, size: 18, grav: -0.04 }); }); break;
    case 'thunder': fx.at(100, () => fx.bolt({ x: to.x + rand(-30, 30), y: -20 }, to, '#fde047', { width: 8, branches: 3, dur: 300 })); break;
    case 'shatter': fx.at(260, () => fx.burst(to, '#e0f2fe', 26, 10, { grav: 0.25, size: 9, color2: '#7dd3fc' })); break;
    case 'pierce': fx.beam(from, { x: to.x + dir * 120, y: to.y }, c, { width: 7, dur: 300, color2: '#ffffff' }); break;
    case 'blast': fx.at(300, () => fx.explode(to, c, 0.9, c2)); break;
    case 'beast': fx.giant({ x: (from.x + to.x) / 2, y: to.y + 20 }, c, { scale: 0.45, dur: 700 }); break;
    case 'pressure': fx.ring(to, c, { radius: 160, width: 10, delay: 120 }); break;
    case 'venom': fx.at(200, () => fx.burst(to, '#84cc16', 22, 7, { grav: 0.35, size: 10, color2: '#365314' })); break;
    case 'stars': fx.at(200, () => { for (let i = 0; i < 18; i++) fx.spark(to, i % 2 ? '#e0e7ff' : c, { vx: rand(-8, 8), vy: rand(-8, 8), life: 600, size: 9, hard: true }); }); break;
    case 'moon': fx.crescent(from, to, '#e0e7ff', { size: 80, dur: 380, color2: c }); break;
    case 'smoke': fx.at(150, () => { for (let i = 0; i < 12; i++) fx.spark({ x: to.x + rand(-50, 50), y: to.y + rand(-30, 40) }, '#9ca3af', { vx: rand(-1, 1), vy: -0.6, life: 900, size: 34, endSize: 60, alpha: 0.35 }); }); break;
    case 'mirror': fx.at(120, () => { fx.wash(c, 0.15, 500, { radial: to }); for (let i = 0; i < 3; i++) fx.orb({ x: to.x + (i - 1) * 70, y: to.y }, c, 26, 300, { alpha: 0.5 }); }); break;
  }
}
