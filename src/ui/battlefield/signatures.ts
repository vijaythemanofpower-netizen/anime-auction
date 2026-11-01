// How each built-in fighter moves, on top of what their archetype gives them:
// Luffy's punches stretch, Minato and Zenitsu vanish mid-dash, Levi spins on his
// gear, Sanji fights with his legs, Jotaro's Stand throws the punches while he
// stands still, Gojo and Saitama barely bother winding up, the giants slam.
// Fighters without an entry (originals, Explorer characters, raid villains)
// keep the profile built from their archetype, speed and temperament.
import type { MotionProfile } from './motion';

export type Trait =
  /** Rubber limbs: strikes stretch far. */ 'stretch'
  /** Flash step / teleport: vanishes mid-move. */ | 'blink'
  /** Spins and flips (gear, dual blades, acrobatics). */ | 'spinner'
  /** Fights with kicks. */ | 'kicks'
  /** A Stand or summon throws the hits; the fighter stays put. */ | 'stand'
  /** Effortless: tiny wind-up, no strain. */ | 'casual'
  /** Huge and heavy: slow, crushing slams. */ | 'heavy';

export interface Signature {
  style?: MotionProfile['style'];
  floats?: boolean;
  idle?: MotionProfile['idle'];
  traits?: Trait[];
}

const S = (style: MotionProfile['style'] | undefined, traits: Trait[] = [], o: Partial<Signature> = {}): Signature => ({ style, traits, ...o });

export const SIGNATURES: Record<string, Signature> = {
  naruto: S('brawler', ['spinner'], { idle: 'bounce' }), sasuke: S('blade', ['blink'], { idle: 'still' }), itachi: S('caster', ['blink', 'casual'], { idle: 'still' }),
  kakashi: S('shadow', ['blink'], { idle: 'still' }), luffy: S('brawler', ['stretch'], { idle: 'bounce' }), zoro: S('blade', ['spinner'], { idle: 'still' }),
  sanji: S('brawler', ['kicks', 'spinner'], { idle: 'proud' }), ace: S('brawler', [], { idle: 'proud' }), goku: S('brawler', ['blink'], { idle: 'bounce', floats: false }),
  vegeta: S('brawler', ['blink'], { idle: 'proud' }), frieza: S('caster', ['casual'], { idle: 'proud', floats: true }), ichigo: S('blade', ['blink'], { idle: 'sway' }),
  byakuya: S('blade', ['blink', 'casual'], { idle: 'still' }), aizen: S('blade', ['blink', 'casual'], { idle: 'proud' }), gojo: S('caster', ['blink', 'casual'], { idle: 'proud', floats: true }),
  yuji: S('brawler', [], { idle: 'bounce' }), sukuna: S('caster', ['casual'], { idle: 'proud' }), megumi: S('caster', ['stand'], { idle: 'still' }),
  tanjiro: S('blade', ['spinner'], { idle: 'sway' }), zenitsu: S('blade', ['blink'], { idle: 'sway' }), rengoku: S('blade', [], { idle: 'proud' }),
  deku: S('brawler', ['kicks'], { idle: 'bounce' }), bakugo: S('brawler', ['spinner'], { idle: 'bounce' }), todoroki: S('caster', [], { idle: 'still' }),
  allmight: S('tank', ['heavy'], { idle: 'proud' }), levi: S('blade', ['spinner', 'blink'], { idle: 'still' }), eren: S('brawler', ['heavy'], { idle: 'sway' }),
  mikasa: S('blade', ['spinner'], { idle: 'still' }), gon: S('brawler', [], { idle: 'bounce' }), killua: S('shadow', ['blink'], { idle: 'sway' }),
  hisoka: S('shooter', ['casual'], { idle: 'proud' }), edward: S('brawler', [], { idle: 'bounce' }), roy: S('caster', ['casual'], { idle: 'proud' }),
  saitama: S('brawler', ['casual'], { idle: 'still' }), natsu: S('brawler', [], { idle: 'bounce' }), denji: S('blade', ['spinner'], { idle: 'bounce' }),
  minato: S('shadow', ['blink'], { idle: 'still' }), madara: S('caster', ['casual', 'stand'], { idle: 'proud' }), pain: S('caster', ['casual'], { idle: 'still', floats: true }),
  gaara: S('caster', ['stand'], { idle: 'still' }), lee: S('brawler', ['kicks', 'spinner'], { idle: 'bounce' }), law: S('blade', ['blink', 'casual'], { idle: 'still' }),
  whitebeard: S('tank', ['heavy'], { idle: 'proud' }), shanks: S('blade', ['casual'], { idle: 'still' }), gohan: S('brawler', ['blink'], { idle: 'sway' }),
  piccolo: S('caster', [], { idle: 'still', floats: true }), broly: S('tank', ['heavy'], { idle: 'sway' }), kenpachi: S('blade', ['heavy'], { idle: 'proud' }),
  toshiro: S('blade', [], { idle: 'still' }), rukia: S('blade', ['spinner'], { idle: 'still' }), yuta: S('blade', ['stand'], { idle: 'sway' }),
  todo: S('tank', ['blink', 'heavy'], { idle: 'proud' }), nanami: S('blade', ['casual'], { idle: 'still' }), nobara: S('shooter', [], { idle: 'proud' }),
  giyu: S('blade', ['casual'], { idle: 'still' }), inosuke: S('blade', ['spinner'], { idle: 'bounce' }), akaza: S('brawler', ['kicks'], { idle: 'bounce' }),
  shinobu: S('shadow', ['blink'], { idle: 'sway' }), shigaraki: S('caster', [], { idle: 'sway' }), endeavor: S('caster', ['heavy'], { idle: 'proud' }),
  kurapika: S('caster', ['stand'], { idle: 'still' }), meruem: S('brawler', ['casual'], { idle: 'still' }), jinwoo: S('shadow', ['stand', 'blink'], { idle: 'still' }),
  jotaro: S('brawler', ['stand', 'casual'], { idle: 'still' }), dio: S('brawler', ['stand', 'blink'], { idle: 'proud' }), mob: S('caster', ['casual'], { idle: 'still', floats: true }),
  kaneki: S('shadow', ['kicks', 'spinner'], { idle: 'sway' }), asta: S('blade', [], { idle: 'bounce' }), yuno: S('caster', [], { idle: 'still', floats: true }),
  power: S('brawler', ['heavy'], { idle: 'bounce' }), yor: S('shadow', ['kicks', 'spinner'], { idle: 'still' }), gilgamesh: S('caster', ['casual', 'stand'], { idle: 'proud' }),
  saber: S('blade', [], { idle: 'still' }), kirito: S('blade', ['spinner'], { idle: 'still' }), frieren: S('caster', ['casual'], { idle: 'still', floats: true }),
  escanor: S('tank', ['heavy', 'casual'], { idle: 'proud' }),
};

/** The built-in's key from a fighter id ("legend:luffy", "legend:luffy#b" in tests). */
export function signatureOf(charId: string): Signature | undefined {
  const m = /^legend:([a-z0-9_]+)/.exec(charId);
  return m ? SIGNATURES[m[1]] : undefined;
}
