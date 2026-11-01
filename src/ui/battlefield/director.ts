// The fight director: turns a finished battle record into a "battlefield script",
// one frame per event, saying what the sky does, what breaks, where the camera
// goes and how each fighter moves. It is a pure function of the record, so every
// replay and every player in an online room sees exactly the same battlefield,
// and the seeded combat engine is never touched. Visual randomness (particles)
// lives in the renderers; everything that matters to the story lives here.
import type { BattleEvent, BattleRecord, FighterSnapshot, Tag, VfxKind } from '../../engine/types';
import { ABILITIES, vfxOf } from '../../engine/data/abilities';
import { Rng, hashString } from '../../engine/rng';
import { ELEMENT_WEATHER, SNOWY, WET, climateOf, propsOf, type Climate, type PropDef, type WeatherKind } from './climate';

// ------------------------------------------------------------------ types

export interface WeatherState {
  kind: WeatherKind;
  /** 0..1, how hard it is raining/snowing/blowing. */
  intensity: number;
  /** -1 (blowing left) .. 1 (blowing right). */
  wind: number;
  /** 0..1 how dark the sky is. */
  dark: number;
  /** Water on the ground 0..1 (puddles, reflections). */
  wet: number;
  /** Snow lying on the ground 0..1. */
  snow: number;
  /** A lightning flash on this event. */
  flash: boolean;
  /** Set while a fighter's power is bending the weather. */
  cause?: string;
}

export type Anchor = { fighter: string; dx: number } | { x: number };
export type MarkKind = 'crater' | 'crack' | 'radial' | 'scorch' | 'frost' | 'slash' | 'puddle' | 'rubble' | 'glow' | 'trench' | 'melt';
export interface Mark { id: number; seq: number; kind: MarkKind; at: Anchor; size: number; rot: number; color: string }

export type Clip =
  | 'idle' | 'strike' | 'cast' | 'beam' | 'throw' | 'charge' | 'ultimate' | 'powerup' | 'transform'
  | 'hit' | 'knockback' | 'block' | 'parry' | 'recoil' | 'dodge' | 'clash' | 'stagger' | 'knockdown'
  | 'getup' | 'defeated' | 'victory' | 'taunt' | 'recover' | 'flinch' | 'dashin' | 'hurt';
export const CLIP_VARIANTS: Record<Clip, number> = {
  idle: 1, strike: 4, cast: 3, beam: 2, throw: 3, charge: 2, ultimate: 2, powerup: 2, transform: 2,
  hit: 3, knockback: 2, block: 2, parry: 2, recoil: 2, dodge: 3, clash: 2, stagger: 2, knockdown: 2,
  getup: 2, defeated: 2, victory: 3, taunt: 3, recover: 1, flinch: 2, dashin: 1, hurt: 2,
};
export interface MotionCue {
  clip: Clip;
  variant: number;
  /** 0..1 how big the motion is. */
  power: number;
  /** Where a hit landed. */
  region?: 'head' | 'body' | 'legs';
  /** Prop the fighter is knocked into. */
  into?: string;
}

export type Focus = 'actor' | 'target' | 'mid' | 'wide';
export interface CameraCue {
  shot: string;
  focus: Focus;
  zoom: number;
  /** Degrees of dutch tilt. */
  tilt: number;
  shake: 0 | 1 | 2 | 3;
  letterbox: boolean;
  slowmo: boolean;
}

export interface Light { at: 'actor' | 'target' | 'mid'; color: string; power: number }
export type HazardKind = 'lightning' | 'eruption' | 'blizzard' | 'riptide' | 'sandstorm' | 'collapse';

export interface Frame {
  weather: WeatherState;
  camera: CameraCue;
  motion: Record<string, MotionCue>;
  light?: Light;
  hazard?: { kind: HazardKind; targets: string[] };
  /** Crowd / arena energy 0..1: rises on big moments, settles in quiet ones. */
  hype: number;
  /** Props hit on this event (for debris effects). */
  propHits: string[];
  /** Water splashes up from the ground on this event's impact. */
  splash?: boolean;
}

export interface BattlefieldScript {
  envId: string;
  climate: Climate;
  props: PropDef[];
  frames: Frame[];
  marks: Mark[];
  propDamage: Array<{ seq: number; id: string; dmg: number }>;
}

// ---------------------------------------------------------------- helpers

const STRIKES = new Set(['attack', 'counter', 'block', 'miss']);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** What kind of effect a move is (same rule the arena uses). */
export function moveKind(e: BattleEvent, snap: FighterSnapshot | undefined): VfxKind {
  if (e.ability && ABILITIES[e.ability]) return vfxOf(ABILITIES[e.ability]);
  if (e.action === 'combo') return 'barrage';
  if (!snap) return 'punch';
  return snap.reach === 'ranged' ? 'projectile' : snap.archetype === 'Duelist' || snap.archetype === 'Assassin' ? 'slash' : 'punch';
}
const MELEE = new Set<VfxKind>(['punch', 'slash', 'barrage']);
export const isUltimate = (e: BattleEvent) => !!e.ability && ABILITIES[e.ability]?.kind === 'ultimate';
const elementOf = (e: BattleEvent): Tag | undefined => (e.ability ? ABILITIES[e.ability]?.element : undefined);
const colorOf = (e: BattleEvent, fallback = '#e5e7eb') => (e.ability && ABILITIES[e.ability] ? ABILITIES[e.ability].fx.color : fallback);

function heavyOf(e: BattleEvent): number {
  if (e.context?.impact === 'devastating') return 1;
  if (e.crit) return 0.9;
  if (e.context?.impact === 'heavy') return 0.7;
  if (e.context?.impact === 'glancing') return 0.2;
  return 0.45;
}

const HAZARD_OF: Record<string, HazardKind> = { storm: 'lightning', volcano: 'eruption', tundra: 'blizzard', ocean: 'riptide', desert: 'sandstorm', ruins: 'collapse' };

// ----------------------------------------------------------------- build

export function buildBattlefield(record: BattleRecord): BattlefieldScript {
  const { input, result } = record;
  const events = result.events;
  const envId = input.environmentId;
  const climate = climateOf(envId);
  const props = propsOf(envId);
  const seed = hashString(`${record.battleId}:battlefield`);
  const wxRng = new Rng(seed ^ 0x51ed);
  const rng = new Rng(seed);
  const snaps = new Map<string, FighterSnapshot>();
  for (const s of input.sides) for (const f of [...s.fighters, ...(s.reserves ?? [])]) snaps.set(f.charId, f);
  const sideOf = (id?: string) => (id ? snaps.get(id)?.side : undefined);

  const frames: Frame[] = [];
  const marks: Mark[] = [];
  const propDamage: BattlefieldScript['propDamage'] = [];
  const propHp = new Map(props.map((p) => [p.id, 0]));
  let markId = 0;
  const mark = (seq: number, kind: MarkKind, at: Anchor, size: number, color = '#000000', rot?: number) => {
    marks.push({ id: markId++, seq, kind, at, size, rot: rot ?? rng.range(-40, 40), color });
  };
  const near = (id: string, spread = 0.5): Anchor => ({ fighter: id, dx: rng.range(-spread, spread) });

  // ---- weather: drifts between the climate's kinds; strong moves bend it for a while.
  const pool = climate.pool.map(([k]) => k), weights = climate.pool.map(([, w]) => w);
  let base: WeatherKind = wxRng.weighted(pool, weights);
  let baseI = wxRng.range(0.45, 0.85);
  let wind = wxRng.range(-0.6, 0.6);
  let nextChange = wxRng.int(16, 34);
  type Ov = { kind: WeatherKind; until: number; cause: string; dark: number };
  let override = null as Ov | null;
  let shown: WeatherKind = base;
  let intensity = baseI;
  let wet = WET.has(base) ? 0.35 : envId === 'ocean' ? 0.3 : 0;
  let snow = SNOWY.has(base) || envId === 'tundra' ? 0.55 : 0;
  let hype = 0.15;

  // ---- anti-repetition memory
  const lastVariant = new Map<string, number>();
  let lastShot = '';
  let tiltSign = 1;
  const pickVariant = (id: string, clip: Clip) => {
    const n = CLIP_VARIANTS[clip];
    const key = `${id}:${clip}`;
    let v = rng.int(0, n - 1);
    if (n > 1 && v === lastVariant.get(key)) v = (v + 1 + rng.int(0, n - 2)) % n;
    lastVariant.set(key, v);
    return v;
  };
  const shot = (options: Array<Omit<CameraCue, 'tilt'> & { tilt?: number }>): CameraCue => {
    let o = rng.pick(options);
    if (options.length > 1 && o.shot === lastShot) o = options[(options.indexOf(o) + 1) % options.length];
    lastShot = o.shot;
    tiltSign = -tiltSign;
    return { ...o, tilt: (o.tilt ?? 0) * tiltSign };
  };
  const WIDE: CameraCue = { shot: 'wide', focus: 'wide', zoom: 1, tilt: 0, shake: 0, letterbox: false, slowmo: false };

  // Damage a prop on a side; returns its id when hit.
  const hitProp = (seq: number, side: 0 | 1 | undefined, dmg: number, prefer?: 'front' | 'back'): string | undefined => {
    if (side === undefined) return;
    const live = props.filter((p) => p.side === side && (propHp.get(p.id) ?? 0) < p.hp);
    if (!live.length) return;
    const pickFrom = prefer ? live.filter((p) => p.layer === prefer) : live;
    const p = rng.pick(pickFrom.length ? pickFrom : live);
    const before = propHp.get(p.id)!;
    const after = Math.min(p.hp, before + dmg);
    propHp.set(p.id, after);
    propDamage.push({ seq, id: p.id, dmg: after });
    if (after >= p.hp && before < p.hp) mark(seq, 'rubble', { x: p.x }, 60 * p.scale, '#000');
    return p.id;
  };

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const seq = e.seq;
    const motion: Record<string, MotionCue> = {};
    const propHits: string[] = [];
    let camera: CameraCue = WIDE;
    let light: Light | undefined;
    let hazard: Frame['hazard'];
    let splash = false;
    let flash = false;
    const actor = e.actor, target = e.target;
    const aSnap = actor ? snaps.get(actor) : undefined;
    const kind = STRIKES.has(e.type) || e.type === 'ability' || e.type === 'desperation' ? moveKind(e, aSnap) : null;
    const melee = !!kind && (MELEE.has(kind) || (kind === 'barrage' && aSnap?.reach === 'melee'));
    const power = heavyOf(e);
    const ult = isUltimate(e);
    const el = elementOf(e);
    const color = colorOf(e);
    const put = (id: string | undefined, clip: Clip, p = 0.6, extra: Partial<MotionCue> = {}) => {
      if (!id) return;
      motion[id] = { clip, variant: pickVariant(id, clip), power: clamp(p), ...extra };
    };
    const region = (): MotionCue['region'] => {
      if (e.injury) return e.injury.part === 'head' ? 'head' : e.injury.part === 'leg' ? 'legs' : 'body';
      const r = (hashString(`${seq}:${target}`) % 6);
      return r < 2 ? 'head' : r < 5 ? 'body' : 'legs';
    };
    const bend = (k: WeatherKind | undefined, cause: string, len: number, dark = 0) => {
      if (!k) return;
      override = { kind: k, until: i + len, cause, dark };
    };

    switch (e.type) {
      case 'attack': case 'counter': case 'block': case 'miss': {
        const env = !!e.context?.environmental;
        const dmg = (e.damage ?? 0) > 0;
        if (env) {
          put(target, power > 0.6 ? 'knockback' : 'flinch', 0.6, { region: 'body' });
          camera = shot([{ shot: 'hazard-wide', focus: 'target', zoom: 1.06, shake: 2, letterbox: false, slowmo: false }]);
          if (envId === 'volcano') mark(seq, 'glow', near(target!), 50, '#ff6a3d');
          else if (envId === 'storm') mark(seq, 'scorch', near(target!), 40, '#1e1b4b');
          else if (envId === 'tundra') mark(seq, 'frost', near(target!), 55, '#e0f2fe');
          else if (envId === 'ocean') { mark(seq, 'puddle', near(target!), 70, '#38bdf8'); splash = true; }
          else if (envId === 'ruins') { mark(seq, 'rubble', near(target!, 0.8), 55, '#000'); mark(seq, 'crack', near(target!), 60, '#000'); }
          else if (envId === 'desert') mark(seq, 'melt', near(target!), 60, '#000');
          break;
        }
        const clip: Clip = melee ? 'strike' : kind === 'beam' || kind === 'lightning' || kind === 'fire' ? 'beam' : kind === 'projectile' || kind === 'explosion' || kind === 'ice' || kind === 'wave' ? 'throw' : 'cast';
        put(actor, clip, ult ? 1 : power);
        if (dmg && target) {
          const knock = power >= 0.85 || ult;
          let into: string | undefined;
          // Big hits throw the target back; sometimes into whatever is standing behind them.
          if (knock && rng.chance(ult ? 0.8 : 0.45)) { into = hitProp(seq, sideOf(target), ult ? 2 : 1, 'front'); if (into) propHits.push(into); }
          put(target, knock ? 'knockback' : 'hit', power, { region: region(), into });
          // The ground remembers.
          const grip = target;
          if (kind === 'fire') { mark(seq, 'scorch', near(grip), 40 + power * 40, '#1c0a05'); if (wet > 0.2) mark(seq, 'melt', near(grip), 40, '#000'); if (snow > 0.2) mark(seq, 'melt', near(grip), 55, '#000'); }
          else if (kind === 'ice') mark(seq, 'frost', near(grip), 45 + power * 35, '#dbeafe');
          else if (kind === 'lightning') { mark(seq, 'scorch', near(grip), 35 + power * 30, '#111827'); if (power > 0.6) mark(seq, 'crack', near(grip), 50, '#000'); }
          else if (kind === 'slash' && power > 0.4) mark(seq, 'slash', near(grip), 60 + power * 50, '#000');
          else if (kind === 'explosion' || ult) { mark(seq, 'crater', near(grip, 0.3), 70 + power * 70, '#000'); mark(seq, 'radial', near(grip, 0.2), 90 + power * 60, '#000'); }
          else if (kind === 'beam') mark(seq, 'trench', near(grip, 0.2), 90 + power * 60, '#000', sideOf(actor) === 0 ? 0 : 180);
          else if (kind === 'wave' && el === 'WATER') { mark(seq, 'puddle', near(grip), 70, '#38bdf8'); }
          else if (power >= 0.7) mark(seq, power >= 0.9 ? 'crater' : 'crack', near(grip), 40 + power * 50, '#000');
          if (el === 'EARTH' && power > 0.5) mark(seq, 'crack', near(grip), 80, '#000');
          if (el === 'DARK' || el === 'DEMON' || el === 'SHADOW') { if (power > 0.6) mark(seq, 'glow', near(grip), 45, color); }
          if (kind === 'explosion' || ult) { for (const s of [0, 1] as const) if (s === sideOf(target) || ult) { const h = hitProp(seq, s, 1, 'back'); if (h) propHits.push(h); } }
          else if (power >= 0.7 && rng.chance(0.35)) { const h = hitProp(seq, sideOf(target), 1, 'back'); if (h) propHits.push(h); }
          if ((wet > 0.35 || envId === 'ocean') && power >= 0.45) splash = true;
          hype = Math.max(hype, 0.3 + power * 0.5);
        } else if (e.type === 'block' && target) put(target, 'block', power);
        else if (e.type === 'miss' && target) {
          put(target, 'dodge', 0.6);
          // A missed big move still hits something.
          if (power >= 0.7 || ult) { mark(seq, kind === 'slash' ? 'slash' : 'crack', near(target, 0.9), 55, '#000'); const h = hitProp(seq, sideOf(target), 1); if (h) propHits.push(h); }
        }
        if (ult) camera = shot([{ shot: 'ultimate-impact', focus: 'target', zoom: 1.14, shake: 3, letterbox: true, slowmo: true }]);
        else if (e.type === 'miss') camera = shot([{ shot: 'whip-miss', focus: 'target', zoom: 1.06, tilt: 3, shake: 0, letterbox: false, slowmo: false }, { shot: 'track-miss', focus: 'mid', zoom: 1.04, tilt: 2, shake: 0, letterbox: false, slowmo: false }]);
        else if (power >= 0.85) camera = shot([{ shot: 'impact-push', focus: 'target', zoom: 1.2, tilt: 4, shake: 2, letterbox: false, slowmo: false }, { shot: 'impact-low', focus: 'target', zoom: 1.16, tilt: -5, shake: 2, letterbox: false, slowmo: false }]);
        else if (power >= 0.65) camera = shot([{ shot: 'push-target', focus: 'target', zoom: 1.12, tilt: 2, shake: 1, letterbox: false, slowmo: false }, { shot: 'two-shot', focus: 'mid', zoom: 1.08, shake: 1, letterbox: false, slowmo: false }]);
        else camera = shot([{ shot: 'two-shot', focus: 'mid', zoom: 1.05, shake: 0, letterbox: false, slowmo: false }, { shot: 'follow-actor', focus: 'actor', zoom: 1.07, tilt: 1.5, shake: 0, letterbox: false, slowmo: false }, { shot: 'over-shoulder', focus: 'target', zoom: 1.08, tilt: -1.5, shake: 0, letterbox: false, slowmo: false }]);
        if (e.ability) light = { at: kind === 'beam' || kind === 'lightning' ? 'mid' : 'target', color, power: 0.4 + power * 0.5 };
        break;
      }
      case 'parry':
        put(actor, 'parry', 0.7); put(target, 'recoil', 0.6);
        camera = shot([{ shot: 'parry-close', focus: 'actor', zoom: 1.15, tilt: 4, shake: 1, letterbox: false, slowmo: false }]);
        light = { at: 'actor', color: '#ffffff', power: 0.5 };
        break;
      case 'clash':
        put(actor, 'clash', 1); put(target, 'clash', 1);
        mark(seq, 'crater', { x: 0.5 }, 90, '#000'); mark(seq, 'radial', { x: 0.5 }, 140, '#000');
        for (const s of [0, 1] as const) { const h = hitProp(seq, s, 1, 'back'); if (h) propHits.push(h); }
        camera = shot([{ shot: 'clash-mid', focus: 'mid', zoom: 1.16, shake: 2, letterbox: true, slowmo: false }, { shot: 'clash-tilt', focus: 'mid', zoom: 1.12, tilt: 6, shake: 2, letterbox: true, slowmo: false }]);
        light = { at: 'mid', color: '#fde047', power: 1 };
        hype = 1;
        break;
      case 'ability': case 'desperation': {
        const a = e.ability ? ABILITIES[e.ability] : undefined;
        const buff = a?.kind === 'buff' || a?.kind === 'shield' || a?.kind === 'heal';
        put(actor, ult ? 'ultimate' : buff ? 'powerup' : 'charge', ult ? 1 : 0.7);
        if (ult || (kind === 'domain')) {
          camera = shot([{ shot: 'charge-close', focus: 'actor', zoom: 1.26, shake: 1, letterbox: true, slowmo: false }, { shot: 'charge-low', focus: 'actor', zoom: 1.22, tilt: -4, shake: 1, letterbox: true, slowmo: false }]);
          bend(el ? ELEMENT_WEATHER[el] : undefined, `${aSnap?.name ?? 'A fighter'}'s ${a?.name ?? 'power'}`, rng.int(14, 26), kind === 'domain' ? 0.45 : 0.15);
          if (kind === 'domain') mark(seq, 'glow', near(actor!, 0.1), 160, color);
          hype = Math.max(hype, 0.8);
        } else if (a) camera = shot([{ shot: 'cast-push', focus: 'actor', zoom: 1.1, shake: 0, letterbox: false, slowmo: false }, { shot: 'cast-side', focus: 'actor', zoom: 1.08, tilt: 2, shake: 0, letterbox: false, slowmo: false }]);
        if (a) light = { at: 'actor', color, power: ult ? 1 : 0.6 };
        break;
      }
      case 'transform': {
        put(actor, 'transform', 1);
        const tag = aSnap?.tags.find((t) => ELEMENT_WEATHER[t]);
        bend(tag ? ELEMENT_WEATHER[tag] : 'wind', `${aSnap?.name ?? 'A fighter'} transforming`, rng.int(10, 18), 0.25);
        mark(seq, 'radial', near(actor!, 0.1), 130, '#000'); mark(seq, 'crater', near(actor!, 0.1), 80, '#000');
        const h = hitProp(seq, sideOf(actor), 1); if (h) propHits.push(h);
        camera = shot([{ shot: 'reveal', focus: 'actor', zoom: 1.3, tilt: 3, shake: 2, letterbox: true, slowmo: false }]);
        light = { at: 'actor', color: String(e.context?.color ?? '#f5c451'), power: 1 };
        hype = 1;
        break;
      }
      case 'awakening': case 'iron_will':
        put(actor ?? target, 'powerup', 0.9);
        mark(seq, 'radial', near((actor ?? target)!, 0.1), 100, '#000');
        camera = shot([{ shot: 'awaken', focus: 'actor', zoom: 1.22, tilt: -3, shake: 1, letterbox: true, slowmo: false }]);
        light = { at: 'actor', color: '#f5c451', power: 0.9 };
        hype = Math.max(hype, 0.85);
        break;
      case 'knockdown':
        put(target, 'knockdown', 1);
        mark(seq, 'crater', near(target!, 0.3), 80, '#000');
        { const h = hitProp(seq, sideOf(target), 2, 'front'); if (h) { propHits.push(h); motion[target!].into = h; } }
        if (wet > 0.3 || envId === 'ocean') splash = true;
        camera = shot([{ shot: 'drop', focus: 'target', zoom: 1.2, tilt: 6, shake: 3, letterbox: false, slowmo: true }, { shot: 'drop-low', focus: 'target', zoom: 1.16, tilt: -6, shake: 3, letterbox: false, slowmo: true }]);
        hype = 1;
        break;
      case 'get_up': put(actor, 'getup', 0.7); camera = shot([{ shot: 'rise', focus: 'actor', zoom: 1.1, shake: 0, letterbox: false, slowmo: false }]); break;
      case 'guard_break': put(target, 'stagger', 0.9); camera = shot([{ shot: 'break', focus: 'target', zoom: 1.12, tilt: 3, shake: 2, letterbox: false, slowmo: false }]); break;
      case 'injury': put(target, 'hurt', e.injury?.severity === 2 ? 1 : 0.6, { region: region() }); camera = shot([{ shot: 'injury-close', focus: 'target', zoom: 1.18, shake: 1, letterbox: false, slowmo: false }]); break;
      case 'defeat': {
        put(target, 'defeated', 1);
        mark(seq, 'crater', near(target!, 0.2), 110, '#000'); mark(seq, 'radial', near(target!, 0.2), 150, '#000');
        const h = hitProp(seq, sideOf(target), 3, 'front'); if (h) { propHits.push(h); motion[target!].into = h; }
        if (wet > 0.3 || envId === 'ocean') splash = true;
        camera = shot([{ shot: 'ko', focus: 'target', zoom: 1.28, tilt: 5, shake: 3, letterbox: true, slowmo: true }]);
        light = { at: 'target', color: '#ef4444', power: 0.8 };
        hype = 1;
        break;
      }
      case 'heal': put(target, 'recover', 0.5); light = { at: 'target', color: '#4ade80', power: 0.5 }; break;
      case 'status_tick': put(target, 'flinch', 0.4); break;
      case 'banter': case 'rival': put(actor, 'taunt', 0.6); if (e.type === 'rival') put(target, 'taunt', 0.6); camera = shot([{ shot: 'talk', focus: 'actor', zoom: 1.12, shake: 0, letterbox: e.type === 'rival', slowmo: false }, { shot: 'talk-side', focus: 'actor', zoom: 1.1, tilt: 2, shake: 0, letterbox: e.type === 'rival', slowmo: false }]); break;
      case 'secret': put(actor, 'ultimate', 1); camera = shot([{ shot: 'secret', focus: 'actor', zoom: 1.24, tilt: -4, shake: 1, letterbox: true, slowmo: false }]); hype = 1; break;
      case 'reinforcement': put(actor, 'dashin', 0.9); camera = shot([{ shot: 'entry', focus: 'actor', zoom: 1.1, shake: 1, letterbox: false, slowmo: false }]); break;
      case 'combo': put(actor, 'strike', 0.9); if (typeof e.context?.partner === 'string') put(e.context.partner, 'strike', 0.9); if (target) put(target, 'knockback', 0.8, { region: 'body' }); camera = shot([{ shot: 'combo', focus: 'target', zoom: 1.14, tilt: 3, shake: 2, letterbox: !!e.context?.duo, slowmo: false }]); break;
      case 'environment': {
        const hz = HAZARD_OF[envId];
        const targets = events.slice(i + 1, i + 6).filter((x) => x.context?.environmental && x.target).map((x) => x.target!);
        if (hz) hazard = { kind: hz, targets };
        if (hz === 'lightning') { flash = true; bend('storm', 'Stray lightning', 8, 0.2); const h = hitProp(seq, rng.chance(0.5) ? 0 : 1, 1, 'back'); if (h) propHits.push(h); }
        if (hz === 'blizzard') bend('blizzard', 'The blizzard', 10);
        if (hz === 'eruption') bend('ash', 'The eruption', 10, 0.2);
        if (hz === 'riptide') bend('rain', 'The riptide', 8);
        if (hz === 'sandstorm') bend('dust', 'The sandstorm', 12, 0.15);
        if (hz === 'collapse') { const h = hitProp(seq, rng.chance(0.5) ? 0 : 1, 2, 'back'); if (h) propHits.push(h); }
        camera = shot([{ shot: 'hazard', focus: 'wide', zoom: 1.02, shake: 2, letterbox: false, slowmo: false }]);
        hype = Math.max(hype, 0.7);
        break;
      }
      case 'verdict': {
        const win = result.winnerSide;
        for (const f of input.sides[win].fighters) put(f.charId, 'victory', 0.8);
        camera = { ...WIDE, shot: 'victory', zoom: 1.04, letterbox: true };
        hype = 1;
        break;
      }
      case 'final_exchange': camera = shot([{ shot: 'final', focus: 'mid', zoom: 1.1, shake: 1, letterbox: true, slowmo: false }]); hype = Math.max(hype, 0.8); break;
      case 'intro': case 'prebattle': camera = { ...WIDE, shot: 'establish', zoom: 1.02 }; break;
    }

    // ---- weather for this frame
    if (i >= nextChange && !override) {
      nextChange = i + wxRng.int(18, 40);
      if (wxRng.chance(0.7)) {
        const others = pool.filter((k) => k !== base);
        if (others.length) base = wxRng.weighted(others, others.map((k) => weights[pool.indexOf(k)]));
        baseI = wxRng.range(0.4, 0.95);
        wind = clamp(wind + wxRng.range(-0.5, 0.5), -1, 1);
      }
    }
    if (override && i > override.until) override = null;
    const want = override ? override.kind : base;
    const wantI = override ? 1 : baseI;
    if (want !== shown) { intensity -= 0.25; if (intensity <= 0.1) { shown = want; intensity = 0.1; } }
    else intensity += (wantI - intensity) * 0.25;
    intensity = clamp(intensity, 0.05, 1);
    const windNow = shown === 'wind' || shown === 'blizzard' || shown === 'storm' || shown === 'dust' ? Math.sign(wind || 1) * Math.max(0.6, Math.abs(wind)) : wind * 0.5;
    if (WET.has(shown)) wet = clamp(wet + 0.012 * intensity * (shown === 'storm' ? 1.6 : 1));
    else if (shown === 'heat' || shown === 'embers') wet = clamp(wet - 0.03);
    else wet = clamp(wet - 0.004, envId === 'ocean' ? 0.25 : 0);
    if (SNOWY.has(shown)) snow = clamp(snow + 0.01 * intensity * (shown === 'blizzard' ? 1.8 : 1));
    else if (shown === 'heat' || shown === 'embers' || shown === 'rain') snow = clamp(snow - 0.02);
    // Rain pools into puddles over time; heavy snow buries the scars.
    if (WET.has(shown) && wet > 0.4 && i % 9 === 0 && marks.filter((m) => m.kind === 'puddle').length < 6) mark(seq, 'puddle', { x: rng.range(0.15, 0.85) }, rng.range(50, 90), '#38bdf8', 0);
    if (shown === 'storm' && !flash && wxRng.chance(0.07 * intensity)) flash = true;
    const darkAdd: Partial<Record<WeatherKind, number>> = { storm: 0.25, rain: 0.1, fog: 0.12, blizzard: 0.15, ash: 0.18, dust: 0.1, snow: 0.05 };
    const dark = clamp(climate.dark + (darkAdd[shown] ?? 0) * intensity + (override ? override.dark : 0), 0, 0.8);
    hype = clamp(hype * 0.9 + (camera.shake ? 0.03 : 0), 0.08, 1);

    frames.push({
      weather: { kind: shown, intensity, wind: windNow, dark, wet, snow, flash, cause: override?.cause },
      camera, motion, light, hazard, hype, propHits, splash: splash || undefined,
    });
  }

  return { envId, climate, props, frames, marks, propDamage };
}

// ------------------------------------------------------------- queries

/** Marks on the ground once the event with this seq has played (Infinity = fight over, 0 = before the bell). */
export function marksAt(s: BattlefieldScript, seq: number): Mark[] {
  const out = s.marks.filter((m) => m.seq <= seq);
  return out.length > 70 ? out.slice(out.length - 70) : out;
}

/** 0 intact, 1 cracked, 2 destroyed, for each prop once the event with this seq has played. */
export function propStatesAt(s: BattlefieldScript, seq: number): Record<string, 0 | 1 | 2> {
  const dmg = new Map<string, number>();
  for (const d of s.propDamage) if (d.seq <= seq) dmg.set(d.id, d.dmg);
  const out: Record<string, 0 | 1 | 2> = {};
  for (const p of s.props) { const v = dmg.get(p.id) ?? 0; out[p.id] = v >= p.hp ? 2 : v >= p.hp / 2 ? 1 : 0; }
  return out;
}

/** The frame for the event with this seq (events are numbered from 1). */
export function frameAt(s: BattlefieldScript, seq: number): Frame | undefined {
  return s.frames[Math.max(0, Math.min(s.frames.length - 1, seq - 1))];
}
