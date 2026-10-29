// Famous matchups and team-ups from the series. When rivals meet, they trade
// words before the bell, fight a little harder, and their signature moves are
// drawn into head-on clashes. Partners on the same side unlock a named combo.

export interface Rivalry {
  a: string;
  b: string;
  title: string;
  /** What each says before the bell. */
  lines: [string, string];
  /** When a uses clash[0] and b has clash[1] ready (or the reverse), they collide. */
  clash: [string, string];
}

export interface Duo {
  a: string;
  b: string;
  name: string;
  look: string;
  color: string;
}

const L = (k: string) => `legend:${k}`;

export const RIVALRIES: Rivalry[] = [
  { a: L('naruto'), b: L('sasuke'), title: 'The Valley of the End', lines: ['I\'m bringing you back, even if I have to break every bone in your body!', 'You still don\'t get it, Naruto.'], clash: ['naruto:rasengan', 'sasuke:chidori'] },
  { a: L('itachi'), b: L('sasuke'), title: 'Brothers of the Uchiha', lines: ['Foolish little brother. Hate me, and survive.', 'I\'ve waited my whole life for this, Itachi.'], clash: ['itachi:phoenix', 'sasuke:fireball'] },
  { a: L('naruto'), b: L('madara'), title: 'The Fourth Great Ninja War', lines: ['Your dream is a nightmare. I\'ll stop it!', 'Dance with me, boy.'], clash: ['naruto:tbb', 'madara:meteor'] },
  { a: L('goku'), b: L('vegeta'), title: 'Prince and Rival', lines: ['Ready, Vegeta? Let\'s go all out!', 'Today, Kakarot, I surpass you.'], clash: ['goku:kamehameha', 'vegeta:galick'] },
  { a: L('goku'), b: L('frieza'), title: 'The Battle of Namek', lines: ['You\'ve hurt too many people, Frieza.', 'Filthy monkey. I\'ll make it quick.'], clash: ['goku:kamehameha', 'frieza:deathbeam'] },
  { a: L('gojo'), b: L('sukuna'), title: 'The Strongest vs the King of Curses', lines: ['Throughout heaven and earth, I alone am the honoured one.', 'Stand proud. You are strong.'], clash: ['gojo:purple', 'sukuna:shrine'] },
  { a: L('yuji'), b: L('sukuna'), title: 'Vessel and Curse', lines: ['Get out of my body and face me!', 'Brat. You\'re just my container.'], clash: ['yuji:blackflash', 'sukuna:dismantle'] },
  { a: L('deku'), b: L('bakugo'), title: 'Deku vs Kacchan', lines: ['I won\'t lose to you anymore, Kacchan!', 'Don\'t look down on me, DEKU!'], clash: ['deku:detroit', 'bakugo:apshot'] },
  { a: L('jotaro'), b: L('dio'), title: 'ORA vs MUDA', lines: ['You\'re going to pay for everything, Dio.', 'You thought it would be easy? But it was me, DIO!'], clash: ['jotaro:ora', 'dio:muda'] },
  { a: L('asta'), b: L('yuno'), title: 'Race to Wizard King', lines: ['Yuno! The Wizard King is gonna be ME!', 'Then you\'ll have to beat me first.'], clash: ['asta:demonslayer', 'yuno:tempest'] },
  { a: L('rengoku'), b: L('akaza'), title: 'The Mugen Train', lines: ['Set your heart ablaze!', 'Become a demon, Kyojuro. Let us fight forever.'], clash: ['rengoku:ninth', 'akaza:annihilation'] },
  { a: L('zoro'), b: L('sanji'), title: 'Marimo vs Swirly Brow', lines: ['Stay out of my way, love-cook.', 'Watch who you\'re talking to, moss head!'], clash: ['zoro:onigiri', 'sanji:diable'] },
  { a: L('ichigo'), b: L('aizen'), title: 'The Battle for Karakura', lines: ['I\'ll end this with my own hands.', 'Everything is going according to plan.'], clash: ['ichigo:getsuga', 'aizen:kurohitsugi'] },
  { a: L('ichigo'), b: L('byakuya'), title: 'To Save Rukia', lines: ['Move, Byakuya. I\'m taking Rukia home.', 'You will not touch her. Scatter, Senbonzakura.'], clash: ['ichigo:getsuga', 'byakuya:byakurai'] },
  { a: L('ichigo'), b: L('kenpachi'), title: 'Bells and Blades', lines: ['You just want to fight, huh?', 'Ha! Finally someone fun!'], clash: ['ichigo:getsuga', 'kenpachi:kendo'] },
  { a: L('gilgamesh'), b: L('saber'), title: 'Holy Grail War', lines: ['Kneel, Saber. You will be mine.', 'Never. My sword answers to no one.'], clash: ['gilgamesh:ea', 'saber:excalibur'] },
  { a: L('luffy'), b: L('shanks'), title: 'The Promise of the Straw Hat', lines: ['I\'m gonna give the hat back after I become King!', 'Show me how strong you\'ve gotten, Anchor.'], clash: ['luffy:kong', 'shanks:kamusari'] },
  { a: L('eren'), b: L('levi'), title: 'Humanity\'s Strongest', lines: ['Nobody tells me what to do anymore.', 'Then I\'ll beat some discipline into you.'], clash: ['eren:hardened', 'levi:spin'] },
  { a: L('killua'), b: L('meruem'), title: 'The Chimera Ant King', lines: ['I\'m not running this time.', 'Insect. Know your place.'], clash: ['killua:thunderbolt', 'meruem:photon'] },
  { a: L('kaneki'), b: L('shigaraki'), title: 'Monsters of the City', lines: ['I am a ghoul.', 'Everything breaks eventually.'], clash: ['kaneki:kagune', 'shigaraki:decay'] },
];

export const DUOS: Duo[] = [
  { a: L('naruto'), b: L('sasuke'), name: 'Yin-Yang Release: Rasengan x Chidori', look: 'Orange chakra and purple lightning spiral together into a single blinding storm.', color: '#f59e0b' },
  { a: L('goku'), b: L('vegeta'), name: 'Fusion: Gogeta\'s Stardust Breaker', look: 'They fuse in a flash; Gogeta crushes a rainbow ki orb in his fist.', color: '#60a5fa' },
  { a: L('yuji'), b: L('todo'), name: 'Brothers\' Black Flash', look: 'Clap, swap, and two black flashes land in the same millionth of a second.', color: '#111827' },
  { a: L('gon'), b: L('killua'), name: 'Jajanken x Godspeed', look: 'Killua\'s lightning drags the target into Gon\'s waiting fist.', color: '#22c55e' },
  { a: L('deku'), b: L('bakugo'), name: 'Double Smash', look: 'An explosion launches Deku into a 100% smash from point-blank range.', color: '#16a34a' },
  { a: L('itachi'), b: L('sasuke'), name: 'Uchiha Brothers\' Susanoo', look: 'Red and purple Susanoo fire arrows of fire and lightning side by side.', color: '#dc2626' },
  { a: L('luffy'), b: L('zoro'), name: 'Straw Hat Combination', look: 'A stretching fist and three swords strike from both sides at once.', color: '#ef4444' },
  { a: L('zoro'), b: L('sanji'), name: 'Monster Trio Clash', look: 'Flaming kicks and demon swords, bickering the whole way.', color: '#f97316' },
  { a: L('levi'), b: L('mikasa'), name: 'Ackerman Pincer', look: 'Two blurs on ODM gear, blades from both sides.', color: '#94a3b8' },
  { a: L('tanjiro'), b: L('giyu'), name: 'Water Breathing Duet', look: 'Two water dragons coil around each other and strike as one.', color: '#3b82f6' },
  { a: L('tanjiro'), b: L('rengoku'), name: 'Blazing Sun and Flame', look: 'Hinokami fire and flame breathing roar together like twin suns.', color: '#ea580c' },
  { a: L('asta'), b: L('yuno'), name: 'Clover Kingdom\'s Finest', look: 'Wind carries Asta\'s anti-magic blade straight through every defense.', color: '#4ade80' },
  { a: L('edward'), b: L('roy'), name: 'Alchemy Barrage', look: 'Stone spears rise as a wall of flame races along them.', color: '#ea580c' },
  { a: L('gojo'), b: L('megumi'), name: 'Jujutsu High Assault', look: 'Shadows swallow the target as Blue drags them into the dark.', color: '#38bdf8' },
  { a: L('jotaro'), b: L('kakashi'), name: 'Reading Every Move', look: 'Sharingan and Star Platinum: nothing gets past them.', color: '#8b5cf6' },
  { a: L('minato'), b: L('naruto'), name: 'Father and Son Rasengan', look: 'Two Rasengans merge into one spinning sphere of golden chakra.', color: '#fde047' },
  { a: L('saitama'), b: L('allmight'), name: 'Symbol of Peace and Caped Baldy', look: 'Two punches. The clouds part over the whole city.', color: '#facc15' },
];

const pairKey = (x: string, y: string) => [x, y].sort().join('|');
const RIVAL_BY_PAIR = new Map(RIVALRIES.map((r) => [pairKey(r.a, r.b), r]));
const DUO_BY_PAIR = new Map(DUOS.map((d) => [pairKey(d.a, d.b), d]));

export const rivalryBetween = (x: string, y: string) => RIVAL_BY_PAIR.get(pairKey(x, y));
export const duoOf = (x: string, y: string) => DUO_BY_PAIR.get(pairKey(x, y));
