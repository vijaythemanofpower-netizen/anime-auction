// Fighting kits on top of each character's signature moves: transformations they reach
// mid-fight when the moment calls for it, more of their real attacks (some only in a
// form), and one secret move they hold back until a teammate falls, they're the last
// one standing, or they're nearly beaten. Move and form names are the series' own;
// the descriptions are written for this game.
import type { Ability, Tag, VfxKind } from '../types';

/** When a form or secret move comes out: hurt (hp70/50/30), a teammate down, or last one standing. */
export type KitTrigger = 'hp70' | 'hp50' | 'hp30' | 'ally' | 'last';

export interface Form {
  name: string;
  trigger: KitTrigger;
  color: string;
  /** Drawing tags for how the fighter looks in this form. */
  look: string;
}

export interface Kit { forms: Form[]; moves: Ability[]; secret: Ability }

const COLOR: Partial<Record<Tag, string>> = {
  FIRE: '#f97316', LIGHTNING: '#facc15', ICE: '#7dd3fc', WATER: '#38bdf8', WIND: '#86efac', EARTH: '#a16207', DARK: '#7c3aed', SHADOW: '#6d28d9',
  HOLY: '#fde68a', DIVINE: '#fef08a', DEMON: '#dc2626', DRAGON: '#ef4444', MAGIC: '#c084fc', SPIRIT: '#a5f3fc', WARRIOR: '#e5e7eb', ASSASSIN: '#94a3b8',
};
const VFX: Partial<Record<Tag, VfxKind>> = { FIRE: 'fire', LIGHTNING: 'lightning', ICE: 'ice', WATER: 'wave', WIND: 'wave', DARK: 'genjutsu', SHADOW: 'genjutsu', WARRIOR: 'slash', ASSASSIN: 'slash' };

type K = 'a' | 'e' | 's' | 'b' | 'h' | 'd' | 'u';

function make(owner: string, key: string, name: string, k: K, power: number, el: Tag | '', look: string, form = 0): Ability {
  const element = el || undefined;
  const color = (element && COLOR[element]) ?? '#f472b6';
  const base = { id: `${owner}:${key}`, owner, name, description: look, look, element, trigger: 'always' as const, shout: `${name.toUpperCase()}!`, form: form || undefined, color2: '#ffffff' };
  const cd = power >= 2.4 ? 6 : power >= 1.9 ? 4 : power >= 1.5 ? 3 : 2;
  const cost = Math.round(10 + power * 9);
  switch (k) {
    case 'a': return { ...base, kind: 'attack', target: 'enemy', cost, cooldown: cd, power, vfx: (element && VFX[element]) ?? 'beam', fx: { color, style: 'beam' } };
    case 'u': return { ...base, kind: 'ultimate', target: 'enemy', cost, cooldown: Math.max(cd, 6), power, vfx: 'explosion', fx: { color, style: 'burst' } };
    case 'e': return { ...base, kind: 'aoe', target: 'all_enemies', cost, cooldown: Math.max(cd, 3), power, vfx: 'explosion', fx: { color, style: 'burst' } };
    case 's': return { ...base, kind: 'summon', target: 'enemy', cost, cooldown: cd, power, vfx: 'summon', fx: { color, style: 'burst' } };
    case 'b': return { ...base, kind: 'buff', target: 'self', cost: 16, cooldown: 5, power: 0, vfx: 'aura', fx: { color, style: 'glow' }, status: { type: 'focus', chance: 1, duration: 3, magnitude: power } };
    case 'h': return { ...base, kind: 'heal', target: 'self', cost: 16, cooldown: 4, power, vfx: 'heal', fx: { color, style: 'glow' }, trigger: 'hp_below_50' };
    case 'd': return { ...base, kind: 'debuff', target: 'enemy', cost: 18, cooldown: 4, power: 0.5, vfx: 'genjutsu', fx: { color, style: 'wave' }, status: { type: power >= 1 ? 'stun' : 'weaken', chance: 0.75, duration: power >= 1 ? 1 : 3, magnitude: 0.2 } };
  }
}

/** Compact kit builder: forms, then moves [key, name, kind, power, element, look, form?], then the secret. */
function kit(owner: string, forms: Array<[string, KitTrigger, string, string]>, moves: Array<[string, string, K, number, Tag | '', string, number?]>, secret: [string, string, K, number, Tag | '', KitTrigger, string]): Kit {
  const s = make(owner, secret[0], secret[1], secret[2], secret[3], secret[4], secret[6]);
  return {
    forms: forms.map(([name, trigger, color, look]) => ({ name, trigger, color, look })),
    moves: moves.map(([key, name, k, p, el, look, form]) => make(owner, key, name, k, p, el, look, form)),
    secret: { ...s, secret: secret[5], cooldown: 99, cost: Math.min(s.cost, 25) },
  };
}

export const KITS: Record<string, Kit> = {
  // ---------------------------------------------------------------- Naruto
  naruto: kit('naruto',
    [['Sage Mode', 'hp70', '#f59e0b', 'sage mode, orange pigment around eyes, toad eyes'], ['Kurama Link Mode', 'hp50', '#fb923c', 'golden chakra cloak, glowing yellow body, black seal markings'], ['Baryon Mode', 'last', '#f97316', 'baryon mode, orange flame aura, two chakra horns, burning cloak']],
    [['rasenshuriken', 'Wind Style: Rasenshuriken', 'a', 2.1, 'WIND', 'A screaming four-bladed shuriken of wind chakra shreds the target at the cellular level.', 1], ['frog_kumite', 'Frog Kumite', 'a', 1.5, 'WIND', 'Sage-enhanced taijutsu: every punch lands with an invisible ring of natural energy.', 1], ['planetary', 'Planetary Rasengan', 'e', 2.0, 'SPIRIT', 'A ring of Rasengan orbiting one giant sphere crashes down on the whole enemy line.', 2]],
    ['baryon_fist', 'Baryon Mode: Life-Force Strike', 'u', 2.9, 'SPIRIT', 'ally', 'He fuses with Kurama, burning their life force together; every hit drains the enemy\'s years away.']),
  sasuke: kit('sasuke',
    [['Mangekyou Sharingan', 'hp70', '#dc2626', 'mangekyou sharingan, red eyes with black pattern'], ['Rinnegan', 'hp50', '#7c3aed', 'rinnegan left eye, purple ripple eye, sharingan right eye'], ['Perfect Susanoo', 'last', '#8b5cf6', 'purple susanoo armor, giant spectral warrior around him']],
    [['kirin', 'Kirin', 'u', 2.4, 'LIGHTNING', 'He calls down a lightning dragon from the storm clouds; the strike is over before the sound arrives.', 1], ['susanoo_arrow', 'Susanoo Arrow', 'a', 1.9, 'DARK', 'A purple spectral archer draws and fires a black-flamed arrow.', 1], ['chidori_sharp', 'Chidori Sharp Spear', 'a', 1.6, 'LIGHTNING', 'The Chidori stretches into a crackling blade that skewers from range.']],
    ['amenotejikara', 'Amenotejikara: Blind Strike', 'u', 2.7, 'DARK', 'ally', 'The Rinnegan swaps places in an instant; the target turns around into Kusanagi already buried in them.']),
  itachi: kit('itachi',
    [['Mangekyou Sharingan', 'hp70', '#b91c1c', 'mangekyou sharingan, red eyes, akatsuki cloak'], ['Susanoo', 'hp30', '#ef4444', 'red susanoo ribcage, yata mirror, akatsuki cloak']],
    [['amaterasu_i', 'Amaterasu', 'a', 1.8, 'FIRE', 'Black flames that never go out bloom on the target the moment he looks at them.', 1], ['yata', 'Yata Mirror', 'b', 0.35, 'SPIRIT', 'A mirror shield of shifting nature absorbs anything thrown at him.', 2], ['shuriken_i', 'Shuriken Ricochet', 'a', 1.3, 'ASSASSIN', 'Kunai bounce off each other in the air and hit from blind angles.']],
    ['izanami', 'Izanami', 'd', 1.2, 'SHADOW', 'ally', 'He sacrifices an eye to trap the enemy in a loop of the same moment until they give up.']),
  kakashi: kit('kakashi',
    [['Mangekyou Sharingan', 'hp50', '#dc2626', 'mangekyou sharingan, masked face, silver hair'], ['Perfect Susanoo', 'last', '#3b82f6', 'blue perfect susanoo, two sharingan eyes']],
    [['lightning_hound', 'Lightning Beast Running', 'a', 1.6, 'LIGHTNING', 'A hound made of lightning sprints across the field and bites down.'], ['earth_wall', 'Earth Style: Mud Wall', 'b', 0.25, 'EARTH', 'A wall of earth carved with dog faces rises to cover him.'], ['kamui_raikiri', 'Kamui Raikiri', 'u', 2.6, 'LIGHTNING', 'Raikiri wrapped in Kamui: a strike that phases through any defence.', 2]],
    ['purple_lightning', 'Purple Lightning', 'a', 2.4, 'LIGHTNING', 'ally', 'Without his Sharingan he invents a new jutsu on the spot: violet lightning, fast as thought.']),
  // ---------------------------------------------------------------- One Piece
  luffy: kit('luffy',
    [['Gear Second', 'hp70', '#f472b6', 'gear second, pink steam from skin'], ['Gear Fourth', 'hp50', '#7f1d1d', 'gear fourth boundman, black armament haki arms, inflated muscles'], ['Gear Fifth', 'last', '#ffffff', 'gear fifth, white hair, white clothes, laughing, sun god nika']],
    [['jet_pistol', 'Gum-Gum Jet Pistol', 'a', 1.7, 'WARRIOR', 'A punch so fast only the shockwave is visible.', 1], ['elephant_gun', 'Gum-Gum Elephant Gun', 'a', 2.0, 'WARRIOR', 'A giant haki-hardened fist the size of a house.', 2], ['bajrang', 'Gum-Gum Bajrang Gun', 'u', 2.6, 'DIVINE', 'A fist the size of an island, bouncing like a cartoon, hits like a falling moon.', 3]],
    ['red_hawk', 'Gum-Gum Red Hawk', 'u', 2.5, 'FIRE', 'ally', 'For his crew: a burning haki fist that sets the air on fire.']),
  zoro: kit('zoro',
    [['Asura', 'hp50', '#4b5563', 'asura, three heads six arms nine swords illusion, dark aura'], ['King of Hell', 'last', '#7c3aed', 'purple conquerors haki flames on swords, one eye open, scar']],
    [['shishi', 'Shishi Sonson', 'a', 1.5, 'WARRIOR', 'A single draw-cut so fast the blade is sheathed before the target falls.'], ['tatsumaki', 'Tatsumaki', 'e', 1.4, 'WIND', 'Spinning three swords, he becomes a cutting tornado.'], ['purgatory', 'Purgatory Onigiri', 'u', 2.4, 'DARK', 'Three swords charged with haki rip through in a cross of flame.', 2]],
    ['shin_kyutoryu', 'Asura: Silver Mist', 'u', 2.8, 'DARK', 'ally', '"Nothing happened." He takes the pain for the crew and swings nine blades at once.']),
  sanji: kit('sanji',
    [['Diable Jambe', 'hp70', '#ef4444', 'diable jambe, flaming red leg'], ['Ifrit Jambe', 'last', '#3b82f6', 'ifrit jambe, blue flames on legs, raid suit']],
    [['collier', 'Collier Shot', 'a', 1.3, 'WARRIOR', 'A heel to the neck that snaps the head back.'], ['party_table', 'Party Table Kick Course', 'e', 1.4, 'WARRIOR', 'A handstand spin that kicks everyone around him.'], ['hell_memories', 'Hell Memories', 'u', 2.3, 'FIRE', 'Fire from his worst memories engulfs the target.', 1]],
    ['raid_suit', 'Raid Suit: Stealth Black', 'a', 2.4, 'SHADOW', 'ally', 'He finally wears the suit he swore never to use: invisible, he kicks from nowhere.']),
  ace: kit('ace',
    [['Flame Body', 'hp50', '#f97316', 'body made of fire, flames everywhere']],
    [['flame_commandment', 'Flame Commandment', 'u', 2.3, 'FIRE', 'A blazing wall of fire that turns into a giant fist.', 1], ['fire_pillar', 'Fire Pillar', 'a', 1.6, 'FIRE', 'A tower of flame erupts under the target.'], ['firefly_light', 'Firefly: Hotarubi Hidaruma', 'e', 1.4, 'FIRE', 'Dozens of green fireflies drift out, then ignite all at once.']],
    ['entei', 'Great Flame Commandment: Entei', 'u', 2.8, 'FIRE', 'ally', 'He gathers the heat of the sun into one giant fireball for his little brother.']),
  // ---------------------------------------------------------------- Dragon Ball
  goku: kit('goku',
    [['Super Saiyan', 'hp70', '#fde047', 'super saiyan, spiky golden hair, golden aura'], ['Super Saiyan Blue', 'hp50', '#38bdf8', 'super saiyan blue, blue hair, blue aura'], ['Ultra Instinct', 'last', '#e5e7eb', 'ultra instinct, silver hair, silver eyes, silver aura, calm face']],
    [['dragon_fist', 'Dragon Fist', 'u', 2.3, 'DRAGON', 'A golden dragon of ki coils around his punch and tears through the target.', 1], ['kaioken', 'Kaioken x20', 'b', 0.4, 'FIRE', 'A red aura multiplies his power, straining every muscle.', 2], ['ui_kamehameha', 'Ultra Instinct Kamehameha', 'a', 2.2, 'SPIRIT', 'He fires without thinking; the beam bends around every defence.', 3]],
    ['spirit_bomb_ui', 'Universal Spirit Bomb', 'u', 2.9, 'SPIRIT', 'ally', 'Everyone lends their energy; a sphere as big as the sky comes down.']),
  vegeta: kit('vegeta',
    [['Super Saiyan', 'hp70', '#fde047', 'super saiyan, spiky golden hair, widow peak, golden aura'], ['Super Saiyan Blue Evolution', 'hp50', '#1d4ed8', 'super saiyan blue evolution, dark blue hair'], ['Ultra Ego', 'last', '#7c3aed', 'ultra ego, purple hair, purple destroyer aura']],
    [['final_explosion', 'Final Explosion', 'e', 2.4, 'SPIRIT', 'He pours his whole life into one blast that swallows everything.', 2], ['gamma_burst', 'Gamma Burst Flash', 'a', 2.1, 'SPIRIT', 'Two hands thrust forward: a blue beam of pure pride.', 2], ['hakai', 'Hakai Energy Blast', 'u', 2.5, 'DARK', 'Destroyer energy; the target starts to crumble into dust.', 3]],
    ['final_explosion_s', 'Final Explosion (for his family)', 'u', 3.0, 'SPIRIT', 'ally', '"Bulma... Trunks... and yes, even you, Kakarot." He detonates himself.']),
  frieza: kit('frieza',
    [['Final Form', 'hp70', '#e9d5ff', 'frieza final form, white and purple body'], ['Golden Frieza', 'hp50', '#facc15', 'golden frieza, golden body, purple face'], ['Black Frieza', 'last', '#111827', 'black frieza, black body, red eyes']],
    [['death_saucer', 'Death Saucer', 'a', 1.6, 'DARK', 'A spinning disc of ki that homes in on its target.'], ['nova_strike', 'Nova Strike', 'a', 1.9, 'DARK', 'He becomes a purple comet and rams through.', 1], ['earth_breaker', 'Earth Breaker', 'e', 2.3, 'DARK', 'A massive sphere aimed to wipe out the whole battlefield.', 2]],
    ['black_death', 'Black Frieza\'s One Finger', 'u', 3.0, 'DARK', 'last', 'One flick of one finger from ten years of training. That is all it takes.']),
  gohan: kit('gohan',
    [['Super Saiyan 2', 'hp70', '#fde047', 'super saiyan 2, lightning sparks, golden hair'], ['Ultimate Gohan', 'hp50', '#e5e7eb', 'ultimate gohan, white aura, black hair'], ['Gohan Beast', 'last', '#e5e7eb', 'gohan beast, tall silver spiky hair, red eyes']],
    [['kamehameha_g', 'Kamehameha', 'a', 1.8, 'SPIRIT', 'A blue wave of ki, like father like son.'], ['special_beam_g', 'Special Beam Cannon', 'a', 2.0, 'DARK', 'The technique of his mentor, Piccolo, spirals through the target.', 2], ['ultimate_kick', 'Ultimate Rush', 'a', 1.6, 'WARRIOR', 'A blur of kicks unlocked by Elder Kai.', 2]],
    ['ssj2_rage', 'Angry SSJ2 Kamehameha', 'u', 2.8, 'SPIRIT', 'ally', 'When someone he loves falls, his hidden anger finally explodes.']),
  piccolo: kit('piccolo',
    [['Fused with Kami', 'hp70', '#22c55e', 'piccolo, white cape, glowing aura'], ['Orange Piccolo', 'last', '#f97316', 'orange piccolo, giant, muscular, orange skin']],
    [['light_grenade', 'Light Grenade', 'a', 1.7, 'SPIRIT', 'A glowing yellow sphere detonates on impact.'], ['giant_form', 'Giant Namekian', 'b', 0.3, 'EARTH', 'He grows to the size of a building.', 1], ['demon_slash', 'Demon Slash', 'a', 1.5, 'DARK', 'A blade of ki cuts through the air.']],
    ['protect_kid', 'Mentor\'s Shield', 'u', 2.6, 'DARK', 'ally', 'He takes the blow meant for a student, then fires back point-blank.']),
  broly: kit('broly',
    [['Wrath State', 'hp70', '#22c55e', 'broly wrath state, green aura, glowing eyes'], ['Legendary Super Saiyan', 'hp50', '#4ade80', 'legendary super saiyan, huge muscles, green hair, green aura']],
    [['omega_blaster', 'Omega Blaster', 'u', 2.4, 'SPIRIT', 'A giant green ball of ki flung like a stone.', 1], ['rage_rush', 'Rampaging Rush', 'a', 1.6, 'WARRIOR', 'He grabs the target and smashes them through rock.'], ['blaster_meteor', 'Blaster Meteor', 'e', 2.0, 'SPIRIT', 'Green ki rains down on everything.', 2]],
    ['kakarot_scream', '"KAKAROT!"', 'u', 3.0, 'SPIRIT', 'last', 'Pure rage with no limit: the planet shakes as he lunges.']),
  // ---------------------------------------------------------------- Bleach
  ichigo: kit('ichigo',
    [['Bankai: Tensa Zangetsu', 'hp70', '#111827', 'bankai, black long coat, black thin sword'], ['Hollow Mask', 'hp50', '#ffffff', 'white hollow mask with red stripes, black and yellow eyes'], ['Final Getsuga Tensho', 'last', '#000000', 'mugetsu form, long black hair, black bandages, black aura']],
    [['getsuga_hollow', 'Hollowfied Getsuga', 'a', 2.1, 'DARK', 'A black-and-red crescent of energy screams across the field.', 2], ['cero_ichigo', 'Cero', 'a', 1.9, 'DARK', 'A blast of hollow energy fires from his mask.', 2], ['tensa_rush', 'Tensa Speed Rush', 'a', 1.6, 'WARRIOR', 'He moves so fast there seem to be ten of him.', 1]],
    ['true_bankai', 'True Bankai: Getsuga Jujisho', 'u', 2.8, 'DARK', 'ally', 'Two blades, a cross-shaped wave of black light, for every friend he swore to protect.']),
  byakuya: kit('byakuya',
    [['Bankai', 'hp70', '#f9a8d4', 'bankai, thousands of pink blade petals around him'], ['Gokei', 'last', '#ec4899', 'senkei, rows of giant swords around him, pink light']],
    [['gokei', 'Gokei', 'e', 2.0, 'WIND', 'A sphere of a million petals closes around the enemies.', 1], ['senka', 'Senka', 'a', 1.6, 'ASSASSIN', 'Flash step behind, two cuts to the spine before they turn.'], ['ikka_senjinka', 'Ikka Senjinka', 'a', 2.1, 'WIND', 'Blades form a dome and fall on one target.', 2]],
    ['white_imperial', 'Shukei: Hakuteiken (pride)', 'u', 2.8, 'HOLY', 'ally', 'He draws all his blades into one, sprouting white wings of light.']),
  aizen: kit('aizen',
    [['Hogyoku Fusion', 'hp70', '#a78bfa', 'aizen fused with hogyoku, white body, purple glow'], ['Butterfly Form', 'hp30', '#7c3aed', 'aizen butterfly form, wings, many eyes, white']],
    [['hado_88', 'Hado #88: Hiryugekizoku Shinten Raiho', 'a', 2.0, 'LIGHTNING', 'A giant blast of lightning kido, without incantation.'], ['kurohitsugi_full', 'Full Incantation Kurohitsugi', 'u', 2.4, 'DARK', 'The full chant: a black coffin of gravity crushes everything inside.', 1], ['sword_flash', 'Flash Step Cut', 'a', 1.6, 'ASSASSIN', 'He is already behind you, his sword already sheathed.']],
    ['since_when', '"Since when were you under the impression..."', 'd', 1.5, 'MAGIC', 'hp30', 'The whole fight was an illusion. The enemy attacks a ghost.']),
  kenpachi: kit('kenpachi',
    [['Eyepatch Off', 'hp70', '#eab308', 'no eyepatch, yellow spiritual pressure, crazy grin'], ['Bankai', 'last', '#dc2626', 'kenpachi bankai, red skin, horns, demonic']],
    [['two_hand', 'Two-Handed Kendo', 'a', 2.0, 'WARRIOR', 'For once, he holds his sword with both hands.', 1], ['shikai', 'Shikai: Nozarashi', 'a', 2.2, 'WARRIOR', 'A giant cleaver that cuts through mountains.', 1], ['reckless', 'Reckless Charge', 'a', 1.5, 'WARRIOR', 'He takes the hit just to get closer.']],
    ['bankai_rage', 'Bankai: Unleashed', 'u', 3.0, 'DEMON', 'last', 'He loses his mind and his arm; he doesn\'t care.']),
  toshiro: kit('toshiro',
    [['Bankai', 'hp70', '#7dd3fc', 'bankai, ice dragon wings, ice tail'], ['Adult Bankai', 'last', '#e0f2fe', 'adult toshiro, tall, ice wings, ice flowers']],
    [['ryujin', 'Ryujin Shieldflower', 'b', 0.3, 'ICE', 'Ice wings wrap around him as armour.', 1], ['sennen', 'Sennen Hyoro', 'e', 2.0, 'ICE', 'Ice pillars rise in a circle and crush inward.', 1], ['shikai_t', 'Shikai: Hyorinmaru', 'a', 1.5, 'ICE', 'An ice dragon flows off the blade.']],
    ['hyoten_adult', 'Shiten Hyorinmaru', 'u', 2.9, 'ICE', 'ally', 'The ice flower blooms: anything it touches freezes for good.']),
  rukia: kit('rukia',
    [['Bankai: Hakka no Togame', 'hp50', '#e0f2fe', 'rukia bankai, white kimono, white hair, frost']],
    [['third_dance', 'Third Dance: Shirafune', 'a', 1.7, 'ICE', 'A broken blade regrows as a long spear of ice.'], ['kido_63', 'Hado #63: Raikoho', 'a', 1.6, 'LIGHTNING', 'A blast of yellow lightning kido.'], ['absolute_zero', 'Absolute Zero Touch', 'd', 1.0, 'ICE', 'One touch freezes the target solid.', 1]],
    ['hakka_s', 'Hakka no Togame (for her brother)', 'u', 2.8, 'ICE', 'ally', 'Everything within reach turns to white ice and shatters.']),
  // ---------------------------------------------------------------- Jujutsu Kaisen
  gojo: kit('gojo',
    [['Six Eyes Unleashed', 'hp70', '#93c5fd', 'blindfold off, glowing blue six eyes'], ['Domain: Unlimited Void', 'hp50', '#1e3a8a', 'domain expansion unlimited void, galaxy background']],
    [['unlimited_void', 'Domain Expansion: Unlimited Void', 'd', 1.5, 'MAGIC', 'Infinite information floods the mind; nobody can move.', 1], ['blue_max', 'Blue: Maximum Output', 'e', 2.0, 'MAGIC', 'A huge blue gravity sphere drags everyone into it.'], ['purple_200', '200% Hollow Purple', 'u', 2.8, 'MAGIC', 'Blue and red at double output: a sphere that erases everything in its path.', 2]],
    ['throughout', '"Throughout heaven and earth, I alone am the honoured one"', 'u', 3.0, 'DIVINE', 'hp30', 'He laughs while bleeding, and his technique reaches a new level.']),
  yuji: kit('yuji',
    [['Black Flash Zone', 'hp70', '#ef4444', 'black flash, red and black sparks, focused eyes'], ['Awakened Technique', 'last', '#7f1d1d', 'yuji, scar under eye, red cursed energy, dismantle']],
    [['dismantle_y', 'Dismantle', 'a', 1.8, 'DEMON', 'Sukuna\'s technique, learned in his own body: an invisible slash.', 2], ['shrine_y', 'Domain Expansion', 'd', 1.2, 'SPIRIT', 'His own domain: the enemy relives their crimes.', 2], ['cursed_rush', 'Cursed Energy Rush', 'a', 1.4, 'WARRIOR', 'A fast combo with delayed cursed energy.']],
    ['soul_punch', 'Soul Strike', 'u', 2.7, 'SPIRIT', 'ally', 'He hits the soul itself, for everyone who died for him.']),
  sukuna: kit('sukuna',
    [['Fingers Unsealed', 'hp70', '#7f1d1d', 'sukuna, black markings, four eyes, smirk'], ['Heian Form', 'hp30', '#991b1b', 'sukuna heian form, four arms, two faces, mouth on stomach']],
    [['spiderweb', 'Spiderweb', 'e', 1.8, 'DEMON', 'Dismantle radiating out on the ground; everything nearby is cut apart.'], ['world_cut', 'World-Cutting Slash', 'u', 2.7, 'DEMON', 'A slash that cuts space itself; nothing blocks it.', 1], ['hand_sign', 'Four-Arm Barrage', 'a', 1.8, 'DEMON', 'Four fists, all at once.', 2]],
    ['fuga_full', 'Fuga: Divine Flame Arrow', 'u', 3.0, 'FIRE', 'last', '"Open." A burning arrow of fire that turns the world to ash.']),
  megumi: kit('megumi',
    [['Domain: Chimera Shadow Garden', 'hp50', '#1e293b', 'domain expansion, shadows everywhere, shikigami']],
    [['toad', 'Toad', 's', 1.2, 'WATER', 'A giant toad shikigami grabs the target with its tongue.'], ['orochi', 'Great Serpent', 's', 1.7, 'EARTH', 'A giant snake shikigami bursts from the ground.'], ['agito', 'Agito', 's', 2.1, 'SHADOW', 'A fused shikigami of beasts.', 1]],
    ['mahoraga', 'Eight-Handled Sword Divergent Sila Divine General Mahoraga', 'u', 3.0, 'DIVINE', 'last', 'He summons what nobody has ever tamed, to take the enemy down with him.']),
  yuta: kit('yuta',
    [['Rika Fully Manifested', 'hp50', '#e5e7eb', 'rika fully manifested, giant curse girl behind him']],
    [['copy_speech', 'Copy: Cursed Speech', 'd', 1.2, 'MAGIC', '"Don\'t move." The words force the enemy to freeze.'], ['katana_rush', 'Reinforced Katana Rush', 'a', 1.6, 'WARRIOR', 'His sword glows with Rika\'s energy.'], ['domain_yuta', 'Domain: Authentic Mutual Love', 'e', 2.2, 'SPIRIT', 'A field of swords: every one holds a copied technique.', 1]],
    ['pure_love', 'Rika, I Love You', 'u', 3.0, 'SPIRIT', 'ally', 'He gives everything to Rika for one last attack.']),
  todo: kit('todo', [['Best Friend Mode', 'ally', '#facc15', 'shirtless, huge muscles, crying with joy']],
    [['vibra_swap', 'Boogie Woogie Swap', 'b', 0.3, 'MAGIC', 'A clap and he swaps places to confuse the enemy.'], ['brutal_suplex', 'Brutal Suplex', 'a', 1.7, 'WARRIOR', 'A wrestling suplex that cracks the floor.'], ['black_flash_t', 'Black Flash', 'a', 2.1, 'DARK', 'Cursed energy hits within a millionth of a second of the blow.', 1]],
    ['my_brother', '"My brother!"', 'u', 2.6, 'WARRIOR', 'ally', 'An imaginary memory of friendship powers a perfect combo.']),
  nanami: kit('nanami', [['Overtime', 'hp50', '#eab308', 'loosened tie, overtime, serious face']],
    [['ratio_split', 'Ratio: 7:3 Split', 'a', 1.8, 'WARRIOR', 'He strikes the exact weak point at 7:3 of the target.'], ['blade_wrap', 'Wrapped Blade', 'a', 1.4, 'WARRIOR', 'A blunt blade wrapped in cloth.'], ['collapse_n', 'Collapse: Wide', 'e', 2.0, 'EARTH', 'He breaks the ground under all enemies.', 1]],
    ['last_shift', 'Last Shift', 'u', 2.7, 'WARRIOR', 'last', 'Working overtime for the last time: no holding back.']),
  nobara: kit('nobara', [['Resolve', 'hp50', '#f472b6', 'nobara, determined, blood on face, nails glowing']],
    [['straw_doll', 'Straw Doll Technique', 'a', 1.6, 'SPIRIT', 'A nail through a doll hits the enemy\'s soul.'], ['nail_storm', 'Nail Storm', 'e', 1.4, 'WARRIOR', 'A handful of nails fired at once.'], ['resonance_full', 'Full Resonance', 'u', 2.3, 'SPIRIT', 'She nails her own wound to hurt the enemy as much.', 1]],
    ['hairpin_full', 'Hairpin: Total Detonation', 'u', 2.6, 'SPIRIT', 'ally', 'Every nail on the field explodes at once.']),
  // ---------------------------------------------------------------- Demon Slayer
  tanjiro: kit('tanjiro',
    [['Demon Slayer Mark', 'hp70', '#ef4444', 'demon slayer mark on forehead, red flames'], ['Selfless State', 'last', '#fbbf24', 'transparent world, calm face, fire breathing']],
    [['dance', 'Hinokami Kagura: Clear Blue Sky', 'a', 1.8, 'FIRE', 'A circular slash of solar flames.', 1], ['flame_dance', 'Fire Wheel', 'a', 1.6, 'FIRE', 'A burning wheel slashes from above.'], ['dragon_sun', 'Sunflower Thrust', 'a', 2.0, 'FIRE', 'The fastest thrust of the Sun Breathing.', 2]],
    ['thirteenth_s', 'Sun Breathing: Endless Thirteenth Form', 'u', 3.0, 'FIRE', 'ally', 'All twelve forms in a row, without end, until the sun rises.']),
  zenitsu: kit('zenitsu', [['Sleep Mode', 'hp70', '#fde047', 'zenitsu asleep, eyes closed, lightning']],
    [['sixfold_z', 'Eightfold Thunder', 'a', 1.9, 'LIGHTNING', 'Eight steps of lightning around the target.', 1], ['god_speed_z', 'Godspeed', 'a', 2.1, 'LIGHTNING', 'A step so fast his feet burn.', 1], ['kaminari', 'Thunderclap', 'a', 1.5, 'LIGHTNING', 'A single burst of lightning.']],
    ['flaming_thunder', 'Flaming Thunder God', 'u', 3.0, 'LIGHTNING', 'ally', 'His own form, created for a fallen friend: a thunder dragon.']),
  rengoku: kit('rengoku', [['Mark of the Flame', 'hp50', '#f97316', 'demon slayer mark, burning hair, intense']],
    [['flame_tiger', 'Flame Tiger', 'a', 2.0, 'FIRE', 'A tiger of flames charges the target.'], ['blooming_flame', 'Blooming Flame Undulation', 'b', 0.3, 'FIRE', 'A curtain of fire guards him.', 1], ['flame_nine', 'Flame Breathing: Rising Sun', 'a', 1.6, 'FIRE', 'A rising slash of flame.']],
    ['set_heart_ablaze', '"Set your heart ablaze!"', 'u', 3.0, 'FIRE', 'last', 'He protects everyone behind him with all the fire he has left.']),
  giyu: kit('giyu', [['Demon Slayer Mark', 'hp50', '#3b82f6', 'demon slayer mark, water dragon']],
    [['eleventh', 'Eleventh Form: Dead Calm', 'b', 0.4, 'WATER', 'Total stillness: nothing can reach him.', 1], ['flowing_dance', 'Flowing Dance', 'a', 1.6, 'WATER', 'Flowing like water, he slashes from every angle.'], ['water_dragon', 'Water Dragon', 'a', 1.9, 'WATER', 'A water dragon wraps around the blade.']],
    ['for_sabito', 'For Sabito', 'u', 2.8, 'WATER', 'ally', 'He finally accepts his role as Hashira.']),
  inosuke: kit('inosuke', [['Mark', 'hp50', '#64748b', 'boar mask, demon slayer mark, wild']],
    [['fang_eight', 'Fang Eight: Explosive Rush', 'a', 1.9, 'WARRIOR', 'He bursts forward, two swords out.'], ['thrust', 'Fang Two: Slice', 'a', 1.4, 'WARRIOR', 'A brutal slice from two swords.'], ['spatial_spin', 'Spatial Awareness: Fang Ten', 'e', 2.0, 'WARRIOR', 'A whirl of blades, he can feel everyone around.', 1]],
    ['mother', 'For Mom', 'u', 2.7, 'WARRIOR', 'ally', 'He remembers his mother\'s face and swings with everything.']),
  akaza: kit('akaza', [['Upper Moon Three', 'hp70', '#ec4899', 'akaza, blue markings, pink hair, compass ground'], ['Selfless State', 'last', '#be185d', 'akaza, snowflake compass, transparent world']],
    [['air_type', 'Disordered Air', 'e', 1.8, 'DEMON', 'Punches thrown at the air hit everyone.'], ['leg_type', 'Leg Type: Flash Kick', 'a', 1.7, 'DEMON', 'A kick that cuts like a blade.'], ['blue_silver', 'Blue Silver Chaotic Afterglow', 'u', 2.5, 'DEMON', 'A storm of punches in every direction.', 1]],
    ['snow_crystal', 'Destructive Death: Snowflake Wheel', 'u', 2.9, 'DEMON', 'last', 'He remembers who he was, and fights like a man for the last time.']),
  shinobu: kit('shinobu', [['Final Stage', 'hp30', '#a855f7', 'shinobu, butterfly haori, purple glow']],
    [['bee_sting', 'Bee Sting: Flutter', 'a', 1.5, 'ASSASSIN', 'A precise stinger thrust with poison.'], ['poison_cloud', 'Wisteria Poison', 'd', 0.8, 'ASSASSIN', 'Poison that weakens the target.'], ['true_flutter', 'Bee Sting: True Flutter', 'a', 2.0, 'ASSASSIN', 'Four thrusts in a blink.', 1]],
    ['self_poison', 'Wisteria Body', 'u', 2.8, 'ASSASSIN', 'last', 'Her whole body is poison. Let them try and eat her.']),
  // ---------------------------------------------------------------- My Hero Academia
  deku: kit('deku',
    [['Full Cowl 45%', 'hp70', '#22c55e', 'green lightning, full cowl'], ['Black Whip', 'hp50', '#111827', 'black whip tendrils, green lightning'], ['One For All 100%', 'last', '#4ade80', 'deku, green lightning everywhere, glowing eyes']],
    [['st_louis', 'St. Louis Smash', 'a', 1.6, 'WIND', 'A kick that cuts the air.', 1], ['black_whip', 'Black Whip', 'd', 1.0, 'SHADOW', 'Black tendrils lash and hold the target.', 2], ['united_states_d', 'United States of Smash', 'u', 2.8, 'WIND', 'All Might\'s finisher, passed down.', 3]],
    ['ofa_all', 'Every Quirk at Once', 'u', 2.9, 'WIND', 'ally', 'All seven quirks of One For All at once, for his friends.']),
  bakugo: kit('bakugo', [['Max Power', 'hp50', '#f97316', 'bakugo, explosive gauntlets, burning hands']],
    [['cluster', 'Cluster', 'e', 1.8, 'FIRE', 'A swarm of explosions all around.'], ['nitro', 'Nitro Shot', 'a', 1.6, 'FIRE', 'A concentrated blast from his palm.'], ['cannon', 'Cannon Blast', 'u', 2.4, 'FIRE', 'He fires his gauntlet\'s full charge.', 1]],
    ['save_deku', 'Howitzer Impact: Cluster', 'u', 2.9, 'FIRE', 'ally', '"Deku!" he screams as he dives for him.']),
  todoroki: kit('todoroki', [['Full Fire', 'hp50', '#ef4444', 'todoroki, left side flames, right side ice']],
    [['phosphor', 'Phosphor', 'a', 2.0, 'FIRE', 'White-hot flame, the same as his father.', 1], ['ice_path', 'Ice Path', 'd', 0.8, 'ICE', 'Ice freezes the target\'s legs.'], ['great_glacier', 'Great Glacier', 'e', 2.2, 'ICE', 'A mountain of ice swallows the enemies.', 1]],
    ['blazing_fist', 'Flashfire Fist: Hell\'s Spider', 'u', 2.8, 'FIRE', 'ally', 'He accepts his fire to save everyone.']),
  allmight: kit('allmight', [['Prime', 'hp70', '#3b82f6', 'all might prime, huge muscles, smiling, golden hair']],
    [['detroit', 'Detroit Smash', 'a', 2.0, 'WIND', 'A punch that changes the weather.'], ['oklahoma', 'Oklahoma Smash', 'e', 1.6, 'WIND', 'He spins and blasts everyone away.'], ['new_hampshire', 'New Hampshire Smash', 'a', 1.7, 'WIND', 'He punches the air to fly into the target.', 1]],
    ['plus_ultra', 'Plus Ultra', 'u', 3.0, 'WIND', 'last', '"Now, it\'s your turn." One last smash with every last ember.']),
  shigaraki: kit('shigaraki', [['Awakened', 'hp70', '#64748b', 'shigaraki, white hair, red eyes, hand mask'], ['All For One', 'last', '#111827', 'shigaraki, all for one, black tendrils, cracked skin']],
    [['decay_wave', 'Decay Wave', 'e', 2.0, 'DARK', 'Decay spreads across the ground and swallows all.'], ['quirk_steal', 'Quirk Steal', 'd', 1.0, 'DARK', 'He steals a piece of the target\'s power.', 1], ['air_cannon', 'Air Cannon', 'a', 1.6, 'WIND', 'A stolen quirk fires a blast of air.', 1]],
    ['catastrophe', 'Total Decay', 'u', 3.0, 'DARK', 'hp30', 'He decays the whole city to get you.']),
  endeavor: kit('endeavor', [['Prominence', 'hp50', '#f97316', 'endeavor, flames all over, blue flames']],
    [['jet_burn', 'Jet Burn', 'a', 1.7, 'FIRE', 'Fire propulsion punch.'], ['vanishing_fist', 'Vanishing Fist', 'a', 1.8, 'FIRE', 'He moves behind the enemy in a burst.', 1], ['hell_flame', 'Hellflame', 'e', 1.6, 'FIRE', 'He sets the whole field on fire.']],
    ['plus_ultra_e', 'Plus Ultra: Prominence Burn', 'u', 3.0, 'FIRE', 'last', 'He burns himself to be a hero his son can look up to.']),
  // ---------------------------------------------------------------- Attack on Titan
  levi: kit('levi', [['Ackerman Awakening', 'hp50', '#64748b', 'levi, scars, focused, spinning blades']],
    [['thunder_spear_l', 'Thunder Spear', 'a', 1.9, 'FIRE', 'He fires two explosive spears into the target.'], ['rotation', 'Spinning Slash', 'a', 1.6, 'WARRIOR', 'A spinning attack, too fast to follow.'], ['beast_hunt', 'Beast Hunt', 'u', 2.4, 'WARRIOR', 'Every blade on his belt, every last one.', 1]],
    ['promise', '"I swore to Erwin"', 'u', 3.0, 'WARRIOR', 'ally', 'He keeps the promise to his fallen comrades.']),
  eren: kit('eren', [['Attack Titan', 'hp70', '#92400e', 'attack titan form, huge titan'], ['Founding Titan', 'last', '#e5e7eb', 'founding titan, giant skeleton, colossal']],
    [['war_hammer', 'War Hammer Titan', 'a', 2.1, 'EARTH', 'He pulls a hammer of hardened crystal from the ground.', 1], ['harden_punch', 'Hardened Punch', 'a', 1.8, 'EARTH', 'A titan fist covered in crystal.', 1], ['titan_roar', 'Titan Roar', 'd', 1.0, 'SPIRIT', 'A roar that freezes all who hear it.']],
    ['freedom', '"Keep moving forward"', 'u', 3.0, 'EARTH', 'last', 'Millions of colossal titans march.']),
  mikasa: kit('mikasa', [['Ackerman Power', 'hp50', '#475569', 'mikasa, red scarf, focused, ackerman eyes']],
    [['scarf', 'For Eren', 'b', 0.35, 'WARRIOR', 'She fixes the scarf; she won\'t lose here.'], ['dive_slash', 'Diving Slash', 'a', 1.7, 'WARRIOR', 'A steep dive with both blades.'], ['thunder_double', 'Double Thunder Spear', 'a', 2.0, 'FIRE', 'Two explosive spears.', 1]],
    ['red_scarf', 'Ackerman Fury', 'u', 2.8, 'WARRIOR', 'ally', 'She remembers the scarf. Nothing will stop her now.']),
  // ---------------------------------------------------------------- Hunter x Hunter
  gon: kit('gon', [['Rage', 'hp50', '#f97316', 'gon, angry, glowing aura'], ['Adult Gon', 'last', '#111827', 'adult gon, long black hair, huge aura, muscular']],
    [['fishing', 'Fishing Rod Hook', 'a', 1.3, 'WARRIOR', 'A swing of his fishing rod.'], ['jajanken_charged', 'Charged Jajanken', 'a', 2.1, 'WARRIOR', 'He charges Nen to the limit.', 1], ['adult_rock', 'Adult Rock', 'u', 2.8, 'WARRIOR', 'A fist that leaves a mushroom cloud.', 2]],
    ['give_everything', '"This is enough"', 'u', 3.0, 'WARRIOR', 'ally', 'He trades his whole future for one punch.']),
  killua: kit('killua', [['Godspeed', 'hp70', '#93c5fd', 'killua godspeed, white hair, blue lightning']],
    [['whirlwind', 'Whirlwind', 'a', 2.0, 'LIGHTNING', 'He reacts automatically to the slightest move.', 1], ['assassin_claws', 'Assassin\'s Claws', 'a', 1.6, 'ASSASSIN', 'His hand sharpens into a claw.'], ['yo_yo', 'Steel Yo-Yo', 'a', 1.4, 'WARRIOR', 'Heavy yo-yos weighing 50kg each.']],
    ['for_gon', 'For Gon', 'u', 2.8, 'LIGHTNING', 'ally', 'He will save his best friend no matter what.']),
  hisoka: kit('hisoka', [['Excited', 'hp70', '#ec4899', 'hisoka, excited, crazy grin, cards']],
    [['card_slice', 'Card Slice', 'a', 1.6, 'ASSASSIN', 'A playing card thrown like a blade.'], ['bungee_trap', 'Bungee Gum Trap', 'd', 1.0, 'MAGIC', 'Elastic aura sticks to the target.'], ['texture_s', 'Texture Surprise', 'b', 0.3, 'MAGIC', 'Paper-thin illusions hide his wounds.', 1]],
    ['post_mortem', 'Post-Mortem Nen', 'u', 2.8, 'MAGIC', 'last', 'He dies, and his Nen restarts his heart. He smiles.']),
  kurapika: kit('kurapika', [['Scarlet Eyes', 'hp70', '#dc2626', 'scarlet eyes, chains glowing']],
    [['holy_chain', 'Holy Chain', 'h', 0.25, 'HOLY', 'A chain that heals his wounds.'], ['steal_chain', 'Stealing Chain', 'd', 1.0, 'MAGIC', 'He steals an ability for a while.', 1], ['chain_swing', 'Chain Lash', 'a', 1.4, 'WARRIOR', 'A heavy chain lash.']],
    ['judgment_final', 'Judgment Chain: Spider Hunt', 'u', 2.9, 'MAGIC', 'ally', 'For his clan, his life span burns.']),
  meruem: kit('meruem', [['Royal Guard Fusion', 'hp50', '#22c55e', 'meruem, wings, royal guard aura']],
    [['aura_burst', 'Aura Blast', 'e', 2.0, 'DARK', 'A shockwave of aura that hits everyone.', 1], ['king_strike', 'King\'s Strike', 'a', 1.8, 'WARRIOR', 'A strike from the king of ants.'], ['absorb', 'Absorption', 'h', 0.3, 'DARK', 'He absorbs Nen to regenerate.']],
    ['for_komugi', 'For Komugi', 'u', 3.0, 'DARK', 'last', 'The king finds a reason to fight that isn\'t for the crown.']),
  // ---------------------------------------------------------------- Others
  edward: kit('edward', [['Full Power', 'hp50', '#fde047', 'edward elric, automail arm blade, alchemy circle']],
    [['cannon_ed', 'Alchemy Cannon', 'a', 1.8, 'EARTH', 'He turns the ground into a cannon.'], ['spikes', 'Ground Spikes', 'e', 1.6, 'EARTH', 'Spikes shoot up from the ground all around.'], ['giant_fist', 'Giant Stone Fist', 'a', 2.1, 'EARTH', 'A stone fist the size of a house.', 1]],
    ['equivalent', 'Equivalent Exchange', 'u', 2.8, 'MAGIC', 'ally', 'He gives up his alchemy itself to bring his brother back.']),
  roy: kit('roy', [['Blind Fury', 'hp50', '#ef4444', 'roy mustang, glove, burning, fierce']],
    [['flame_wall', 'Flame Wall', 'b', 0.3, 'FIRE', 'A wall of flame blocks attacks.'], ['oxygen', 'Oxygen Control', 'd', 0.8, 'FIRE', 'He removes the air around the target.', 1], ['blue_flame', 'Blue Flame', 'a', 2.0, 'FIRE', 'A focused flame that burns blue.', 1]],
    ['for_hughes', 'For Hughes', 'u', 3.0, 'FIRE', 'ally', 'He burns over and over, never stopping.']),
  saitama: kit('saitama', [['Serious Mode', 'hp70', '#fde047', 'saitama serious face, cape, determined']],
    [['serious_table', 'Serious Table Flip', 'e', 2.0, 'WARRIOR', 'He flips the ground itself.', 1], ['serious_headbutt', 'Serious Headbutt', 'a', 2.2, 'WARRIOR', 'A headbutt that cracks the moon.', 1], ['normal_kick', 'Normal Kick', 'a', 1.6, 'WARRIOR', 'Just a normal kick.']],
    ['zero_punch', 'Serious Series: Zero Punch', 'u', 3.5, 'WARRIOR', 'ally', 'He goes serious, for real. The universe trembles.']),
  natsu: kit('natsu', [['Dragon Force', 'hp70', '#f97316', 'dragon force, scales on face, flames'], ['E.N.D.', 'last', '#dc2626', 'natsu end form, demon horns, black markings']],
    [['wing_attack', 'Fire Dragon\'s Wing Attack', 'e', 1.8, 'FIRE', 'Fire wings sweep across the field.'], ['brilliant_flame', 'Brilliant Flame', 'a', 2.0, 'FIRE', 'A giant ball of fire.', 1], ['end_fist', 'Demon Fist', 'u', 2.6, 'DEMON', 'A fist of demon fire.', 2]],
    ['fairy_tail', 'For Fairy Tail!', 'u', 2.9, 'FIRE', 'ally', 'He eats his own flames and doubles them, for his guild.']),
  denji: kit('denji', [['Chainsaw Man', 'hp50', '#dc2626', 'chainsaw man form, chainsaw head, chainsaw arms'], ['True Chainsaw Man', 'last', '#111827', 'true chainsaw man, black, many arms']],
    [['saw_spin', 'Saw Spin', 'e', 1.6, 'DEMON', 'Chainsaws spin around him.'], ['rope_saw', 'Rope Chainsaw', 'a', 1.8, 'DEMON', 'He swings a chainsaw on a chain.', 1], ['eat_devil', 'Devil Eater', 'u', 2.5, 'DEMON', 'He tears the enemy apart.', 2]],
    ['pochita', 'Pochita\'s Roar', 'u', 3.0, 'DEMON', 'last', 'Pochita takes over. Every devil fears this sound.']),
  minato: kit('minato', [['Nine-Tails Chakra Mode', 'hp50', '#fde047', 'minato, nine tails chakra cloak, hokage cloak']],
    [['space_time', 'Space-Time Barrier', 'b', 0.35, 'SPIRIT', 'He teleports the attack away.'], ['kunai_flurry', 'Kunai Flurry', 'a', 1.4, 'ASSASSIN', 'Marked kunai everywhere.'], ['tailed_bomb_m', 'Tailed Beast Ball', 'u', 2.4, 'SPIRIT', 'A dark orb of chakra.', 1]],
    ['reaper', 'Reaper Death Seal', 'u', 2.8, 'SPIRIT', 'last', 'He gives his soul to seal the enemy.']),
  madara: kit('madara', [['Edo Tensei', 'hp70', '#dc2626', 'madara, red armor, rinnegan'], ['Six Paths Sage Mode', 'hp30', '#ffffff', 'madara six paths, white hair, truth seeking orbs']],
    [['limbo', 'Limbo: Border Jail', 'a', 2.0, 'SPIRIT', 'Invisible shadows strike from another world.', 2], ['truth_seeker', 'Truth-Seeking Orbs', 'a', 1.9, 'DARK', 'Black orbs that destroy anything.', 2], ['susanoo_slash', 'Susanoo Slash', 'e', 2.0, 'DARK', 'A giant blue Susanoo swings its swords.', 1]],
    ['infinite', 'Infinite Tsukuyomi', 'd', 1.5, 'SPIRIT', 'hp30', 'The moon turns red. Everyone falls into a dream.']),
  pain: kit('pain', [['Deva Path', 'hp70', '#f97316', 'pain deva path, rinnegan, piercings']],
    [['animal_path', 'Animal Path Summoning', 's', 1.7, 'EARTH', 'Giant summoned beasts charge the enemy.'], ['asura_path', 'Asura Path Missiles', 'e', 1.6, 'FIRE', 'Mechanical arms fire missiles.'], ['shinra_max', 'Shinra Tensei: Full Power', 'e', 2.4, 'DIVINE', 'The whole village vanishes.', 1]],
    ['god', '"Feel pain"', 'u', 2.9, 'DIVINE', 'ally', 'A god among men; all six paths at once.']),
  gaara: kit('gaara', [['Sand Armor', 'hp70', '#d97706', 'gaara, sand armor, gourd']],
    [['sand_spear', 'Sand Spear', 'a', 1.6, 'EARTH', 'A spear of compressed sand.'], ['sand_burial', 'Sand Burial', 'u', 2.3, 'EARTH', 'Sand closes around the target and crushes.', 1], ['sand_shuriken', 'Sand Shuriken', 'e', 1.4, 'EARTH', 'Hundreds of sand shuriken.']],
    ['shukaku', 'Shukaku Unleashed', 'u', 2.8, 'EARTH', 'last', 'The one-tailed beast rises from the sand.']),
  lee: kit('lee', [['Gate of Joy', 'hp70', '#22c55e', 'rock lee, green aura, eight gates, red skin'], ['Gate of Death', 'last', '#dc2626', 'rock lee, red aura, eighth gate']],
    [['hidden_lotus', 'Hidden Lotus', 'a', 2.0, 'WARRIOR', 'A punch in the air, then a hammer blow.', 1], ['daytime_tiger', 'Daytime Tiger', 'u', 2.5, 'WIND', 'A punch that becomes a tiger of air.', 1], ['drunken_fist', 'Drunken Fist', 'a', 1.6, 'WARRIOR', 'Unpredictable drunken moves.']],
    ['night_guy', 'Night Guy', 'u', 3.2, 'WARRIOR', 'ally', 'The eighth gate: a kick that bends space.']),
  law: kit('law', [['Awakening', 'hp50', '#3b82f6', 'law, awakened room, nodachi']],
    [['counter_shock', 'Counter Shock', 'a', 1.8, 'LIGHTNING', 'A defibrillator shock in the chest.'], ['injection_shot', 'Injection Shot', 'a', 1.6, 'WARRIOR', 'A thrust from far away.'], ['puncture_wille', 'Puncture Wille', 'u', 2.6, 'WARRIOR', 'A blade that pierces from the inside.', 1]],
    ['k_room', 'K-Room: Shock Wille', 'u', 2.9, 'LIGHTNING', 'ally', 'He shocks from inside, to save his friends.']),
  whitebeard: kit('whitebeard', [['Wounded Pride', 'hp50', '#e5e7eb', 'whitebeard, bloodied, determined']],
    [['bisento_swing', 'Bisento Swing', 'a', 1.8, 'WARRIOR', 'A wide swing with his bisento.'], ['tsunami', 'Tsunami', 'e', 2.2, 'WATER', 'He cracks the sea into waves.', 1], ['air_crack', 'Air Crack', 'a', 2.0, 'EARTH', 'He grabs the air and cracks it.']],
    ['one_piece_exists', '"The One Piece is real!"', 'u', 3.0, 'EARTH', 'last', 'Standing even after death.']),
  shanks: kit('shanks', [['Conqueror\'s Haki', 'hp70', '#dc2626', 'shanks, red hair, conquerors haki']],
    [['divine_haki', 'Haki Slash', 'a', 2.0, 'WARRIOR', 'A slash coated in conquerors haki.', 1], ['one_sword', 'One Sword', 'a', 1.6, 'WARRIOR', 'One arm, one sword, enough.'], ['haki_aura', 'Haki Aura', 'd', 1.0, 'SPIRIT', 'Everyone weaker passes out.']],
    ['divine_full', 'Divine Departure: Full', 'u', 3.0, 'WARRIOR', 'ally', 'The emperor stops holding back.']),
  jinwoo: kit('jinwoo',
    [['Shadow Monarch', 'hp70', '#6d28d9', 'sung jinwoo, glowing purple eyes, black coat, shadow aura'], ['Monarch\'s Domain', 'hp50', '#4c1d95', 'shadow army behind him, purple flames, daggers'], ['Ashborn Inheritance', 'last', '#111827', 'sung jinwoo shadow monarch armor, black armor, purple glowing eyes']],
    [['igris', 'Arise: Igris', 's', 1.7, 'SHADOW', 'The blood-red knight Igris kneels, then charges.', 1], ['beru', 'Arise: Beru', 's', 2.0, 'SHADOW', 'The ant king Beru claws the target apart.', 2], ['bellion', 'Arise: Bellion', 's', 2.3, 'SHADOW', 'Bellion, grand marshal of the shadow army, swings his sword.', 3]],
    ['shadow_army', 'Shadow Army Raid', 'u', 3.0, 'SHADOW', 'ally', 'Thousands of shadow soldiers rise at once.']),
  jotaro: kit('jotaro', [['Star Platinum', 'hp70', '#7c3aed', 'jotaro, star platinum stand behind him']],
    [['star_finger_j', 'Star Finger', 'a', 1.6, 'WARRIOR', 'His stand\'s fingers stretch and stab.'], ['time_stop', 'Star Platinum: The World', 'd', 1.5, 'SPIRIT', 'Time stops. Only he moves.', 1], ['ora_full', 'ORA Barrage', 'e', 2.0, 'WARRIOR', 'A barrage at every enemy.']],
    ['yare_yare', '"Yare yare daze"', 'u', 2.9, 'WARRIOR', 'ally', 'He pulls his hat down. Then everything breaks.']),
  dio: kit('dio', [['The World', 'hp70', '#eab308', 'dio, the world stand behind him, golden'], ['Over Heaven', 'last', '#ffffff', 'dio over heaven, white clothes, white aura']],
    [['the_world', 'ZA WARUDO', 'd', 1.5, 'DARK', 'Time stops for nine seconds.', 1], ['vampire_freeze', 'Vaporization Freeze', 'a', 1.6, 'ICE', 'His hand freezes the target.'], ['heaven_reality', 'Reality Overwrite', 'u', 2.6, 'DIVINE', 'Reality bends to his will.', 2]],
    ['road_roller', 'Road Roller: Over Heaven', 'u', 3.0, 'DARK', 'last', 'Even Jonathan\'s blood can\'t stop it.']),
  mob: kit('mob', [['100%', 'hp50', '#c084fc', 'mob 100 percent, psychic aura'], ['???%', 'last', '#ffffff', 'mob ??? percent, white eyes, huge aura']],
    [['psychic_wave', 'Psychic Wave', 'e', 1.6, 'MAGIC', 'A wave of psychic power.'], ['spirit_sword', 'Spirit Sword', 'a', 1.8, 'MAGIC', 'A psychic blade.', 1], ['explosion_100', '100% Explosion', 'u', 2.6, 'MAGIC', 'All emotion released at once.', 1]],
    ['mob_bro', 'For Ritsu', 'u', 3.0, 'MAGIC', 'ally', 'He finally gets angry.']),
  kaneki: kit('kaneki', [['Half-Kakuja', 'hp70', '#dc2626', 'kaneki half kakuja, white hair, red eyes, kagune'], ['Dragon', 'last', '#7f1d1d', 'kaneki dragon form, giant ghoul monster']],
    [['centipede_k', 'Centipede Kagune', 'a', 2.0, 'DEMON', 'Kagune shaped like a giant centipede.', 1], ['kagune_slash', 'Kagune Slash', 'a', 1.6, 'DEMON', 'Red tentacles slash.'], ['dragon_crush', 'Dragon Crush', 'e', 2.4, 'DEMON', 'A dragon of flesh crushes all.', 2]],
    ['thousand_minus_seven', '"What\'s 1000 minus 7?"', 'u', 2.9, 'DEMON', 'ally', 'He counts down. Something in him breaks.']),
  asta: kit('asta', [['Black Asta', 'hp70', '#111827', 'black asta, horn, black wing, devil arm'], ['Devil Union', 'last', '#000000', 'asta devil union, horns, black armor']],
    [['black_meteorite', 'Black Meteorite', 'a', 2.0, 'DEMON', 'A black meteor that cuts through magic.', 1], ['demon_destroyer', 'Demon-Destroyer Sword', 'a', 1.8, 'DEMON', 'A blade that rejects all magic.'], ['black_hurricane', 'Black Hurricane', 'e', 2.0, 'DEMON', 'A tornado of anti-magic.', 2]],
    ['no_magic', '"Surpass your limits!"', 'u', 2.9, 'DEMON', 'ally', 'He has no magic. He still wins.']),
  yuno: kit('yuno', [['Spirit Dive', 'hp70', '#22c55e', 'yuno spirit dive, wind armor'], ['Star Magic', 'last', '#facc15', 'yuno, star magic, four leaf grimoire']],
    [['spirit_dive', 'Spirit Dive', 'b', 0.35, 'WIND', 'He fuses with the wind spirit.'], ['star_sword', 'Star Sword', 'a', 2.0, 'MAGIC', 'A sword of starlight.', 2], ['wind_typhoon', 'Wind Typhoon', 'e', 1.8, 'WIND', 'A typhoon sweeps the field.']],
    ['rival', 'For Asta', 'u', 2.8, 'WIND', 'ally', 'His rival is in trouble; he flies faster than ever.']),
  power: kit('power', [['Blood Fiend', 'hp50', '#dc2626', 'power, horns, blood, crazy grin']],
    [['blood_shield', 'Blood Shield', 'b', 0.3, 'DEMON', 'A shield of blood.'], ['blood_scythe', 'Blood Scythe', 'a', 1.8, 'DEMON', 'A scythe of blood.', 1], ['blood_rain_p', 'Blood Storm', 'e', 2.0, 'DEMON', 'Blood rains as spikes.', 1]],
    ['denji', 'For Denji!', 'u', 2.8, 'DEMON', 'ally', 'Power gives her blood to save her buddy.']),
  yor: kit('yor', [['Thorn Princess', 'hp50', '#111827', 'yor, thorn princess dress, stilettos, red eyes']],
    [['neck_strike', 'Neck Strike', 'a', 2.0, 'ASSASSIN', 'A precise strike to the neck.', 1], ['dash_kick', 'Dash Kick', 'a', 1.6, 'ASSASSIN', 'A kick that breaks a car.'], ['blade_dance', 'Blade Dance', 'e', 1.8, 'ASSASSIN', 'Stilettos fly in every direction.', 1]],
    ['family', 'For My Family', 'u', 2.9, 'ASSASSIN', 'ally', 'She protects Anya and Loid. Death follows.']),
  gilgamesh: kit('gilgamesh', [['King\'s Treasury', 'hp70', '#eab308', 'gilgamesh, golden armor, gate of babylon']],
    [['ea_charge', 'Ea Charge', 'b', 0.35, 'DIVINE', 'He draws the sword of rupture, Ea.'], ['treasure_rain', 'Treasure Rain', 'e', 2.0, 'DIVINE', 'A hundred legendary weapons rain down.'], ['chain_heaven', 'Chains of Heaven', 'd', 1.0, 'DIVINE', 'Chains that bind even gods.', 1]],
    ['enuma_full', 'Enuma Elish: Full Power', 'u', 3.0, 'DIVINE', 'hp30', 'He finally takes his opponent seriously.']),
  saber: kit('saber', [['Excalibur Unsealed', 'hp50', '#facc15', 'saber, blue armor, golden sword']],
    [['mana_burst', 'Mana Burst', 'a', 1.8, 'HOLY', 'A burst of mana from her sword.'], ['invisible_slash', 'Invisible Slash', 'a', 1.6, 'WIND', 'Wind hides the length of her blade.'], ['excalibur_morgan', 'Excalibur Morgan', 'u', 2.6, 'DARK', 'The dark version of Excalibur.', 1]],
    ['avalon_full', 'Avalon: Everdistant Utopia', 'u', 2.9, 'HOLY', 'ally', 'Her sheath shields her from everything as she strikes.']),
  kirito: kit('kirito', [['Dual Blades', 'hp70', '#111827', 'kirito, black coat, dual swords'], ['Star King', 'last', '#facc15', 'kirito, golden aura, star king']],
    [['vorpal_double', 'Double Circular', 'a', 1.8, 'WARRIOR', 'Two swords spin into a circle.', 1], ['eclipse', 'The Eclipse', 'u', 2.6, 'WARRIOR', 'A 27-hit dual-blade combo.', 1], ['release', 'Release Recollection', 'a', 2.2, 'MAGIC', 'His sword turns into a giant tree.', 2]],
    ['for_asuna', 'For Asuna', 'u', 2.9, 'WARRIOR', 'ally', 'Her face flashes in his mind. He gets back up.']),
  frieren: kit('frieren', [['Full Mana', 'hp50', '#c4b5fd', 'frieren, unsealed mana, glowing staff']],
    [['zoltraak_barrage', 'Zoltraak Barrage', 'e', 2.0, 'MAGIC', 'A hundred Zoltraak beams at once.', 1], ['flower_field', 'Flower Field', 'b', 0.3, 'MAGIC', 'A field of flowers to calm the mind.'], ['catastravia', 'Catastravia', 'u', 2.5, 'MAGIC', 'A thousand arrows of light fall from the sky.', 1]],
    ['himmel', 'Himmel would have', 'u', 2.9, 'MAGIC', 'ally', 'Because Himmel would have done the same.']),
  escanor: kit('escanor', [['Noon', 'hp70', '#fbbf24', 'escanor, midday, giant, glowing'], ['The One', 'last', '#facc15', 'escanor the one, glowing sun, giant muscles']],
    [['sunshine_burst', 'Sunshine Burst', 'e', 2.0, 'FIRE', 'He glows like the sun and burns everyone.', 1], ['pride_flare', 'Pride Flare', 'a', 2.2, 'FIRE', 'A tiny sun thrown with one hand.', 1], ['rhitta_slam', 'Rhitta Slam', 'a', 1.8, 'FIRE', 'He swings the giant axe.']],
    ['who_decided', '"Who decided that?"', 'u', 3.0, 'FIRE', 'last', 'The sun is at its highest. Nobody is above him.']),
};

/** Raid villains (looked up from AniList, keyed by name): signature moves, forms and a secret. */
export const VILLAIN_KITS: Record<string, Kit> = {
  'Kaidou': kit('kaidou', [['Hybrid Form', 'hp70', '#3b82f6', 'kaidou hybrid form, dragon horns, kanabo'], ['Azure Dragon', 'hp30', '#1d4ed8', 'giant blue azure dragon']], [['thunder_bagua', 'Thunder Bagua', 'a', 2.0, 'LIGHTNING', 'A kanabo swing charged with conquerors haki.'], ['bolo_breath', 'Bolo Breath', 'e', 2.2, 'FIRE', 'A blast of fire from his dragon mouth.', 1], ['flame_clouds', 'Flame Clouds', 'b', 0.3, 'FIRE', 'He rides on clouds of fire.']], ['ragnaraku', 'Ragnaraku', 'u', 3.0, 'LIGHTNING', 'hp30', 'A world-ending kanabo strike.']),
  'Linlin Charlotte': kit('bigmom', [['Soul Pocus', 'hp70', '#ec4899', 'big mom, zeus cloud, prometheus sun']], [['zeus', 'Zeus Thunder', 'a', 2.0, 'LIGHTNING', 'A cloud homie fires lightning.'], ['prometheus', 'Prometheus Flames', 'e', 2.0, 'FIRE', 'A living sun burns everything.'], ['napoleon', 'Napoleon Slash', 'a', 1.8, 'WARRIOR', 'A giant sword strike.', 1]], ['maser', 'Maser Cannon', 'u', 3.0, 'FIRE', 'hp30', 'Prometheus and Zeus fused into one blast.']),
  'Teach Marshall': kit('blackbeard', [['Two Fruits', 'hp50', '#111827', 'blackbeard, darkness, earthquake']], [['black_hole', 'Black Hole', 'd', 1.0, 'DARK', 'Darkness swallows everything.'], ['quake', 'Quake Punch', 'a', 2.0, 'EARTH', 'A stolen tremor fruit.', 1], ['liberation', 'Liberation', 'e', 1.8, 'DARK', 'He releases what he swallowed.']], ['kurouzu', 'Black Vortex', 'u', 2.9, 'DARK', 'hp30', 'He drags the enemy into darkness.']),
  'Sakazuki': kit('akainu', [['Magma Body', 'hp50', '#ea580c', 'akainu, magma body, marine cloak']], [['meigo', 'Meigo', 'a', 2.2, 'FIRE', 'A magma fist through the chest.'], ['ryusei', 'Ryusei Kazan', 'e', 2.0, 'FIRE', 'A rain of magma fists.', 1], ['magma_hound', 'Magma Hound', 'a', 1.8, 'FIRE', 'A magma dog bites.']], ['absolute_justice', 'Absolute Justice', 'u', 3.0, 'FIRE', 'hp30', 'Evil must be eradicated.']),
  'Doflamingo Donquixote': kit('doflamingo', [['Awakening', 'hp50', '#ec4899', 'doflamingo, strings, pink coat']], [['overheat', 'Overheat', 'a', 1.9, 'WARRIOR', 'A rope of strings hot as fire.'], ['birdcage', 'Birdcage', 'e', 2.0, 'WARRIOR', 'A cage of strings closes in.', 1], ['parasite', 'Parasite', 'd', 1.0, 'MAGIC', 'Strings control the target.']], ['god_thread', 'God Thread', 'u', 2.9, 'WARRIOR', 'hp30', 'Sixteen strings fused into one strike.']),
  'Crocodile': kit('crocodile', [['Sand Body', 'hp50', '#d97706', 'crocodile, sand, hook']], [['desert_spada', 'Desert Spada', 'a', 1.8, 'EARTH', 'A blade of sand.'], ['sables', 'Sables', 'e', 1.8, 'EARTH', 'A sandstorm.', 1], ['hook_poison', 'Poison Hook', 'a', 1.6, 'ASSASSIN', 'A poisoned golden hook.']], ['ground_death', 'Ground Death', 'u', 2.8, 'EARTH', 'hp30', 'He dries out everything.']),
  'Cell': kit('cell', [['Perfect Form', 'hp70', '#22c55e', 'perfect cell, green body, black spots'], ['Super Perfect', 'hp30', '#facc15', 'super perfect cell, golden aura']], [['solar_kame', 'Solar Kamehameha', 'u', 2.4, 'SPIRIT', 'A kamehameha that could destroy the solar system.', 1], ['cell_juniors', 'Cell Juniors', 's', 1.8, 'DARK', 'Seven mini Cells swarm.', 1], ['special_beam_c', 'Special Beam Cannon', 'a', 1.8, 'DARK', 'Stolen from Piccolo.']], ['self_destruct', 'Self-Destruct', 'u', 3.0, 'SPIRIT', 'hp30', 'He swells up to explode.']),
  'Majin Boo': kit('buu', [['Super Buu', 'hp70', '#ec4899', 'super buu, pink, antenna'], ['Kid Buu', 'hp30', '#ec4899', 'kid buu, small, pink, crazy']], [['candy_beam', 'Candy Beam', 'd', 1.0, 'MAGIC', 'Turns the enemy into candy.'], ['planet_burst', 'Planet Burst', 'e', 2.2, 'SPIRIT', 'A ball that destroys a planet.', 2], ['absorb_buu', 'Absorption', 'h', 0.3, 'MAGIC', 'He regenerates from any wound.']], ['vanishing_ball', 'Vanishing Ball', 'u', 3.0, 'SPIRIT', 'hp30', 'Pure destruction.']),
  'Beerus': kit('beerus', [['Destroyer', 'hp50', '#7c3aed', 'beerus, god of destruction, purple aura']], [['hakai_b', 'Hakai', 'u', 2.5, 'DARK', 'Destruction: the target begins to fade.'], ['sphere_destruction', 'Sphere of Destruction', 'e', 2.2, 'DARK', 'A small sun of destruction.', 1], ['tap', 'Godly Tap', 'a', 1.8, 'DIVINE', 'A light tap that hits like a mountain.']], ['wake_up', 'God of Destruction: Annoyed', 'u', 3.0, 'DARK', 'hp30', 'He is now really annoyed.']),
  'Jiren': kit('jiren', [['Full Power', 'hp50', '#ef4444', 'jiren, red aura, glowing eyes']], [['power_impact', 'Power Impact', 'a', 2.1, 'SPIRIT', 'A ball of power thrown like a stone.'], ['glare', 'Glare', 'd', 1.0, 'SPIRIT', 'Just a stare, it hurts.'], ['infinity_rush', 'Infinity Rush', 'a', 1.8, 'WARRIOR', 'A rush of punches.', 1]], ['true_power', 'True Power', 'u', 3.0, 'SPIRIT', 'hp30', 'For the first time, he gets angry.']),
  'Zamasu': kit('zamasu', [['Fused Zamasu', 'hp50', '#22c55e', 'fused zamasu, halo, white hair']], [['holy_wrath', 'Holy Wrath', 'e', 2.2, 'DIVINE', 'A rain of light blades.', 1], ['divine_blade', 'Divine Blade', 'a', 1.9, 'DIVINE', 'A blade of energy from his hand.'], ['immortal', 'Immortal Body', 'h', 0.3, 'DIVINE', 'He cannot die.']], ['world_of_light', 'Zero Mortals Plan', 'u', 3.0, 'DIVINE', 'hp30', 'His body merges with the universe.']),
  'Kaguya Ootsutsuki': kit('kaguya', [['Rabbit Goddess', 'hp50', '#e5e7eb', 'kaguya, byakugan, rinne sharingan']], [['all_killing', 'All-Killing Ash Bones', 'a', 2.2, 'SPIRIT', 'A bone that turns flesh to ash.'], ['expansive', 'Expansive Truth-Seeking Ball', 'e', 2.4, 'SPIRIT', 'A huge orb that destroys everything.', 1], ['dimension_shift', 'Dimension Shift', 'd', 1.0, 'MAGIC', 'She moves the fight to another world.']], ['infinite_k', 'Infinite Tsukuyomi', 'u', 3.0, 'SPIRIT', 'hp30', 'The moon turns red.']),
  'Orochimaru': kit('orochimaru', [['White Snake', 'hp50', '#e5e7eb', 'orochimaru, giant white snake']], [['snake_strike', 'Hidden Shadow Snake Hands', 'a', 1.7, 'EARTH', 'Snakes shoot from his sleeves.'], ['kusanagi_o', 'Kusanagi', 'a', 1.9, 'WARRIOR', 'A sword from his mouth.'], ['manda', 'Summoning: Manda', 's', 2.2, 'EARTH', 'A giant purple snake.', 1]], ['eight_branches', 'Eight Branches Technique', 'u', 2.9, 'EARTH', 'hp30', 'An eight-headed serpent.']),
  'Yhwach': kit('yhwach', [['The Almighty', 'hp70', '#111827', 'yhwach, many eyes, black aura']], [['blut', 'Blut Vene', 'b', 0.35, 'HOLY', 'Blood vessels harden into armour.'], ['heilig', 'Heilig Pfeil', 'e', 2.2, 'HOLY', 'A storm of holy arrows.'], ['almighty', 'The Almighty', 'd', 1.5, 'DIVINE', 'He sees and changes the future.', 1]], ['auswahlen', 'Auswählen', 'u', 3.0, 'HOLY', 'hp30', 'He takes back all power he gave.']),
  'Ulquiorra Cifer': kit('ulquiorra', [['Resurrección', 'hp70', '#22c55e', 'ulquiorra resurreccion, black wings'], ['Segunda Etapa', 'hp30', '#111827', 'ulquiorra segunda etapa, demon, black tail']], [['cero_oscuras', 'Cero Oscuras', 'u', 2.4, 'DARK', 'A black cero.', 1], ['lanza', 'Lanza del Relámpago', 'a', 2.2, 'LIGHTNING', 'A spear of green lightning.', 2], ['cero_u', 'Cero', 'a', 1.8, 'DARK', 'A green cero.']], ['heart', '"Is this a heart?"', 'u', 2.8, 'DARK', 'hp30', 'He finally understands.']),
  'Muzan Kibutsuji': kit('muzan', [['Demon King', 'hp70', '#111827', 'muzan, demon form, tentacles']], [['whip_arms', 'Whip Arms', 'e', 2.0, 'DEMON', 'Arms like whips cut everything.'], ['blood_spike', 'Blood Spike', 'a', 1.8, 'DEMON', 'Spikes of flesh.'], ['regenerate', 'Five Brains Seven Hearts', 'h', 0.35, 'DEMON', 'He regrows instantly.']], ['final_body', 'Final Form', 'u', 3.0, 'DEMON', 'hp30', 'He turns into a giant baby to survive.']),
  'Douma': kit('douma', [['Upper Moon Two', 'hp50', '#7dd3fc', 'douma, ice fans, rainbow eyes']], [['lotus', 'Lotus Vines', 'a', 1.8, 'ICE', 'Ice vines grab the target.'], ['ice_fog', 'Frozen Mist', 'd', 1.0, 'ICE', 'Breathing the air freezes the lungs.'], ['ice_buddha', 'Crystalline Divine Child', 's', 2.0, 'ICE', 'Ice clones of himself.', 1]], ['buddha_ice', 'Ice Buddha', 'u', 2.9, 'ICE', 'hp30', 'A giant ice statue crushes the enemy.']),
  'Mahito': kit('mahito', [['Instant Spirit Body', 'hp30', '#94a3b8', 'mahito, true form, patchwork']], [['idle_transfig', 'Idle Transfiguration', 'a', 2.0, 'SPIRIT', 'He reshapes the soul.'], ['polymorphic', 'Polymorphic Soul Isomer', 's', 1.8, 'SPIRIT', 'Transfigured humans attack.'], ['self_embodiment', 'Self-Embodiment of Perfection', 'd', 1.5, 'SPIRIT', 'His domain.', 1]], ['true_form', 'Instant Spirit Body of Distorted Killing', 'u', 2.9, 'SPIRIT', 'hp30', 'His true soul.']),
  'Kenjaku': kit('kenjaku', [['Gravity Technique', 'hp50', '#111827', 'kenjaku, geto, forehead stitches']], [['uzumaki', 'Uzumaki', 'e', 2.2, 'DARK', 'Thousands of curses spiral into one.'], ['gravity', 'Anti-Gravity', 'd', 1.0, 'EARTH', 'Gravity crushes the target.'], ['curse_army', 'Curse Army', 's', 1.8, 'DARK', 'A swarm of curses.', 1]], ['womb', 'Womb Profusion', 'u', 2.9, 'DARK', 'hp30', 'His own domain.']),
  'All For One': kit('afo', [['Prime', 'hp50', '#111827', 'all for one, young, black tendrils']], [['air_cannon_afo', 'Air Cannon + Strength', 'a', 2.0, 'WIND', 'Stacked quirks in one punch.'], ['forced_quirk', 'Forced Quirk', 'd', 1.0, 'DARK', 'He forces a quirk on the target.'], ['black_tendrils', 'Black Tendrils', 'e', 2.0, 'DARK', 'Tendrils pierce everything.', 1]], ['all_quirks', 'All Quirks Unleashed', 'u', 3.0, 'DARK', 'hp30', 'Every quirk he ever stole.']),
  'Kai Chisaki': kit('overhaul', [['Fused', 'hp50', '#475569', 'overhaul fused, giant arms']], [['overhaul_spike', 'Overhaul Spikes', 'e', 2.0, 'EARTH', 'The ground turns into spikes.'], ['disassemble', 'Disassemble', 'a', 1.8, 'DARK', 'He takes the target apart.'], ['repair', 'Reassemble', 'h', 0.3, 'EARTH', 'He rebuilds himself.']], ['overhaul_full', 'Full Overhaul', 'u', 2.8, 'EARTH', 'hp30', 'He reshapes the whole area.']),
  'Chrollo Lucilfer': kit('chrollo', [['Skill Hunter', 'hp50', '#111827', 'chrollo, book of skills, cross']], [['sun_moon', 'Sun and Moon', 'a', 2.0, 'MAGIC', 'Stamps that explode.'], ['indoor_fish', 'Indoor Fish', 's', 1.8, 'DARK', 'Fish that eat flesh.'], ['double_face', 'Double Face', 'd', 1.0, 'MAGIC', 'He takes someone\'s face.', 1]], ['black_voice', 'Black Voice', 'u', 2.8, 'MAGIC', 'hp30', 'Puppets of all his victims.']),
  'Neferpitou': kit('pitou', [['Terpsichora', 'hp50', '#e5e7eb', 'neferpitou, cat ears, terpsichora puppet']], [['claw', 'Claw Strike', 'a', 1.9, 'ASSASSIN', 'A claw faster than sight.'], ['doctor_blythe', 'Doctor Blythe', 'h', 0.3, 'MAGIC', 'A nurse doll heals.'], ['puppet', 'Puppet Master', 'd', 1.0, 'MAGIC', 'Controls the dead.', 1]], ['last_puppet', 'Final Puppet', 'u', 2.9, 'MAGIC', 'hp30', 'Even after death, it keeps fighting.']),
  'King Bradley': kit('bradley', [['Ultimate Eye', 'hp70', '#ef4444', 'king bradley, eyepatch off, ouroboros eye']], [['five_swords', 'Five Swords', 'a', 2.0, 'WARRIOR', 'He sees every move and cuts all.'], ['tank_slice', 'Tank Slice', 'a', 1.8, 'WARRIOR', 'He slices a tank in half.'], ['eye_read', 'Ultimate Eye', 'b', 0.4, 'SPIRIT', 'Nothing gets past him.', 1]], ['last_charge', 'Last Charge', 'u', 2.9, 'WARRIOR', 'hp30', 'He dies swinging.']),
  'Zeref': kit('zeref', [['Ankhseram', 'hp50', '#111827', 'zeref, black magic, black aura']], [['death_wave', 'Death Wave', 'e', 2.2, 'DARK', 'A wave of death magic.'], ['black_orb', 'Black Orb', 'a', 1.9, 'DARK', 'An orb of black magic.'], ['dark_shield', 'Dark Shield', 'b', 0.3, 'DARK', 'A shield of dark magic.', 1]], ['fairy_heart', 'Fairy Heart', 'u', 3.0, 'MAGIC', 'hp30', 'Infinite magic.']),
  'Acnologia': kit('acnologia', [['Dragon King', 'hp50', '#111827', 'acnologia dragon form, black dragon']], [['dragon_roar', 'Dragon Roar', 'e', 2.2, 'DRAGON', 'A roar that wipes islands.'], ['dragon_claw', 'Dragon Claw', 'a', 2.0, 'DRAGON', 'A claw of the dragon king.'], ['eat_magic', 'Eat Magic', 'h', 0.3, 'DRAGON', 'He eats all magic.', 1]], ['apocalypse', 'Apocalypse Dragon', 'u', 3.0, 'DRAGON', 'hp30', 'The king of dragons.']),
  'Kars': kit('kars', [['Ultimate Being', 'hp50', '#facc15', 'kars ultimate being, wings']], [['light_blade', 'Light Mode Blades', 'a', 2.0, 'HOLY', 'Blades of light from his arms.'], ['hamon_kars', 'Hamon', 'a', 1.8, 'HOLY', 'He uses Hamon too.', 1], ['life_form', 'Life Form Shift', 'h', 0.3, 'EARTH', 'He becomes anything.', 1]], ['volcano_k', 'Into Space', 'u', 2.8, 'HOLY', 'hp30', 'Ultimate being.']),
  'Yoshikage Kira': kit('kira', [['Killer Queen', 'hp70', '#ec4899', 'killer queen stand behind him']], [['sheer_heart', 'Sheer Heart Attack', 's', 1.9, 'FIRE', 'A tank that seeks heat.'], ['killer_queen', 'Killer Queen: First Bomb', 'a', 2.0, 'FIRE', 'Anything touched explodes.'], ['air_bomb', 'Stray Cat Air Bomb', 'a', 1.8, 'WIND', 'Air bubbles that explode.', 1]], ['bites_dust', 'Bites the Dust', 'u', 3.0, 'FIRE', 'hp30', 'Time rewinds. The bomb was always there.']),
  'Makima': kit('makima', [['Control Devil', 'hp50', '#dc2626', 'makima, ringed eyes, red hair']], [['bang', '"Bang"', 'a', 2.2, 'DEMON', 'She points. Things die.'], ['control', 'Control', 'd', 1.5, 'DEMON', 'She commands the target.'], ['contract', 'Contract Damage Transfer', 'b', 0.4, 'DEMON', 'Her damage goes to someone else.', 1]], ['dogs', 'Leashed Devils', 'u', 3.0, 'DEMON', 'hp30', 'All her controlled devils at once.']),
  'Griffith': kit('griffith', [['Femto', 'hp30', '#111827', 'femto, black wings, helmet']], [['hawk_strike', 'Hawk Strike', 'a', 2.0, 'WARRIOR', 'A perfect fencing strike.'], ['band', 'Band of the Hawk', 's', 1.8, 'WARRIOR', 'His army rides in.'], ['gravity_f', 'Gravity Control', 'd', 1.5, 'DARK', 'He crushes with gravity.', 1]], ['eclipse_g', 'The Eclipse', 'u', 3.0, 'DARK', 'hp30', 'He sacrifices everyone.']),
  'Boros-sama': kit('boros', [['Meteoric Burst', 'hp50', '#3b82f6', 'boros meteoric burst, blue aura']], [['regen_b', 'Regeneration', 'h', 0.35, 'SPIRIT', 'He regrows instantly.'], ['meteoric', 'Meteoric Burst', 'a', 2.2, 'SPIRIT', 'He becomes a meteor.', 1], ['blade_punch', 'Blade Arms', 'a', 1.9, 'WARRIOR', 'Arms like blades.']], ['collapsing_star', 'Collapsing Star Roaring Cannon', 'u', 3.0, 'SPIRIT', 'hp30', 'A beam to wipe out a planet.']),
  'Garou': kit('garou', [['Monster Mode', 'hp50', '#111827', 'garou monster mode'], ['Cosmic Fear', 'hp30', '#7c3aed', 'garou cosmic fear mode, galaxy body']], [['flowing_water', 'Water Stream Rock Smashing Fist', 'a', 2.0, 'WATER', 'A martial arts flow.'], ['gamma_ray', 'Gamma Ray Burst', 'u', 2.6, 'DIVINE', 'A beam of cosmic energy.', 2], ['hero_hunt', 'Hero Hunt', 'a', 1.8, 'WARRIOR', 'Fighting for the monsters.']], ['copy_zero', 'Zero Punch (copied)', 'u', 3.0, 'WARRIOR', 'hp30', 'He copies Saitama\'s technique.']),
  'Kishou Arima': kit('arima', [['IXA', 'hp50', '#e5e7eb', 'arima, white hair, glasses, ixa quinque']], [['ixa', 'IXA Lance', 'a', 2.0, 'LIGHTNING', 'A lance that pierces kagune.'], ['narukami_a', 'Narukami', 'a', 2.0, 'LIGHTNING', 'Lightning-firing quinque.'], ['ixa_shield', 'IXA Shield', 'b', 0.35, 'WARRIOR', 'The lance becomes a shield.', 1]], ['grim_reaper', 'Grim Reaper of the CCG', 'u', 2.9, 'WARRIOR', 'hp30', 'He has never lost.']),
  'Zeke': kit('zeke', [['Beast Titan', 'hp70', '#92400e', 'beast titan, huge, furry']], [['pitch', 'Fastball', 'e', 2.1, 'EARTH', 'He pitches a rock storm.', 1], ['scream', 'Scream', 'd', 1.0, 'SPIRIT', 'He turns people into titans.'], ['throw', 'Rock Throw', 'a', 1.8, 'EARTH', 'A crushing throw.']], ['euthanize', 'Euthanasia Plan', 'u', 2.9, 'SPIRIT', 'hp30', 'All Eldians at once.']),
  'Momonga': kit('ainz', [['Overlord', 'hp50', '#7c3aed', 'ainz ooal gown, skeleton, purple robes']], [['grasp_heart', 'Grasp Heart', 'a', 2.2, 'DARK', 'He crushes the heart from afar.'], ['meteor_fall', 'Fallen Down', 'e', 2.2, 'FIRE', 'A super-tier spell.', 1], ['undead_army', 'Undead Army', 's', 1.8, 'DARK', 'An army of undead.']], ['goal_of_death', 'The Goal of All Life is Death', 'u', 3.0, 'DARK', 'hp30', 'Time stops, then everyone dies.']),
  'Alucard': kit('alucard', [['Control Art Release', 'hp50', '#dc2626', 'alucard, release, red coat, many eyes']], [['jackal', 'Jackal', 'a', 2.0, 'WARRIOR', 'A massive pistol.'], ['hellhound', 'Hellhound Baskerville', 's', 1.9, 'DEMON', 'A black dog with many eyes.'], ['familiar', 'Familiars', 'e', 1.8, 'DEMON', 'Bats and eyes everywhere.', 1]], ['cromwell', 'Cromwell Level Zero', 'u', 3.0, 'DEMON', 'hp30', 'His army of souls is released.']),
};

/** Every kit move, for the move registry. */
export const KIT_MOVES: Ability[] = [...Object.values(KITS), ...Object.values(VILLAIN_KITS)].flatMap((k) => [...k.moves, k.secret]);

/** The kit for a character, from their id (built-ins) or name (raid villains). */
export function kitFor(charId: string, name?: string): Kit | null {
  if (charId.startsWith('legend:')) return KITS[charId.slice(7)] ?? null;
  return (name && VILLAIN_KITS[name]) || null;
}
