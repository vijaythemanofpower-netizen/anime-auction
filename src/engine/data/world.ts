import type { Archetype, Synergy, Tag, Injury, StatKey } from '../types';

// Synergies need distinct team members for each requirement, so a single
// character with two tags does not unlock a pair synergy alone.
export const SYNERGIES: Synergy[] = [
  { id: 'dragonfire', name: 'Dragonfire Pact', description: 'FIRE abilities deal +15% damage.', hidden: false, requires: [{ tag: 'FIRE' }, { tag: 'DRAGON' }], effect: { elementDamage: { tag: 'FIRE', mult: 1.15 } } },
  { id: 'frozen_mind', name: 'Frozen Calculus', description: 'Cold logic: +6% crit chance for the team.', hidden: false, requires: [{ tag: 'ICE' }, { archetype: 'Strategist' }], effect: { critBonus: 0.06 } },
  { id: 'bulwark', name: 'Bulwark Bond', description: 'Team takes 8% less damage; healing +15%.', hidden: false, requires: [{ archetype: 'Tank' }, { archetype: 'Support' }], effect: { defenseMult: 1.08, healMult: 1.15 } },
  { id: 'infernal', name: 'Infernal Covenant', description: 'DARK abilities deal +15% damage.', hidden: false, requires: [{ tag: 'DEMON' }, { tag: 'DARK' }], effect: { elementDamage: { tag: 'DARK', mult: 1.15 } } },
  { id: 'heaven_storm', name: 'Heavenstorm', description: 'LIGHTNING abilities deal +18% damage.', hidden: true, requires: [{ tag: 'DIVINE' }, { tag: 'LIGHTNING' }], effect: { elementDamage: { tag: 'LIGHTNING', mult: 1.18 } } },
  { id: 'night_blades', name: 'Night Blades', description: 'Team speed +8% and crit +4%.', hidden: true, requires: [{ archetype: 'Assassin' }, { tag: 'SHADOW' }], effect: { speedMult: 1.08, critBonus: 0.04 } },
  { id: 'tidewind', name: 'Tide & Gale', description: 'Team regains +2 stamina each action.', hidden: true, requires: [{ tag: 'WATER' }, { tag: 'WIND' }], effect: { staminaRegen: 2 } },
  { id: 'spirit_host', name: 'Spirit Host', description: 'SPIRIT abilities deal +20% damage.', hidden: true, requires: [{ archetype: 'Summoner' }, { tag: 'SPIRIT' }], effect: { elementDamage: { tag: 'SPIRIT', mult: 1.2 } } },
  { id: 'vanguard', name: 'Vanguard Line', description: 'Two frontline warriors: team damage +6%.', hidden: false, requires: [{ tag: 'WARRIOR' }, { tag: 'WARRIOR' }], effect: { damageMult: 1.06 } },
  { id: 'arcane_circle', name: 'Arcane Circle', description: 'MAGIC abilities deal +12% damage, healing +10%.', hidden: false, requires: [{ archetype: 'Mage' }, { tag: 'MAGIC' }], effect: { elementDamage: { tag: 'MAGIC', mult: 1.12 }, healMult: 1.1 } },
  { id: 'warlords_gambit', name: 'Warlord\'s Gambit', description: 'A strategist directing a berserker: team damage +8%.', hidden: true, requires: [{ archetype: 'Strategist' }, { archetype: 'Berserker' }], effect: { damageMult: 1.08 } },
  { id: 'earth_shelter', name: 'Stonewatch', description: 'EARTH and HOLY together: team takes 6% less damage.', hidden: true, requires: [{ tag: 'EARTH' }, { tag: 'HOLY' }], effect: { defenseMult: 1.06 } },
];

export function getSynergy(id: string): Synergy | undefined {
  return SYNERGIES.find((s) => s.id === id);
}

interface Member { tags: Tag[]; archetype: Archetype }

/** Returns synergy ids active for a set of team members. */
export function activeSynergies(members: Member[]): string[] {
  const out: string[] = [];
  for (const syn of SYNERGIES) {
    if (members.length < syn.requires.length) continue;
    if (matchRequirements(syn.requires, members)) out.push(syn.id);
  }
  return out;
}

function matchRequirements(reqs: Synergy['requires'], members: Member[]): boolean {
  // Backtracking assignment of distinct members to requirements.
  const used = new Array(members.length).fill(false);
  const fits = (r: Synergy['requires'][number], m: Member) =>
    (!r.tag || m.tags.includes(r.tag)) && (!r.archetype || m.archetype === r.archetype);
  const go = (i: number): boolean => {
    if (i === reqs.length) return true;
    for (let j = 0; j < members.length; j++) {
      if (!used[j] && fits(reqs[i], members[j])) {
        used[j] = true;
        if (go(i + 1)) return true;
        used[j] = false;
      }
    }
    return false;
  };
  return go(0);
}

// --------------------------------------------------------------- Elements

/** Attacker element -> defender tags it is strong against. */
export const ELEMENT_ADVANTAGE: Partial<Record<Tag, Tag[]>> = {
  FIRE: ['ICE', 'WIND', 'SPIRIT'],
  WATER: ['FIRE', 'EARTH'],
  ICE: ['DRAGON', 'WIND', 'EARTH'],
  LIGHTNING: ['WATER', 'WIND'],
  EARTH: ['LIGHTNING', 'FIRE'],
  WIND: ['EARTH'],
  HOLY: ['DEMON', 'DARK', 'SHADOW'],
  DIVINE: ['DEMON', 'DARK'],
  DARK: ['SPIRIT', 'HOLY'],
  SHADOW: ['MAGIC', 'SPIRIT'],
  DEMON: ['DIVINE'],
  DRAGON: ['DRAGON', 'WARRIOR'],
  SPIRIT: ['MAGIC'],
  MAGIC: ['WARRIOR'],
};

export function elementMultiplier(element: Tag | undefined, defenderTags: Tag[], vulnerability: Tag | null): number {
  if (!element) return 1;
  let m = 1;
  if (ELEMENT_ADVANTAGE[element]?.some((t) => defenderTags.includes(t))) m *= 1.15;
  else if (defenderTags.some((t) => ELEMENT_ADVANTAGE[t]?.includes(element))) m *= 0.9;
  if (vulnerability === element) m *= 1.12;
  return m;
}

// ------------------------------------------------------------ Environments

export interface Environment {
  id: string;
  name: string;
  description: string;
  boost: Tag[];
  weaken: Tag[];
  speedMult: number;
  accuracyMod: number;
  staminaDrain: number;
  hazard: { name: string; chance: number; damagePct: number; spares: Tag[]; text: string } | null;
  palette: [string, string, string];
}

export const ENVIRONMENTS: Environment[] = [
  { id: 'volcano', name: 'Caldera of Embers', description: 'Fire is empowered; eruptions scorch anyone not attuned to flame.', boost: ['FIRE', 'DRAGON'], weaken: ['ICE'], speedMult: 1, accuracyMod: 0, staminaDrain: 1, hazard: { name: 'Eruption', chance: 0.18, damagePct: 0.035, spares: ['FIRE', 'DRAGON'], text: 'The caldera erupts' }, palette: ['#1a0905', '#5c1a0b', '#ff6a3d'] },
  { id: 'tundra', name: 'Shiverpeak Tundra', description: 'Ice is empowered and everyone moves slower.', boost: ['ICE', 'WATER'], weaken: ['FIRE'], speedMult: 0.92, accuracyMod: 0, staminaDrain: 0, hazard: { name: 'Blizzard', chance: 0.14, damagePct: 0.025, spares: ['ICE'], text: 'A blizzard howls across the field' }, palette: ['#06121c', '#173b54', '#bae6fd'] },
  { id: 'storm', name: 'Stormcrown Spire', description: 'Lightning and wind are empowered; stray bolts strike at random.', boost: ['LIGHTNING', 'WIND'], weaken: ['WATER'], speedMult: 1.04, accuracyMod: -0.02, staminaDrain: 0, hazard: { name: 'Stray Lightning', chance: 0.16, damagePct: 0.04, spares: ['LIGHTNING'], text: 'A stray bolt splits the sky' }, palette: ['#0b0a1e', '#26215c', '#facc15'] },
  { id: 'temple', name: 'Sanctum of the Ninth Bell', description: 'Holy, divine and magic arts resonate here.', boost: ['HOLY', 'DIVINE', 'MAGIC'], weaken: ['DEMON', 'DARK'], speedMult: 1, accuracyMod: 0.02, staminaDrain: 0, hazard: null, palette: ['#120f08', '#3d3013', '#fde68a'] },
  { id: 'rooftops', name: 'Neon Rooftops', description: 'Fast, open terrain that favours speed and ranged fighters.', boost: ['WIND', 'LIGHTNING'], weaken: [], speedMult: 1.08, accuracyMod: 0, staminaDrain: 0, hazard: null, palette: ['#07071a', '#1e1b4b', '#22d3ee'] },
  { id: 'forest', name: 'Hollowmoon Forest', description: 'Shadows deepen; accuracy suffers and assassins thrive.', boost: ['SHADOW', 'DARK', 'SPIRIT'], weaken: ['HOLY'], speedMult: 1, accuracyMod: -0.05, staminaDrain: 0, hazard: null, palette: ['#050d0a', '#14302a', '#a855f7'] },
  { id: 'ocean', name: 'Tidegate Colosseum', description: 'A flooded arena; water and ice arts surge.', boost: ['WATER', 'ICE'], weaken: ['FIRE', 'LIGHTNING'], speedMult: 0.96, accuracyMod: 0, staminaDrain: 0, hazard: { name: 'Riptide', chance: 0.12, damagePct: 0.025, spares: ['WATER'], text: 'A riptide surges through the arena' }, palette: ['#04101c', '#0c3352', '#38bdf8'] },
  { id: 'desert', name: 'Sunscorch Dunes', description: 'A blazing sea of sand: fire and earth thrive, water and ice wither, and the heat wears everyone down.', boost: ['FIRE', 'EARTH', 'WIND'], weaken: ['WATER', 'ICE'], speedMult: 0.97, accuracyMod: -0.01, staminaDrain: 1, hazard: { name: 'Sandstorm', chance: 0.14, damagePct: 0.025, spares: ['EARTH', 'WIND'], text: 'A wall of sand roars across the dunes' }, palette: ['#1f1305', '#7c4a12', '#fbbf24'] },
  { id: 'ruins', name: 'Shattered Capital', description: 'A fallen city where darkness gathers; holy arts falter and the ruins can come down on anyone.', boost: ['DARK', 'SHADOW', 'DEMON'], weaken: ['HOLY'], speedMult: 1, accuracyMod: -0.02, staminaDrain: 0, hazard: { name: 'Collapse', chance: 0.12, damagePct: 0.035, spares: ['SHADOW'], text: 'A ruined tower gives way' }, palette: ['#0d0b10', '#3b2f3a', '#f87171'] },
  { id: 'colosseum', name: 'Grand Arena Prime', description: 'A neutral stage. No tricks, only skill.', boost: [], weaken: [], speedMult: 1, accuracyMod: 0.02, staminaDrain: 0, hazard: null, palette: ['#0c0a14', '#2a2140', '#a78bfa'] },
];

export function getEnvironment(id: string): Environment {
  return ENVIRONMENTS.find((e) => e.id === id) ?? ENVIRONMENTS[ENVIRONMENTS.length - 1];
}

// ----------------------------------------------------------------- Injuries

export const INJURY_TABLE: Array<Omit<Injury, 'id' | 'matchesRemaining'> & { duration: number }> = [
  { name: 'Fractured Arm', stat: 'attack', penalty: 0.12, duration: 2 },
  { name: 'Sprained Ankle', stat: 'speed', penalty: 0.15, duration: 2 },
  { name: 'Concussion', stat: 'battleIQ', penalty: 0.15, duration: 1 },
  { name: 'Cracked Ribs', stat: 'defense', penalty: 0.12, duration: 2 },
  { name: 'Torn Muscle', stat: 'stamina', penalty: 0.15, duration: 1 },
  { name: 'Blurred Vision', stat: 'technique', penalty: 0.12, duration: 1 },
];

export const TRAINABLE: StatKey[] = ['attack', 'defense', 'speed', 'technique', 'battleIQ', 'stamina'];
