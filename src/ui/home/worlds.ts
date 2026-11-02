// The home page is one character's world, picked at random on each visit: their own
// colours, lines, effects and three cinematic scenes (drawn offline by the local drawing
// app with tools/make-hero.ts into public/hero/<key>/<n>.webp) that change as you scroll.

export type Effect = 'embers' | 'lightning' | 'sparks' | 'petals' | 'shadow' | 'water' | 'ash' | 'void' | 'leaves' | 'dust';

export interface Scene {
  /** What the drawing app paints (the character's own look tags are added by the tool). */
  prompt: string;
  /** The big line over this scene; the part in [brackets] gets the accent colour. */
  title: string;
  /** Small caption under the title. */
  line: string;
}

export interface World {
  key: string;
  /** Short studio-style label, top left (like "STARK / INDUSTRIES" in a film site). */
  house: string;
  name: string;
  series: string;
  accent: string;
  /** Second tone for gradients, rails and glows. */
  tone: string;
  /** Page background: the colour the scenes fade into. */
  ink: string;
  effect: Effect;
  /** A short line in the quote card, in the character's voice (written for this game). */
  quote: string;
  /** How the world is set: headline type, frame around the screen, big background kana. */
  type: 'block' | 'serif' | 'condensed';
  frame: 'hud' | 'ink' | 'clean';
  kana: string;
  scenes: [Scene, Scene, Scene];
}

const CINE = 'upper body, close-up, large figure filling the right half of the frame, face clearly visible, intense eyes, looking at viewer, dark empty background on the left half, cinematic lighting, strong rim light, glowing particles, depth of field, anime key visual, highly detailed, masterpiece';

export const WORLDS: World[] = [
  {
    key: 'naruto', house: 'HIDDEN LEAF / ARCHIVE', name: 'Naruto Uzumaki', series: 'Naruto', accent: '#ff8a1f', tone: '#ffd25a', ink: '#120804', effect: 'leaves',
    quote: 'I don\'t quit, and I don\'t go back on my word.',
    type: 'block', frame: 'ink', kana: 'ナルト',
    scenes: [
      { prompt: `standing on a rooftop at sunset, wind in hair, smiling confidently, village below, ${CINE}`, title: 'Never [give up.]', line: 'The kid nobody believed in, holding a village on his back.' },
      { prompt: `(sage mode:1.2), (orange pigment around eyes, yellow eyes with horizontal pupils:1.3), natural energy swirling, red cloak, mountain of toads, ${CINE}`, title: 'Sage [Mode.]', line: 'Nature\'s own power, borrowed for one more fight.' },
      { prompt: `kurama link mode, golden chakra cloak, glowing yellow body, black seal markings, giant orange fox spirit behind him, rasengan in hand, ${CINE}`, title: 'Bid on the [next Hokage.]', line: 'Fighters go under the hammer. Their true power stays hidden.' },
    ],
  },
  {
    key: 'goku', house: 'CAPSULE CORP / LAB 7', name: 'Goku', series: 'Dragon Ball', accent: '#ffcf33', tone: '#4fb4ff', ink: '#05070f', effect: 'sparks',
    quote: 'There\'s always someone stronger. That\'s the fun part.',
    type: 'block', frame: 'hud', kana: '悟空',
    scenes: [
      { prompt: `orange gi, standing in a rocky wasteland, calm smile, wind, clouds parting, ${CINE}`, title: 'Just a [Saiyan.]', line: 'Raised in the mountains. Born to fight.' },
      { prompt: `super saiyan, spiky golden hair, golden aura, screaming, ground cracking, rocks floating, lightning sparks, ${CINE}`, title: 'Super [Saiyan.]', line: 'The legend everyone said was a myth.' },
      { prompt: `ultra instinct, silver hair, silver eyes, silver blue aura, calm expression, space and stars, debris floating, ${CINE}`, title: 'Build a team [beyond limits.]', line: 'Bid, build and battle your way to the top.' },
    ],
  },
  {
    key: 'luffy', house: 'THOUSAND SUNNY / DECK', name: 'Monkey D. Luffy', series: 'One Piece', accent: '#ff3b3b', tone: '#ffd166', ink: '#070b14', effect: 'sparks',
    quote: 'I\'m going to be King of the Pirates. Bid accordingly.',
    type: 'block', frame: 'ink', kana: 'ルフィ',
    scenes: [
      { prompt: `straw hat, red vest, standing on a ship bow, ocean, sunny sky, big grin, ${CINE}`, title: 'King of the [Pirates.]', line: 'One dream, one crew, no plan B.' },
      { prompt: `gear fourth, boundman, black armament haki arms, inflated muscles, steam, stormy sea, ${CINE}`, title: 'Gear [Fourth.]', line: 'Bounce, punch, repeat.' },
      { prompt: `gear fifth, white hair, white clothes, white flames around neck, laughing, sun god nika, giant fist, sunlight rays, ${CINE}`, title: 'The [warrior of liberation.]', line: 'Whoever you buy, make sure they make you laugh.' },
    ],
  },
  {
    key: 'ichigo', house: 'SOUL SOCIETY / 13 COURTS', name: 'Ichigo Kurosaki', series: 'Bleach', accent: '#ff4d2e', tone: '#e8e8e8', ink: '#060606', effect: 'ash',
    quote: 'I\'m not fighting to win. I fight to protect.',
    type: 'condensed', frame: 'clean', kana: '一護',
    scenes: [
      { prompt: `shinigami black kimono, giant cleaver sword on back, orange spiky hair, night city rooftops, full moon, ${CINE}`, title: 'Substitute [Soul Reaper.]', line: 'Fifteen years old, one oversized sword.' },
      { prompt: `bankai tensa zangetsu, long black coat, thin black sword, black and red reiatsu flames, ${CINE}`, title: 'Ban[kai.]', line: 'Faster than you can blink.' },
      { prompt: `white hollow mask with red stripes, black and yellow eyes, getsuga tensho, black and red crescent of energy, ${CINE}`, title: 'Getsuga [Tensho.]', line: 'Pick fighters with hidden stats. Find out who\'s a monster.' },
    ],
  },
  {
    key: 'gojo', house: 'JUJUTSU HIGH / TOKYO', name: 'Satoru Gojo', series: 'Jujutsu Kaisen', accent: '#5ab0ff', tone: '#b47cff', ink: '#03040c', effect: 'void',
    quote: 'Relax. I\'m the strongest.',
    type: 'serif', frame: 'clean', kana: '五条',
    scenes: [
      { prompt: `black blindfold, white hair, black high collar uniform, hands in pockets, city street at night, ${CINE}`, title: 'The [strongest.]', line: 'Don\'t worry. He\'s got this.' },
      { prompt: `(no blindfold:1.3), (glowing bright blue eyes:1.3), white hair, smirk, blue sphere of energy in hand, infinite space, ${CINE}`, title: 'Six [Eyes.]', line: 'He sees everything. Including your bid.' },
      { prompt: `hollow purple, giant purple sphere of energy, red and blue energy merging, destroyed city, ${CINE}`, title: 'Hollow [Purple.]', line: 'Assemble a squad that can survive this.' },
    ],
  },
  {
    key: 'sukuna', house: 'CURSED / WOMB', name: 'Ryomen Sukuna', series: 'Jujutsu Kaisen', accent: '#ff2a3d', tone: '#ff9a7a', ink: '#0b0204', effect: 'embers',
    quote: 'Know your place.',
    type: 'serif', frame: 'ink', kana: '宿儺',
    scenes: [
      { prompt: `pink hair, black facial markings, extra eyes under eyes, white kimono, sitting on a throne of skulls, sinister smile, ${CINE}`, title: 'King of [Curses.]', line: 'A thousand years of bad intentions.' },
      { prompt: `domain expansion malevolent shrine, shrine with mouths, pool of blood, slashes in the air, ${CINE}`, title: 'Malevolent [Shrine.]', line: 'Everything in range gets cut.' },
      { prompt: `heian form, four arms, two faces, fire arrow, burning city, ${CINE}`, title: 'Open. [Fuga.]', line: 'Spend smart. Someone in the pool is a disaster.' },
    ],
  },
  {
    key: 'tanjiro', house: 'DEMON SLAYER CORPS', name: 'Tanjiro Kamado', series: 'Demon Slayer', accent: '#2fd1c2', tone: '#ff7a2f', ink: '#03090a', effect: 'water',
    quote: 'No matter how many times I fall, I get back up.',
    type: 'condensed', frame: 'ink', kana: '炭治郎',
    scenes: [
      { prompt: `checkered green and black haori, earring, katana at side, snowy mountain forest, night, ${CINE}`, title: 'Kind [heart.]', line: 'A boy who carries his family with him.' },
      { prompt: `water breathing, swinging katana, flowing water dragon around the blade, splash, ${CINE}`, title: 'Water [Breathing.]', line: 'Flow like water, cut like a river.' },
      { prompt: `hinokami kagura, sun breathing, katana wreathed in fire, demon slayer mark on forehead, flames, ${CINE}`, title: 'Dance of the [Fire God.]', line: 'Light the fire. Build the team.' },
    ],
  },
  {
    key: 'levi', house: 'SURVEY CORPS / HQ', name: 'Levi Ackerman', series: 'Attack on Titan', accent: '#c9d4dc', tone: '#3fa66b', ink: '#05080a', effect: 'dust',
    quote: 'Choose the option you\'ll regret least.',
    type: 'condensed', frame: 'hud', kana: 'リヴァイ',
    scenes: [
      { prompt: `short black hair, undercut, survey corps uniform, green cape, 3d maneuver gear, standing on a wall, overcast sky, ${CINE}`, title: 'Humanity\'s [strongest.]', line: 'Short temper. Shorter fuse.' },
      { prompt: `flying with 3d maneuver gear, spinning with two blades, cables, steam, forest of giant trees, ${CINE}`, title: 'Spin [attack.]', line: 'Before the titan turns around, it\'s over.' },
      { prompt: `two blades raised, steam rising, sunset sky, green survey corps cape, ${CINE}`, title: 'Choose [no regrets.]', line: 'Pick your squad. Live with the results.' },
    ],
  },
  {
    key: 'jinwoo', house: 'HUNTER ASSOC. / S-RANK', name: 'Sung Jinwoo', series: 'Solo Leveling', accent: '#8f6bff', tone: '#4fd2ff', ink: '#04030a', effect: 'shadow',
    quote: 'Arise.',
    type: 'block', frame: 'hud', kana: '진우',
    scenes: [
      { prompt: `black hood coat, two daggers, dark dungeon corridor, blue glow, ${CINE}`, title: 'The [weakest] hunter.', line: 'E-rank. For now.' },
      { prompt: `glowing purple eyes, shadow army rising behind him, shadow soldiers, black flames, ${CINE}`, title: '[Arise.]', line: 'Every fallen enemy joins the army.' },
      { prompt: `short black hair, (purple glowing eyes:1.2), black long coat with dark armor plates, giant shadow knight with red plume behind him, ${CINE}`, title: 'Shadow [Monarch.]', line: 'Level up your roster, one bid at a time.' },
    ],
  },
  {
    key: 'eren', house: 'PARADIS / MARLEY', name: 'Eren Yeager', series: 'Attack on Titan', accent: '#e0a24a', tone: '#7fbf8e', ink: '#0a0704', effect: 'ash',
    quote: 'I keep moving forward.',
    type: 'serif', frame: 'hud', kana: 'エレン',
    scenes: [
      { prompt: `short brown hair, green eyes, survey corps uniform, green cape, looking over a giant wall, ${CINE}`, title: 'Beyond the [walls.]', line: 'He wanted to see the ocean.' },
      { prompt: `attack titan, giant titan with long hair, roaring, lightning strike, ruined city, ${CINE}`, title: 'Attack [Titan.]', line: 'One bite of the hand, and everything changes.' },
      { prompt: `long hair, older, dark coat, colossal titans marching behind him, smoke, apocalyptic sky, ${CINE}`, title: 'Keep moving [forward.]', line: 'Bid, build, battle. No turning back.' },
    ],
  },
  {
    key: 'vegeta', house: 'SAIYAN ROYAL GUARD', name: 'Vegeta', series: 'Dragon Ball', accent: '#3d8bff', tone: '#ffd400', ink: '#03050d', effect: 'sparks',
    quote: 'I am the prince of all Saiyans. Remember that when you bid.',
    type: 'block', frame: 'hud', kana: 'ベジータ',
    scenes: [
      { prompt: `blue saiyan armor, arms crossed, smirk, widow's peak black hair, rocky cliff, ${CINE}`, title: 'The [Prince.]', line: 'Pride is a power source.' },
      { prompt: `super saiyan blue, blue spiky hair, blue aura, clenched fist, ${CINE}`, title: 'Super Saiyan [Blue.]', line: 'Always one step behind. Never for long.' },
      { prompt: `final flash, both hands forward, giant yellow energy beam, golden hair, ${CINE}`, title: 'Final [Flash.]', line: 'Bring everything. Hold nothing back.' },
    ],
  },
  {
    key: 'sasuke', house: 'UCHIHA / ARCHIVE', name: 'Sasuke Uchiha', series: 'Naruto', accent: '#9b5cff', tone: '#ff2d55', ink: '#05030b', effect: 'lightning',
    quote: 'I have a goal, and I will reach it.',
    type: 'serif', frame: 'clean', kana: 'サスケ',
    scenes: [
      { prompt: `black hair, white high collar shirt, sharingan red eyes, cold stare, rainy night, ${CINE}`, title: 'The last [Uchiha.]', line: 'He walks alone, on purpose.' },
      { prompt: `chidori, blue lightning in hand, sharingan, lightning sparks, ${CINE}`, title: '[Chidori.]', line: 'A thousand birds, one strike.' },
      { prompt: `rinnegan left eye, purple susanoo behind him, black cloak, ${CINE}`, title: 'Eyes of [the gods.]', line: 'He sees the auction three moves ahead.' },
    ],
  },
  {
    key: 'zoro', house: 'THREE SWORD STYLE', name: 'Roronoa Zoro', series: 'One Piece', accent: '#3ddc84', tone: '#e5e7eb', ink: '#030805', effect: 'dust',
    quote: 'Nothing happened.',
    type: 'condensed', frame: 'ink', kana: 'ゾロ',
    scenes: [
      { prompt: `green hair, three swords at hip, green haramaki, scar over left eye, ${CINE}`, title: 'Three [swords.]', line: 'Lost again. Still going to win.' },
      { prompt: `santoryu stance, sword in mouth, two swords crossed, slashing wind, ${CINE}`, title: 'Santo[ryu.]', line: 'Two hands, one mouth, three blades.' },
      { prompt: `asura, dark aura, glowing eye, nine swords illusion, ${CINE}`, title: '[Asura.]', line: 'A demon of a swordsman for your squad.' },
    ],
  },
  {
    key: 'rengoku', house: 'FLAME HASHIRA', name: 'Kyojuro Rengoku', series: 'Demon Slayer', accent: '#ff7a1a', tone: '#ffd23f', ink: '#0d0502', effect: 'embers',
    quote: 'Set your heart ablaze.',
    type: 'block', frame: 'ink', kana: '煉獄',
    scenes: [
      { prompt: `yellow and red flame hair, white haori with flame pattern, big confident smile, ${CINE}`, title: 'Flame [Hashira.]', line: 'Loud, kind, impossible to stop.' },
      { prompt: `flame breathing, katana wreathed in fire, flames everywhere, ${CINE}`, title: 'Flame [Breathing.]', line: 'Every slash leaves the air burning.' },
      { prompt: `ninth form rengoku, giant fire dragon, sunrise, ${CINE}`, title: 'Set your heart [ablaze.]', line: 'Protect what matters. Then win.' },
    ],
  },
  {
    key: 'killua', house: 'ZOLDYCK ESTATE', name: 'Killua Zoldyck', series: 'Hunter x Hunter', accent: '#7fd8ff', tone: '#c9b6ff', ink: '#03070c', effect: 'lightning',
    quote: "I will protect my friend. That is all.",
    type: 'condensed', frame: 'clean', kana: 'キルア',
    scenes: [
      { prompt: `white spiky hair, blue eyes, purple shirt, skateboard, smirk, ${CINE}`, title: 'Ex-[assassin.]', line: 'Born into the family business. Quit.' },
      { prompt: `godspeed, white hair, blue lightning all over body, ${CINE}`, title: 'God[speed.]', line: 'He moves before you think.' },
      { prompt: `assassin claws, cold eyes, lightning, dark alley, ${CINE}`, title: 'Rhythm [Echo.]', line: 'Fast fighters win auctions too.' },
    ],
  },
  {
    key: 'saitama', house: 'HERO ASSOC. / CLASS B', name: 'Saitama', series: 'One Punch Man', accent: '#ffd400', tone: '#ff3b3b', ink: '#0b0904', effect: 'dust',
    quote: 'OK.',
    type: 'block', frame: 'hud', kana: 'サイタマ',
    scenes: [
      { prompt: `bald, yellow suit, white cape, red gloves, bored expression, city, ${CINE}`, title: 'Hero for [fun.]', line: 'One punch. Every time.' },
      { prompt: `serious face, bald, yellow suit, cape flowing, intense shadows, ${CINE}`, title: 'Serious [mode.]', line: 'The rare times he tries.' },
      { prompt: `serious punch, fist forward, shockwave splitting clouds, ${CINE}`, title: 'Serious [Punch.]', line: 'Bid on him and the tournament is over.' },
    ],
  },
];

/** A world at random, different from the last one this browser saw when possible. */
export function pickWorld(): World {
  let last = '';
  try { last = localStorage.getItem('aa-home-world') ?? ''; } catch { /* storage unavailable */ }
  const pool = WORLDS.filter((w) => w.key !== last);
  const w = pool[Math.floor(Math.random() * pool.length)] ?? WORLDS[0];
  try { localStorage.setItem('aa-home-world', w.key); } catch { /* storage unavailable */ }
  return w;
}

/** n different worlds at random, the first one different from last visit's opener. */
export function pickWorlds(n: number): World[] {
  const first = pickWorld();
  const rest = WORLDS.filter((w) => w.key !== first.key).map((w) => [Math.random(), w] as const).sort((a, b) => a[0] - b[0]).map(([, w]) => w);
  return [first, ...rest].slice(0, n);
}
