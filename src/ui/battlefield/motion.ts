// Procedural 2D animation for every fighter. Each fighter's portrait is cut
// into three overlapping bands (head, torso, base) that bend at the neck and
// waist, inside a body that dashes, jumps, recoils and falls. How a fighter
// moves comes from who they are: archetype (a Tank plants and slams, an
// Assassin flickers, a Mage floats), speed stat (tempo), temperament (idle
// stance) and element (floaters). Each clip has several variants and the
// director never plays the same variant twice in a row for a fighter.
import type { FighterSnapshot } from '../../engine/types';
import type { Clip, MotionCue } from './director';
import { signatureOf, type Trait } from './signatures';

export interface MotionProfile {
  /** Seconds multiplier: >1 slower and heavier. */
  tempo: number;
  /** How far strikes travel (fraction of card width). */
  reach: number;
  /** Squash and stretch amount. */
  squash: number;
  /** Floats instead of standing (mages, spirits, gods). */
  floats: boolean;
  /** Leaves afterimages when moving fast. */
  ghosts: boolean;
  style: 'brawler' | 'blade' | 'caster' | 'shooter' | 'shadow' | 'tank';
  idle: 'bounce' | 'still' | 'sway' | 'proud' | 'float';
  /** Character-specific ways of moving (signatures.ts). */
  traits: Trait[];
}

export function profileOf(s: FighterSnapshot): MotionProfile {
  const spd = s.stats.speed ?? 50;
  const tempo = Math.max(0.75, Math.min(1.3, 1.25 - (spd - 30) / 160));
  const caster = s.archetype === 'Mage' || s.archetype === 'Summoner' || s.archetype === 'Controller' || s.archetype === 'Support';
  const style: MotionProfile['style'] = s.archetype === 'Assassin' ? 'shadow' : s.archetype === 'Duelist' ? 'blade' : s.archetype === 'Tank' ? 'tank'
    : s.archetype === 'Ranger' ? 'shooter' : caster ? 'caster' : 'brawler';
  const floats = caster && s.tags.some((t) => t === 'DIVINE' || t === 'SPIRIT' || t === 'MAGIC' || t === 'WIND');
  const idle: MotionProfile['idle'] = floats ? 'float' : s.temperament === 'stoic' || s.temperament === 'calculating' || s.temperament === 'analytical' ? 'still'
    : s.temperament === 'arrogant' ? 'proud' : s.temperament === 'cheerful' || s.temperament === 'hot-blooded' || s.temperament === 'aggressive' || s.temperament === 'reckless' ? 'bounce' : 'sway';
  const sig = signatureOf(s.charId);
  const st = sig?.style ?? style;
  const traits = sig?.traits ?? [];
  const fl = sig?.floats ?? floats;
  const heavy = traits.includes('heavy'), casual = traits.includes('casual');
  let t = st === 'tank' ? tempo * 1.12 : st === 'shadow' ? tempo * 0.85 : tempo;
  if (heavy) t *= 1.1;
  if (traits.includes('blink')) t *= 0.9;
  return {
    tempo: t,
    reach: (st === 'shooter' || st === 'caster' ? 0.12 : st === 'blade' ? 0.5 : st === 'shadow' ? 0.55 : 0.42) * (traits.includes('stretch') ? 1.35 : 1) * (traits.includes('stand') ? 0.3 : 1),
    squash: (st === 'tank' ? 0.1 : st === 'brawler' ? 0.07 : 0.045) * (heavy ? 1.5 : 1) * (casual ? 0.5 : 1),
    floats: fl,
    ghosts: st === 'shadow' || st === 'blade' || spd >= 75 || traits.includes('blink') || traits.includes('stand'),
    style: st,
    idle: fl ? 'float' : sig?.idle ?? idle,
    traits,
  };
}

type KF = Keyframe[];
export interface ClipFrames { body: KF; head?: KF; torso?: KF; base?: KF; dur: number; ghosts: boolean; easing?: string }

const T = (x = 0, y = 0, r = 0, sx = 1, sy = sx) => `translate(${x}%, ${y}%) rotate(${r}deg) scale(${sx}, ${sy})`;
const R = (deg: number, x = 0, y = 0) => `translate(${x}%, ${y}%) rotate(${deg}deg)`;
const k = (offset: number, transform: string, extra: Record<string, string | number> = {}): Keyframe => ({ offset, transform, ...extra });

/**
 * Keyframes for one clip. `dir` is the way the fighter faces: +1 right (left side), -1 left.
 * Translations are % of the fighter card, so the same clip works at every size.
 */
export function clipFrames(cue: MotionCue, p: MotionProfile, dir: 1 | -1): ClipFrames {
  return withTraits(baseFrames(cue, p, dir), cue, p, dir);
}

/** Character signatures layered on a clip: stretching limbs, flash steps, spins, kicks, Stands, effortless or crushing blows. */
function withTraits(f: ClipFrames, cue: MotionCue, p: MotionProfile, dir: 1 | -1): ClipFrames {
  if (!p.traits.length || !f.body.length) return f;
  const d = dir;
  const has = (t: Trait) => p.traits.includes(t);
  const out: ClipFrames = { ...f, body: [...f.body] };
  const attack = cue.clip === 'strike' || cue.clip === 'dashin' || cue.clip === 'clash';
  if (has('stretch') && attack) {
    // The arm keeps going: the card stretches toward the target at the moment of impact.
    out.body = out.body.map((k) => (k.offset && k.offset > 0.35 && k.offset < 0.7 ? { ...k, transform: `${k.transform} scale(${1.45}, 0.9)`, transformOrigin: d > 0 ? '0% 50%' : '100% 50%' } : k));
  }
  if (has('blink') && (attack || cue.clip === 'dodge')) {
    // Gone for a split second, then already there.
    out.body = out.body.flatMap((k) => (k.offset && k.offset > 0.25 && k.offset < 0.5 ? [{ ...k, opacity: 0, filter: 'blur(4px)' }] : [k]));
    out.ghosts = true;
  }
  if (has('spinner') && cue.clip === 'strike' && cue.variant !== 2) {
    out.body = out.body.map((k) => (k.offset && k.offset > 0.3 && k.offset < 0.6 ? { ...k, transform: `${k.transform} rotate(${360 * d}deg)` } : k));
    out.ghosts = true;
  }
  if (has('kicks') && cue.clip === 'strike') out.base = [{ offset: 0, transform: 'rotate(0deg)' }, { offset: 0.35, transform: `rotate(${-10 * d}deg)` }, { offset: 0.5, transform: `rotate(${-38 * d}deg) translate(${8 * d}%, -4%)` }, { offset: 0.7, transform: `rotate(${-20 * d}deg)` }, { offset: 1, transform: 'rotate(0deg)' }];
  if (has('stand') && (cue.clip === 'strike' || cue.clip === 'throw' || cue.clip === 'cast')) {
    // The Stand / summon does the hitting: a rapid shudder while the body holds its pose.
    out.body = [{ offset: 0, transform: 'translate(0%, 0%)' }, ...Array.from({ length: 10 }, (_, i) => ({ offset: 0.1 + i * 0.08, transform: `translate(${(i % 2 ? 2.5 : 0.5) * d}%, 0%) rotate(${(i % 2 ? 1 : -1) * d}deg)`, filter: `brightness(${1.1 + (i % 3) * 0.08})` })), { offset: 1, transform: 'translate(0%, 0%)' }];
    out.ghosts = true;
  }
  if (has('casual') && (cue.clip === 'strike' || cue.clip === 'cast' || cue.clip === 'charge')) out.dur *= 0.75;
  if (has('heavy') && (cue.clip === 'strike' || cue.clip === 'knockdown' || cue.clip === 'victory')) out.dur *= 1.15;
  return out;
}

function baseFrames(cue: MotionCue, p: MotionProfile, dir: 1 | -1): ClipFrames {
  const { clip, power } = cue;
  // Heavy fighters favour the overhead slam; spinners the spinning strike.
  const v = clip === 'strike' && p.traits.includes('heavy') && cue.variant === 1 ? 3 : clip === 'strike' && p.traits.includes('spinner') && cue.variant === 0 ? 2 : cue.variant;
  const d = dir, P = 0.6 + power * 0.6, sq = p.squash * P;
  const reach = p.reach * 100 * P;
  const base = (dur: number) => dur * p.tempo;
  switch (clip as Clip) {
    case 'strike': {
      if (p.style === 'caster' || p.style === 'shooter') return baseFrames({ ...cue, clip: 'cast' }, p, dir);
      if (v === 0) return { // dash in and punch / cut through
        dur: base(620), ghosts: p.ghosts || power > 0.7,
        body: [k(0, T()), k(0.22, T(-8 * d, 1, -3 * d, 1 + sq, 1 - sq)), k(0.48, T(reach * d, -2, 5 * d, 1 - sq, 1 + sq), { filter: 'blur(0.6px)' }), k(0.6, T(reach * 0.92 * d, 0, 4 * d)), k(1, T())],
        torso: [k(0, R(0)), k(0.22, R(-6 * d)), k(0.48, R(10 * d, 3 * d)), k(1, R(0))],
        head: [k(0, R(0)), k(0.22, R(-4 * d)), k(0.5, R(6 * d, 2 * d)), k(1, R(0))],
      };
      if (v === 1) return { // rising uppercut / jumping strike
        dur: base(700), ghosts: p.ghosts,
        body: [k(0, T()), k(0.2, T(-4 * d, 4, 0, 1 + sq, 1 - sq)), k(0.5, T(reach * 0.8 * d, -20, -8 * d, 1 - sq, 1 + sq)), k(0.75, T(reach * 0.6 * d, -6, -3 * d)), k(1, T())],
        torso: [k(0, R(0)), k(0.5, R(-12 * d)), k(1, R(0))],
        base: [k(0, R(0)), k(0.5, R(14 * d)), k(1, R(0))],
      };
      if (v === 2) return { // spinning strike
        dur: base(760), ghosts: true,
        body: [k(0, T()), k(0.2, T(-6 * d, 0, -4 * d)), k(0.45, T(reach * 0.6 * d, -4, 0, -1, 1)), k(0.6, T(reach * d, -2, 6 * d, 1, 1)), k(1, T())],
        torso: [k(0, R(0)), k(0.6, R(12 * d)), k(1, R(0))],
      };
      return { // heavy overhead slam
        dur: base(820), ghosts: false,
        body: [k(0, T()), k(0.3, T(-6 * d, -12, -6 * d, 1 - sq, 1 + sq)), k(0.55, T(reach * 0.85 * d, 3, 8 * d, 1 + sq * 1.6, 1 - sq * 1.6)), k(0.7, T(reach * 0.8 * d, 2, 6 * d)), k(1, T())],
        torso: [k(0, R(0)), k(0.3, R(-14 * d)), k(0.55, R(16 * d)), k(1, R(0))],
        head: [k(0, R(0)), k(0.3, R(-8 * d)), k(0.55, R(10 * d)), k(1, R(0))],
      };
    }
    case 'cast': return {
      dur: base(700 + v * 60), ghosts: false,
      body: [k(0, T()), k(0.3, T(-6 * d, p.floats ? -10 : -3, -2 * d, 1 - sq * 0.5, 1 + sq * 0.5)), k(0.55, T(6 * d, p.floats ? -8 : -1, 3 * d), { filter: 'brightness(1.25)' }), k(1, T())],
      torso: [k(0, R(0)), k(0.3, R(v === 1 ? 8 * d : -8 * d)), k(0.55, R(8 * d)), k(1, R(0))],
      head: [k(0, R(0)), k(0.3, R(-6 * d)), k(0.55, R(4 * d)), k(1, R(0))],
    };
    case 'beam': return {
      dur: base(1100), ghosts: false,
      body: [k(0, T()), k(0.15, T(-8 * d, 1, -2 * d, 1 + sq, 1 - sq)), ...[0.25, 0.35, 0.45, 0.55, 0.65].map((o, i) => k(o, T(-12 * d + (i % 2 ? 1.5 : -1.5), 1, 0, 1 + sq, 1 - sq), { filter: 'brightness(1.3)' })), k(1, T())],
      torso: [k(0, R(0)), k(0.15, R(8 * d)), k(0.7, R(8 * d)), k(1, R(0))],
    };
    case 'throw': return {
      dur: base(640), ghosts: false,
      body: [k(0, T()), k(0.3, T(-10 * d, 0, -6 * d, 1 - sq, 1 + sq)), k(0.5, T(10 * d, 0, 7 * d, 1 + sq, 1 - sq)), k(1, T())],
      torso: [k(0, R(0)), k(0.3, R(-14 * d)), k(0.5, R(14 * d)), k(1, R(0))],
      head: [k(0, R(0)), k(0.3, R(-6 * d)), k(0.5, R(6 * d)), k(1, R(0))],
    };
    case 'charge': return {
      dur: base(1300), ghosts: false,
      body: [k(0, T()), k(0.15, T(0, 3, 0, 1 + sq, 1 - sq)), ...Array.from({ length: 8 }, (_, i) => k(0.2 + i * 0.08, T(i % 2 ? 1.2 : -1.2, 3 - (v ? i * 0.5 : 0), 0, 1 + sq, 1 - sq), { filter: `brightness(${1 + i * 0.05})` })), k(1, T())],
      head: [k(0, R(0)), k(0.2, R(6 * d, 0, 2)), k(0.85, R(-4 * d)), k(1, R(0))],
      torso: [k(0, R(0)), k(0.2, R(-5 * d)), k(0.85, R(0)), k(1, R(0))],
    };
    case 'ultimate': case 'powerup': case 'transform': {
      const big = clip === 'transform' ? 1.4 : clip === 'ultimate' ? 1.2 : 1;
      const rise = (p.floats || clip !== 'powerup' ? -12 : -5) * big;
      return {
        dur: base(clip === 'transform' ? 1800 : 1500), ghosts: false, easing: 'ease-in-out',
        body: [k(0, T()), k(0.12, T(0, 4, 0, 1 + sq * 1.5, 1 - sq * 1.5)),
          ...Array.from({ length: 10 }, (_, i) => k(0.18 + i * 0.06, T(i % 2 ? 1.6 * big : -1.6 * big, rise * Math.min(1, i / 4), 0, 1 + 0.04 * big, 1 + 0.04 * big), { filter: `brightness(${1.1 + i * 0.06}) saturate(${1 + i * 0.05})` })),
          k(0.85, T(0, rise, 0, 1.08, 1.08), { filter: clip === 'transform' ? 'brightness(2.2) saturate(0.4)' : 'brightness(1.6)' }), k(1, T())],
        head: [k(0, R(0)), k(0.12, R(8 * d, 0, 2)), k(0.7, R(-10 * d)), k(1, R(0))],
        torso: [k(0, R(0)), k(0.12, R(6 * d)), k(0.7, R(-8 * d)), k(1, R(0))],
      };
    }
    case 'hit': case 'hurt': case 'flinch': {
      const s = clip === 'flinch' ? 0.4 : P;
      const back = -d;
      const flash = { filter: 'brightness(1.9) saturate(0.3)' };
      if (cue.region === 'head') return { dur: base(520), ghosts: false,
        body: [k(0, T()), k(0.12, T(back * 8 * s, 0, back * 4 * s), flash), k(0.4, T(back * 5 * s, 0, back * 2 * s)), k(1, T())],
        head: [k(0, R(0)), k(0.12, R(back * 22 * s, back * 4)), k(0.45, R(back * 8 * s)), k(1, R(0))] };
      if (cue.region === 'legs') return { dur: base(560), ghosts: false,
        body: [k(0, T()), k(0.15, T(back * 5 * s, 6 * s, back * -5 * s, 1, 1 - sq), flash), k(0.5, T(back * 3 * s, 3 * s)), k(1, T())],
        base: [k(0, R(0)), k(0.15, R(back * -16 * s)), k(0.5, R(back * -6 * s)), k(1, R(0))] };
      return { dur: base(560), ghosts: false,
        body: [k(0, T()), k(0.12, T(back * 10 * s, 1, back * 3 * s, 1 - sq, 1 + sq * 0.5), flash), k(0.45, T(back * 6 * s, 0)), k(1, T())],
        torso: [k(0, R(0)), k(0.12, R(-back * 14 * s, back * 3)), k(0.5, R(-back * 5 * s)), k(1, R(0))],
        head: [k(0, R(0)), k(0.12, R(-back * 10 * s)), k(1, R(0))] };
    }
    case 'knockback': {
      const back = -d, far = cue.into ? 70 : 45 * P;
      return { dur: base(900), ghosts: true,
        body: [k(0, T()), k(0.1, T(back * 8, 0, back * 6), { filter: 'brightness(2) saturate(0.3)' }), k(0.4, T(back * far, v ? -16 : -8, back * (v ? 30 : 16), 1.04, 0.96)),
          k(0.55, T(back * far * 1.05, 2, back * 10, 1 + sq * 2, 1 - sq * 2)), k(0.75, T(back * far * 0.5, 0, back * 4)), k(1, T())],
        head: [k(0, R(0)), k(0.1, R(back * 20)), k(0.55, R(back * 10)), k(1, R(0))] };
    }
    case 'block': return {
      dur: base(520), ghosts: false,
      body: [k(0, T()), k(0.15, T(-6 * d, 1, -2 * d, 0.96, 0.98), { filter: 'brightness(1.3) hue-rotate(-20deg)' }), k(0.5, T(-4 * d, 0, -1 * d, 0.97)), k(1, T())],
      torso: [k(0, R(0)), k(0.15, R(v ? 10 * d : 6 * d)), k(0.6, R(4 * d)), k(1, R(0))],
      head: [k(0, R(0)), k(0.15, R(8 * d, 0, 3)), k(1, R(0))],
    };
    case 'parry': return {
      dur: base(520), ghosts: true,
      body: [k(0, T()), k(0.25, T(6 * d, -2, v ? -10 * d : 10 * d)), k(0.5, T(10 * d, 0, 4 * d)), k(1, T())],
      torso: [k(0, R(0)), k(0.25, R(v ? -16 * d : 16 * d)), k(1, R(0))],
    };
    case 'recoil': return { dur: base(500), ghosts: false, body: [k(0, T()), k(0.2, T(-14 * d, -2, -8 * d)), k(0.55, T(-8 * d, 0, -3 * d)), k(1, T())], head: [k(0, R(0)), k(0.2, R(-12 * d)), k(1, R(0))] };
    case 'dodge': {
      const back = -d;
      if (v === 0 || p.style === 'tank') return { dur: base(560), ghosts: p.ghosts, body: [k(0, T()), k(0.3, T(back * 32, -10, back * 8, 0.95, 1.05)), k(0.6, T(back * 26, 0, back * 3)), k(1, T())] };
      if (v === 1) return { dur: base(520), ghosts: true, body: [k(0, T()), k(0.3, T(back * 14, 6, 0, 0.84, 0.84), { opacity: 0.75 }), k(0.6, T(back * 10, 4, 0, 0.88, 0.88)), k(1, T())] };
      return { dur: base(720), ghosts: true, body: [k(0, T()), k(0.15, T(0, 4, 0, 1.05, 0.92)), k(0.45, T(back * 18, -40, back * 180)), k(0.75, T(back * 10, -8, back * 360)), k(1, T(0, 0, back * 360))] };
    }
    case 'clash': return {
      dur: base(1300), ghosts: true,
      body: [k(0, T()), k(0.2, T(34 * d, -2, 6 * d, 1 + sq, 1 - sq)), ...Array.from({ length: 6 }, (_, i) => k(0.3 + i * 0.08, T((34 + (i % 2 ? 4 : -4)) * d, -1, 5 * d), { filter: `brightness(${1.2 + i * 0.05})` })), k(0.85, T(-10 * d, 0, -6 * d)), k(1, T())],
      torso: [k(0, R(0)), k(0.2, R(12 * d)), k(0.8, R(10 * d)), k(1, R(0))],
    };
    case 'stagger': return {
      dur: base(900), ghosts: false,
      body: [k(0, T()), k(0.15, T(-8 * d, 2, -10 * d)), k(0.35, T(-4 * d, 1, 8 * d)), k(0.55, T(-6 * d, 2, -6 * d)), k(0.75, T(-2 * d, 1, 4 * d)), k(1, T())],
      head: [k(0, R(0)), k(0.2, R(14 * d)), k(0.5, R(-12 * d)), k(1, R(0))],
    };
    case 'knockdown': return {
      dur: base(1000), ghosts: true,
      body: [k(0, T()), k(0.12, T(-10 * d, -6, -16 * d), { filter: 'brightness(2) saturate(0.2)' }), k(0.4, T(-30 * d, -22, -50 * d)), k(0.65, T(-34 * d, 14, -78 * d, 1.06, 0.9)), k(0.8, T(-32 * d, 10, -70 * d)), k(1, T())],
      head: [k(0, R(0)), k(0.12, R(-24 * d)), k(0.65, R(-10 * d)), k(1, R(0))],
    };
    case 'getup': return {
      dur: base(900), ghosts: false,
      body: [k(0, T(-6 * d, 12, -40 * d)), k(0.4, T(-3 * d, 6, -14 * d, 1.04, 0.94)), k(0.7, T(0, -3, 3 * d, 0.98, 1.04)), k(1, T())],
      torso: [k(0, R(16 * d)), k(0.5, R(6 * d)), k(1, R(0))],
    };
    case 'defeated': return {
      dur: base(1400), ghosts: false,
      body: [k(0, T()), k(0.15, T(-12 * d, -8, -16 * d), { filter: 'brightness(2.2) saturate(0)' }), k(0.45, T(-28 * d, -14, -40 * d)), k(0.7, T(-30 * d, 18, -84 * d, 1.05, 0.9)), k(0.85, T(-30 * d, 14, -80 * d)), k(1, T())],
      head: [k(0, R(0)), k(0.15, R(-30 * d)), k(1, R(0))],
    };
    case 'victory': {
      if (v === 0) return { dur: base(1200), ghosts: false, easing: 'ease-out', body: [k(0, T()), k(0.2, T(0, 3, 0, 1.05, 0.94)), k(0.4, T(0, -18, -3 * d)), k(0.55, T(0, 2, 0, 1.06, 0.94)), k(0.7, T(0, -10, 3 * d)), k(1, T())] };
      if (v === 1) return { dur: base(1300), ghosts: false, body: [k(0, T()), k(0.4, T(0, -4, -4 * d, 1.06, 1.06), { filter: 'brightness(1.2)' }), k(0.8, T(0, -4, -4 * d, 1.06, 1.06)), k(1, T())], torso: [k(0, R(0)), k(0.4, R(-8 * d)), k(0.8, R(-8 * d)), k(1, R(0))], head: [k(0, R(0)), k(0.4, R(-12 * d)), k(1, R(0))] };
      return { dur: base(1100), ghosts: false, body: [0, 0.2, 0.4, 0.6, 0.8, 1].map((o, i) => k(o, T(0, i % 2 ? -8 : 0, i % 2 ? 4 : -4)) )};
    }
    case 'taunt': {
      if (v === 0) return { dur: base(900), ghosts: false, body: [k(0, T()), k(0.3, T(-4 * d, 0, -5 * d)), k(0.7, T(-4 * d, 0, -5 * d)), k(1, T())], head: [k(0, R(0)), k(0.3, R(-14 * d)), k(0.7, R(-10 * d)), k(1, R(0))] };
      if (v === 1) return { dur: base(800), ghosts: false, body: [k(0, T()), k(0.25, T(10 * d, -2, 4 * d, 1.04, 0.97)), k(0.5, T(6 * d, 0, 2 * d)), k(1, T())], torso: [k(0, R(0)), k(0.25, R(10 * d)), k(1, R(0))] };
      return { dur: base(900), ghosts: false, body: [k(0, T()), k(0.3, T(0, -3, 0, 1, 1.04)), k(0.6, T(0, -3, 0, 1, 1.04)), k(1, T())], torso: [k(0, R(0)), k(0.3, R(4 * d, 0, -3)), k(1, R(0))], head: [k(0, R(0)), k(0.35, R(10 * d)), k(0.6, R(-10 * d)), k(1, R(0))] };
    }
    case 'recover': return { dur: base(1000), ghosts: false, body: [k(0, T()), k(0.5, T(0, -5, 0, 1.03, 1.03), { filter: 'brightness(1.4) hue-rotate(60deg)' }), k(1, T())], torso: [k(0, R(0)), k(0.5, R(-4 * d)), k(1, R(0))] };
    case 'dashin': return { dur: base(700), ghosts: true, body: [k(0, T(-160 * d, -6, 10 * d, 1.1, 0.9), { opacity: 0 }), k(0.35, T(-40 * d, -2, 6 * d), { opacity: 1 }), k(0.6, T(6 * d, 1, -3 * d, 1 + sq, 1 - sq)), k(1, T())] };
    default: return { dur: 0, ghosts: false, body: [] };
  }
}
