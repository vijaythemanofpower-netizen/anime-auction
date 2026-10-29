import type { Ability, AbilityKind, AbilityTarget, AbilityTrigger, StatusApply, Tag, VfxKind } from '../types';
import { LEGEND_MOVES } from './legendMoves';

type FxStyle = Ability['fx']['style'];

function ab(
  id: string, name: string, kind: AbilityKind, target: AbilityTarget, cost: number, cooldown: number, power: number,
  description: string, shout: string, color: string, style: FxStyle,
  extra: { element?: Tag; trigger?: AbilityTrigger; status?: StatusApply; piercing?: boolean } = {},
): Ability {
  return { id, name, kind, target, cost, cooldown, power, description, shout, fx: { color, style }, trigger: extra.trigger ?? 'always', element: extra.element, status: extra.status, piercing: extra.piercing };
}

const st = (type: StatusApply['type'], chance: number, duration: number, magnitude: number): StatusApply => ({ type, chance, duration, magnitude });

const LIST: Ability[] = [
  // Fire
  ab('ember_lance', 'Ember Lance', 'attack', 'enemy', 16, 2, 1.55, 'A spear of compressed flame that may ignite the target.', 'Burn through!', '#ff6a3d', 'beam', { element: 'FIRE', status: st('burn', 0.45, 3, 0.04) }),
  ab('inferno_burst', 'Inferno Burst', 'aoe', 'all_enemies', 30, 4, 1.15, 'Detonates a ring of fire around every enemy.', 'INFERNO BURST!', '#ff4d2e', 'burst', { element: 'FIRE', status: st('burn', 0.35, 2, 0.035) }),
  ab('phoenix_rite', 'Phoenix Rite', 'heal', 'self', 28, 6, 0.32, 'Rises from embers, restoring a large share of health once low.', 'From the ashes!', '#ffb347', 'glow', { element: 'FIRE', trigger: 'hp_below_30' }),
  // Ice
  ab('frost_needle', 'Frost Needle', 'attack', 'enemy', 14, 2, 1.35, 'A precise shard that can freeze the target in place.', 'Hold still.', '#7dd3fc', 'beam', { element: 'ICE', status: st('freeze', 0.3, 1, 0) }),
  ab('glacial_prison', 'Glacial Prison', 'debuff', 'enemy', 26, 4, 0.7, 'Encases a foe in ice, stunning them.', 'Glacial Prison!', '#bae6fd', 'wave', { element: 'ICE', status: st('stun', 0.75, 1, 0) }),
  ab('absolute_zero', 'Absolute Zero', 'ultimate', 'all_enemies', 42, 7, 1.6, 'A desperate whiteout that drains every enemy.', 'ABSOLUTE ZERO!', '#e0f2fe', 'wave', { element: 'ICE', trigger: 'hp_below_50', status: st('weaken', 0.5, 2, 0.15) }),
  // Lightning
  ab('volt_step', 'Volt Step', 'attack', 'enemy', 15, 2, 1.4, 'A lightning-speed strike that grants haste.', 'Too slow!', '#facc15', 'slash', { element: 'LIGHTNING', status: st('haste', 0.6, 2, 0.25) }),
  ab('thunder_judgment', 'Thunder Judgment', 'attack', 'enemy', 32, 4, 2.3, 'Calls down a pillar of lightning.', 'THUNDER JUDGMENT!', '#fde047', 'beam', { element: 'LIGHTNING', status: st('stun', 0.25, 1, 0), piercing: true }),
  ab('storm_chain', 'Storm Chain', 'aoe', 'all_enemies', 28, 4, 1.05, 'Lightning arcs between every enemy.', 'Chain them all!', '#fbbf24', 'beam', { element: 'LIGHTNING' }),
  // Dark / Shadow / Demon
  ab('shadow_fang', 'Shadow Fang', 'attack', 'enemy', 14, 2, 1.5, 'Emerges from the target\'s shadow; causes bleeding.', 'Behind you.', '#a855f7', 'slash', { element: 'SHADOW', status: st('bleed', 0.5, 3, 0.035), piercing: true }),
  ab('umbral_veil', 'Umbral Veil', 'buff', 'self', 18, 4, 0, 'Wraps in darkness, gaining focus for a lethal strike.', 'Fade away...', '#6d28d9', 'glow', { element: 'SHADOW', status: st('focus', 1, 2, 0.25) }),
  ab('demon_pact', 'Demon Pact', 'buff', 'self', 20, 5, 0, 'Trades vitality for overwhelming strength.', 'Take it all!', '#be123c', 'glow', { element: 'DEMON', status: st('focus', 1, 3, 0.35) }),
  ab('abyss_rend', 'Abyss Rend', 'attack', 'enemy', 30, 4, 2.2, 'A tearing blow from the abyss.', 'ABYSS REND!', '#9f1239', 'slash', { element: 'DARK', status: st('weaken', 0.4, 2, 0.15) }),
  ab('nightfall', 'Nightfall', 'aoe', 'all_enemies', 32, 5, 1.1, 'Plunges the arena into darkness, weakening enemies.', 'Let the night fall.', '#4c1d95', 'wave', { element: 'DARK', status: st('weaken', 0.45, 2, 0.12) }),
  // Holy / Divine
  ab('sacred_blade', 'Sacred Blade', 'attack', 'enemy', 16, 2, 1.5, 'A radiant cut, extra effective on the wicked.', 'By the light!', '#fef3c7', 'slash', { element: 'HOLY' }),
  ab('divine_aegis', 'Divine Aegis', 'shield', 'all_allies', 26, 5, 0.12, 'Shields the whole team with light.', 'None shall fall!', '#fde68a', 'shield', { element: 'DIVINE' }),
  ab('heavens_verdict', 'Heaven\'s Verdict', 'ultimate', 'enemy', 40, 6, 2.8, 'Judgment from above, used when the end is near.', 'HEAVEN\'S VERDICT!', '#fff7d6', 'beam', { element: 'DIVINE', trigger: 'hp_below_50', piercing: true }),
  ab('blessing', 'Blessing', 'heal', 'lowest_ally', 20, 3, 0.22, 'Restores the most wounded ally.', 'Stay with me!', '#fef9c3', 'glow', { element: 'HOLY' }),
  // Wind
  ab('gale_cutter', 'Gale Cutter', 'attack', 'enemy', 13, 1, 1.25, 'A blade of wind; cheap and quick.', 'Cut!', '#a7f3d0', 'slash', { element: 'WIND' }),
  ab('tempest_dance', 'Tempest Dance', 'aoe', 'all_enemies', 26, 4, 0.95, 'A whirlwind that buffets every foe.', 'Dance, tempest!', '#6ee7b7', 'wave', { element: 'WIND', status: st('haste', 0.5, 2, 0.2) }),
  // Earth
  ab('stone_bulwark', 'Stone Bulwark', 'shield', 'self', 16, 3, 0.2, 'Raises a wall of stone.', 'Unbreakable!', '#d6a77a', 'shield', { element: 'EARTH' }),
  ab('quake_hammer', 'Quake Hammer', 'attack', 'enemy', 24, 3, 1.9, 'A ground-splitting hammer blow that can stun.', 'QUAKE!', '#b45309', 'burst', { element: 'EARTH', status: st('stun', 0.3, 1, 0) }),
  // Water
  ab('tidal_spear', 'Tidal Spear', 'attack', 'enemy', 15, 2, 1.45, 'A pressurised water lance.', 'Flow!', '#38bdf8', 'beam', { element: 'WATER' }),
  ab('healing_rain', 'Healing Rain', 'heal', 'all_allies', 28, 5, 0.14, 'Gentle rain that heals every ally over time.', 'Rest a moment.', '#7dd3fc', 'wave', { element: 'WATER', status: st('regen', 1, 3, 0.04) }),
  // Dragon
  ab('dragon_roar', 'Dragon Roar', 'debuff', 'all_enemies', 22, 4, 0.5, 'A roar that weakens every enemy.', 'ROOOAR!', '#f97316', 'wave', { element: 'DRAGON', status: st('weaken', 0.6, 2, 0.15) }),
  ab('wyrm_breath', 'Wyrm Breath', 'aoe', 'all_enemies', 34, 5, 1.3, 'Ancient dragonfire washes over the enemy team.', 'WYRM BREATH!', '#ea580c', 'beam', { element: 'DRAGON', status: st('burn', 0.4, 2, 0.04) }),
  // Spirit / Magic / Summon
  ab('spirit_wolves', 'Spirit Wolves', 'summon', 'enemy', 22, 3, 1.6, 'Summons spectral wolves that maul the target.', 'Go, my pack!', '#c4b5fd', 'burst', { element: 'SPIRIT', status: st('bleed', 0.4, 2, 0.03) }),
  ab('astral_golem', 'Astral Golem', 'summon', 'all_enemies', 34, 5, 1.2, 'A golem of starlight crashes into every enemy.', 'Rise, guardian!', '#a5b4fc', 'burst', { element: 'SPIRIT' }),
  ab('arcane_missiles', 'Arcane Missiles', 'attack', 'enemy', 18, 2, 1.65, 'Homing bolts of raw mana.', 'Arcane barrage!', '#818cf8', 'beam', { element: 'MAGIC', piercing: true }),
  ab('mana_burst', 'Mana Burst', 'aoe', 'all_enemies', 30, 4, 1.15, 'Releases a shockwave of stored mana.', 'Overload!', '#6366f1', 'burst', { element: 'MAGIC' }),
  ab('hex_bind', 'Hex Bind', 'debuff', 'enemy', 20, 3, 0.4, 'Binds the target with a hex, stunning them.', 'Bound.', '#c026d3', 'wave', { element: 'MAGIC', status: st('stun', 0.6, 1, 0) }),
  // Martial / generic
  ab('iaido_flash', 'Iaido Flash', 'attack', 'enemy', 18, 3, 2.0, 'A single draw-cut of absolute precision.', 'Iaido... flash.', '#e2e8f0', 'slash', { element: 'WARRIOR' }),
  ab('riposte_stance', 'Riposte Stance', 'buff', 'self', 12, 3, 0, 'Prepares to punish the next attack.', 'Come at me.', '#cbd5e1', 'shield', { element: 'WARRIOR', status: st('focus', 1, 2, 0.15) }),
  ab('rampage', 'Rampage', 'attack', 'enemy', 22, 3, 1.9, 'A frenzied series of blows, stronger when wounded.', 'RAAAGH!', '#ef4444', 'burst', { element: 'WARRIOR' }),
  ab('blood_frenzy', 'Blood Frenzy', 'ultimate', 'enemy', 34, 6, 2.7, 'A desperate all-out assault.', 'I\'M NOT DONE YET!', '#dc2626', 'burst', { element: 'WARRIOR', trigger: 'hp_below_30' }),
  ab('piercing_arrow', 'Piercing Arrow', 'attack', 'enemy', 14, 2, 1.45, 'An arrow that slips past the frontline.', 'Mark.', '#86efac', 'beam', { piercing: true }),
  ab('rain_of_arrows', 'Rain of Arrows', 'aoe', 'all_enemies', 28, 4, 1.0, 'Arrows blot out the sky.', 'Loose!', '#4ade80', 'wave'),
  ab('smoke_bomb', 'Smoke Bomb', 'buff', 'self', 12, 3, 0, 'Vanishes in smoke, gaining haste.', 'Poof.', '#94a3b8', 'glow', { status: st('haste', 1, 2, 0.3) }),
  ab('assassinate', 'Assassinate', 'attack', 'enemy', 26, 4, 2.4, 'An execution strike against a weakened foe.', 'It ends here.', '#a21caf', 'slash', { trigger: 'enemy_low', piercing: true }),
  ab('guardian_oath', 'Guardian Oath', 'shield', 'lowest_ally', 18, 3, 0.18, 'Shields the most endangered ally.', 'Behind me!', '#93c5fd', 'shield', { trigger: 'ally_low' }),
  ab('iron_fortress', 'Iron Fortress', 'shield', 'self', 20, 4, 0.28, 'Becomes an immovable fortress.', 'Iron Fortress!', '#9ca3af', 'shield'),
  ab('war_cry', 'War Cry', 'buff', 'all_allies', 22, 5, 0, 'Inspires allies with focus.', 'FOR GLORY!', '#f59e0b', 'wave', { status: st('focus', 1, 2, 0.2) }),
  ab('tactical_read', 'Tactical Read', 'debuff', 'enemy', 16, 3, 0.3, 'Exposes the target\'s weak point.', 'I see your pattern.', '#22d3ee', 'glow', { status: st('weaken', 0.85, 3, 0.18) }),
  ab('gambit', 'Checkmate Gambit', 'attack', 'enemy', 30, 5, 2.4, 'A planned decisive strike when momentum is yours.', 'Checkmate.', '#06b6d4', 'beam', { trigger: 'momentum_positive', piercing: true }),
  ab('second_sun', 'Second Sun', 'ultimate', 'all_enemies', 44, 7, 1.7, 'Ignites a miniature sun above the arena.', 'BEHOLD THE SECOND SUN!', '#fb923c', 'burst', { element: 'FIRE', trigger: 'hp_below_50' }),
  ab('mirror_ward', 'Mirror Ward', 'shield', 'all_allies', 24, 5, 0.1, 'Mirrors that blunt the next blows.', 'Reflect!', '#e9d5ff', 'shield', { element: 'MAGIC' }),
];

export const ABILITIES: Record<string, Ability> = Object.fromEntries([...LIST, ...LEGEND_MOVES].map((a) => [a.id, a]));

export const BASIC_ATTACK: Ability = {
  id: 'basic', name: 'Strike', description: 'A standard attack.', kind: 'attack', target: 'enemy',
  cost: 4, cooldown: 0, power: 1, trigger: 'always', fx: { color: '#e5e7eb', style: 'slash' }, shout: '',
};

/** Makes a character's own written moves available to the engine. */
export function registerCharacterMoves(pc: { customMoves?: Ability[] }) {
  for (const m of pc.customMoves ?? []) ABILITIES[m.id] = m;
}

export function getAbility(id: string): Ability {
  if (id === 'basic') return BASIC_ATTACK;
  const a = ABILITIES[id];
  if (!a) throw new Error(`Unknown ability: ${id}`);
  return a;
}

/** Generic moves only; signature moves belong to one character and are never handed out randomly. */
export const ABILITY_IDS = LIST.map((a) => a.id);

/** The arena visual effect for any move. */
export function vfxOf(a: Ability): VfxKind {
  if (a.vfx) return a.vfx;
  if (a.kind === 'heal') return 'heal';
  if (a.kind === 'summon') return 'summon';
  if (a.kind === 'buff') return 'aura';
  if (a.kind === 'shield') return 'shield';
  if (a.element === 'LIGHTNING') return 'lightning';
  if (a.element === 'FIRE' && a.fx.style !== 'slash') return 'fire';
  if (a.element === 'ICE' && a.fx.style !== 'slash') return 'ice';
  if (a.status?.type === 'stun' && a.kind === 'debuff') return 'genjutsu';
  switch (a.fx.style) {
    case 'slash': return 'slash';
    case 'burst': return 'explosion';
    case 'beam': return a.power >= 2 ? 'beam' : 'projectile';
    case 'wave': return 'wave';
    case 'glow': return 'aura';
    case 'shield': return 'shield';
  }
}
