// Hidden profile generation and the vault that keeps hidden data separate
// from public game state. Each game has its own secret, so the same
// character has different (but stable within the campaign) true stats in
// every game — knowing a character's public profile never reveals its power.
import { canonStats } from './data/canonStats';
import type { EvolutionPath, HiddenProfile, HiddenTrait, PublicCharacter, StatKey, Stats, Tag } from './types';
import { STAT_KEYS } from './types';
import { ARCHETYPES } from './data/archetypes';
import { ABILITY_IDS, ABILITIES, registerCharacterMoves } from './data/abilities';
import { Rng, deriveSeed } from './rng';
import { LEGEND_KITS } from './data/legends';

const TRAITS: HiddenTrait[] = [
  'Late Bloomer', 'Iron Will', 'Glass Jaw', 'Lucky Star', 'Cold Reader',
  'Second Wind', 'Short Fuse', 'Overthinker', 'Big Game Player', 'Steady Hands',
];

export const TRAIT_INFO: Record<HiddenTrait, { good: boolean; text: string }> = {
  'Late Bloomer': { good: true, text: 'Far more likely to awaken when badly hurt.' },
  'Iron Will': { good: true, text: 'Gets back up once per battle from a blow that should have finished them.' },
  'Glass Jaw': { good: false, text: 'Takes 15% more damage from critical hits.' },
  'Lucky Star': { good: true, text: '+5% chance to dodge any attack.' },
  'Cold Reader': { good: true, text: 'Adapts to repeated enemy moves twice as fast.' },
  'Second Wind': { good: true, text: 'Regains extra stamina every action.' },
  'Short Fuse': { good: false, text: 'Taunts and provocations always land; accuracy drops when provoked.' },
  'Overthinker': { good: false, text: 'Acts slower during the opening turns.' },
  'Big Game Player': { good: true, text: '+8% damage in knockout matches and finals.' },
  'Steady Hands': { good: true, text: 'Damage variance is narrower and accuracy +3%.' },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function generateHidden(pc: PublicCharacter, gameSecret: number): HiddenProfile {
  const rng = new Rng(deriveSeed('hidden', gameSecret, pc.id));
  const base = ARCHETYPES[pc.archetype].base;
  const stats = {} as Stats;
  registerCharacterMoves(pc);
  const kit = LEGEND_KITS[pc.id] ?? (pc.customKit ? { ...pc.customKit, bias: {} } : undefined);
  // Built-in characters follow their canon sheet with only a small wobble per game;
  // everyone else is built from their fighter type with a wider spread.
  const canon = pc.canonStats ?? canonStats(pc.id);
  for (const k of STAT_KEYS) stats[k] = canon ? clamp(Math.round(canon[k] + rng.range(-5, 5)), 15, 99) : clamp(Math.round(base[k] + (kit?.bias[k] ?? 0) + rng.range(-14, 14)), 15, 99);

  // A single "profile twist" makes cheap-looking characters occasionally
  // excellent and intimidating ones occasionally fragile (never for canon sheets).
  const twist = canon ? 1 : rng.next();
  if (twist < 0.14) {
    // Hidden gem
    const k = rng.pick<StatKey>(['attack', 'speed', 'technique', 'battleIQ']);
    stats[k] = clamp(stats[k] + rng.int(12, 20), 15, 99);
    stats.potential = clamp(stats.potential + 15, 15, 99);
    stats.adaptability = clamp(stats.adaptability + 10, 15, 99);
  } else if (twist < 0.26) {
    // Fragile
    stats.stamina = clamp(stats.stamina - rng.int(14, 22), 15, 99);
    stats.defense = clamp(stats.defense - rng.int(6, 12), 15, 99);
  } else if (twist < 0.36) {
    // Powerhouse with poor control
    stats.attack = clamp(stats.attack + rng.int(8, 14), 15, 99);
    stats.battleIQ = clamp(stats.battleIQ - rng.int(10, 16), 15, 99);
  }

  const traitCount = rng.chance(0.35) ? 2 : 1;
  const traits = rng.shuffle(TRAITS).slice(0, traitCount);

  const candidates = ABILITY_IDS.filter((id) => !pc.knownAbilities.includes(id));
  const tagged = candidates.filter((id) => {
    const el = ABILITIES[id].element;
    return el && pc.tags.includes(el);
  });
  const pickedHidden = rng.pick(tagged.length ? tagged : candidates);
  const hiddenAbility = kit?.hidden ?? pickedHidden;

  const unlockPool = candidates.filter((id) => id !== hiddenAbility && (ABILITIES[id].kind === 'ultimate' || ABILITIES[id].power >= 2));
  const genericForm = rng.pick(['Ascendant', 'Awakened', 'Unbound', 'Zenith', 'Eclipse', 'Overdrive']) + ' ' + pc.name.split(' ')[0];
  const evo: EvolutionPath = {
    formName: kit?.form ?? genericForm,
    trigger: rng.pick(['xp', 'xp', 'survive_critical', 'rivalry_win']),
    threshold: rng.int(3, 5),
    statBoost: { attack: rng.int(4, 8), [rng.pick(['defense', 'speed', 'technique'] as StatKey[])]: rng.int(4, 8), potential: -5 },
    unlockAbility: kit?.ultimate ?? rng.pick(unlockPool.length ? unlockPool : candidates),
  };

  const allTags: Tag[] = ['FIRE', 'ICE', 'LIGHTNING', 'WATER', 'HOLY', 'DARK', 'SHADOW', 'EARTH', 'WIND', 'MAGIC'];
  const vulnerability = rng.chance(0.55) ? rng.pick(allTags.filter((t) => !pc.tags.includes(t))) : null;

  return { charId: pc.id, stats, traits, hiddenAbility, evolution: evo, vulnerability };
}

/** Composite "True Power" (0-100) shown only after reveal. */
export function truePower(stats: Stats): number {
  const w: Record<StatKey, number> = { attack: 1.3, defense: 1.1, speed: 1.1, technique: 1, battleIQ: 0.9, stamina: 1, adaptability: 0.6, luck: 0.4, potential: 0.3 };
  let sum = 0, tw = 0;
  for (const k of STAT_KEYS) { sum += stats[k] * w[k]; tw += w[k]; }
  return Math.round(sum / tw);
}

export const STAT_LABELS: Record<StatKey, string> = {
  attack: 'Attack', defense: 'Defense', speed: 'Speed', technique: 'Technique', battleIQ: 'Battle IQ',
  stamina: 'Stamina', adaptability: 'Adaptability', luck: 'Luck', potential: 'Potential',
};

/**
 * A coarse scouting hint about one hidden attribute. This is the only
 * permitted pre-purchase leak, and it costs the player a scout token.
 */
export function scoutHint(hidden: HiddenProfile, rngSeed: number): { text: string; stat: StatKey | 'trait'; signal: number } {
  const rng = new Rng(rngSeed);
  if (rng.chance(0.25)) {
    const t = rng.pick(hidden.traits);
    const good = TRAIT_INFO[t].good;
    return { stat: 'trait', signal: good ? 0.5 : -0.5, text: good ? 'Scouts report an unusual strength that has not shown up on paper.' : 'Scouts noticed a weakness this fighter tries to hide.' };
  }
  const k = rng.pick<StatKey>(['attack', 'defense', 'speed', 'stamina', 'technique', 'battleIQ', 'potential']);
  const v = hidden.stats[k];
  const band = v >= 78 ? 'exceptional' : v >= 64 ? 'above average' : v >= 48 ? 'about average' : 'below average';
  const signal = v >= 78 ? 1 : v >= 64 ? 0.5 : v >= 48 ? 0 : -0.8;
  return { stat: k, signal, text: `${STAT_LABELS[k]} looks ${band}.` };
}

// ------------------------------------------------------------------- Vault

/**
 * Holds hidden profiles for the active game, outside of the GameState object
 * that UI components receive. Persisted in an encoded form so hidden values
 * are not readable as plain text in browser storage. Local mode cannot be
 * cryptographically secure against someone with developer tools — see docs.
 */
export class Vault {
  private profiles = new Map<string, HiddenProfile>();

  constructor(private secret: number) {}

  ensure(pc: PublicCharacter): void {
    if (!this.profiles.has(pc.id)) this.profiles.set(pc.id, generateHidden(pc, this.secret));
  }

  /** Internal engine access only (combat, settlement, scouting hints). */
  get(charId: string): HiddenProfile {
    const p = this.profiles.get(charId);
    if (!p) throw new Error(`Vault has no profile for ${charId}`);
    return p;
  }

  has(charId: string): boolean {
    return this.profiles.has(charId);
  }

  ids(): string[] {
    return [...this.profiles.keys()];
  }

  encode(): string {
    const json = JSON.stringify([...this.profiles.values()]);
    const key = this.secret;
    let out = '';
    for (let i = 0; i < json.length; i++) {
      const c = json.charCodeAt(i) ^ ((key >>> ((i % 4) * 8)) & 0xff);
      out += String.fromCharCode(c);
    }
    return btoa(unescape(encodeURIComponent(out)));
  }

  static decode(secret: number, data: string): Vault {
    const v = new Vault(secret);
    if (!data) return v;
    const raw = decodeURIComponent(escape(atob(data)));
    let json = '';
    for (let i = 0; i < raw.length; i++) {
      json += String.fromCharCode(raw.charCodeAt(i) ^ ((secret >>> ((i % 4) * 8)) & 0xff));
    }
    const list = JSON.parse(json) as HiddenProfile[];
    if (!Array.isArray(list)) throw new Error('Invalid vault');
    for (const p of list) {
      if (!p || typeof p.charId !== 'string' || !p.stats) throw new Error('Invalid vault entry');
      v.profiles.set(p.charId, p);
    }
    return v;
  }
}
