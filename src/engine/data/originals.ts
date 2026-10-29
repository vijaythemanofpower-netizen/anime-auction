// Original characters created for this game. These are not from any real
// anime; the series titles are fictional and all artwork is procedurally
// drawn by the game.
import type { Archetype, PublicCharacter, Tag, Temperament } from '../types';
import { SCHEMA_VERSION } from '../types';
import { ARCHETYPES } from './archetypes';
import { hashString } from '../rng';

export interface OriginalSeries {
  id: string;
  title: string;
  synopsis: string;
  hue: number;
}

export const ORIGINAL_SERIES: OriginalSeries[] = [
  { id: 'crimson-meridian', title: 'Crimson Meridian', synopsis: 'Dragon-riders and fire-sworn knights fight over the last ember of a dying sun.', hue: 12 },
  { id: 'hollowmoon-requiem', title: 'Hollowmoon Requiem', synopsis: 'A city where shadows have contracts and demons collect on them.', hue: 280 },
  { id: 'stormcrown-academy', title: 'Stormcrown Academy', synopsis: 'Students of a floating academy duel with lightning, wind and raw arcana.', hue: 48 },
  { id: 'frostbound-covenant', title: 'Frostbound Covenant', synopsis: 'Ice wardens guard a frozen sea that hides a sleeping god.', hue: 196 },
  { id: 'ninth-bell', title: 'Order of the Ninth Bell', synopsis: 'Holy knights ring the final bell against an endless night.', hue: 44 },
  { id: 'iron-lotus', title: 'Iron Lotus Chronicle', synopsis: 'Martial schools compete in a tournament that decides who rules the valley.', hue: 24 },
  { id: 'spirit-lantern', title: 'Spirit Lantern Festival', synopsis: 'On the night of lanterns, summoners bargain with the spirits of the river.', hue: 250 },
  { id: 'neon-ronin', title: 'Neon Ronin 2099', synopsis: 'Cybernetic ronin duel for contracts across a rain-soaked megacity.', hue: 186 },
];

type Row = [
  name: string, series: string, archetype: Archetype, temperament: Temperament, tags: Tag[],
  weapon: string, specialty: string, style: string, bio: string, aliases: string[], known: [string, string],
];

const ROWS: Row[] = [
  // Crimson Meridian
  ['Kaien Ashborne', 'crimson-meridian', 'Berserker', 'hot-blooded', ['FIRE', 'WARRIOR'], 'Greatsword "Cinderfall"', 'Overwhelming melee pressure', 'Reckless two-handed sword', 'A foundling raised in a forge who swings a sword taller than himself.', ['The Cinder Brute'], ['ember_lance', 'rampage']],
  ['Seraphine Vell', 'crimson-meridian', 'Mage', 'arrogant', ['FIRE', 'MAGIC'], 'Sunstone staff', 'Area flame magic', 'Long-range pyromancy', 'Court pyromancer who believes no flame burns brighter than hers.', ['Lady Sunflare'], ['inferno_burst', 'arcane_missiles']],
  ['Drakon Mire', 'crimson-meridian', 'Tank', 'stoic', ['DRAGON', 'EARTH'], 'Dragon-scale tower shield', 'Holding the line', 'Shield wall and shoulder charges', 'A dragon-blooded sentinel whose skin is half scale.', ['The Scale Wall'], ['stone_bulwark', 'dragon_roar']],
  ['Ilya Redwing', 'crimson-meridian', 'Ranger', 'cheerful', ['DRAGON', 'WIND'], 'Wyrmbone longbow', 'Aerial archery', 'Shoots from dragonback', 'The youngest wyvern rider in a century, and the loudest.', ['Redwing'], ['piercing_arrow', 'gale_cutter']],
  ['Mother Cindra', 'crimson-meridian', 'Support', 'patient', ['FIRE', 'HOLY'], 'Censer of embers', 'Healing through flame', 'Restorative fire rites', 'A temple elder who tends the eternal flame and its wounded knights.', ['Keeper of Embers'], ['blessing', 'phoenix_rite']],
  // Hollowmoon Requiem
  ['Noct Valemir', 'hollowmoon-requiem', 'Assassin', 'calculating', ['SHADOW', 'DARK'], 'Twin umbral daggers', 'Backline eliminations', 'Shadow-step ambushes', 'Collects debts for the Moon Syndicate and has never missed a deadline.', ['The Debt Collector'], ['shadow_fang', 'umbral_veil']],
  ['Lilith Morrow', 'hollowmoon-requiem', 'Summoner', 'arrogant', ['DEMON', 'SPIRIT'], 'Contract grimoire', 'Demon summoning', 'Binds lesser demons to fight', 'Signed a pact at age nine and has been renegotiating ever since.', ['Contract Witch'], ['spirit_wolves', 'demon_pact']],
  ['Graves Thorne', 'hollowmoon-requiem', 'Berserker', 'reckless', ['DEMON', 'DARK'], 'Chain scythe', 'Sustained carnage', 'Wild chain-scythe sweeps', 'A man who sold half his soul and is trying to spend the rest quickly.', ['Halfsoul'], ['abyss_rend', 'rampage']],
  ['Sister Vesper', 'hollowmoon-requiem', 'Controller', 'stoic', ['DARK', 'MAGIC'], 'Bell of silence', 'Crowd control', 'Hexes and binding chants', 'A nun of an order nobody else remembers.', ['The Silent Bell'], ['hex_bind', 'nightfall']],
  ['Pip Lanternjack', 'hollowmoon-requiem', 'Duelist', 'cheerful', ['SHADOW', 'WARRIOR'], 'Lantern-hilted rapier', 'Fencing and footwork', 'Showman fencing', 'A street performer whose act includes beating the audience.', ['Lanternjack'], ['riposte_stance', 'shadow_fang']],
  // Stormcrown Academy
  ['Rei Kasumi', 'stormcrown-academy', 'Duelist', 'analytical', ['LIGHTNING', 'WARRIOR'], 'Thunder katana', 'Lightning-speed duels', 'Iaido with a crackling blade', 'Top of her class, and she keeps notes on everyone below it.', ['Class Rep'], ['volt_step', 'iaido_flash']],
  ['Professor Halden Quill', 'stormcrown-academy', 'Strategist', 'calculating', ['MAGIC', 'WIND'], 'Floating quills', 'Battlefield analysis', 'Predictive spellcraft', 'A professor who grades every battle and has never given an A.', ['The Examiner'], ['tactical_read', 'gambit']],
  ['Zeph Arroway', 'stormcrown-academy', 'Ranger', 'reckless', ['WIND', 'LIGHTNING'], 'Storm crossbow', 'Rapid ranged volleys', 'Skirmishing on gusts', 'Expelled twice, readmitted twice, ranked third.', ['Gustbolt'], ['rain_of_arrows', 'volt_step']],
  ['Mina Starling', 'stormcrown-academy', 'Mage', 'cheerful', ['LIGHTNING', 'MAGIC'], 'Prism wand', 'Spell barrages', 'Rapid-fire arcana', 'A first-year who casts spells faster than she can pronounce them.', ['Prism Girl'], ['arcane_missiles', 'storm_chain']],
  ['Brann Coilheart', 'stormcrown-academy', 'Tank', 'defensive', ['LIGHTNING', 'EARTH'], 'Grounding gauntlets', 'Absorbing lightning', 'Grapples and grounding', 'The academy groundskeeper who keeps students from frying themselves.', ['Old Coil'], ['iron_fortress', 'quake_hammer']],
  // Frostbound Covenant
  ['Yuki Harrowmere', 'frostbound-covenant', 'Controller', 'patient', ['ICE', 'WATER'], 'Glacier fan', 'Freezing and stunning', 'Elegant ice dance', 'A warden who has stood watch on the frozen sea for thirty winters.', ['Winter Warden'], ['glacial_prison', 'frost_needle']],
  ['Kael Frostmarrow', 'frostbound-covenant', 'Duelist', 'stoic', ['ICE', 'WARRIOR'], 'Rime greatblade', 'Precise counters', 'Cold, minimal swordplay', 'Speaks once a day and has won every duel since he stopped talking.', ['The Quiet Edge'], ['iaido_flash', 'frost_needle']],
  ['Marisol Tidewell', 'frostbound-covenant', 'Support', 'cheerful', ['WATER', 'SPIRIT'], 'Coral chime', 'Group healing', 'Rain and song', 'A fisher-priestess whose songs make the tide listen.', ['Tide Singer'], ['healing_rain', 'tidal_spear']],
  ['Hrolf Icebeard', 'frostbound-covenant', 'Berserker', 'aggressive', ['ICE', 'WARRIOR'], 'Frozen war axe', 'Shattering blows', 'Axe frenzy', 'A raider who fell through the ice and climbed back out angrier.', ['The Unthawed'], ['rampage', 'frost_needle']],
  ['Selka Rime', 'frostbound-covenant', 'Assassin', 'calculating', ['ICE', 'SHADOW'], 'Icicle stilettos', 'Silent eliminations', 'Whiteout infiltration', 'Nobody sees Selka arrive; they only notice the frost.', ['Whiteout'], ['frost_needle', 'smoke_bomb']],
  // Ninth Bell
  ['Sir Aldric Dawnhallow', 'ninth-bell', 'Tank', 'stoic', ['HOLY', 'WARRIOR'], 'Bell-shield and mace', 'Protecting allies', 'Unyielding guard', 'The last knight to have rung the ninth bell and lived.', ['The Bellwarden'], ['guardian_oath', 'sacred_blade']],
  ['Celestine Ora', 'ninth-bell', 'Support', 'patient', ['DIVINE', 'HOLY'], 'Halo staff', 'Shields and healing', 'Radiant wards', 'A saint-in-training who is extremely tired of being called a saint.', ['Little Halo'], ['divine_aegis', 'blessing']],
  ['Gideon Lux', 'ninth-bell', 'Duelist', 'arrogant', ['DIVINE', 'LIGHTNING'], 'Judgment spear', 'Decisive strikes', 'Lightning-fast spear thrusts', 'Champion of the Order who thinks humility is for runners-up.', ['Spear of Dawn'], ['volt_step', 'sacred_blade']],
  ['Abbess Marrow', 'ninth-bell', 'Strategist', 'calculating', ['HOLY', 'MAGIC'], 'Abacus of prayers', 'Coordinating the order', 'Commands from the rear', 'Runs the Order\'s war council and its accounts with equal severity.', ['The Ledger'], ['tactical_read', 'mirror_ward']],
  ['Theo Brightwick', 'ninth-bell', 'Ranger', 'cheerful', ['HOLY', 'WIND'], 'Candle-arrow bow', 'Purifying arrows', 'Mobile archery', 'A novice who lights his arrows from the chapel candles. He was asked to stop.', ['Wick'], ['piercing_arrow', 'sacred_blade']],
  // Iron Lotus
  ['Master Shen Ivo', 'iron-lotus', 'Duelist', 'patient', ['WARRIOR', 'EARTH'], 'Bare hands', 'Counter-fighting', 'Iron Lotus palm', 'Founder of the Iron Lotus school; older than he looks, faster than he should be.', ['Old Lotus'], ['riposte_stance', 'quake_hammer']],
  ['Ryo Takane', 'iron-lotus', 'Berserker', 'hot-blooded', ['WARRIOR', 'FIRE'], 'Burning gauntlets', 'Explosive combos', 'Brawling with fire fists', 'A hothead who challenges every school in the valley before breakfast.', ['Fist of the Morning'], ['rampage', 'ember_lance']],
  ['Lin Mei', 'iron-lotus', 'Assassin', 'analytical', ['WARRIOR', 'WIND'], 'Steel fans', 'Pressure-point strikes', 'Wind-step fan dance', 'Studied every style in the valley so she could defeat them all.', ['The Silk Wind'], ['gale_cutter', 'assassinate']],
  ['Big Bao', 'iron-lotus', 'Tank', 'cheerful', ['EARTH', 'WARRIOR'], 'Iron cauldron', 'Endurance', 'Belly-and-cauldron defense', 'The school cook, who learned to block because students kept throwing food.', ['The Cauldron'], ['iron_fortress', 'stone_bulwark']],
  ['Grandmother Ume', 'iron-lotus', 'Controller', 'stoic', ['EARTH', 'SPIRIT'], 'Walking cane', 'Disabling opponents', 'Joint locks and sweeps', 'Nobody knows which school she belongs to. Every school is afraid of her.', ['The Cane'], ['hex_bind', 'quake_hammer']],
  // Spirit Lantern
  ['Hotaru Sen', 'spirit-lantern', 'Summoner', 'patient', ['SPIRIT', 'WATER'], 'Paper lanterns', 'Spirit companions', 'Lantern spirit swarms', 'A lantern-maker whose lanterns occasionally refuse to stay lanterns.', ['Lanternkeeper'], ['spirit_wolves', 'astral_golem']],
  ['Okuro the Fox', 'spirit-lantern', 'Assassin', 'reckless', ['SPIRIT', 'SHADOW'], 'Foxfire claws', 'Tricks and ambushes', 'Illusion strikes', 'A nine-tailed trickster who has lost seven tails in bets.', ['Two-Tail'], ['shadow_fang', 'smoke_bomb']],
  ['Aiko Riverbell', 'spirit-lantern', 'Support', 'cheerful', ['SPIRIT', 'HOLY'], 'River bells', 'Spirit blessing', 'Festival dances', 'Shrine maiden who blesses the festival and secretly runs the betting pool.', ['Riverbell'], ['blessing', 'war_cry']],
  ['The Paper Shogun', 'spirit-lantern', 'Strategist', 'arrogant', ['SPIRIT', 'MAGIC'], 'Origami army', 'Commanding constructs', 'Folds paper soldiers', 'A spirit general made entirely of folded paper and grievances.', ['Lord Origami'], ['astral_golem', 'gambit']],
  ['Kuro Mizuchi', 'spirit-lantern', 'Mage', 'stoic', ['WATER', 'DRAGON'], 'River-dragon pearl', 'Water dragon magic', 'Summoned tides', 'A river dragon wearing a human shape for the festival.', ['The River Pearl'], ['tidal_spear', 'wyrm_breath']],
  // Neon Ronin
  ['Jin-09', 'neon-ronin', 'Duelist', 'stoic', ['LIGHTNING', 'WARRIOR'], 'Plasma katana', 'Contract duels', 'Cybernetic iaido', 'A ronin android who still keeps a code nobody programmed into him.', ['Unit Nine'], ['iaido_flash', 'volt_step']],
  ['Vex Halcyon', 'neon-ronin', 'Ranger', 'aggressive', ['LIGHTNING', 'SHADOW'], 'Railgun', 'Long-range elimination', 'Rooftop sniping', 'A bounty hunter who charges by the rooftop.', ['Halo-Shot'], ['piercing_arrow', 'thunder_judgment']],
  ['Nyx Datawraith', 'neon-ronin', 'Controller', 'analytical', ['SHADOW', 'MAGIC'], 'Drone swarm', 'System hacking', 'Remote disruption', 'A hacker who exists mostly as a rumour and a rising bill.', ['Wraith'], ['hex_bind', 'tactical_read']],
  ['Moto Rampart', 'neon-ronin', 'Tank', 'defensive', ['EARTH', 'LIGHTNING'], 'Riot hardlight shield', 'Shielding the crew', 'Hardlight barriers', 'An ex-riot officer who now protects the people he once arrested.', ['Rampart'], ['iron_fortress', 'guardian_oath']],
  ['Saki Overdrive', 'neon-ronin', 'Berserker', 'reckless', ['LIGHTNING', 'FIRE'], 'Overclocked chainblade', 'Overclocked offense', 'Burns her own circuits for power', 'Runs her implants at 300% and her mouth at 400%.', ['Redline'], ['rampage', 'volt_step']],
];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const ORIGINAL_CHARACTERS: PublicCharacter[] = ROWS.map((r) => {
  const [name, seriesId, archetype, temperament, tags, weapon, specialty, style, bio, aliases, known] = r;
  const series = ORIGINAL_SERIES.find((s) => s.id === seriesId)!;
  const h = hashString(name);
  return {
    id: `orig:${slug(name)}`,
    schemaVersion: SCHEMA_VERSION,
    source: 'original',
    name,
    aliases,
    series: series.title,
    seriesId,
    bio,
    specialty,
    fightingStyle: style,
    weapon,
    temperament,
    archetype,
    reach: ARCHETYPES[archetype].reach,
    tags,
    knownAbilities: known,
    verifiedFields: [],
    art: { hue: (series.hue + (h % 40) - 20 + 360) % 360, hue2: (h >>> 8) % 360, hair: (h >>> 16) % 6, eye: (h >>> 20) % 4 },
  };
});
