// Anime Legends: real characters from popular anime. Official artwork is
// loaded at runtime from AniList's CDN (not bundled). Biographies are short
// summaries written for this game. Combat stats are still generated per game.
import type { Archetype, PublicCharacter, StatKey, Tag, Temperament } from '../types';
import { SCHEMA_VERSION } from '../types';
import { ARCHETYPES } from './archetypes';
import { LEGEND_MOVESETS } from './legendMoves';
import { hashString } from '../rng';

const CDN = 'https://s4.anilist.co/file/anilistcdn/character/large/';

type Row = [
  key: string, name: string, anilistId: number, image: string, series: string, archetype: Archetype, temperament: Temperament,
  tags: Tag[], weapon: string, specialty: string, style: string, bio: string, aliases: string[], form: string, bias: Partial<Record<StatKey, number>>,
];

const ROWS: Row[] = [
  ['naruto', 'Naruto Uzumaki', 17, 'b17-phjcWCkRuIhu.png', 'Naruto', 'Berserker', 'hot-blooded', ['WIND', 'SPIRIT'], 'Kunai & chakra', 'Overwhelming stamina', 'Clone swarms and Rasengan', 'A loud, stubborn ninja who carries a nine-tailed fox inside him and never gives up.', ['Seventh Hokage'], 'Six Paths Naruto', { stamina: 10 }],
  ['sasuke', 'Sasuke Uchiha', 13, 'b13-SISLEw1oAD7a.png', 'Naruto', 'Duelist', 'arrogant', ['LIGHTNING', 'FIRE'], 'Kusanagi sword', 'Lightning and Sharingan', 'Precise, fast and ruthless', 'The last Uchiha, driven by vengeance, wielding lightning and black flames.', ['The Avenger'], 'Rinnegan Sasuke', { technique: 6 }],
  ['itachi', 'Itachi Uchiha', 14, 'b14-9Kb1E5oel1ke.png', 'Naruto', 'Controller', 'calculating', ['FIRE', 'SHADOW'], 'Kunai & Mangekyou Sharingan', 'Genjutsu', 'Illusions that end fights before they begin', 'A prodigy who wiped out his own clan and carried the secret alone.', ['Crow'], 'Susanoo Itachi', { battleIQ: 10 }],
  ['kakashi', 'Kakashi Hatake', 85, 'b85-mkVBh2yjxjmx.png', 'Naruto', 'Strategist', 'patient', ['LIGHTNING', 'ASSASSIN'], 'Kunai & Sharingan', 'Copying techniques', 'Calm, adaptive, always reading', 'The Copy Ninja: a lazy-looking teacher who has copied a thousand jutsu.', ['Copy Ninja'], 'Double Sharingan Kakashi', { adaptability: 8 }],
  ['luffy', 'Monkey D. Luffy', 40, 'b40-MNypXsxSRb1R.png', 'One Piece', 'Berserker', 'cheerful', ['WARRIOR', 'WIND'], 'Rubber body', 'Unpredictable brawling', 'Stretching punches and Gears', 'A rubber-bodied pirate captain who wants to be King of the Pirates.', ['Straw Hat'], 'Gear Fifth Luffy', { stamina: 8 }],
  ['zoro', 'Roronoa Zoro', 62, 'b62-S7oAeA9WInjV.png', 'One Piece', 'Duelist', 'stoic', ['WARRIOR', 'DEMON'], 'Three katana', 'Three-Sword Style', 'Brutal swordsmanship', 'A swordsman who fights with a blade in his mouth and gets lost walking in a straight line.', ['Pirate Hunter'], 'King of Hell Zoro', { attack: 6 }],
  ['sanji', 'Sanji', 305, 'b305-6lisPmHtCnLT.png', 'One Piece', 'Assassin', 'hot-blooded', ['FIRE', 'WIND'], 'His legs', 'Kicks only', 'Spinning flaming kicks', 'The Straw Hats\' chef, who refuses to use his hands in a fight.', ['Black Leg'], 'Raid Suit Sanji', { speed: 6 }],
  ['ace', 'Portgas D. Ace', 2072, 'b2072-Lc6jEdsueJUK.jpg', 'One Piece', 'Mage', 'reckless', ['FIRE', 'WARRIOR'], 'Flame-Flame Fruit', 'Fire logia', 'Raw fire power', 'Luffy\'s fiery older brother, a pirate whose body is made of flame.', ['Fire Fist'], 'Flame Emperor Ace', {}],
  ['goku', 'Goku', 246, '246-wsRRr6z1kii8.png', 'Dragon Ball Z', 'Berserker', 'cheerful', ['WARRIOR', 'DIVINE'], 'Ki', 'Martial arts and ki blasts', 'Joyful all-out combat', 'A Saiyan raised on Earth who lives for the next strong opponent.', ['Kakarot'], 'Ultra Instinct Goku', { potential: 10 }],
  ['vegeta', 'Vegeta', 913, 'b913-NIFkKazWM8VO.png', 'Dragon Ball Z', 'Duelist', 'arrogant', ['WARRIOR', 'DIVINE'], 'Ki', 'Ki beams', 'Proud, aggressive pressure', 'The Prince of all Saiyans, endlessly chasing his rival.', ['Saiyan Prince'], 'Ultra Ego Vegeta', { attack: 6 }],
  ['frieza', 'Frieza', 3694, 'b3694-bDfOdSSdFfPv.png', 'Dragon Ball Z', 'Mage', 'arrogant', ['DARK', 'DEMON'], 'Ki', 'Planet-destroying ki', 'Cold, cruel precision', 'A galactic tyrant who destroys planets for business.', ['Emperor of the Universe'], 'Golden Frieza', {}],
  ['ichigo', 'Ichigo Kurosaki', 5, 'b5-a7bkJgjhhigE.png', 'Bleach', 'Duelist', 'hot-blooded', ['SPIRIT', 'DARK'], 'Zangetsu', 'Getsuga Tensho', 'Huge blade, huge spirit energy', 'A teenager who can see ghosts and became a Soul Reaper to protect people.', ['Substitute Soul Reaper'], 'Mugetsu Ichigo', { potential: 8 }],
  ['byakuya', 'Byakuya Kuchiki', 907, 'b907-kgnDKeMtEN5y.png', 'Bleach', 'Controller', 'stoic', ['WIND', 'SPIRIT'], 'Senbonzakura', 'Petal blades', 'Elegant total control', 'The noble captain of the Sixth Division, cold and unbending.', ['Captain of Squad 6'], 'Hakuteiken Byakuya', {}],
  ['aizen', 'Sousuke Aizen', 1086, 'b1086-qR9218BjZTC0.png', 'Bleach', 'Strategist', 'calculating', ['DARK', 'MAGIC'], 'Kyoka Suigetsu', 'Complete hypnosis and kido', 'Everything goes according to plan', 'A former captain whose betrayal was planned a century in advance.', ['The Traitor'], 'Transcendent Aizen', { battleIQ: 12 }],
  ['gojo', 'Satoru Gojo', 127691, 'b127691-9zqh1xpIubn7.png', 'Jujutsu Kaisen', 'Mage', 'cheerful', ['MAGIC', 'DIVINE'], 'Limitless & Six Eyes', 'Infinity', 'Untouchable and overwhelming', 'The strongest jujutsu sorcerer alive, and he knows it.', ['The Strongest'], 'Unlimited Gojo', { defense: 6 }],
  ['yuji', 'Yuji Itadori', 127212, 'b127212-FVm2tD0erQ5B.png', 'Jujutsu Kaisen', 'Berserker', 'cheerful', ['WARRIOR', 'DARK'], 'His fists', 'Cursed-energy martial arts', 'Raw physical power', 'A high-schooler with absurd strength who swallowed a cursed finger.', ['Sukuna\'s Vessel'], 'Awakened Yuji', { stamina: 8 }],
  ['sukuna', 'Ryomen Sukuna', 133701, 'b133701-rCQuDpHr3UZL.png', 'Jujutsu Kaisen', 'Assassin', 'arrogant', ['DEMON', 'FIRE'], 'Cutting technique', 'Invisible slashes', 'Merciless and playful', 'The King of Curses, a thousand-year-old demon.', ['King of Curses'], 'True Form Sukuna', { attack: 8 }],
  ['megumi', 'Megumi Fushiguro', 126635, 'b126635-L0y3I92JSUkN.png', 'Jujutsu Kaisen', 'Summoner', 'stoic', ['SHADOW', 'SPIRIT'], 'Ten Shadows', 'Shikigami', 'Summons from his shadow', 'A serious sorcerer who calls beasts out of his own shadow.', ['Ten Shadows User'], 'Shadow Garden Megumi', {}],
  ['tanjiro', 'Tanjiro Kamado', 126071, 'b126071-BTNEc1nRIv68.png', 'Demon Slayer', 'Duelist', 'patient', ['WATER', 'FIRE'], 'Nichirin sword', 'Breathing styles', 'Water flowing into sun-fire', 'A kind demon slayer searching for a way to turn his sister back into a human.', ['Sun Breather'], 'Sun Breathing Tanjiro', { adaptability: 8 }],
  ['zenitsu', 'Zenitsu Agatsuma', 129131, 'b129131-FZrQ7lSlxmEr.png', 'Demon Slayer', 'Assassin', 'reckless', ['LIGHTNING', 'WARRIOR'], 'Nichirin sword', 'Thunder Breathing', 'One perfect lightning draw', 'A cowardly crybaby who becomes a lightning-fast swordsman when he passes out.', ['Thunder Breather'], 'Thunder God Zenitsu', { speed: 12, stamina: -6 }],
  ['rengoku', 'Kyojuro Rengoku', 129133, 'b129133-VlTPowwt68rJ.png', 'Demon Slayer', 'Tank', 'hot-blooded', ['FIRE', 'HOLY'], 'Nichirin sword', 'Flame Breathing', 'Burning heart, unbreakable guard', 'The Flame Hashira, who never stops smiling and never stops fighting.', ['Flame Hashira'], 'Burning Heart Rengoku', {}],
  ['deku', 'Izuku Midoriya', 89028, 'b89028-8w1I9o1ISHMg.png', 'My Hero Academia', 'Strategist', 'analytical', ['LIGHTNING', 'WARRIOR'], 'One For All', 'Smashes', 'Analysis plus raw power', 'A quirkless boy who inherited the greatest power of all and keeps notes on everyone.', ['Deku'], 'One For All 100% Deku', { potential: 8 }],
  ['bakugo', 'Katsuki Bakugo', 88892, 'b88892-bdOha3lNcaN6.png', 'My Hero Academia', 'Berserker', 'aggressive', ['FIRE', 'WIND'], 'Explosion quirk', 'Explosive offense', 'Explosive and relentless', 'A short-fused genius who sweats nitroglycerin.', ['Kacchan'], 'Dynamight Bakugo', { attack: 6 }],
  ['todoroki', 'Shoto Todoroki', 89220, 'b89220-KNBwaVFAR8FD.png', 'My Hero Academia', 'Mage', 'stoic', ['ICE', 'FIRE'], 'Half-Cold Half-Hot', 'Ice and fire', 'Field control', 'Half of him freezes, half of him burns.', ['Shoto'], 'Flashfreeze Todoroki', {}],
  ['allmight', 'All Might', 89224, 'b89224-K6KEuQAuYKzq.jpg', 'My Hero Academia', 'Tank', 'cheerful', ['WARRIOR', 'HOLY'], 'One For All', 'Symbol of Peace', 'Smiling overwhelming power', 'The Symbol of Peace, who smiles so no one else has to be afraid.', ['Symbol of Peace'], 'Prime All Might', { attack: 6, stamina: -6 }],
  ['levi', 'Levi Ackerman', 45627, 'b45627-CR68RyZmddGG.png', 'Attack on Titan', 'Assassin', 'stoic', ['WARRIOR', 'WIND'], 'ODM gear blades', 'Titan killing', 'Spinning blade dives', 'Humanity\'s strongest soldier, who also really likes cleaning.', ['Humanity\'s Strongest'], 'Awakened Levi', { speed: 8 }],
  ['eren', 'Eren Yeager', 40882, 'b40882-dsj7IP943WFF.jpg', 'Attack on Titan', 'Berserker', 'hot-blooded', ['EARTH', 'WARRIOR'], 'ODM gear & Attack Titan', 'Titan shifting', 'Fury and transformation', 'A boy who swore to destroy every titan, and became one.', ['Attack Titan'], 'Founding Titan Eren', {}],
  ['mikasa', 'Mikasa Ackerman', 40881, 'b40881-F3gr1PkreDvj.png', 'Attack on Titan', 'Duelist', 'defensive', ['WARRIOR', 'WIND'], 'ODM gear blades', 'Protecting Eren', 'Flawless aerial combat', 'An Ackerman with near-perfect combat instincts who never leaves Eren\'s side.', ['Ackerman'], 'Awakened Mikasa', {}],
  ['gon', 'Gon Freecss', 30, 'b30-lyFExKyDhefc.jpg', 'Hunter x Hunter', 'Berserker', 'cheerful', ['WARRIOR', 'SPIRIT'], 'Fishing rod & Nen', 'Enhancer Nen', 'Rock, paper, scissors', 'A cheerful boy searching for his Hunter father, with terrifying resolve.', ['Little Hunter'], 'Adult Gon', { potential: 10 }],
  ['killua', 'Killua Zoldyck', 27, 'b27-Z5O02kQUydpT.jpg', 'Hunter x Hunter', 'Assassin', 'calculating', ['LIGHTNING', 'ASSASSIN'], 'Claws & Nen lightning', 'Transmuter Nen', 'Assassin speed', 'Heir to a family of assassins who just wants to be Gon\'s friend.', ['Zoldyck Heir'], 'Godspeed Killua', { speed: 10 }],
  ['hisoka', 'Hisoka Morow', 31, 'b31-FZckOuu7L1un.png', 'Hunter x Hunter', 'Controller', 'reckless', ['MAGIC', 'ASSASSIN'], 'Playing cards', 'Bungee Gum', 'Toying with prey', 'A magician who only cares about fighting strong opponents.', ['The Magician'], 'Unbound Hisoka', {}],
  ['edward', 'Edward Elric', 11, 'b11-TA5Nuk7EDUZG.jpg', 'Fullmetal Alchemist: Brotherhood', 'Strategist', 'hot-blooded', ['EARTH', 'WARRIOR'], 'Automail arm', 'Alchemy without a circle', 'Improvised transmutation', 'The Fullmetal Alchemist, searching for a way to restore his brother\'s body.', ['Fullmetal Alchemist'], 'Gate-Bound Edward', {}],
  ['roy', 'Roy Mustang', 68, 'b68-moBLY2WO2am3.png', 'Fullmetal Alchemist: Brotherhood', 'Mage', 'calculating', ['FIRE', 'WIND'], 'Ignition gloves', 'Flame Alchemy', 'One snap, one inferno', 'The Flame Alchemist, useless in the rain.', ['Flame Alchemist'], 'Inferno Mustang', {}],
  ['saitama', 'Saitama', 73935, 'b73935-ON5d0mAcrItd.jpg', 'One-Punch Man', 'Duelist', 'stoic', ['WARRIOR', 'DIVINE'], 'Fists', 'One punch', 'Bored, unstoppable', 'A hero who got so strong that every fight ends in one punch. He is very bored.', ['Caped Baldy'], 'Serious Saitama', { attack: 8 }],
  ['natsu', 'Natsu Dragneel', 5187, 'b5187-y1OEdRu9sPN2.png', 'Fairy Tail', 'Berserker', 'hot-blooded', ['FIRE', 'DRAGON'], 'Dragon Slayer magic', 'Eats fire', 'Burning brawls', 'A Fire Dragon Slayer raised by a dragon, who gets motion sickness on everything.', ['Salamander'], 'Dragon Force Natsu', {}],
  ['denji', 'Denji', 130102, 'b130102-FO1VHNnEnLlB.png', 'Chainsaw Man', 'Berserker', 'reckless', ['DEMON', 'WARRIOR'], 'Chainsaws', 'Chainsaw Devil', 'Messy, bloody, unkillable', 'A broke teenager fused with his chainsaw devil dog.', ['Chainsaw Man'], 'True Chainsaw Man', { stamina: 6 }],
  ['minato', 'Minato Namikaze', 2535, 'b2535-Xq9WKNPJQEt3.png', 'Naruto', 'Assassin', 'calculating', ['LIGHTNING', 'WIND'], 'Three-pronged kunai', 'Space-time teleportation', 'Strikes before you see him', 'The Fourth Hokage, called the Yellow Flash for teleporting across battlefields.', ['Yellow Flash', 'Fourth Hokage'], 'Kurama Link Minato', { speed: 10 }],
  ['madara', 'Madara Uchiha', 53901, 'b53901-HnRKSoHMG5Vg.png', 'Naruto', 'Controller', 'arrogant', ['FIRE', 'EARTH'], 'Gunbai & Rinnegan', 'Susanoo and Wood Style', 'Fights entire armies alone', 'A legendary Uchiha who fought the First Hokage and came back from the dead for more.', ['Ghost of the Uchiha'], 'Ten-Tails Jinchuriki Madara', { attack: 6, battleIQ: 4 }],
  ['pain', 'Pain', 3180, 'b3180-ITMGBLWNBOgV.png', 'Naruto', 'Summoner', 'calculating', ['DIVINE', 'DARK'], 'Rinnegan & chakra rods', 'Six Paths of Pain', 'Gravity control', 'The leader of the Akatsuki, who controls six bodies and calls himself a god.', ['Nagato', 'Six Paths of Pain'], 'Deva Path Ascended', { battleIQ: 6 }],
  ['gaara', 'Gaara', 1662, 'b1662-4E5J0LX9jZKZ.png', 'Naruto', 'Tank', 'stoic', ['EARTH', 'SPIRIT'], 'Sand gourd', 'Absolute sand defense', 'Never gets touched', 'The Fifth Kazekage, whose sand moves on its own to protect him.', ['Kazekage'], 'Shukaku Gaara', { defense: 10 }],
  ['lee', 'Rock Lee', 306, 'b306-oUTOO45xInXt.png', 'Naruto', 'Berserker', 'hot-blooded', ['WARRIOR', 'WIND'], 'His body', 'Pure taijutsu', 'Opens the Eight Gates', 'A ninja who can\'t use ninjutsu, so he trained his body until it was enough.', ['Handsome Devil of the Leaf'], 'Seventh Gate Lee', { speed: 6, attack: 4 }],
  ['law', 'Trafalgar Law', 13767, 'b13767-U604OJN9dxCn.jpg', 'One Piece', 'Strategist', 'calculating', ['MAGIC', 'WARRIOR'], 'Kikoku nodachi', 'Op-Op Fruit surgery', 'Controls space inside his Room', 'The Surgeon of Death, a pirate captain who can rearrange anything inside his Room.', ['Surgeon of Death'], 'Awakened Law', { technique: 8 }],
  ['whitebeard', 'Edward Newgate', 2751, 'b2751-NnzW0N2vCTjX.jpg', 'One Piece', 'Tank', 'stoic', ['EARTH', 'WATER'], 'Bisento', 'Tremor-Tremor Fruit', 'Shakes the world', 'Whitebeard, the Strongest Man in the World, whose punches crack the air.', ['Whitebeard'], 'Last Stand Whitebeard', { attack: 6, defense: 6 }],
  ['shanks', 'Shanks', 727, 'b727-wUJx7M1z5xON.png', 'One Piece', 'Duelist', 'cheerful', ['WARRIOR', 'DARK'], 'Gryphon saber', 'Conqueror\'s Haki', 'Ends fights with willpower', 'Red-Haired Shanks, the Emperor who gave Luffy his straw hat.', ['Red-Haired Shanks'], 'Emperor Shanks', { battleIQ: 6, technique: 4 }],
  ['gohan', 'Gohan', 2093, 'b2093-kdFZhqcNSsqW.png', 'Dragon Ball Z', 'Mage', 'patient', ['DIVINE', 'WARRIOR'], 'Ki', 'Hidden potential', 'Explodes when friends are hurt', 'Goku\'s son, a scholar with the greatest hidden power of any Saiyan.', ['Great Saiyaman'], 'Gohan Beast', { potential: 10 }],
  ['piccolo', 'Piccolo', 914, 'b914-KuS8AWjqBrqa.jpg', 'Dragon Ball Z', 'Strategist', 'stoic', ['DIVINE', 'MAGIC'], 'Ki', 'Special Beam Cannon', 'Tactical and patient', 'A Namekian warrior who went from Goku\'s enemy to Gohan\'s mentor.', ['Demon King'], 'Orange Piccolo', { battleIQ: 6 }],
  ['broly', 'Broly', 4945, 'b4945-iE59qIP7TxPu.png', 'Dragon Ball Z', 'Berserker', 'reckless', ['DIVINE', 'WARRIOR'], 'Ki', 'Legendary Super Saiyan', 'Endless rage', 'A Saiyan whose power keeps rising the longer he fights.', ['Legendary Super Saiyan'], 'Full Power Broly', { attack: 8, stamina: 4 }],
  ['kenpachi', 'Kenpachi Zaraki', 909, 'b909-slhoFBon7oiH.jpg', 'Bleach', 'Berserker', 'reckless', ['WARRIOR', 'SPIRIT'], 'Nozarashi', 'Monstrous spiritual pressure', 'Lives to fight', 'The captain of the Eleventh Division, who fights with handicaps to make it last.', ['Kenpachi'], 'Bankai Kenpachi', { attack: 8, stamina: 4 }],
  ['toshiro', 'Toshiro Hitsugaya', 245, 'b245-buy3Cfn6IFSB.jpg', 'Bleach', 'Mage', 'stoic', ['ICE', 'SPIRIT'], 'Hyorinmaru', 'Ice dragon', 'Freezes the battlefield', 'The youngest captain in the Gotei 13, wielder of the strongest ice-type Zanpakuto.', ['Captain of Squad 10'], 'Adult Hitsugaya', { technique: 6 }],
  ['rukia', 'Rukia Kuchiki', 6, 'b6-25WoBeWMZXBc.png', 'Bleach', 'Mage', 'defensive', ['ICE', 'SPIRIT'], 'Sode no Shirayuki', 'Ice dances and kido', 'Elegant freezing', 'The Soul Reaper who gave Ichigo his powers and later became a captain.', ['Captain of Squad 13'], 'Bankai Rukia', { technique: 6 }],
  ['yuta', 'Yuta Okkotsu', 129571, 'b129571-GHJk7gviHOOw.jpg', 'Jujutsu Kaisen', 'Summoner', 'patient', ['DARK', 'SPIRIT'], 'Katana & Rika', 'Unlimited cursed energy', 'Copies techniques with Rika', 'A special-grade sorcerer haunted by the cursed spirit of his childhood friend.', ['Special Grade'], 'Fully Manifested Rika', { potential: 6, stamina: 4 }],
  ['todo', 'Aoi Todo', 137975, 'b137975-6TH7PiLWJaqy.png', 'Jujutsu Kaisen', 'Berserker', 'hot-blooded', ['WARRIOR', 'MAGIC'], 'His fists', 'Boogie Woogie', 'Clap, swap, punch', 'A huge, eccentric sorcerer who decides friendships by asking about your type.', ['Best Friend'], 'Vibraslap Todo', { attack: 6 }],
  ['nanami', 'Kento Nanami', 133704, 'b133704-8wLTGjc234q2.png', 'Jujutsu Kaisen', 'Duelist', 'stoic', ['WARRIOR', 'EARTH'], 'Wrapped blade', 'Ratio Technique', 'Methodical weak-point strikes', 'A salaryman sorcerer who works by the clock and hates overtime.', ['Grade 1 Sorcerer'], 'Overtime Nanami', { technique: 8 }],
  ['nobara', 'Nobara Kugisaki', 133700, 'b133700-f6sOO3TcgLV6.png', 'Jujutsu Kaisen', 'Ranger', 'aggressive', ['MAGIC', 'WARRIOR'], 'Hammer & nails', 'Straw Doll Technique', 'Hits from any distance', 'A fierce country girl who fights with a hammer, nails and a straw doll.', ['Straw Doll'], 'Resonance Nobara', { technique: 4 }],
  ['giyu', 'Giyu Tomioka', 130050, 'b130050-qsLThJs5VIbz.png', 'Demon Slayer', 'Duelist', 'stoic', ['WATER', 'WARRIOR'], 'Nichirin sword', 'Water Breathing', 'Calm, flowing defense', 'The quiet Water Hashira who spared Tanjiro and Nezuko.', ['Water Hashira'], 'Marked Giyu', { defense: 6 }],
  ['inosuke', 'Inosuke Hashibira', 129130, 'n129130-SJC0Kn1DU39E.jpg', 'Demon Slayer', 'Berserker', 'reckless', ['WARRIOR', 'EARTH'], 'Twin jagged swords', 'Beast Breathing', 'Wild and unpredictable', 'A boy raised by boars who fights in a boar mask and challenges everyone.', ['Boar Head'], 'Awakened Inosuke', { speed: 6 }],
  ['akaza', 'Akaza', 141694, 'b141694-0COi0GVXPuEn.png', 'Demon Slayer', 'Berserker', 'hot-blooded', ['DEMON', 'WARRIOR'], 'His fists', 'Destructive Death', 'Martial arts and regeneration', 'Upper Moon Three, a demon martial artist obsessed with strong opponents.', ['Upper Moon Three'], 'Selfless State Akaza', { attack: 6, stamina: 4 }],
  ['shinobu', 'Shinobu Kocho', 136070, 'b136070-MC9LLxJsHyHE.png', 'Demon Slayer', 'Assassin', 'calculating', ['ASSASSIN', 'HOLY'], 'Stinger sword', 'Wisteria poison', 'Poison instead of power', 'The Insect Hashira, too small to behead demons, so she poisons them instead.', ['Insect Hashira'], 'Wisteria Sacrifice Shinobu', { technique: 8, speed: 4 }],
  ['shigaraki', 'Tomura Shigaraki', 89226, 'b89226-qGXqFthO4SM3.jpg', 'My Hero Academia', 'Controller', 'reckless', ['DARK', 'EARTH'], 'Decay quirk', 'Disintegration', 'Destroy everything', 'The leader of the League of Villains, who turns anything he touches to dust.', ['Tenko Shimura'], 'All For One Shigaraki', { attack: 6 }],
  ['endeavor', 'Endeavor', 126158, 'b126158-Wix9rh7unTDQ.png', 'My Hero Academia', 'Mage', 'aggressive', ['FIRE', 'WARRIOR'], 'Hellflame quirk', 'Flames', 'Relentless heat', 'The Number One Hero after All Might, burning with the hottest flames in Japan.', ['Enji Todoroki', 'Flame Hero'], 'Prominence Endeavor', { attack: 8 }],
  ['kurapika', 'Kurapika', 28, 'b28-ivA7UGnfE40a.png', 'Hunter x Hunter', 'Controller', 'calculating', ['MAGIC', 'SPIRIT'], 'Five Nen chains', 'Conjurer Nen', 'Binding and restraint', 'The last of the Kurta clan, whose eyes turn scarlet with rage.', ['Scarlet Eyes'], 'Emperor Time Kurapika', { technique: 8 }],
  ['meruem', 'Meruem', 23277, 'b23277-EYmIxzL64Mji.png', 'Hunter x Hunter', 'Berserker', 'arrogant', ['DEMON', 'DARK'], 'Tail', 'Absorbing aura', 'Learns instantly', 'The Chimera Ant King, born to rule and stronger with every meal.', ['Chimera Ant King'], 'Absorbed-Aura Meruem', { attack: 6, adaptability: 6 }],
  ['jinwoo', 'Sung Jinwoo', 129928, 'b129928-BCEjVaP0AQSw.png', 'Solo Leveling', 'Summoner', 'stoic', ['SHADOW', 'DARK'], 'Daggers & shadow army', 'Shadow Extraction', 'Leveling up without limit', 'The world\'s weakest hunter who became the Shadow Monarch.', ['Shadow Monarch'], 'Shadow Monarch Jinwoo', { potential: 8 }],
  ['jotaro', 'Jotaro Kujo', 4003, 'b4003-gWDSEGbeOAll.png', 'JoJo\'s Bizarre Adventure', 'Duelist', 'stoic', ['SPIRIT', 'WARRIOR'], 'Star Platinum', 'Stand rush', 'Calm and precise', 'A stoic high schooler with the Stand Star Platinum. Yare yare daze.', ['JoJo'], 'Time-Stop Jotaro', { technique: 6 }],
  ['dio', 'Dio Brando', 4004, 'b4004-w0OtWuvjhftG.png', 'JoJo\'s Bizarre Adventure', 'Controller', 'arrogant', ['DARK', 'SPIRIT'], 'The World', 'Stopping time', 'Vampire cruelty', 'A vampire with the Stand The World, the Joestar family\'s eternal enemy.', ['DIO'], 'Heaven-Ascended DIO', { attack: 6 }],
  ['mob', 'Shigeo Kageyama', 89616, 'b89616-dXmdOc7L6SDi.png', 'Mob Psycho 100', 'Mage', 'patient', ['SPIRIT', 'MAGIC'], 'Psychic powers', 'Emotion overload', 'Holds back until 100%', 'A quiet boy with the strongest psychic powers in the world, who keeps his emotions locked down.', ['Mob'], '???% Mob', { potential: 10 }],
  ['kaneki', 'Ken Kaneki', 87275, 'b87275-mb13EWZBdbh3.png', 'Tokyo Ghoul', 'Berserker', 'stoic', ['DEMON', 'DARK'], 'Rinkaku kagune', 'Ghoul regeneration', 'Tentacle fury', 'A college student turned half-ghoul after a deadly date.', ['Eyepatch', 'Centipede'], 'Kakuja Kaneki', { stamina: 6 }],
  ['asta', 'Asta', 123285, 'b123285-tKijiuQErDS0.png', 'Black Clover', 'Berserker', 'hot-blooded', ['DEMON', 'WARRIOR'], 'Anti-magic swords', 'Anti-magic', 'Cuts through any spell', 'A boy born without magic who swings anti-magic swords and wants to be Wizard King.', ['Black Bull'], 'Devil Union Asta', { stamina: 6, attack: 4 }],
  ['yuno', 'Yuno', 123284, 'b123284-w6kIFYnTclMd.png', 'Black Clover', 'Mage', 'stoic', ['WIND', 'MAGIC'], 'Four-leaf grimoire', 'Wind and star magic', 'Prodigy spellcasting', 'Asta\'s rival and best friend, chosen by the wind spirit Sylph.', ['Golden Dawn'], 'Spirit Dive Yuno', { technique: 6 }],
  ['power', 'Power', 137079, 'b137079-6yLEUYR3bmpr.png', 'Chainsaw Man', 'Berserker', 'arrogant', ['DEMON', 'WARRIOR'], 'Blood weapons', 'Blood Devil', 'Loud, chaotic and bloody', 'The Blood Fiend, who lies constantly and thinks she is the best.', ['Blood Fiend'], 'Blood Devil Power', { attack: 4 }],
  ['yor', 'Yor Forger', 138102, 'b138102-ZOAu9jI2d5ke.png', 'Spy x Family', 'Assassin', 'cheerful', ['ASSASSIN', 'WARRIOR'], 'Gold stilettos', 'Superhuman assassin', 'Elegant and deadly', 'A city hall clerk who is secretly the assassin Thorn Princess.', ['Thorn Princess'], 'Thorn Princess Yor', { speed: 8 }],
  ['gilgamesh', 'Gilgamesh', 2514, 'b2514-hnE6LEdqm7Su.png', 'Fate/Zero', 'Ranger', 'arrogant', ['DIVINE', 'HOLY'], 'Gate of Babylon', 'Every treasure in the world', 'Fires legends like arrows', 'The King of Heroes, who owns the prototype of every legendary weapon.', ['King of Heroes', 'Archer'], 'Ea-Drawn Gilgamesh', { attack: 6 }],
  ['saber', 'Artoria Pendragon', 497, 'b497-Yg5pNmC8kxzs.png', 'Fate/Zero', 'Duelist', 'stoic', ['HOLY', 'WIND'], 'Excalibur', 'Holy sword', 'Knightly swordplay', 'King Arthur, summoned as Saber in the Holy Grail War.', ['Saber', 'King Arthur'], 'Excalibur Saber', { technique: 6 }],
  ['kirito', 'Kirito', 36765, 'b36765-BnLbXg0Tzzh9.png', 'Sword Art Online', 'Duelist', 'calculating', ['WARRIOR', 'DARK'], 'Elucidator & Dark Repulser', 'Dual Blades', 'Lightning-fast sword skills', 'The Black Swordsman who cleared a death game from the inside.', ['Black Swordsman'], 'Dual Blades Kirito', { speed: 6 }],
  ['frieren', 'Frieren', 176754, 'b176754-PCnpqIOkjhFk.png', 'Frieren: Beyond Journey\'s End', 'Mage', 'patient', ['MAGIC', 'LIGHTNING'], 'Staff', 'A thousand years of magic', 'Hides her true mana', 'An elf mage who helped defeat the Demon King and is still learning what people mean to her.', ['Frieren the Slayer'], 'Unsuppressed Frieren', { battleIQ: 8 }],
  ['escanor', 'Escanor', 90202, 'b90202-1H7FIX2hDmYd.png', 'The Seven Deadly Sins', 'Tank', 'arrogant', ['HOLY', 'FIRE'], 'Divine Axe Rhitta', 'Sunshine', 'Stronger as the sun rises', 'The Lion\'s Sin of Pride, who grows mightier until noon.', ['Lion\'s Sin of Pride'], 'The One Escanor', { attack: 8 }],
];

// Used to pick a fitting voice; everyone else in the roster is male.
const FEMALE = new Set(['mikasa', 'nobara', 'shinobu', 'rukia', 'yor', 'saber', 'frieren', 'power']);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export interface LegendKit { hidden: string; ultimate: string; form: string; bias: Partial<Record<StatKey, number>> }

/** Hidden move, evolution unlock and form per legend (engine-side only). */
export const LEGEND_KITS: Record<string, LegendKit> = {};

export const LEGEND_CHARACTERS: PublicCharacter[] = ROWS.map((r): PublicCharacter => {
  const [key, name, anilistId, image, series, archetype, temperament, tags, weapon, specialty, style, bio, aliases, form, bias] = r;
  const moves = LEGEND_MOVESETS[key];
  if (!moves || moves.length !== 4) throw new Error(`Moveset missing for ${key}`);
  const id = `legend:${key}`;
  LEGEND_KITS[id] = { hidden: moves[2].id, ultimate: moves[3].id, form, bias };
  const h = hashString(name);
  return {
    id,
    schemaVersion: SCHEMA_VERSION,
    source: 'legend',
    name,
    aliases,
    series,
    seriesId: `legend-${slug(series)}`,
    imageUrl: CDN + image,
    bio,
    specialty,
    fightingStyle: style,
    weapon,
    temperament,
    archetype,
    reach: ARCHETYPES[archetype].reach,
    tags,
    knownAbilities: [moves[0].id, moves[1].id],
    verifiedFields: ['name', 'series', 'imageUrl', 'abilities'],
    anilistId,
    gender: FEMALE.has(key) ? 'female' : 'male',
    art: { hue: h % 360, hue2: (h >>> 9) % 360, hair: (h >>> 17) % 6, eye: (h >>> 21) % 4 },
  };
});

export const LEGEND_SERIES = [...new Set(LEGEND_CHARACTERS.map((c) => c.series))].map((title) => ({
  id: `legend-${slug(title)}`,
  title,
  synopsis: `Fighters from ${title}. Artwork courtesy of AniList; moves are the ones used in the series.`,
}));
