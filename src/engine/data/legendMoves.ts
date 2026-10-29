// Signature moves for the Anime Legends roster. Move names are the ones used
// in each series; descriptions and the "look" lines are written for this game.
// Every move maps onto a normal engine mechanic (kind, power, cost, status).
import type { Ability, AbilityKind, AbilityTarget, AbilityTrigger, StatusApply, Tag, VfxKind } from '../types';

interface Opts { el?: Tag; st?: StatusApply; tr?: AbilityTrigger; pierce?: boolean; c2?: string; shout?: string }

const st = (type: StatusApply['type'], chance: number, duration: number, magnitude: number): StatusApply => ({ type, chance, duration, magnitude });

const STYLE: Record<VfxKind, Ability['fx']['style']> = {
  slash: 'slash', beam: 'beam', projectile: 'beam', explosion: 'burst', barrage: 'burst', lightning: 'beam', fire: 'beam',
  genjutsu: 'wave', domain: 'wave', aura: 'glow', summon: 'burst', shield: 'shield', heal: 'glow', wave: 'wave', punch: 'burst', ice: 'wave',
};

function mv(
  owner: string, key: string, name: string, kind: AbilityKind, target: AbilityTarget, cost: number, cooldown: number, power: number,
  vfx: VfxKind, color: string, look: string, description: string, o: Opts = {},
): Ability {
  return {
    id: `${owner}:${key}`, owner, name, kind, target, cost, cooldown, power, description, look, vfx, color2: o.c2,
    shout: o.shout ?? `${name.toUpperCase()}!`, fx: { color, style: STYLE[vfx] }, trigger: o.tr ?? 'always', element: o.el, status: o.st, piercing: o.pierce,
  };
}

/** Per character: [known1, known2, hidden, ultimate (unlocked by evolution)]. */
export const LEGEND_MOVESETS: Record<string, Ability[]> = {
  naruto: [
    mv('naruto', 'clones', 'Shadow Clone Jutsu', 'aoe', 'all_enemies', 22, 3, 0.95, 'barrage', '#f97316', 'A puff of smoke and dozens of orange-clad clones dog-pile every enemy.', 'Floods the field with clones that mob all enemies.', { el: 'WIND' }),
    mv('naruto', 'rasengan', 'Rasengan', 'attack', 'enemy', 18, 2, 1.75, 'projectile', '#60a5fa', 'A spinning sphere of blue chakra forms in his palm and is driven into the target.', 'A compressed spiral of chakra slammed into one enemy.', { el: 'WIND', c2: '#e0f2fe' }),
    mv('naruto', 'sage', 'Sage Mode', 'buff', 'self', 18, 5, 0, 'aura', '#f59e0b', 'Orange pigment rings his eyes as natural energy flows in; his whole body glows.', 'Absorbs natural energy: big damage boost for 3 actions.', { st: st('focus', 1, 3, 0.3) }),
    mv('naruto', 'tbb', 'Tailed Beast Bomb', 'ultimate', 'all_enemies', 42, 7, 1.7, 'explosion', '#fb923c', 'Kurama\'s jaws open over the arena and a black-and-white chakra orb detonates on the enemy line.', 'Kurama Mode finisher that hits every enemy.', { el: 'SPIRIT', tr: 'hp_below_50', c2: '#1e1b4b' }),
  ],
  sasuke: [
    mv('sasuke', 'chidori', 'Chidori', 'attack', 'enemy', 18, 2, 1.7, 'lightning', '#7dd3fc', 'A thousand chirping birds of lightning crackle in his hand as he charges straight through.', 'A lightning-charged thrust that can paralyse.', { el: 'LIGHTNING', st: st('stun', 0.2, 1, 0) }),
    mv('sasuke', 'fireball', 'Fireball Jutsu', 'attack', 'enemy', 15, 2, 1.45, 'fire', '#f97316', 'He exhales a roaring ball of flame that engulfs the target.', 'Great Fireball Technique; may set the target ablaze.', { el: 'FIRE', st: st('burn', 0.4, 2, 0.04) }),
    mv('sasuke', 'amaterasu', 'Amaterasu', 'attack', 'enemy', 24, 4, 1.4, 'fire', '#111827', 'His left eye bleeds and black flames that never go out burst across the target.', 'Inextinguishable black flames: heavy, lasting burn.', { el: 'FIRE', st: st('burn', 0.9, 4, 0.06), c2: '#7c3aed', pierce: true }),
    mv('sasuke', 'indra', 'Indra\'s Arrow', 'ultimate', 'enemy', 40, 6, 2.8, 'beam', '#a855f7', 'A purple Susanoo draws a bow the size of a mountain and looses an arrow of pure lightning.', 'Susanoo arrow charged with every bit of his chakra.', { el: 'LIGHTNING', tr: 'hp_below_50', pierce: true, c2: '#f0abfc' }),
  ],
  itachi: [
    mv('itachi', 'phoenix', 'Phoenix Flower Jutsu', 'attack', 'enemy', 15, 2, 1.45, 'barrage', '#fb923c', 'A volley of small fireballs, each hiding a shuriken, rains in from odd angles.', 'Hidden shuriken inside fireballs.', { el: 'FIRE', st: st('bleed', 0.35, 2, 0.03) }),
    mv('itachi', 'crows', 'Crow Genjutsu', 'debuff', 'enemy', 16, 3, 0.4, 'genjutsu', '#dc2626', 'He dissolves into a flock of crows; the target sees him everywhere and loses focus.', 'Illusion that weakens the target.', { el: 'SHADOW', st: st('weaken', 0.85, 3, 0.2) }),
    mv('itachi', 'tsukuyomi', 'Tsukuyomi', 'debuff', 'enemy', 26, 5, 0.8, 'genjutsu', '#b91c1c', 'The world turns red and black. Seventy-two hours of torment pass in a single second.', 'Mangekyou genjutsu that locks the target in place.', { el: 'SHADOW', st: st('stun', 0.8, 1, 0), c2: '#000000' }),
    mv('itachi', 'totsuka', 'Susanoo: Totsuka Blade', 'ultimate', 'enemy', 40, 6, 2.6, 'slash', '#ef4444', 'A crimson Susanoo rises behind him and seals the target with a blade of sake-like liquid.', 'The spirit sword that seals anything it pierces.', { el: 'SPIRIT', tr: 'hp_below_50', pierce: true }),
  ],
  kakashi: [
    mv('kakashi', 'raikiri', 'Raikiri', 'attack', 'enemy', 18, 2, 1.75, 'lightning', '#bae6fd', 'Lightning screams in his palm; he blurs forward and splits the target\'s guard.', 'The Lightning Blade, refined from Chidori.', { el: 'LIGHTNING', pierce: true }),
    mv('kakashi', 'hounds', 'Summoning: Ninja Hounds', 'summon', 'enemy', 20, 3, 1.4, 'summon', '#a8a29e', 'Eight ninja dogs burst out of the ground and pin the target in their jaws.', 'Summoned hounds bite and hold the target.', { el: 'EARTH', st: st('stun', 0.35, 1, 0) }),
    mv('kakashi', 'copy', 'Sharingan Copy', 'buff', 'self', 14, 4, 0, 'aura', '#dc2626', 'He lifts his headband; the Sharingan reads every move before it happens.', 'Copies the enemy\'s rhythm: focus for 3 actions.', { st: st('focus', 1, 3, 0.25) }),
    mv('kakashi', 'kamui', 'Kamui', 'ultimate', 'enemy', 38, 6, 2.5, 'domain', '#1e3a8a', 'Space twists into a spiral around the target and tears them toward another dimension.', 'Mangekyou space-time warp.', { tr: 'hp_below_50', pierce: true, c2: '#000000' }),
  ],
  luffy: [
    mv('luffy', 'pistol', 'Gum-Gum Pistol', 'attack', 'enemy', 12, 1, 1.4, 'punch', '#ef4444', 'His arm stretches across the whole arena and snaps back with a rubbery crack.', 'A stretching long-range punch.', { pierce: true }),
    mv('luffy', 'gatling', 'Gum-Gum Gatling', 'attack', 'enemy', 20, 3, 1.75, 'barrage', '#f87171', 'A blur of a hundred stretching fists hammers the target.', 'Rapid-fire rubber punches.', { el: 'WARRIOR' }),
    mv('luffy', 'gear2', 'Gear Second', 'buff', 'self', 16, 4, 0, 'aura', '#f472b6', 'He pumps his blood; pink steam pours off his skin as he vanishes into high speed.', 'Pumped blood: haste and focus for 3 actions.', { st: st('haste', 1, 3, 0.35) }),
    mv('luffy', 'kong', 'Gear Fourth: King Kong Gun', 'ultimate', 'enemy', 42, 7, 2.8, 'explosion', '#b91c1c', 'He inflates into Boundman, cocks a fist the size of a house and fires it down like a cannon.', 'Gear Fourth\'s giant armament-haki fist.', { tr: 'hp_below_50', c2: '#111827' }),
  ],
  zoro: [
    mv('zoro', 'onigiri', 'Oni Giri', 'attack', 'enemy', 15, 2, 1.6, 'slash', '#a3e635', 'Three swords cross in an X and he dashes straight through the target.', 'Three-Sword Style demon slash.', { el: 'WARRIOR', st: st('bleed', 0.4, 2, 0.035) }),
    mv('zoro', 'phoenix', '36 Pound Phoenix', 'attack', 'enemy', 16, 2, 1.5, 'wave', '#bef264', 'A spinning flying slash leaves his blades and carves through the air like a bird.', 'Long-range flying slash.', { el: 'WIND', pierce: true }),
    mv('zoro', 'asura', 'Asura: Nine Swords', 'attack', 'enemy', 30, 5, 2.2, 'slash', '#65a30d', 'A haze surrounds him; three heads and six arms appear, and nine blades strike at once.', 'Demonic illusion of nine swords.', { el: 'DEMON', c2: '#1a2e05' }),
    mv('zoro', 'hell', 'King of Hell: Three-Sword Style', 'ultimate', 'enemy', 40, 6, 2.7, 'slash', '#4d7c0f', 'Conqueror\'s haki coats his blades black-red; the slash splits the sky behind the target.', 'The King of Hell\'s finishing strike.', { el: 'DEMON', tr: 'hp_below_50', c2: '#7f1d1d' }),
  ],
  sanji: [
    mv('sanji', 'diable', 'Diable Jambe', 'attack', 'enemy', 16, 2, 1.55, 'fire', '#f97316', 'He spins on one hand until his leg glows red-hot, then kicks.', 'A flaming spin-kick.', { el: 'FIRE', st: st('burn', 0.4, 2, 0.035) }),
    mv('sanji', 'concasse', 'Concasse', 'attack', 'enemy', 14, 2, 1.45, 'punch', '#fde68a', 'He flips high and drops his heel onto the target like a guillotine.', 'A crushing axe-kick from above.', { el: 'WARRIOR' }),
    mv('sanji', 'skywalk', 'Sky Walk', 'buff', 'self', 12, 4, 0, 'aura', '#93c5fd', 'He kicks the air itself and runs upward, impossible to pin down.', 'Air-running: haste for 3 actions.', { el: 'WIND', st: st('haste', 1, 3, 0.35) }),
    mv('sanji', 'ifrit', 'Ifrit Jambe', 'ultimate', 'enemy', 38, 6, 2.6, 'fire', '#2563eb', 'His leg burns blue and white with heat hot enough to warp the air.', 'Blue-flame evolution of Diable Jambe.', { el: 'FIRE', tr: 'hp_below_50', c2: '#f8fafc', st: st('burn', 0.6, 3, 0.05) }),
  ],
  ace: [
    mv('ace', 'firefist', 'Fire Fist', 'attack', 'enemy', 18, 2, 1.75, 'fire', '#f97316', 'His arm becomes a pillar of fire that roars across the battlefield.', 'A giant fist of flame.', { el: 'FIRE', st: st('burn', 0.4, 2, 0.04), pierce: true }),
    mv('ace', 'firegun', 'Fire Gun', 'attack', 'enemy', 14, 2, 1.4, 'barrage', '#fdba74', 'He points his fingers like pistols and fires bullets of flame.', 'Rapid flame bullets.', { el: 'FIRE' }),
    mv('ace', 'fireflies', 'Phosphorescent Fireflies', 'aoe', 'all_enemies', 26, 4, 1.05, 'fire', '#fde047', 'Hundreds of glowing green-gold fireflies drift over the enemy line, then explode.', 'Fireflies that detonate on every enemy.', { el: 'FIRE', st: st('burn', 0.3, 2, 0.03), c2: '#84cc16' }),
    mv('ace', 'emperor', 'Flame Emperor', 'ultimate', 'all_enemies', 44, 7, 1.7, 'explosion', '#ea580c', 'A miniature sun swells above his raised hand and is hurled at the enemy.', 'His strongest technique: a giant fireball.', { el: 'FIRE', tr: 'hp_below_50' }),
  ],
  goku: [
    mv('goku', 'kamehameha', 'Kamehameha', 'attack', 'enemy', 20, 2, 1.8, 'beam', '#38bdf8', '"Ka... me... ha... me..." A blue wave of ki erupts from his cupped hands.', 'The Turtle School\'s signature energy wave.', { pierce: true, c2: '#e0f2fe' }),
    mv('goku', 'transmission', 'Instant Transmission Strike', 'attack', 'enemy', 14, 2, 1.4, 'punch', '#facc15', 'Two fingers to his forehead, he blinks out and reappears behind the target mid-punch.', 'Teleport and strike from any angle.', { pierce: true }),
    mv('goku', 'ssj', 'Super Saiyan', 'buff', 'self', 18, 5, 0, 'aura', '#fde047', 'His hair flares gold, a blazing aura erupts and the ground cracks around him.', 'Transformation: big damage boost for 3 actions.', { st: st('focus', 1, 3, 0.35) }),
    mv('goku', 'spiritbomb', 'Spirit Bomb', 'ultimate', 'all_enemies', 44, 7, 1.75, 'explosion', '#7dd3fc', 'He raises both hands; a sphere of energy gathered from all living things grows to the size of a moon.', 'Energy borrowed from every living thing.', { el: 'SPIRIT', tr: 'hp_below_50', c2: '#ffffff' }),
  ],
  vegeta: [
    mv('vegeta', 'galick', 'Galick Gun', 'attack', 'enemy', 20, 2, 1.8, 'beam', '#a855f7', 'He crosses his arms and fires a purple beam of pure Saiyan pride.', 'A purple energy wave.', { pierce: true, c2: '#f0abfc' }),
    mv('vegeta', 'bigbang', 'Big Bang Attack', 'attack', 'enemy', 18, 3, 1.7, 'projectile', '#38bdf8', 'One open palm; a sphere of ki shoots out and erupts into a dome of light.', 'A single explosive energy sphere.', { c2: '#ffffff' }),
    mv('vegeta', 'blue', 'Super Saiyan Blue', 'buff', 'self', 20, 5, 0, 'aura', '#0ea5e9', 'A calm blue flame of godly ki surrounds him; his eyes go cold.', 'God ki transformation: focus for 3 actions.', { el: 'DIVINE', st: st('focus', 1, 3, 0.35) }),
    mv('vegeta', 'finalflash', 'Final Flash', 'ultimate', 'enemy', 42, 6, 2.8, 'beam', '#fde047', 'He spreads his arms wide, slams his palms together and a golden beam blots out the arena.', 'His strongest beam, fired at point blank.', { tr: 'hp_below_50', pierce: true, c2: '#ffffff' }),
  ],
  frieza: [
    mv('frieza', 'deathbeam', 'Death Beam', 'attack', 'enemy', 12, 1, 1.45, 'beam', '#e879f9', 'A thin, silent purple ray from his fingertip pierces straight through.', 'A precise, piercing ray.', { pierce: true }),
    mv('frieza', 'deathball', 'Death Ball', 'aoe', 'all_enemies', 30, 4, 1.15, 'explosion', '#f97316', 'He raises one finger; a small red sun grows above it and falls on the enemy line.', 'A planet-destroying sphere, scaled down.', { c2: '#fde047' }),
    mv('frieza', 'golden', 'Golden Frieza', 'buff', 'self', 20, 5, 0, 'aura', '#facc15', 'His body shines gold and purple; a cruel smile spreads.', 'Golden transformation: damage boost for 3 actions.', { st: st('focus', 1, 3, 0.35) }),
    mv('frieza', 'supernova', 'Supernova', 'ultimate', 'all_enemies', 44, 7, 1.7, 'explosion', '#ef4444', 'A massive orange ball of destruction screams down and swallows everything.', 'His planet-buster, aimed at the enemy team.', { tr: 'hp_below_50' }),
  ],
  ichigo: [
    mv('ichigo', 'getsuga', 'Getsuga Tensho', 'attack', 'enemy', 18, 2, 1.75, 'wave', '#60a5fa', 'He swings Zangetsu and a crescent of blue-white spiritual energy tears across the ground.', 'Moon-fang slash of spirit energy.', { el: 'SPIRIT', pierce: true }),
    mv('ichigo', 'shunpo', 'Flash Step Slash', 'attack', 'enemy', 13, 1, 1.35, 'slash', '#e5e7eb', 'He vanishes and reappears mid-swing behind the target.', 'A high-speed step and cut.', { el: 'WARRIOR' }),
    mv('ichigo', 'bankai', 'Bankai: Tensa Zangetsu', 'buff', 'self', 18, 5, 0, 'aura', '#111827', 'A black pillar of reiatsu explodes upward; he emerges in a black coat with a slim black blade.', 'Bankai: haste and focus for 3 actions.', { st: st('haste', 1, 3, 0.4), c2: '#dc2626' }),
    mv('ichigo', 'mugetsu', 'Mugetsu', 'ultimate', 'enemy', 44, 7, 2.9, 'domain', '#000000', 'Black hair to his ankles, he swings once and the whole arena is swallowed by darkness.', 'The Final Getsuga Tensho.', { el: 'SPIRIT', tr: 'hp_below_30', pierce: true, c2: '#991b1b' }),
  ],
  byakuya: [
    mv('byakuya', 'senbonzakura', 'Senbonzakura', 'aoe', 'all_enemies', 22, 3, 0.95, 'barrage', '#f9a8d4', 'His blade scatters into a thousand pink petal-blades that slice the whole enemy line.', 'A thousand cherry-blossom blades.', { el: 'WIND', st: st('bleed', 0.35, 2, 0.03) }),
    mv('byakuya', 'byakurai', 'Hado #4: Byakurai', 'attack', 'enemy', 14, 2, 1.45, 'lightning', '#f5f5f4', 'A pale lightning beam shoots silently from his fingertip.', 'Kido lightning ray.', { el: 'LIGHTNING', pierce: true }),
    mv('byakuya', 'kageyoshi', 'Bankai: Senbonzakura Kageyoshi', 'aoe', 'all_enemies', 30, 5, 1.25, 'barrage', '#fbcfe8', 'Giant blades rise from the ground and shatter into a pink storm.', 'Bankai: a hundred million petal blades.', { el: 'WIND', st: st('bleed', 0.5, 3, 0.035) }),
    mv('byakuya', 'hakuteiken', 'Shukei: Hakuteiken', 'ultimate', 'enemy', 40, 6, 2.7, 'slash', '#ffffff', 'All the petals condense into a single blade; white wings of reiatsu unfold behind him.', 'Every blade gathered into one.', { el: 'SPIRIT', tr: 'hp_below_50', c2: '#f9a8d4' }),
  ],
  aizen: [
    mv('aizen', 'kurohitsugi', 'Hado #90: Kurohitsugi', 'attack', 'enemy', 22, 3, 1.85, 'domain', '#18181b', 'A black coffin of gravity rises around the target; spears pierce it from inside.', 'The Black Coffin.', { el: 'DARK', pierce: true, c2: '#7c3aed' }),
    mv('aizen', 'rikujo', 'Bakudo #61: Six Rods', 'debuff', 'enemy', 16, 3, 0.3, 'shield', '#fde68a', 'Six beams of light slam into the target\'s waist and lock them in place.', 'Binding kido.', { el: 'HOLY', st: st('stun', 0.7, 1, 0) }),
    mv('aizen', 'kyoka', 'Kyoka Suigetsu', 'debuff', 'enemy', 22, 4, 0.5, 'genjutsu', '#a78bfa', 'His blade dissolves into mist; the target is now attacking a reflection of their ally.', 'Complete hypnosis.', { el: 'MAGIC', st: st('weaken', 0.9, 3, 0.25) }),
    mv('aizen', 'hogyoku', 'Hogyoku Transcendence', 'ultimate', 'all_enemies', 42, 7, 1.65, 'explosion', '#c084fc', 'The Hogyoku in his chest pulses; his body breaks apart into a winged, transcendent form that crushes the field.', 'Fusion with the Hogyoku.', { el: 'DARK', tr: 'hp_below_50' }),
  ],
  gojo: [
    mv('gojo', 'blue', 'Lapse: Blue', 'attack', 'enemy', 16, 2, 1.55, 'projectile', '#3b82f6', 'A point of blue appears and everything around the target is sucked into it.', 'Attraction that crushes the target inward.', { el: 'MAGIC', pierce: true }),
    mv('gojo', 'red', 'Reversal: Red', 'attack', 'enemy', 20, 3, 1.85, 'explosion', '#ef4444', 'A red point flares at his fingertip and blasts the target away like a cannon.', 'Repulsion that hurls the target.', { el: 'MAGIC' }),
    mv('gojo', 'infinity', 'Infinity', 'shield', 'self', 18, 4, 0.3, 'shield', '#93c5fd', 'Attacks slow to a crawl and stop a hair from his skin.', 'An infinite barrier absorbs incoming damage.', { el: 'MAGIC' }),
    mv('gojo', 'purple', 'Hollow Purple', 'ultimate', 'enemy', 44, 7, 2.9, 'beam', '#a855f7', 'Blue and Red collide into an imaginary mass that erases a path through the arena.', 'Infinity\'s attraction and repulsion combined.', { el: 'MAGIC', tr: 'hp_below_50', pierce: true, c2: '#ffffff' }),
  ],
  yuji: [
    mv('yuji', 'divergent', 'Divergent Fist', 'attack', 'enemy', 13, 1, 1.4, 'punch', '#f87171', 'His punch lands, then a delayed wave of cursed energy hits a second time.', 'A double-impact punch.', { el: 'WARRIOR' }),
    mv('yuji', 'manji', 'Manji Kick', 'attack', 'enemy', 14, 2, 1.45, 'punch', '#fca5a5', 'He grabs the target and spins into a crushing kick.', 'A grappling kick.', { el: 'WARRIOR', st: st('stun', 0.2, 1, 0) }),
    mv('yuji', 'blackflash', 'Black Flash', 'attack', 'enemy', 22, 3, 2.1, 'lightning', '#000000', 'Space distorts; black lightning sparks off his fist at the instant of impact.', 'Cursed energy hitting within a millionth of a second.', { el: 'DARK', c2: '#ef4444' }),
    mv('yuji', 'chain', 'Black Flash Chain', 'ultimate', 'enemy', 38, 6, 2.7, 'barrage', '#111827', 'He enters the zone and lands Black Flash after Black Flash.', 'Consecutive Black Flashes.', { el: 'DARK', tr: 'hp_below_50', c2: '#dc2626' }),
  ],
  sukuna: [
    mv('sukuna', 'dismantle', 'Dismantle', 'attack', 'enemy', 14, 1, 1.5, 'slash', '#ef4444', 'Invisible slashes carve the air; the target simply comes apart.', 'Unseen cutting technique.', { el: 'DEMON', pierce: true, st: st('bleed', 0.4, 2, 0.035) }),
    mv('sukuna', 'cleave', 'Cleave', 'attack', 'enemy', 18, 2, 1.75, 'slash', '#b91c1c', 'One touch and a slash calibrated to the target\'s toughness cuts them clean.', 'A cut adjusted to the target.', { el: 'DEMON' }),
    mv('sukuna', 'fuga', 'Fuga: Open', 'attack', 'enemy', 26, 4, 2.0, 'fire', '#f97316', 'A bow of flame forms in his hands; he draws and fires a blazing arrow.', 'Flame arrow.', { el: 'FIRE', st: st('burn', 0.6, 3, 0.05) }),
    mv('sukuna', 'shrine', 'Domain Expansion: Malevolent Shrine', 'ultimate', 'all_enemies', 44, 7, 1.7, 'domain', '#7f1d1d', 'A shrine of skulls rises; every surface inside the domain is shredded by endless slashes.', 'His domain: guaranteed hits on everyone.', { el: 'DEMON', tr: 'hp_below_50', c2: '#000000', st: st('bleed', 0.6, 3, 0.04) }),
  ],
  megumi: [
    mv('megumi', 'dogs', 'Divine Dogs', 'summon', 'enemy', 16, 2, 1.5, 'summon', '#e5e7eb', 'He forms a dog with his hands; a black and a white wolf leap from his shadow.', 'Shadow hounds tear at the target.', { el: 'SHADOW', st: st('bleed', 0.35, 2, 0.03) }),
    mv('megumi', 'nue', 'Nue', 'summon', 'enemy', 20, 3, 1.55, 'lightning', '#fde047', 'A great owl-like shikigami swoops down crackling with electricity.', 'Electric bird shikigami.', { el: 'LIGHTNING', st: st('stun', 0.25, 1, 0) }),
    mv('megumi', 'elephant', 'Max Elephant', 'summon', 'all_enemies', 28, 4, 1.15, 'summon', '#38bdf8', 'A huge elephant drops from above and floods the field with water from its trunk.', 'A water-spraying giant shikigami.', { el: 'WATER' }),
    mv('megumi', 'garden', 'Chimera Shadow Garden', 'ultimate', 'all_enemies', 40, 7, 1.6, 'domain', '#0f172a', 'The floor becomes liquid shadow; shikigami rise from it endlessly.', 'His incomplete domain.', { el: 'SHADOW', tr: 'hp_below_50', st: st('weaken', 0.5, 2, 0.15) }),
  ],
  tanjiro: [
    mv('tanjiro', 'waterwheel', 'Water Breathing: Water Wheel', 'attack', 'enemy', 15, 2, 1.55, 'wave', '#38bdf8', 'He flips forward and his blade traces a full circle of flowing water.', 'A vertical rolling slash.', { el: 'WATER' }),
    mv('tanjiro', 'flux', 'Constant Flux', 'aoe', 'all_enemies', 24, 3, 1.0, 'wave', '#0ea5e9', 'A water dragon made of continuous slashes winds through the enemy line.', 'An unbroken chain of strikes.', { el: 'WATER' }),
    mv('tanjiro', 'hinokami', 'Hinokami Kagura: Dance', 'attack', 'enemy', 24, 4, 2.0, 'fire', '#f97316', 'His blade turns red and a spiral of sun-fire follows the slash.', 'The Dance of the Fire God.', { el: 'FIRE', st: st('burn', 0.5, 2, 0.04) }),
    mv('tanjiro', 'thirteenth', 'Sun Breathing: Thirteenth Form', 'ultimate', 'enemy', 40, 6, 2.7, 'fire', '#fbbf24', 'Twelve forms flow into one endless cycle of blazing sun slashes.', 'All twelve forms linked into one.', { el: 'FIRE', tr: 'hp_below_50', c2: '#dc2626' }),
  ],
  zenitsu: [
    mv('zenitsu', 'thunderclap', 'Thunderclap and Flash', 'attack', 'enemy', 15, 2, 1.7, 'lightning', '#facc15', 'One step, one crack of thunder: he is already past the target, sheathing his sword.', 'A single lightning-fast draw.', { el: 'LIGHTNING', pierce: true }),
    mv('zenitsu', 'sixfold', 'Thunderclap: Sixfold', 'attack', 'enemy', 22, 3, 1.9, 'lightning', '#fde047', 'Six flashes of lightning zig-zag around the target in an instant.', 'Six consecutive thunderclaps.', { el: 'LIGHTNING' }),
    mv('zenitsu', 'asleep', 'Sleeping Focus', 'buff', 'self', 12, 4, 0, 'aura', '#fef08a', 'He passes out mid-scream... and his body moves with perfect calm.', 'Fights asleep: haste for 3 actions.', { st: st('haste', 1, 3, 0.4) }),
    mv('zenitsu', 'honoikazuchi', 'Seventh Form: Honoikazuchi no Kami', 'ultimate', 'enemy', 40, 6, 2.8, 'lightning', '#fbbf24', 'A golden thunder dragon roars out of his blade.', 'His own Seventh Form: Flaming Thunder God.', { el: 'LIGHTNING', tr: 'hp_below_50', pierce: true, c2: '#f97316' }),
  ],
  rengoku: [
    mv('rengoku', 'unknowing', 'Flame Breathing: Unknowing Fire', 'attack', 'enemy', 15, 2, 1.6, 'fire', '#f97316', 'A straight charge wrapped in a trail of flame.', 'First Form: a burning rush.', { el: 'FIRE' }),
    mv('rengoku', 'rising', 'Rising Scorching Sun', 'attack', 'enemy', 14, 2, 1.45, 'wave', '#fb923c', 'An upward arc of fire like a sunrise.', 'Second Form: an upward flame arc.', { el: 'FIRE', st: st('burn', 0.35, 2, 0.035) }),
    mv('rengoku', 'universe', 'Blazing Universe', 'aoe', 'all_enemies', 26, 4, 1.1, 'fire', '#ea580c', 'He leaps high and brings down a giant arc of blazing fire.', 'Fifth Form: a flaming tiger crash.', { el: 'FIRE' }),
    mv('rengoku', 'ninth', 'Ninth Form: Rengoku', 'ultimate', 'enemy', 40, 6, 2.8, 'fire', '#dc2626', 'A colossal flaming dragon charges forward with everything he has left.', 'His final, all-out form.', { el: 'FIRE', tr: 'hp_below_50', c2: '#fbbf24' }),
  ],
  deku: [
    mv('deku', 'detroit', 'Detroit Smash', 'attack', 'enemy', 16, 2, 1.65, 'punch', '#22c55e', 'Green lightning arcs around his arm; the punch blows a crater out of the ground.', 'One For All punch.', { el: 'LIGHTNING' }),
    mv('deku', 'shootstyle', 'Shoot Style', 'attack', 'enemy', 13, 1, 1.4, 'punch', '#4ade80', 'He springs off the wall and lands a crackling green kick.', 'Kick-based One For All.', { el: 'WIND' }),
    mv('deku', 'fullcowl', 'Full Cowl', 'buff', 'self', 16, 4, 0, 'aura', '#22c55e', 'Green sparks of power course over his entire body.', 'Power spread across his body: haste and focus.', { st: st('haste', 1, 3, 0.3) }),
    mv('deku', 'ofa100', 'One For All 100%: Delaware Detroit Smash', 'ultimate', 'enemy', 42, 7, 2.8, 'explosion', '#16a34a', 'He flicks and punches at 100% in one motion; the shockwave levels the arena.', 'Full-power One For All.', { tr: 'hp_below_50', pierce: true }),
  ],
  bakugo: [
    mv('bakugo', 'apshot', 'AP Shot', 'attack', 'enemy', 15, 2, 1.55, 'beam', '#fb923c', 'He cups his hands into a scope and fires a focused explosion beam.', 'Armor-piercing explosion.', { el: 'FIRE', pierce: true }),
    mv('bakugo', 'grenade', 'Stun Grenade', 'debuff', 'enemy', 16, 3, 0.6, 'explosion', '#fef3c7', 'A blinding white flash bursts in the target\'s face.', 'A flashbang explosion that can stun.', { el: 'FIRE', st: st('stun', 0.55, 1, 0) }),
    mv('bakugo', 'propulsion', 'Explosion Propulsion', 'buff', 'self', 12, 4, 0, 'aura', '#f97316', 'He rockets around the arena on blasts from his palms.', 'Explosive mobility: haste for 3 actions.', { el: 'FIRE', st: st('haste', 1, 3, 0.35) }),
    mv('bakugo', 'howitzer', 'Howitzer Impact', 'ultimate', 'enemy', 42, 6, 2.8, 'explosion', '#ea580c', 'He spins into a tornado of explosions and drills into the target like a shell.', 'A spinning explosive cannonball.', { el: 'FIRE', tr: 'hp_below_50' }),
  ],
  todoroki: [
    mv('todoroki', 'glacier', 'Glacier', 'attack', 'enemy', 15, 2, 1.5, 'ice', '#93c5fd', 'A wall of jagged ice races across the floor and swallows the target.', 'A rushing ice wave that can freeze.', { el: 'ICE', st: st('freeze', 0.35, 1, 0) }),
    mv('todoroki', 'flashfire', 'Flashfire', 'attack', 'enemy', 16, 2, 1.55, 'fire', '#f97316', 'His left side bursts into flame and a fist of fire shoots forward.', 'Left-side fire blast.', { el: 'FIRE', st: st('burn', 0.35, 2, 0.035) }),
    mv('todoroki', 'icewall', 'Heaven-Piercing Ice Wall', 'aoe', 'all_enemies', 28, 4, 1.05, 'ice', '#bae6fd', 'A glacier the height of a tower erupts across the enemy line.', 'A massive ice eruption.', { el: 'ICE', st: st('freeze', 0.3, 1, 0) }),
    mv('todoroki', 'heatwave', 'Flashfreeze Heatwave', 'ultimate', 'all_enemies', 42, 7, 1.7, 'explosion', '#f472b6', 'He chills the air with ice, then ignites it; the expanding air detonates.', 'Ice and fire combined.', { el: 'FIRE', tr: 'hp_below_50', c2: '#93c5fd' }),
  ],
  allmight: [
    mv('allmight', 'texas', 'Texas Smash', 'attack', 'enemy', 16, 2, 1.65, 'punch', '#facc15', 'A single straight punch with a wind pressure strong enough to change the weather.', 'A wind-pressure punch.', { el: 'WIND', pierce: true }),
    mv('allmight', 'carolina', 'Carolina Smash', 'attack', 'enemy', 14, 2, 1.5, 'slash', '#fde047', 'He leaps in and swings both arms in a giant X chop.', 'A cross-chop.', { el: 'WARRIOR' }),
    mv('allmight', 'muscle', 'Muscle Form', 'buff', 'self', 18, 5, 0, 'aura', '#fbbf24', 'His frame bulks up with a grin and a burst of steam. "I AM HERE!"', 'Muscle form: focus for 3 actions.', { st: st('focus', 1, 3, 0.35) }),
    mv('allmight', 'usa', 'United States of Smash', 'ultimate', 'enemy', 44, 7, 2.9, 'explosion', '#ef4444', 'He pours every ember of One For All into one final punch that blows away the clouds.', 'The last punch of the Symbol of Peace.', { tr: 'hp_below_30', c2: '#3b82f6' }),
  ],
  levi: [
    mv('levi', 'spin', 'ODM Spin Attack', 'attack', 'enemy', 15, 2, 1.65, 'slash', '#cbd5e1', 'He launches on ODM gear and spins like a drill, blades carving everything they touch.', 'A spinning blade dive.', { el: 'WARRIOR', st: st('bleed', 0.45, 2, 0.035) }),
    mv('levi', 'spear', 'Thunder Spear', 'attack', 'enemy', 18, 3, 1.8, 'explosion', '#fbbf24', 'A spear fires into the target and detonates a second later.', 'An explosive lance.', { el: 'LIGHTNING' }),
    mv('levi', 'ackerman', 'Ackerman Awakening', 'buff', 'self', 14, 4, 0, 'aura', '#94a3b8', 'Something in his blood switches on; every movement becomes perfect.', 'Ackerman instinct: haste for 3 actions.', { st: st('haste', 1, 3, 0.35) }),
    mv('levi', 'strongest', 'Humanity\'s Strongest', 'ultimate', 'enemy', 38, 6, 2.7, 'barrage', '#e2e8f0', 'A blur of steel cables and blades; the target is cut a hundred times before landing.', 'A relentless aerial assault.', { el: 'WARRIOR', tr: 'hp_below_50' }),
  ],
  eren: [
    mv('eren', 'blades', 'ODM Blades', 'attack', 'enemy', 13, 1, 1.4, 'slash', '#cbd5e1', 'He zips in on ODM gear and slashes at the nape.', 'A quick blade strike.', { el: 'WARRIOR' }),
    mv('eren', 'hardened', 'Hardened Fist', 'attack', 'enemy', 18, 2, 1.7, 'punch', '#e0f2fe', 'Crystal-hard skin forms over his knuckles before the punch lands.', 'A crystal-armored punch.', { el: 'EARTH' }),
    mv('eren', 'titan', 'Attack Titan Transformation', 'buff', 'self', 20, 5, 0, 'aura', '#eab308', 'He bites his hand; a yellow lightning bolt strikes and a fifteen-meter titan rises.', 'Titan form: damage boost for 3 actions.', { el: 'LIGHTNING', st: st('focus', 1, 3, 0.35) }),
    mv('eren', 'rumbling', 'The Rumbling', 'ultimate', 'all_enemies', 44, 7, 1.75, 'explosion', '#a8a29e', 'The ground shakes; walls of colossal titans march across the arena.', 'The Founder unleashes the Wall Titans.', { el: 'EARTH', tr: 'hp_below_50' }),
  ],
  mikasa: [
    mv('mikasa', 'twin', 'Twin Blade Strike', 'attack', 'enemy', 14, 1, 1.5, 'slash', '#e2e8f0', 'She drops from above with both blades and cuts in a single motion.', 'A precise double slash.', { el: 'WARRIOR' }),
    mv('mikasa', 'spear', 'Thunder Spear', 'attack', 'enemy', 18, 3, 1.75, 'explosion', '#fbbf24', 'She fires a spear point-blank and kicks off before it detonates.', 'An explosive lance.', { el: 'LIGHTNING' }),
    mv('mikasa', 'instinct', 'Ackerman Instinct', 'buff', 'self', 14, 4, 0, 'aura', '#94a3b8', 'Her expression goes blank; her reflexes take over completely.', 'Ackerman instinct: focus for 3 actions.', { st: st('focus', 1, 3, 0.28) }),
    mv('mikasa', 'storm', 'Spinning Blade Storm', 'ultimate', 'enemy', 38, 6, 2.6, 'slash', '#f1f5f9', 'She spirals through the air with both blades out, slicing everything around her.', 'A whirling aerial finisher.', { el: 'WARRIOR', tr: 'hp_below_50' }),
  ],
  gon: [
    mv('gon', 'rock', 'Jajanken: Rock', 'attack', 'enemy', 18, 2, 1.8, 'punch', '#22c55e', '"Rock... Paper... ROCK!" A fist packed with all his aura.', 'Enhancer punch.', { el: 'WARRIOR' }),
    mv('gon', 'paper', 'Jajanken: Paper', 'attack', 'enemy', 15, 2, 1.45, 'projectile', '#4ade80', 'He releases a ball of aura from his open palm.', 'An aura blast.', { el: 'SPIRIT', pierce: true }),
    mv('gon', 'scissors', 'Jajanken: Scissors', 'attack', 'enemy', 14, 2, 1.45, 'slash', '#86efac', 'His two fingers become an aura blade.', 'An aura cut.', { el: 'SPIRIT', st: st('bleed', 0.4, 2, 0.03) }),
    mv('gon', 'adult', 'Adult Gon: Full Jajanken', 'ultimate', 'enemy', 44, 7, 2.9, 'explosion', '#16a34a', 'He forces himself to grow up in an instant; his hair reaches the floor and his Rock leaves a crater.', 'Sacrificing his future for one punch.', { tr: 'hp_below_30' }),
  ],
  killua: [
    mv('killua', 'thunderbolt', 'Thunderbolt', 'attack', 'enemy', 16, 2, 1.6, 'lightning', '#60a5fa', 'He jumps high and drops a bolt of blue lightning onto the target.', 'Aura converted to lightning.', { el: 'LIGHTNING', st: st('stun', 0.2, 1, 0) }),
    mv('killua', 'rhythm', 'Rhythm Echo', 'attack', 'enemy', 14, 2, 1.45, 'slash', '#e2e8f0', 'Afterimages surround the target; claws strike from the real one.', 'Assassin step with afterimages.', { el: 'ASSASSIN', pierce: true }),
    mv('killua', 'godspeed', 'Godspeed', 'buff', 'self', 16, 4, 0, 'aura', '#93c5fd', 'Lightning wraps his body; he moves before the target even thinks.', 'Godspeed: big haste for 3 actions.', { el: 'LIGHTNING', st: st('haste', 1, 3, 0.45) }),
    mv('killua', 'narukami', 'Narukami', 'ultimate', 'enemy', 38, 6, 2.7, 'lightning', '#3b82f6', 'He raises his hand and a massive pillar of lightning slams down.', 'His thunder strike from the sky.', { el: 'LIGHTNING', tr: 'hp_below_50', pierce: true }),
  ],
  hisoka: [
    mv('hisoka', 'cards', 'Card Barrage', 'attack', 'enemy', 13, 1, 1.4, 'barrage', '#f472b6', 'Playing cards coated in aura fly like razor blades.', 'Aura-coated cards.', { el: 'ASSASSIN', pierce: true }),
    mv('hisoka', 'bungee', 'Bungee Gum', 'debuff', 'enemy', 18, 3, 0.6, 'genjutsu', '#ec4899', 'A pink string of sticky-and-stretchy aura yanks the target off balance.', 'Aura with the properties of rubber and gum.', { el: 'MAGIC', st: st('stun', 0.55, 1, 0) }),
    mv('hisoka', 'texture', 'Texture Surprise', 'debuff', 'enemy', 16, 3, 0.4, 'genjutsu', '#f9a8d4', 'A thin film of aura disguises his moves; the target strikes at nothing.', 'Illusion that weakens.', { el: 'MAGIC', st: st('weaken', 0.85, 3, 0.2) }),
    mv('hisoka', 'snap', 'Bungee Gum: Snapback', 'ultimate', 'enemy', 38, 6, 2.6, 'punch', '#db2777', 'The stretched gum snaps back and launches the target into a wall.', 'All the stored elasticity released at once.', { el: 'MAGIC', tr: 'hp_below_50' }),
  ],
  edward: [
    mv('edward', 'spear', 'Transmutation Spear', 'attack', 'enemy', 14, 2, 1.5, 'projectile', '#60a5fa', 'He claps, touches the ground, and stone spears erupt toward the target.', 'Alchemy from the earth.', { el: 'EARTH', pierce: true }),
    mv('edward', 'armblade', 'Arm Blade', 'attack', 'enemy', 13, 1, 1.4, 'slash', '#cbd5e1', 'His automail arm reshapes into a blade mid-swing.', 'Automail transmuted into a blade.', { el: 'WARRIOR' }),
    mv('edward', 'wall', 'Ground Wall', 'shield', 'self', 14, 3, 0.25, 'shield', '#a16207', 'A wall of stone springs up with a flash of blue alchemy.', 'An instant earth barrier.', { el: 'EARTH' }),
    mv('edward', 'grand', 'Grand Transmutation', 'ultimate', 'all_enemies', 40, 7, 1.6, 'explosion', '#3b82f6', 'A huge transmutation circle lights up beneath the enemy and the ground erupts.', 'Field-wide alchemy.', { el: 'EARTH', tr: 'hp_below_50' }),
  ],
  roy: [
    mv('roy', 'snap', 'Flame Alchemy Snap', 'attack', 'enemy', 16, 2, 1.7, 'fire', '#f97316', 'He snaps his gloved fingers and a line of fire races to the target.', 'Spark-and-oxygen flame alchemy.', { el: 'FIRE', st: st('burn', 0.45, 2, 0.04), pierce: true }),
    mv('roy', 'pillar', 'Flame Pillar', 'aoe', 'all_enemies', 26, 4, 1.05, 'fire', '#ea580c', 'Columns of fire erupt under every enemy at once.', 'Precise multi-point ignition.', { el: 'FIRE' }),
    mv('roy', 'ignition', 'Air Ignition', 'attack', 'enemy', 22, 3, 2.0, 'explosion', '#fdba74', 'He thins the oxygen around the target, then sparks it. The air detonates.', 'Controlled oxygen explosion.', { el: 'FIRE' }),
    mv('roy', 'inferno', 'Flame Alchemy: Inferno', 'ultimate', 'all_enemies', 42, 7, 1.7, 'fire', '#dc2626', 'A firestorm swallows the battlefield in a single snap.', 'His full-power flame alchemy.', { el: 'FIRE', tr: 'hp_below_50', st: st('burn', 0.5, 2, 0.045) }),
  ],
  saitama: [
    mv('saitama', 'normal', 'Normal Punch', 'attack', 'enemy', 12, 1, 1.6, 'punch', '#facc15', 'A completely ordinary punch, thrown with a bored face.', 'Just a punch.', { el: 'WARRIOR' }),
    mv('saitama', 'consecutive', 'Consecutive Normal Punches', 'attack', 'enemy', 20, 3, 1.9, 'barrage', '#fde047', 'His fists become a wall of afterimages.', 'A lot of ordinary punches.', { el: 'WARRIOR' }),
    mv('saitama', 'jumps', 'Serious Sideways Jumps', 'buff', 'self', 14, 4, 0, 'aura', '#fef08a', 'He jumps side to side so fast that dozens of copies of him appear.', 'Serious series: haste for 3 actions.', { st: st('haste', 1, 3, 0.4) }),
    mv('saitama', 'serious', 'Serious Punch', 'ultimate', 'enemy', 44, 7, 3.0, 'explosion', '#ef4444', 'His face goes serious for once; the punch splits the clouds over the arena.', 'The one time he tries.', { tr: 'hp_below_50', pierce: true }),
  ],
  natsu: [
    mv('natsu', 'roar', 'Fire Dragon\'s Roar', 'attack', 'enemy', 18, 2, 1.75, 'fire', '#f97316', 'He inhales and breathes a torrent of dragon fire.', 'Dragon Slayer breath attack.', { el: 'FIRE', pierce: true, st: st('burn', 0.4, 2, 0.04) }),
    mv('natsu', 'ironfist', 'Fire Dragon\'s Iron Fist', 'attack', 'enemy', 14, 1, 1.45, 'punch', '#fb923c', 'His fist bursts into flame right before impact.', 'A flaming punch.', { el: 'FIRE' }),
    mv('natsu', 'lightningflame', 'Lightning Flame Dragon Mode', 'buff', 'self', 18, 5, 0, 'aura', '#facc15', 'Red flames and golden lightning twist around him together.', 'Lightning and fire combined: focus for 3 actions.', { el: 'LIGHTNING', st: st('focus', 1, 3, 0.33) }),
    mv('natsu', 'crimson', 'Crimson Lotus: Exploding Flame Blade', 'ultimate', 'enemy', 40, 6, 2.8, 'fire', '#dc2626', 'He spins into a drill of fire and crashes through the target.', 'A spiraling fire-dragon finisher.', { el: 'DRAGON', tr: 'hp_below_50', c2: '#fbbf24' }),
  ],
  denji: [
    mv('denji', 'rip', 'Chainsaw Rip', 'attack', 'enemy', 14, 1, 1.5, 'slash', '#f97316', 'He yanks the cord in his chest; chainsaws burst from his head and arms.', 'Chainsaws that tear and cause bleeding.', { el: 'DEMON', st: st('bleed', 0.55, 3, 0.04) }),
    mv('denji', 'whip', 'Chainsaw Whip', 'attack', 'enemy', 16, 2, 1.55, 'wave', '#fb923c', 'A chain with a blade on the end lashes out across the arena.', 'A long-range chain lash.', { el: 'DEMON', pierce: true }),
    mv('denji', 'blood', 'Blood Refuel', 'heal', 'self', 18, 4, 0.22, 'heal', '#dc2626', 'He drinks blood and his wounds seal over.', 'Restores health with blood.', { el: 'DEMON', tr: 'hp_below_50' }),
    mv('denji', 'true', 'Chainsaw Man: True Form', 'ultimate', 'all_enemies', 42, 7, 1.7, 'explosion', '#111827', 'Black, many-armed and roaring, the Hero of Hell tears into everything.', 'Pochita\'s true form.', { el: 'DEMON', tr: 'hp_below_30', c2: '#dc2626' }),
  ],
  minato: [
    mv('minato', 'kunai', 'Flying Raijin', 'attack', 'enemy', 14, 1, 1.5, 'slash', '#fde047', 'A three-pronged kunai lands beside the target and he is already there, blade drawn, in a yellow flash.', 'Teleports to a marked kunai and strikes.', { el: 'LIGHTNING', pierce: true }),
    mv('minato', 'rasengan', 'Rasengan', 'attack', 'enemy', 18, 2, 1.7, 'projectile', '#60a5fa', 'He appears behind the target with a spinning blue sphere already in his palm.', 'The jutsu he invented, delivered at teleport speed.', { el: 'WIND', c2: '#e0f2fe' }),
    mv('minato', 'barrier', 'Flying Raijin Barrier', 'shield', 'self', 16, 4, 0.3, 'shield', '#fbbf24', 'A seal formula flashes around him and the incoming attack is warped somewhere else.', 'Teleports the enemy attack away.', {}),
    mv('minato', 'kyuubi', 'Nine-Tails Chakra Mode', 'ultimate', 'enemy', 40, 6, 2.6, 'explosion', '#f59e0b', 'Golden chakra robes blaze around him and a Tailed Beast Bomb drops from nowhere.', 'Yin Kurama\'s power with the Yellow Flash\'s speed.', { el: 'SPIRIT', tr: 'hp_below_50', c2: '#111827' }),
  ],
  madara: [
    mv('madara', 'firestorm', 'Majestic Destroyer Flame', 'aoe', 'all_enemies', 26, 3, 1.1, 'fire', '#ea580c', 'He exhales a wall of fire that covers the entire battlefield.', 'A sea of flame over every enemy.', { el: 'FIRE', st: st('burn', 0.35, 2, 0.04) }),
    mv('madara', 'woodstyle', 'Wood Style: Deep Forest Emergence', 'attack', 'enemy', 18, 2, 1.6, 'summon', '#65a30d', 'Giant trees burst from the ground and wrap around the target.', 'Hashirama\'s Wood Style, stolen.', { el: 'EARTH', st: st('stun', 0.25, 1, 0) }),
    mv('madara', 'susanoo', 'Perfect Susanoo', 'shield', 'self', 22, 5, 0.4, 'shield', '#3b82f6', 'A blue armored giant with wings rises around him, taller than the arena.', 'The ultimate Susanoo absorbs blows.', { el: 'SPIRIT' }),
    mv('madara', 'meteor', 'Tengai Shinsei', 'ultimate', 'all_enemies', 44, 7, 1.8, 'explosion', '#78350f', 'The sky darkens. A meteor the size of a mountain falls on the enemy line.', 'Rinnegan meteor drop.', { el: 'EARTH', tr: 'hp_below_50', c2: '#f97316' }),
  ],
  pain: [
    mv('pain', 'shinra', 'Shinra Tensei', 'aoe', 'all_enemies', 24, 3, 1.0, 'wave', '#e5e7eb', 'He says two words and an invisible force blasts everything away from him.', 'Repulsive force that hits every enemy.', { el: 'DIVINE' }),
    mv('pain', 'bansho', 'Bansho Ten\'in', 'attack', 'enemy', 16, 2, 1.5, 'wave', '#a78bfa', 'The target is yanked through the air straight onto a black chakra rod.', 'Pulls the target in and impales them.', { el: 'DIVINE', st: st('bleed', 0.35, 2, 0.03) }),
    mv('pain', 'paths', 'Six Paths of Pain', 'summon', 'enemy', 22, 4, 1.6, 'summon', '#f97316', 'Five more orange-haired bodies with ringed eyes land around the target at once.', 'All six bodies attack together.', { el: 'DARK' }),
    mv('pain', 'chibaku', 'Chibaku Tensei', 'ultimate', 'all_enemies', 44, 7, 1.75, 'domain', '#57534e', 'A black sphere rises into the sky and drags the ground and every enemy into a giant rock moon.', 'Planetary devastation.', { el: 'EARTH', tr: 'hp_below_50', c2: '#111827' }),
  ],
  gaara: [
    mv('gaara', 'coffin', 'Sand Coffin', 'attack', 'enemy', 16, 2, 1.5, 'wave', '#d6a756', 'Sand pours over the target and wraps them up to the neck.', 'Binds the target in sand; may hold them.', { el: 'EARTH', st: st('stun', 0.3, 1, 0) }),
    mv('gaara', 'shield', 'Shield of Sand', 'shield', 'self', 14, 3, 0.3, 'shield', '#e9c46a', 'A wall of sand moves on its own and blocks the attack.', 'Automatic sand defense.', { el: 'EARTH' }),
    mv('gaara', 'tsunami', 'Sand Tsunami', 'aoe', 'all_enemies', 26, 4, 1.05, 'wave', '#c08a3e', 'A wave of desert sand taller than buildings crashes over the enemy line.', 'A huge wave of sand.', { el: 'EARTH' }),
    mv('gaara', 'funeral', 'Sand Waterfall Funeral', 'ultimate', 'enemy', 38, 6, 2.5, 'explosion', '#a16207', 'He closes his fist and the sand coffin crushes inward with a dull roar.', 'Imperial crushing burial.', { el: 'EARTH', tr: 'hp_below_50' }),
  ],
  lee: [
    mv('lee', 'whirlwind', 'Leaf Hurricane', 'attack', 'enemy', 12, 1, 1.45, 'punch', '#22c55e', 'A spinning roundhouse kick so fast it leaves a ring of wind.', 'A whirlwind kick.', { el: 'WIND' }),
    mv('lee', 'lotus', 'Primary Lotus', 'attack', 'enemy', 18, 2, 1.7, 'barrage', '#4ade80', 'He kicks the target into the sky, wraps them in his bandages and spins them head-first into the ground.', 'A taijutsu piledriver.', { el: 'WARRIOR', st: st('stun', 0.25, 1, 0) }),
    mv('lee', 'gates', 'Eight Inner Gates', 'buff', 'self', 18, 5, 0, 'aura', '#16a34a', 'His skin turns red and green steam explodes off him as he opens the gates.', 'Unlocks his limits: haste for 3 actions.', { st: st('haste', 1, 3, 0.4), tr: 'hp_below_50' }),
    mv('lee', 'morning', 'Morning Peacock', 'ultimate', 'enemy', 40, 6, 2.7, 'barrage', '#f97316', 'Punches so fast they catch fire, filling the air with burning peacock feathers.', 'Sixth Gate fire-punch barrage.', { el: 'FIRE', tr: 'hp_below_50' }),
  ],
  law: [
    mv('law', 'room', 'Room: Amputate', 'attack', 'enemy', 15, 2, 1.55, 'slash', '#60a5fa', 'A blue sphere spreads out and his sword cuts the target into floating pieces.', 'Surgical slicing inside his Room.', { el: 'MAGIC', pierce: true }),
    mv('law', 'shambles', 'Shambles', 'debuff', 'enemy', 16, 3, 0.4, 'domain', '#3b82f6', 'Swap: the target is suddenly standing somewhere else, off-balance.', 'Swaps positions to disrupt the target.', { el: 'MAGIC', st: st('weaken', 0.85, 3, 0.2) }),
    mv('law', 'mes', 'Mes', 'attack', 'enemy', 18, 3, 1.4, 'punch', '#93c5fd', 'He punches the target and pulls their heart out in a little cube.', 'Removes the heart: stuns the target.', { el: 'MAGIC', st: st('stun', 0.45, 1, 0) }),
    mv('law', 'gammaknife', 'Gamma Knife', 'ultimate', 'enemy', 40, 6, 2.7, 'beam', '#a78bfa', 'A shimmering energy blade passes through without a cut and destroys the target from inside.', 'Internal destruction that ignores armor.', { el: 'MAGIC', tr: 'hp_below_50', pierce: true }),
  ],
  whitebeard: [
    mv('whitebeard', 'quake', 'Quake Punch', 'attack', 'enemy', 16, 2, 1.7, 'punch', '#e5e7eb', 'His fist cracks the air itself like glass, and the shockwave hits the target.', 'Tremor-Tremor punch.', { el: 'EARTH' }),
    mv('whitebeard', 'bisento', 'Murakumogiri', 'attack', 'enemy', 14, 1, 1.5, 'slash', '#cbd5e1', 'A huge sweep of his giant halberd.', 'A massive bisento slash.', { el: 'WARRIOR' }),
    mv('whitebeard', 'seaquake', 'Seaquake', 'aoe', 'all_enemies', 28, 4, 1.1, 'wave', '#38bdf8', 'He grabs the air and tilts it; the whole sea rises up as a tidal wave.', 'Tilts the world and floods the arena.', { el: 'WATER' }),
    mv('whitebeard', 'gura', 'Strongest Man in the World', 'ultimate', 'all_enemies', 44, 7, 1.8, 'explosion', '#f8fafc', 'Both fists shatter the air around him; the ground splits in two.', 'Every tremor at once.', { el: 'EARTH', tr: 'hp_below_50' }),
  ],
  shanks: [
    mv('shanks', 'slash', 'Gryphon Slash', 'attack', 'enemy', 14, 1, 1.55, 'slash', '#dc2626', 'One clean cut from his saber, too fast to follow.', 'A swift sword strike.', { el: 'WARRIOR' }),
    mv('shanks', 'haki', 'Conqueror\'s Haki', 'debuff', 'all_enemies', 22, 4, 0.4, 'aura', '#7f1d1d', 'Black-red lightning crackles around him and the enemy\'s knees buckle.', 'Overwhelming will: weakens all enemies.', { st: st('weaken', 0.75, 2, 0.2), c2: '#111827' }),
    mv('shanks', 'armament', 'Armament Haki', 'buff', 'self', 14, 4, 0, 'aura', '#111827', 'His blade turns pitch black.', 'Hardened haki: focus for 3 actions.', { st: st('focus', 1, 3, 0.3) }),
    mv('shanks', 'kamusari', 'Divine Departure', 'ultimate', 'enemy', 40, 6, 2.8, 'slash', '#dc2626', 'His saber wrapped in red-black haki splits the sky in one diagonal line.', 'Kamusari: haki-infused finishing slash.', { tr: 'hp_below_50', pierce: true, c2: '#111827' }),
  ],
  gohan: [
    mv('gohan', 'masenko', 'Masenko', 'attack', 'enemy', 16, 2, 1.6, 'beam', '#facc15', 'Both hands over his head; a yellow ki wave fires down at the target.', 'Piccolo\'s technique.', { el: 'DIVINE' }),
    mv('gohan', 'rage', 'Hidden Potential', 'buff', 'self', 16, 5, 0, 'aura', '#fde047', 'Lightning sparks in a golden aura as his hidden power snaps loose.', 'Rage unlocks power: focus for 3 actions.', { st: st('focus', 1, 3, 0.35), tr: 'hp_below_50' }),
    mv('gohan', 'kamehameha', 'Father-Son Kamehameha', 'attack', 'enemy', 26, 4, 2.2, 'beam', '#60a5fa', 'Goku\'s spirit stands behind him as a blue beam swallows the target.', 'The beam that beat Cell.', { el: 'DIVINE', pierce: true, c2: '#e0f2fe' }),
    mv('gohan', 'beast', 'Gohan Beast', 'ultimate', 'enemy', 42, 7, 2.9, 'beam', '#e5e7eb', 'His hair turns silver-white and spikes up; a red-tinted Special Beam Cannon spirals out.', 'Beyond Ultimate: Special Beam Cannon.', { el: 'DIVINE', tr: 'hp_below_50', pierce: true, c2: '#ef4444' }),
  ],
  piccolo: [
    mv('piccolo', 'sbc', 'Special Beam Cannon', 'attack', 'enemy', 20, 3, 1.9, 'beam', '#facc15', 'Two fingers on his forehead; a drill-shaped beam spirals straight through the target.', 'Makankosappo: pierces anything.', { pierce: true, c2: '#a855f7' }),
    mv('piccolo', 'hellzone', 'Hellzone Grenade', 'aoe', 'all_enemies', 24, 3, 1.0, 'barrage', '#fde047', 'Dozens of ki blasts hover around the enemies, then close in all at once.', 'A cage of ki blasts.', {}),
    mv('piccolo', 'regen', 'Namekian Regeneration', 'heal', 'self', 16, 4, 0.22, 'heal', '#22c55e', 'He grunts and grows a missing arm back in a splash of purple.', 'Regrows lost limbs: restores health.', { tr: 'hp_below_50' }),
    mv('piccolo', 'orange', 'Orange Piccolo', 'ultimate', 'enemy', 42, 7, 2.8, 'punch', '#f97316', 'He turns giant and orange and drives down a fist the size of a building.', 'Power-awakened giant form.', { tr: 'hp_below_50' }),
  ],
  broly: [
    mv('broly', 'eraser', 'Eraser Cannon', 'attack', 'enemy', 16, 2, 1.65, 'projectile', '#4ade80', 'A green ki orb the size of a boulder flies from his palm.', 'A crushing green energy sphere.', { el: 'DIVINE' }),
    mv('broly', 'lariat', 'Gigantic Lariat', 'attack', 'enemy', 14, 1, 1.5, 'punch', '#22c55e', 'He charges and swings a massive arm across the target\'s chest.', 'A brute clothesline.', { el: 'WARRIOR' }),
    mv('broly', 'wrath', 'Berserk Rage', 'buff', 'self', 16, 5, 0, 'aura', '#16a34a', 'His roar shakes the arena as a green aura explodes around him.', 'Pure rage: focus for 3 actions.', { st: st('focus', 1, 3, 0.4), tr: 'hp_below_50' }),
    mv('broly', 'meteor', 'Gigantic Meteor', 'ultimate', 'all_enemies', 44, 7, 1.8, 'explosion', '#86efac', 'A green meteor of ki drops onto the arena and erupts.', 'Legendary Super Saiyan finisher.', { el: 'DIVINE', tr: 'hp_below_50' }),
  ],
  kenpachi: [
    mv('kenpachi', 'slash', 'Wild Slash', 'attack', 'enemy', 14, 1, 1.6, 'slash', '#facc15', 'A huge, sloppy swing with a notched blade that cuts through everything anyway.', 'No technique, only power.', { el: 'WARRIOR', st: st('bleed', 0.4, 2, 0.04) }),
    mv('kenpachi', 'eyepatch', 'Remove Eyepatch', 'buff', 'self', 16, 5, 0, 'aura', '#fde047', 'He tears off his eyepatch and a yellow skull-shaped spiritual pressure explodes upward.', 'Unleashed reiatsu: focus for 3 actions.', { el: 'SPIRIT', st: st('focus', 1, 3, 0.35) }),
    mv('kenpachi', 'kendo', 'Kendo', 'attack', 'enemy', 24, 4, 2.2, 'slash', '#eab308', 'For once he uses both hands on the hilt, and the cut splits the ground.', 'Two-handed full-power swing.', { el: 'WARRIOR', pierce: true }),
    mv('kenpachi', 'nozarashi', 'Bankai: Nozarashi', 'ultimate', 'enemy', 42, 7, 2.9, 'explosion', '#dc2626', 'His skin turns red, horns grow, and one swing of a giant cleaver cuts the earth itself.', 'His true Bankai.', { el: 'DEMON', tr: 'hp_below_50', c2: '#111827' }),
  ],
  toshiro: [
    mv('toshiro', 'hyorinmaru', 'Hyorinmaru', 'attack', 'enemy', 16, 2, 1.6, 'ice', '#7dd3fc', 'An ice dragon spirals off his blade and slams into the target.', 'Ice dragon release.', { el: 'ICE', st: st('freeze', 0.3, 1, 0) }),
    mv('toshiro', 'ryusenka', 'Ryusenka', 'attack', 'enemy', 18, 3, 1.5, 'ice', '#bae6fd', 'He stabs the target and a cross of ice explodes out of them.', 'Freezing stab.', { el: 'ICE', st: st('freeze', 0.45, 1, 0) }),
    mv('toshiro', 'daiguren', 'Bankai: Daiguren Hyorinmaru', 'buff', 'self', 18, 5, 0, 'aura', '#38bdf8', 'Ice wings and a tail grow from his back as the air freezes around him.', 'Ice armor: focus for 3 actions.', { el: 'ICE', st: st('focus', 1, 3, 0.3) }),
    mv('toshiro', 'hyoten', 'Hyoten Hyakkaso', 'ultimate', 'all_enemies', 40, 6, 1.7, 'ice', '#e0f2fe', 'Snow falls from a hole in the clouds; every flake that touches an enemy becomes a flower of ice.', 'Hundred-flower ice prison.', { el: 'ICE', tr: 'hp_below_50', st: st('freeze', 0.4, 1, 0) }),
  ],
  rukia: [
    mv('rukia', 'tsukishiro', 'First Dance: Tsukishiro', 'attack', 'enemy', 16, 2, 1.5, 'ice', '#e0f2fe', 'A white circle forms under the target and a pillar of ice shoots up into the sky.', 'Freezes everything inside the circle.', { el: 'ICE', st: st('freeze', 0.4, 1, 0) }),
    mv('rukia', 'hakuren', 'Next Dance: Hakuren', 'attack', 'enemy', 18, 3, 1.65, 'ice', '#bae6fd', 'A wave of freezing white mist rolls out from her sword tip.', 'An avalanche of frost.', { el: 'ICE', pierce: true }),
    mv('rukia', 'kido', 'Hado 33: Sokatsui', 'attack', 'enemy', 14, 1, 1.4, 'beam', '#60a5fa', 'She chants and fires a blast of blue spirit fire.', 'A blue kido blast.', { el: 'SPIRIT' }),
    mv('rukia', 'hakka', 'Bankai: Hakka no Togame', 'ultimate', 'all_enemies', 40, 6, 1.7, 'ice', '#f8fafc', 'She turns pure white and the whole arena freezes at absolute zero.', 'Absolute-zero Bankai.', { el: 'ICE', tr: 'hp_below_50', st: st('freeze', 0.45, 1, 0) }),
  ],
  yuta: [
    mv('yuta', 'katana', 'Cursed Katana Strike', 'attack', 'enemy', 14, 1, 1.5, 'slash', '#c084fc', 'His katana glows with dark purple cursed energy as he cuts.', 'A blade coated in cursed energy.', { el: 'DARK' }),
    mv('yuta', 'rika', 'Rika', 'summon', 'enemy', 22, 3, 1.75, 'summon', '#a855f7', 'A huge cursed spirit with a ring on its claw rises behind him and smashes the target.', 'His special-grade cursed spirit.', { el: 'DARK', c2: '#111827' }),
    mv('yuta', 'rct', 'Reverse Cursed Technique', 'heal', 'self', 18, 4, 0.24, 'heal', '#e9d5ff', 'His wounds close over in a soft purple light.', 'Heals with positive energy.', { tr: 'hp_below_50' }),
    mv('yuta', 'beam', 'Pure Love Cannon', 'ultimate', 'enemy', 42, 7, 2.9, 'beam', '#d946ef', 'Rika wraps him in her arms and a vast beam of cursed energy erupts from them both.', 'Unlimited cursed energy, focused into one beam.', { el: 'DARK', tr: 'hp_below_50', pierce: true }),
  ],
  todo: [
    mv('todo', 'punch', 'Black Flash Punch', 'attack', 'enemy', 16, 2, 1.65, 'punch', '#111827', 'Black sparks distort the air around his fist on impact.', 'Cursed energy hits within a millionth of a second of the punch.', { el: 'WARRIOR', c2: '#dc2626' }),
    mv('todo', 'boogie', 'Boogie Woogie', 'debuff', 'enemy', 14, 2, 0.4, 'genjutsu', '#f59e0b', 'He claps; the target is suddenly somewhere else, completely lost.', 'Clap to swap places: confuses and weakens.', { st: st('weaken', 0.85, 3, 0.2) }),
    mv('todo', 'brother', 'Best Friend Combo', 'attack', 'enemy', 22, 4, 2.0, 'barrage', '#fbbf24', 'Clap, swap, punch, clap, swap, punch. Nobody can track him.', 'Swap-and-strike combo.', { el: 'WARRIOR' }),
    mv('todo', 'vibraslap', 'Vibraslap', 'ultimate', 'enemy', 38, 6, 2.6, 'explosion', '#f97316', 'He no longer needs to clap. Every touch swaps everything, and the fist lands from behind.', 'Boogie Woogie unbound.', { tr: 'hp_below_50' }),
  ],
  nanami: [
    mv('nanami', 'ratio', 'Ratio Technique', 'attack', 'enemy', 15, 2, 1.65, 'slash', '#fde047', 'Lines divide the target into ten parts; he strikes exactly at the 7:3 point.', 'Forces a weak point.', { el: 'WARRIOR', pierce: true }),
    mv('nanami', 'blade', 'Blunt Blade Strike', 'attack', 'enemy', 12, 1, 1.45, 'slash', '#e5e7eb', 'A methodical swing of his cloth-wrapped blade.', 'Steady, practical attack.', { el: 'WARRIOR' }),
    mv('nanami', 'overtime', 'Overtime', 'buff', 'self', 16, 5, 0, 'aura', '#facc15', 'He loosens his tie. It\'s past working hours, and his cursed energy surges.', 'Binding vow: focus for 3 actions.', { st: st('focus', 1, 3, 0.35) }),
    mv('nanami', 'collapse', 'Collapse', 'ultimate', 'all_enemies', 40, 6, 1.7, 'explosion', '#a16207', 'He strikes a wall at its weak point and the whole structure falls on the enemies.', 'Extended technique: demolition.', { el: 'EARTH', tr: 'hp_below_50' }),
  ],
  nobara: [
    mv('nobara', 'hairpin', 'Hairpin', 'attack', 'enemy', 16, 2, 1.55, 'projectile', '#f472b6', 'She flicks nails into the air and snaps her fingers; they explode in a ring.', 'Nails that detonate with cursed energy.', { el: 'MAGIC' }),
    mv('nobara', 'hammer', 'Hammer and Nails', 'attack', 'enemy', 12, 1, 1.45, 'punch', '#ec4899', 'She hammers a nail through the air straight into the target.', 'Straw-doll nail shot.', { el: 'MAGIC', st: st('bleed', 0.35, 2, 0.03) }),
    mv('nobara', 'grit', 'Unbending Grit', 'buff', 'self', 14, 4, 0, 'aura', '#f9a8d4', 'She grins through the blood and grips her hammer tighter.', 'Focus for 3 actions.', { st: st('focus', 1, 3, 0.3), tr: 'hp_below_50' }),
    mv('nobara', 'resonance', 'Resonance', 'ultimate', 'enemy', 40, 6, 2.7, 'genjutsu', '#be185d', 'A nail is hammered into a straw doll and the target feels it in their own body.', 'Straw-doll technique: damage through a link.', { el: 'MAGIC', tr: 'hp_below_50', pierce: true }),
  ],
  giyu: [
    mv('giyu', 'surface', 'Water Surface Slash', 'attack', 'enemy', 12, 1, 1.5, 'slash', '#3b82f6', 'A single horizontal cut leaves a clear ripple of water in the air.', 'First Form of Water Breathing.', { el: 'WATER' }),
    mv('giyu', 'whirlpool', 'Whirlpool', 'shield', 'self', 16, 3, 0.3, 'shield', '#60a5fa', 'He spins and a whirlpool of water swallows the incoming attack.', 'Sixth Form: deflects attacks.', { el: 'WATER' }),
    mv('giyu', 'calm', 'Dead Calm', 'buff', 'self', 18, 5, 0, 'aura', '#1d4ed8', 'The air around him becomes perfectly still water. Nothing gets through.', 'Eleventh Form: focus for 3 actions.', { el: 'WATER', st: st('focus', 1, 3, 0.35) }),
    mv('giyu', 'drop', 'Drop Ripple Thrust', 'ultimate', 'enemy', 38, 6, 2.6, 'wave', '#93c5fd', 'A single thrust so precise it leaves one ripple behind.', 'The fastest Water Breathing strike, with a demon-slayer mark.', { el: 'WATER', tr: 'hp_below_50', pierce: true }),
  ],
  inosuke: [
    mv('inosuke', 'fang', 'Fang One: Pierce', 'attack', 'enemy', 13, 1, 1.5, 'slash', '#64748b', 'He charges like a boar, both jagged blades stabbing straight forward.', 'Beast Breathing double thrust.', { el: 'WARRIOR', st: st('bleed', 0.4, 2, 0.035) }),
    mv('inosuke', 'crazy', 'Crazy Cutting', 'attack', 'enemy', 18, 2, 1.7, 'barrage', '#94a3b8', 'He flails both blades wildly in every direction, shredding everything nearby.', 'Fifth Fang: wild slashing.', { el: 'WARRIOR' }),
    mv('inosuke', 'spatial', 'Spatial Awareness', 'buff', 'self', 14, 4, 0, 'aura', '#475569', 'He stabs his swords into the ground and feels every movement in the air.', 'Senses everything: focus for 3 actions.', { st: st('focus', 1, 3, 0.3) }),
    mv('inosuke', 'spiral', 'Spatial Spiral Spin', 'ultimate', 'enemy', 38, 6, 2.6, 'slash', '#3b82f6', 'He twists his whole body like a drill and spins through the target.', 'Beast Breathing finisher.', { el: 'WARRIOR', tr: 'hp_below_50', pierce: true }),
  ],
  akaza: [
    mv('akaza', 'airtype', 'Destructive Death: Air Type', 'attack', 'enemy', 15, 1, 1.6, 'punch', '#ec4899', 'He punches empty air and the shockwave hits from across the arena.', 'Long-range air punches.', { el: 'DEMON', pierce: true }),
    mv('akaza', 'compass', 'Compass Needle', 'buff', 'self', 14, 4, 0, 'domain', '#38bdf8', 'A snowflake-shaped pattern spreads on the ground under him; he senses every fighting spirit.', 'Technique Development: focus for 3 actions.', { st: st('focus', 1, 3, 0.3) }),
    mv('akaza', 'regen', 'Upper Moon Regeneration', 'heal', 'self', 16, 3, 0.25, 'heal', '#a855f7', 'His severed arm grows back in an instant.', 'Demon regeneration.', { el: 'DEMON', tr: 'hp_below_50' }),
    mv('akaza', 'annihilation', 'Annihilation Type: Chaotic', 'ultimate', 'all_enemies', 42, 7, 1.8, 'barrage', '#f472b6', 'Hundreds of punches fire in every direction at once.', 'Destructive Death finisher.', { el: 'DEMON', tr: 'hp_below_50' }),
  ],
  shinobu: [
    mv('shinobu', 'butterfly', 'Butterfly Dance: Caprice', 'attack', 'enemy', 14, 1, 1.35, 'slash', '#c084fc', 'She flutters past like a butterfly and stabs with a needle-thin blade.', 'Insect Breathing poison thrust.', { el: 'ASSASSIN', st: st('burn', 0.65, 3, 0.05) }),
    mv('shinobu', 'dragonfly', 'Dance of the Dragonfly', 'attack', 'enemy', 18, 2, 1.5, 'barrage', '#a78bfa', 'A flurry of six poison stabs, each one landing on a weak point.', 'Multiple poison thrusts.', { el: 'ASSASSIN', st: st('burn', 0.75, 3, 0.05) }),
    mv('shinobu', 'medicine', 'Wisteria Medicine', 'heal', 'all_allies', 22, 4, 0.14, 'heal', '#e9d5ff', 'She hands out wisteria medicine to her allies.', 'Heals the whole team a little.', { tr: 'ally_low' }),
    mv('shinobu', 'centipede', 'Centipede Zigzag', 'ultimate', 'enemy', 38, 6, 2.4, 'slash', '#7c3aed', 'She zig-zags so fast the floor cracks, then delivers a lethal dose of wisteria poison.', 'The fastest Insect Breathing form.', { el: 'ASSASSIN', tr: 'hp_below_50', st: st('burn', 0.9, 4, 0.07) }),
  ],
  shigaraki: [
    mv('shigaraki', 'decay', 'Decay', 'attack', 'enemy', 16, 2, 1.5, 'genjutsu', '#9ca3af', 'He touches the target with five fingers and their armor crumbles to dust.', 'Disintegration that keeps eating away.', { el: 'DARK', st: st('bleed', 0.6, 3, 0.04), pierce: true }),
    mv('shigaraki', 'grab', 'Reckless Grab', 'attack', 'enemy', 13, 1, 1.4, 'punch', '#6b7280', 'He lunges with clawed hands for the face.', 'A wild, scratching grab.', { el: 'DARK' }),
    mv('shigaraki', 'wave', 'Decay Wave', 'aoe', 'all_enemies', 28, 4, 1.05, 'wave', '#a8a29e', 'He slams a hand on the ground and the floor crumbles away in a spreading wave.', 'Decay spreads through the ground.', { el: 'DARK' }),
    mv('shigaraki', 'afo', 'All For One', 'ultimate', 'enemy', 42, 7, 2.9, 'explosion', '#111827', 'Black tendrils and stolen quirks erupt from his body all at once.', 'Every stolen quirk combined.', { el: 'DARK', tr: 'hp_below_50', c2: '#dc2626' }),
  ],
  endeavor: [
    mv('endeavor', 'hellspider', 'Hell Spider', 'attack', 'enemy', 16, 2, 1.55, 'fire', '#f97316', 'Thin threads of fire shoot from each finger like a cage of hot wires.', 'Precise flame threads.', { el: 'FIRE', st: st('burn', 0.45, 2, 0.04) }),
    mv('endeavor', 'flashfire', 'Flashfire Fist: Jet Burn', 'attack', 'enemy', 16, 2, 1.7, 'punch', '#ea580c', 'Flames blast out of his elbow and drive his fist forward like a rocket.', 'Fire-propelled punch.', { el: 'FIRE' }),
    mv('endeavor', 'cooling', 'Flame Heat Build', 'buff', 'self', 16, 5, 0, 'aura', '#fb923c', 'His flaming beard and shoulders roar higher and higher.', 'Builds heat: focus for 3 actions.', { el: 'FIRE', st: st('focus', 1, 3, 0.3) }),
    mv('endeavor', 'plusultra', 'Prominence Burn', 'ultimate', 'enemy', 42, 7, 2.9, 'fire', '#fef3c7', 'He compresses every bit of his heat into a white-hot pillar of fire.', 'Maximum firepower.', { el: 'FIRE', tr: 'hp_below_50', pierce: true, c2: '#f97316' }),
  ],
  kurapika: [
    mv('kurapika', 'chain', 'Chain Jail', 'attack', 'enemy', 18, 3, 1.3, 'wave', '#94a3b8', 'A chain from his little finger wraps the target and locks tight.', 'Binding chain that holds the target.', { el: 'MAGIC', st: st('stun', 0.45, 1, 0) }),
    mv('kurapika', 'dowsing', 'Dowsing Chain', 'attack', 'enemy', 14, 1, 1.45, 'projectile', '#cbd5e1', 'A pendulum chain swings out and strikes exactly where the target will be.', 'A chain that reads lies and movement.', { el: 'MAGIC' }),
    mv('kurapika', 'emperor', 'Emperor Time', 'buff', 'self', 18, 5, 0, 'aura', '#dc2626', 'His eyes turn scarlet and every Nen type opens to him at full power.', 'Scarlet Eyes: focus for 3 actions.', { st: st('focus', 1, 3, 0.4) }),
    mv('kurapika', 'judgment', 'Judgment Chain', 'ultimate', 'enemy', 38, 6, 2.5, 'slash', '#991b1b', 'A sharp chain stabs into the target\'s heart and wraps around it.', 'The chain that binds a life.', { el: 'MAGIC', tr: 'hp_below_50', pierce: true }),
  ],
  meruem: [
    mv('meruem', 'tail', 'Tail Strike', 'attack', 'enemy', 14, 1, 1.65, 'slash', '#4ade80', 'His bladed tail whips out faster than sight.', 'A lethal tail lash.', { el: 'DEMON' }),
    mv('meruem', 'aura', 'Royal Aura', 'debuff', 'all_enemies', 20, 4, 0.4, 'aura', '#14532d', 'His aura floods the arena; enemies feel they are already dead.', 'Overwhelming presence: weakens all enemies.', { el: 'DARK', st: st('weaken', 0.75, 2, 0.2) }),
    mv('meruem', 'photon', 'Photon', 'attack', 'enemy', 24, 4, 2.1, 'beam', '#a3e635', 'He fires a blast of pure Nen aura from his tail.', 'Stolen aura weapon.', { el: 'DEMON', pierce: true }),
    mv('meruem', 'rage', 'Rage of the King', 'ultimate', 'enemy', 42, 7, 2.9, 'explosion', '#16a34a', 'Huge fan-shaped Nen bursts from his back as he crushes the target.', 'The Ant King at full power.', { el: 'DEMON', tr: 'hp_below_50' }),
  ],
  jinwoo: [
    mv('jinwoo', 'dagger', 'Dagger Rush', 'attack', 'enemy', 13, 1, 1.5, 'slash', '#7c3aed', 'Twin daggers flash purple in a blur of strikes.', 'Kamish\'s Wrath daggers.', { el: 'SHADOW', st: st('bleed', 0.35, 2, 0.03) }),
    mv('jinwoo', 'arise', 'Arise', 'summon', 'enemy', 22, 3, 1.75, 'summon', '#6d28d9', 'He says one word and black smoke rises from the ground, forming an army of shadow soldiers.', 'Shadow Extraction: the army attacks.', { el: 'SHADOW', c2: '#111827' }),
    mv('jinwoo', 'stealth', 'Stealth', 'buff', 'self', 14, 4, 0, 'aura', '#312e81', 'He fades into the shadows and reappears behind the target.', 'Shadow stealth: haste for 3 actions.', { el: 'SHADOW', st: st('haste', 1, 3, 0.35) }),
    mv('jinwoo', 'monarch', 'Ruler\'s Authority: Shadow Monarch', 'ultimate', 'all_enemies', 44, 7, 1.8, 'domain', '#4c1d95', 'Black armor covers him and an invisible hand of the Ruler slams every enemy into the ground.', 'Shadow Monarch power.', { el: 'SHADOW', tr: 'hp_below_50', c2: '#a78bfa' }),
  ],
  jotaro: [
    mv('jotaro', 'ora', 'ORA ORA Barrage', 'attack', 'enemy', 18, 2, 1.75, 'barrage', '#8b5cf6', 'Star Platinum appears behind him and throws a blur of a hundred punches.', 'Stand rush.', { el: 'SPIRIT', shout: 'ORA ORA ORA ORA!' }),
    mv('jotaro', 'starfinger', 'Star Finger', 'attack', 'enemy', 14, 1, 1.45, 'punch', '#a78bfa', 'Star Platinum\'s fingers stretch out like a spear.', 'An extended finger strike.', { el: 'SPIRIT', pierce: true }),
    mv('jotaro', 'precision', 'Star Platinum\'s Precision', 'buff', 'self', 14, 4, 0, 'aura', '#6366f1', 'The stand sees everything in perfect detail, down to a fly on a photograph.', 'Focus for 3 actions.', { st: st('focus', 1, 3, 0.3) }),
    mv('jotaro', 'zawarudo', 'Star Platinum: The World', 'ultimate', 'enemy', 42, 7, 2.8, 'domain', '#4338ca', 'Time stops. The colors invert. Only he can move.', 'Stops time for a full barrage.', { el: 'SPIRIT', tr: 'hp_below_50', c2: '#f5d0fe', shout: 'STAR PLATINUM: THE WORLD!' }),
  ],
  dio: [
    mv('dio', 'muda', 'MUDA MUDA Barrage', 'attack', 'enemy', 18, 2, 1.75, 'barrage', '#facc15', 'The World appears and unloads a golden storm of punches.', 'Stand rush.', { el: 'SPIRIT', shout: 'MUDA MUDA MUDA!' }),
    mv('dio', 'knives', 'Knife Throw', 'aoe', 'all_enemies', 22, 3, 0.95, 'barrage', '#e5e7eb', 'Dozens of knives hang frozen in the air, then all fly at once.', 'Knives thrown during stopped time.', { el: 'ASSASSIN' }),
    mv('dio', 'blood', 'Vampire Blood Drain', 'heal', 'self', 16, 3, 0.24, 'heal', '#b91c1c', 'His fingers sink into the target and drink.', 'Vampiric drain.', { el: 'DARK', tr: 'hp_below_50' }),
    mv('dio', 'roadroller', 'ROAD ROLLER DA!', 'ultimate', 'enemy', 42, 7, 2.9, 'explosion', '#f59e0b', 'Time stops. He drops a steamroller from the sky and pounds on it.', 'The World\'s infamous finisher.', { el: 'DARK', tr: 'hp_below_50', shout: 'ROAD ROLLER DA!' }),
  ],
  mob: [
    mv('mob', 'psychic', 'Psychic Blast', 'attack', 'enemy', 16, 2, 1.6, 'wave', '#7dd3fc', 'An invisible push of psychic power slams the target into the wall.', 'Telekinetic blast.', { el: 'SPIRIT' }),
    mv('mob', 'barrier', 'Psychic Barrier', 'shield', 'self', 14, 3, 0.35, 'shield', '#bae6fd', 'A clear blue dome flickers around him.', 'Telekinetic shield.', { el: 'SPIRIT' }),
    mv('mob', 'meter', '100%', 'buff', 'self', 18, 5, 0, 'aura', '#38bdf8', 'A counter hits 100% and his emotions explode into a hurricane of psychic power.', 'Emotional overload: focus for 3 actions.', { el: 'SPIRIT', st: st('focus', 1, 3, 0.4), tr: 'hp_below_50' }),
    mv('mob', 'ascension', '???%', 'ultimate', 'all_enemies', 44, 7, 1.8, 'domain', '#e0f2fe', 'His eyes go blank. The sky turns white and everything floats.', 'Unconscious, unlimited psychic power.', { el: 'SPIRIT', tr: 'hp_below_30' }),
  ],
  kaneki: [
    mv('kaneki', 'kagune', 'Rinkaku Kagune', 'attack', 'enemy', 15, 1, 1.6, 'slash', '#dc2626', 'Four red tentacles burst from his lower back and lash at the target.', 'Ghoul predator organ.', { el: 'DEMON', st: st('bleed', 0.45, 2, 0.04) }),
    mv('kaneki', 'kakuja', 'Half-Kakuja', 'buff', 'self', 18, 5, 0, 'aura', '#7f1d1d', 'A red centipede-like armor half covers him; his hair turns white.', 'Partial kakuja: focus for 3 actions.', { el: 'DEMON', st: st('focus', 1, 3, 0.35), tr: 'hp_below_50' }),
    mv('kaneki', 'regen', 'Ghoul Regeneration', 'heal', 'self', 16, 3, 0.24, 'heal', '#ef4444', 'His wounds close with a wet crackle.', 'Rapid ghoul healing.', { el: 'DEMON' }),
    mv('kaneki', 'centipede', 'Centipede', 'ultimate', 'enemy', 42, 7, 2.9, 'explosion', '#991b1b', 'A huge armored centipede of kagune coils out of him and strikes like a whip.', 'Full kakuja.', { el: 'DEMON', tr: 'hp_below_50', c2: '#111827' }),
  ],
  asta: [
    mv('asta', 'demonslayer', 'Demon-Slayer Sword', 'attack', 'enemy', 15, 1, 1.6, 'slash', '#1f2937', 'He swings a massive rusty black sword that cuts straight through magic.', 'Anti-magic slash.', { el: 'DEMON', pierce: true }),
    mv('asta', 'dweller', 'Demon-Dweller Sword', 'attack', 'enemy', 16, 2, 1.5, 'wave', '#4b5563', 'He swings and fires a black crescent of anti-magic.', 'Flying anti-magic slash.', { el: 'DEMON' }),
    mv('asta', 'blackasta', 'Black Asta', 'buff', 'self', 18, 5, 0, 'aura', '#111827', 'Black wings burst from his back and a horn appears on his head.', 'Anti-magic form: haste for 3 actions.', { el: 'DEMON', st: st('haste', 1, 3, 0.4), c2: '#dc2626' }),
    mv('asta', 'blackdivider', 'Black Divider', 'ultimate', 'enemy', 40, 6, 2.8, 'slash', '#000000', 'Anti-magic covers his whole body and he cuts the target with a black slash that cancels everything.', 'Devil Union finishing slash.', { el: 'DEMON', tr: 'hp_below_50', pierce: true, c2: '#ef4444' }),
  ],
  yuno: [
    mv('yuno', 'tempest', 'Wind Blades', 'attack', 'enemy', 13, 1, 1.45, 'wave', '#4ade80', 'Crescents of sharp green wind fly from his grimoire.', 'Wind magic blades.', { el: 'WIND' }),
    mv('yuno', 'sylph', 'Spirit of Zephyr', 'buff', 'self', 16, 5, 0, 'aura', '#86efac', 'Bell, the wind spirit, merges with him and a green aura swirls around him.', 'Spirit Dive: focus for 3 actions.', { el: 'WIND', st: st('focus', 1, 3, 0.3) }),
    mv('yuno', 'storm', 'Spirit Storm', 'aoe', 'all_enemies', 26, 4, 1.05, 'wave', '#22c55e', 'A spiral tornado tears through the enemy line.', 'A raging tornado.', { el: 'WIND' }),
    mv('yuno', 'star', 'Star Magic: Zodiac', 'ultimate', 'enemy', 40, 6, 2.7, 'beam', '#fde047', 'A star sigil glows on his forehead and a column of starlight falls on the target.', 'Spade Kingdom star magic.', { el: 'MAGIC', tr: 'hp_below_50', pierce: true, c2: '#4ade80' }),
  ],
  power: [
    mv('power', 'hammer', 'Blood Hammer', 'attack', 'enemy', 14, 1, 1.6, 'punch', '#dc2626', 'Her blood forms a huge spiked hammer that she swings with both arms.', 'A hammer made of her own blood.', { el: 'DEMON' }),
    mv('power', 'spear', 'Blood Spear', 'attack', 'enemy', 15, 2, 1.5, 'projectile', '#ef4444', 'A spear of blood hardens in her hand and she hurls it.', 'A thrown blood javelin.', { el: 'DEMON', st: st('bleed', 0.45, 2, 0.04) }),
    mv('power', 'brag', 'Power is Number One!', 'buff', 'self', 12, 4, 0, 'aura', '#f87171', 'She points at herself and declares she\'s the greatest. Her horns glow red.', 'Overconfidence: focus for 3 actions.', { st: st('focus', 1, 3, 0.3) }),
    mv('power', 'rain', 'Blood Rain', 'ultimate', 'all_enemies', 40, 6, 1.7, 'barrage', '#991b1b', 'The sky goes red and thousands of blood needles rain down.', 'Blood Devil downpour.', { el: 'DEMON', tr: 'hp_below_50' }),
  ],
  yor: [
    mv('yor', 'stiletto', 'Stiletto Strike', 'attack', 'enemy', 13, 1, 1.55, 'slash', '#e11d48', 'A gold stiletto flashes once at the throat.', 'Assassin\'s precision strike.', { el: 'ASSASSIN', pierce: true }),
    mv('yor', 'kick', 'Thorn Princess Kick', 'attack', 'enemy', 14, 2, 1.65, 'punch', '#be123c', 'A spinning kick strong enough to break concrete.', 'Super-human kick.', { el: 'WARRIOR' }),
    mv('yor', 'shadow', 'Into the Shadows', 'buff', 'self', 14, 4, 0, 'aura', '#111827', 'She vanishes in a swirl of black dress and rose petals.', 'Assassin stealth: haste for 3 actions.', { el: 'ASSASSIN', st: st('haste', 1, 3, 0.35) }),
    mv('yor', 'thorn', 'Thorn Princess', 'ultimate', 'all_enemies', 40, 6, 1.7, 'barrage', '#9f1239', 'Rose petals drift. When they land, every enemy has already been cut.', 'A full assassination dance.', { el: 'ASSASSIN', tr: 'hp_below_50' }),
  ],
  gilgamesh: [
    mv('gilgamesh', 'babylon', 'Gate of Babylon', 'aoe', 'all_enemies', 24, 3, 1.05, 'barrage', '#fbbf24', 'Golden portals open behind him and legendary weapons fire out like arrows.', 'Rains treasures on every enemy.', { el: 'DIVINE' }),
    mv('gilgamesh', 'enkidu', 'Enkidu', 'attack', 'enemy', 18, 3, 1.3, 'wave', '#e5e7eb', 'Golden chains shoot from the portals and bind the target.', 'Chains of Heaven.', { el: 'DIVINE', st: st('stun', 0.45, 1, 0) }),
    mv('gilgamesh', 'armor', 'Golden Armor', 'shield', 'self', 14, 3, 0.3, 'shield', '#facc15', 'His golden armor glints and turns aside the attack.', 'The King\'s armor.', { el: 'DIVINE' }),
    mv('gilgamesh', 'ea', 'Enuma Elish', 'ultimate', 'enemy', 44, 7, 3.0, 'beam', '#dc2626', 'Ea spins, three red cylinders rotate, and a storm of space-tearing wind fires at the target.', 'The Star of Creation that Split Heaven and Earth.', { el: 'DIVINE', tr: 'hp_below_50', pierce: true, c2: '#111827', shout: 'ENUMA ELISH!' }),
  ],
  saber: [
    mv('saber', 'invisible', 'Invisible Air', 'attack', 'enemy', 14, 1, 1.55, 'slash', '#93c5fd', 'Her sword is hidden in a ball of wind; the target can\'t judge its length.', 'Wind-hidden sword.', { el: 'WIND' }),
    mv('saber', 'strike', 'Strike Air', 'attack', 'enemy', 16, 2, 1.55, 'wave', '#bfdbfe', 'She releases the wind around her sword as a hammer of air.', 'Released wind barrier.', { el: 'WIND', pierce: true }),
    mv('saber', 'avalon', 'Avalon', 'heal', 'self', 18, 5, 0.25, 'heal', '#fde68a', 'The golden sheath glows and her wounds close.', 'The Everdistant Utopia restores health.', { el: 'HOLY', tr: 'hp_below_50' }),
    mv('saber', 'excalibur', 'Excalibur', 'ultimate', 'enemy', 44, 7, 3.0, 'beam', '#facc15', 'She raises the golden sword; a pillar of light sweeps the arena.', 'Sword of Promised Victory.', { el: 'HOLY', tr: 'hp_below_50', pierce: true, c2: '#fef3c7', shout: 'EXCALIBUR!' }),
  ],
  kirito: [
    mv('kirito', 'vorpal', 'Vorpal Strike', 'attack', 'enemy', 15, 2, 1.65, 'slash', '#ef4444', 'His sword glows red as he lunges forward with a jet-engine roar.', 'Heavy single-thrust sword skill.', { el: 'WARRIOR', pierce: true }),
    mv('kirito', 'sonic', 'Sonic Leap', 'attack', 'enemy', 12, 1, 1.45, 'slash', '#4ade80', 'He jumps in with a green-lit diagonal slash.', 'Rushing sword skill.', { el: 'WARRIOR' }),
    mv('kirito', 'dual', 'Dual Blades', 'buff', 'self', 16, 5, 0, 'aura', '#111827', 'He draws a second sword from his back. Black and white, Elucidator and Dark Repulser.', 'Unique skill: focus for 3 actions.', { st: st('focus', 1, 3, 0.35) }),
    mv('kirito', 'starburst', 'Starburst Stream', 'ultimate', 'enemy', 40, 6, 2.8, 'barrage', '#60a5fa', 'Sixteen blue-lit sword strikes in a row, faster and faster.', 'The Dual Blades 16-hit combo.', { el: 'WARRIOR', tr: 'hp_below_50', shout: 'STARBURST STREAM!' }),
  ],
  frieren: [
    mv('frieren', 'zoltraak', 'Zoltraak', 'attack', 'enemy', 16, 2, 1.7, 'beam', '#e0f2fe', 'A white magic circle opens and a thin beam of killing magic fires.', 'Ordinary Offensive Magic.', { el: 'MAGIC', pierce: true }),
    mv('frieren', 'defense', 'Defensive Magic', 'shield', 'self', 14, 3, 0.35, 'shield', '#a5f3fc', 'Hexagonal panels of light snap together into a barrier.', 'Standard barrier magic.', { el: 'MAGIC' }),
    mv('frieren', 'mana', 'Mana Suppression', 'buff', 'self', 16, 5, 0, 'aura', '#c4b5fd', 'She releases a thousand years of hidden mana all at once.', 'Hidden power revealed: focus for 3 actions.', { el: 'MAGIC', st: st('focus', 1, 3, 0.4) }),
    mv('frieren', 'judradjim', 'Judradjim', 'ultimate', 'all_enemies', 42, 7, 1.75, 'lightning', '#a78bfa', 'Storm clouds gather and a lightning dragon falls on the enemy line.', 'Lightning-summoning magic.', { el: 'LIGHTNING', tr: 'hp_below_50' }),
  ],
  escanor: [
    mv('escanor', 'cruel', 'Cruel Sun', 'attack', 'enemy', 18, 2, 1.75, 'fire', '#fbbf24', 'A small sun forms over his finger and he flicks it at the target.', 'A tiny sun, tossed.', { el: 'FIRE', st: st('burn', 0.45, 2, 0.04) }),
    mv('escanor', 'rhitta', 'Divine Axe Rhitta', 'attack', 'enemy', 16, 2, 1.65, 'slash', '#f59e0b', 'He swings a giant golden axe one-handed.', 'A heavy axe swing.', { el: 'HOLY' }),
    mv('escanor', 'noon', 'Sunshine', 'buff', 'self', 16, 5, 0, 'aura', '#fde047', 'The sun climbs and so does he: bigger, brighter, more arrogant.', 'Grows stronger toward noon: focus for 3 actions.', { el: 'HOLY', st: st('focus', 1, 3, 0.4) }),
    mv('escanor', 'oneman', 'The One Ultimate', 'ultimate', 'enemy', 44, 7, 3.0, 'explosion', '#fef08a', 'At noon he becomes the sun itself. Who decided that?', 'One minute of absolute power.', { el: 'HOLY', tr: 'hp_below_50', pierce: true, shout: 'WHO DECIDED THAT?' }),
  ],
};

export const LEGEND_MOVES: Ability[] = Object.values(LEGEND_MOVESETS).flat();
