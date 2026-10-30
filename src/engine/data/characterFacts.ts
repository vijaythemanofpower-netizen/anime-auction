// Facts shown while a fight's comic is being drawn. Built-in characters have
// hand-written facts (legendFacts.ts) plus extra trivia below; anyone else gets
// facts pulled from their AniList profile: age, height, birthday, affiliation
// and real sentences from their story, never the game's own filler.
import type { PublicCharacter } from '../types';
import { LEGEND_FACTS } from './legendFacts';

const TRIVIA: Record<string, string> = {
  naruto: 'Naruto\'s name comes from narutomaki, the swirled fish cake in ramen, his favourite food.',
  sasuke: 'Sasuke is named after Sarutobi Sasuke, a legendary ninja from Japanese folklore.',
  itachi: 'Itachi means "weasel" in Japanese, an animal folklore links to illusions and trickery.',
  kakashi: 'Kakashi means "scarecrow", which is why scarecrows appear in his early scenes.',
  luffy: 'Luffy\'s Gear 5 form is based on the Sun God Nika, a legend inside One Piece itself.',
  zoro: "Zoro's surname, Roronoa, comes from François l'Olonnais, a real 17th-century pirate.",
  goku: 'Goku is based on Sun Wukong, the Monkey King from the classic novel Journey to the West.',
  vegeta: 'Saiyan names are vegetable puns: Vegeta is "vegetable", Kakarot is "carrot".',
  frieza: 'Frieza\'s name is a pun on "freezer", and his henchmen are named after fruit.',
  ichigo: 'Ichigo\'s name can be read as "one who protects", though it also means "strawberry".',
  gojo: 'Gojo usually keeps his eyes covered because his Six Eyes take in so much information.',
  sukuna: 'Sukuna is named after Ryomen Sukuna, a two-faced figure from ancient Japanese records.',
  tanjiro: 'The scar on Tanjiro\'s forehead later changes into a flame-shaped demon slayer mark.',
  rengoku: 'Demon Slayer: Mugen Train, which centres on Rengoku, became Japan\'s highest-grossing film ever at release.',
  deku: '"Deku" was a childhood insult meaning "useless", which Izuku turned into his hero name.',
  allmight: 'All Might\'s design is a tribute to American superhero comics, which his creator loves.',
  levi: 'Levi is only 160 cm tall, one of the shortest soldiers in the Survey Corps.',
  eren: 'Eren\'s surname, Yeager (Jäger), is German for "hunter".',
  gon: 'Gon is only 12 at the start of Hunter x Hunter, younger than most of the fighters he faces.',
  killua: 'Killua\'s family charges huge fees per assassination, and he was their most promising heir.',
  saitama: 'One-Punch Man started as a free webcomic by ONE before Yusuke Murata redrew it.',
  edward: 'Edward\'s automail arm and leg have to be repaired so often that his mechanic Winry scolds him for it.',
  roy: 'Roy Mustang\'s gloves are made of ignition cloth, which sparks when he snaps.',
  denji: 'Denji\'s biggest early dreams were bread with jam and a normal life.',
  madara: 'Madara and Hashirama were childhood friends who skipped stones together before their clans went to war.',
  whitebeard: 'Whitebeard\'s last words, "The One Piece is real!", set the whole world chasing it again.',
  shanks: 'Shanks sailed on Gol D. Roger\'s ship as a boy, years before he met Luffy.',
  aizen: 'Aizen\'s glasses were part of his disguise: he crushes them the moment he reveals himself.',
  kenpachi: 'Kenpachi is a title given to the strongest swordsman in Soul Society, not his birth name.',
  jotaro: 'Jotaro\'s "Ora ora ora!" barrage is one of the most copied battle cries in anime.',
  dio: 'Dio\'s "ZA WARUDO!" (The World!) became one of anime\'s biggest memes.',
  mob: 'Mob\'s percentage counter climbs with his emotions, and at 100% something explodes.',
  frieren: 'Frieren\'s journey takes place after the hero\'s quest ends, which flips the usual fantasy story.',
  jinwoo: 'Solo Leveling began as a Korean web novel before becoming a webtoon and an anime.',
  meruem: 'Meruem\'s name means "the light that illuminates everything" in the Chimera Ants\' story.',
  escanor: 'Escanor is based on a knight of Arthurian legend whose strength grew with the sun.',
  gilgamesh: 'Gilgamesh is based on the hero of the Epic of Gilgamesh, one of the oldest stories ever written.',
  saber: 'Saber\'s true identity, King Arthur, was one of Fate/stay night\'s biggest early reveals.',
};

// AniList profiles start with "Age: 17 Height: 175 cm ..." lines; turn the useful ones into sentences.
const FIELDS: Array<[RegExp, (name: string, v: string) => string]> = [
  [/\bAge:\s*([^:]+?)(?=\s+[A-Z][a-zA-Z ]{1,20}:|$)/, (n, v) => `${n} is ${v.replace(/\s*\(.*?\)\s*/g, ' ').trim()} years old.`],
  [/\bHeight:\s*([^:]+?)(?=\s+[A-Z][a-zA-Z ]{1,20}:|$)/, (n, v) => `${n} stands ${v.trim()} tall.`],
  [/\bBirthday:\s*([^:]+?)(?=\s+[A-Z][a-zA-Z ]{1,20}:|$)/, (n, v) => `${n}'s birthday is ${v.trim()}.`],
  [/\b(?:Affiliation|Affiliations):\s*([^:]+?)(?=\s+[A-Z][a-zA-Z ]{1,20}:|$)/, (n, v) => `${n} belongs to ${v.trim()}.`],
  [/\bOccupation:\s*([^:]+?)(?=\s+[A-Z][a-zA-Z ]{1,20}:|$)/, (n, v) => `By trade, ${n} is a ${v.trim().toLowerCase()}.`],
  [/\b(?:Ability|Abilities|Quirk|Devil Fruit|Stand|Nen Type):\s*([^:]+?)(?=\s+[A-Z][a-zA-Z ]{1,20}:|$)/, (n, v) => `${n}'s power: ${v.trim()}.`],
];

function profileFacts(c: PublicCharacter): string[] {
  const bio = (c.bio ?? '').replace(/\[spoiler hidden\]/g, '').replace(/\s+/g, ' ').trim();
  if (!bio || /No biography/.test(bio)) return [`${c.name} comes from ${c.series}.`];
  const out: string[] = [];
  for (const [re, make] of FIELDS) {
    const m = bio.match(re);
    if (m && m[1] && m[1].length < 60) out.push(make(c.name, m[1]));
  }
  // Story sentences, after the "Key: value" header lines.
  const prose = bio.replace(/^(?:[A-Z][a-zA-Z ]{1,20}:\s*[^:]+?(?=\s+[A-Z][a-zA-Z ]{1,20}:|\s+[A-Z][a-z]+\s[a-z]))+/, '').trim();
  for (const s of prose.split(/(?<=[.!?])\s+/)) if (s.length > 30 && s.length < 220 && !/:\s/.test(s)) out.push(s);
  if (!out.length) out.push(`${c.name} comes from ${c.series}.`);
  return out.slice(0, 4);
}

/** Facts about one character, best first. */
export function factsFor(c: PublicCharacter): string[] {
  if (c.id.startsWith('legend:')) {
    const key = c.id.slice(7);
    return [...(TRIVIA[key] ? [TRIVIA[key]] : []), ...(LEGEND_FACTS[key] ?? [])];
  }
  return profileFacts(c);
}
