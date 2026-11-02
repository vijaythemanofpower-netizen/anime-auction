// Auction sets and team healers. Every character belongs to one role set, decided from
// public information only (fighter type, known moves, canon healers), so the auction can
// present the pool set by set without revealing anything hidden. Healers matter in team
// fights: medics patch teammates up and treat their wounds; revivers can also bring a
// fallen teammate back, but only characters who can do that in their own story.
import type { Archetype, PublicCharacter } from '../types';
import { ABILITIES } from './abilities';
import { LEGEND_MOVESETS } from './legendMoves';

export type RoleId = 'vanguard' | 'berserker' | 'blade' | 'caster' | 'tactician' | 'healer';

export const ROLES: Record<RoleId, { name: string; icon: string; blurb: string }> = {
  vanguard: { name: 'Vanguard', icon: '🛡', blurb: 'Tanks who hold the front and soak the hits.' },
  berserker: { name: 'Berserkers', icon: '🔥', blurb: 'Raw power that gets scarier as the fight gets bloody.' },
  blade: { name: 'Blades', icon: '⚔', blurb: 'Duelists and assassins: precise, fast, deadly one-on-one.' },
  caster: { name: 'Casters', icon: '✨', blurb: 'Mages, rangers and summoners who hit from range.' },
  tactician: { name: 'Tacticians', icon: '🧠', blurb: 'Strategists and controllers who decide fights with their heads.' },
  healer: { name: 'Healers', icon: '💚', blurb: 'They keep a team standing: they heal wounds, and some can bring the fallen back.' },
};

/** All the sets (the auction shuffles their order every game; healers never come last). */
export const ROLE_ORDER: RoleId[] = ['vanguard', 'berserker', 'healer', 'blade', 'caster', 'tactician'];

const BY_TYPE: Record<Archetype, RoleId> = {
  Tank: 'vanguard', Berserker: 'berserker', Duelist: 'blade', Assassin: 'blade', Mage: 'caster', Ranger: 'caster', Summoner: 'caster',
  Strategist: 'tactician', Controller: 'tactician', Support: 'healer',
};

const norm = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/ou/g, 'o').replace(/uu/g, 'u').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

/** Characters who heal others in their own story (by built-in key, or by name for everyone else). */
const MEDICS = new Set(['shinobu', 'yuta', 'kurapika', 'rimuru', ...[
  'Orihime Inoue', 'Sakura Haruno', 'Tsunade', 'Tony Tony Chopper', 'Shouko Ieiri', 'Chiyo', 'Kabuto Yakushi', 'Isane Kotetsu',
  'Retsu Unohana', 'Asia Argento', 'Aqua', 'Rem', 'Emilia', 'Shizune', 'Ino Yamanaka', 'Chiyo Shuzenji', 'Eri', 'Raphtalia',
].map(norm)]);

/** Of those, the ones who can bring someone back from the brink (once per fight). */
const REVIVERS = new Set(['rimuru', ...['Orihime Inoue', 'Chiyo', 'Aqua', 'Retsu Unohana', 'Eri', 'Kabuto Yakushi'].map(norm)]);

interface Who { id?: string; charId?: string; name: string; archetype: Archetype; abilities?: string[]; knownAbilities?: string[] }

const keyOf = (c: Who) => {
  const id = c.id ?? c.charId ?? '';
  return id.startsWith('legend:') ? id.slice(7).split('#')[0] : '';
};
const allyHeal = (ids: string[]) => ids.some((id) => { const a = ABILITIES[id]; return a?.kind === 'heal' && (a.target === 'ally' || a.target === 'all_allies' || a.target === 'lowest_ally'); });

/** Medic (patches teammates up, treats wounds), reviver (also revives once), or neither. */
export function healerKind(c: Who): 'reviver' | 'medic' | null {
  const key = keyOf(c);
  const n = norm(c.name);
  if ((key && REVIVERS.has(key)) || REVIVERS.has(n)) return 'reviver';
  const moves = [...(c.abilities ?? []), ...(c.knownAbilities ?? []), ...(key ? (LEGEND_MOVESETS[key] ?? []).map((m) => m.id) : [])];
  if (c.archetype === 'Support' || (key && MEDICS.has(key)) || MEDICS.has(n) || allyHeal(moves)) return 'medic';
  return null;
}

/** Which auction set a character goes in. Healers go in the healer set whatever their fighter type. */
export function roleOf(c: PublicCharacter): RoleId {
  return healerKind(c) ? 'healer' : BY_TYPE[c.archetype] ?? 'blade';
}
