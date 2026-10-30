// Canon stat sheets for the built-in characters, based on what each one shows
// in their own series (the feats fans and wikis rank them by). Order:
// attack, defense, speed, technique, battleIQ, stamina, adaptability, luck, potential.
// Each game adds only a small wobble around these (hidden.ts), so the strongest stay strong.
import type { StatKey, Stats } from '../types';

export const SHEET_ORDER: StatKey[] = ['attack', 'defense', 'speed', 'technique', 'battleIQ', 'stamina', 'adaptability', 'luck', 'potential'];

const SHEETS: Record<string, number[]> = {
  goku: [97, 88, 95, 90, 82, 95, 92, 60, 99], vegeta: [95, 86, 93, 88, 80, 90, 85, 45, 92], frieza: [94, 85, 94, 88, 85, 80, 70, 50, 90],
  broly: [99, 90, 85, 60, 45, 99, 80, 45, 97], gohan: [92, 80, 88, 82, 78, 82, 80, 55, 99], piccolo: [82, 80, 80, 85, 90, 82, 85, 50, 75],
  saitama: [99, 97, 97, 70, 60, 99, 90, 80, 70],
  gojo: [95, 99, 95, 97, 95, 85, 90, 70, 90], sukuna: [97, 88, 92, 97, 92, 90, 88, 60, 88], yuji: [86, 78, 85, 80, 68, 90, 80, 55, 95],
  megumi: [78, 70, 78, 86, 85, 72, 85, 50, 92], yuta: [90, 80, 85, 88, 80, 85, 92, 55, 95], todo: [85, 82, 84, 86, 90, 85, 85, 60, 75],
  nanami: [82, 78, 76, 86, 88, 75, 78, 45, 65], nobara: [72, 62, 70, 80, 75, 68, 72, 55, 75],
  aizen: [94, 92, 92, 97, 99, 88, 90, 65, 90], ichigo: [93, 82, 92, 82, 75, 88, 88, 60, 97], byakuya: [88, 82, 90, 95, 88, 78, 78, 50, 80],
  kenpachi: [98, 88, 82, 72, 70, 97, 80, 50, 90], toshiro: [82, 75, 84, 88, 84, 72, 80, 50, 90], rukia: [76, 70, 80, 86, 82, 70, 78, 55, 85],
  naruto: [92, 82, 88, 80, 75, 99, 90, 70, 99], sasuke: [92, 78, 92, 94, 88, 82, 88, 55, 95], itachi: [88, 75, 90, 97, 98, 65, 92, 50, 85],
  kakashi: [82, 78, 85, 93, 95, 72, 95, 55, 78], minato: [85, 75, 99, 93, 92, 75, 88, 55, 85], madara: [96, 92, 90, 95, 93, 95, 90, 55, 90],
  pain: [92, 88, 80, 92, 90, 78, 85, 50, 85], gaara: [80, 92, 70, 85, 82, 78, 78, 50, 82], lee: [84, 70, 88, 88, 72, 85, 70, 55, 80],
  luffy: [93, 88, 88, 82, 74, 97, 95, 85, 99], zoro: [93, 85, 86, 93, 74, 95, 82, 40, 94], sanji: [88, 78, 92, 88, 80, 85, 82, 55, 88],
  ace: [88, 75, 84, 82, 75, 82, 78, 40, 82], law: [86, 76, 85, 92, 92, 75, 85, 55, 88], whitebeard: [98, 92, 72, 85, 88, 90, 82, 45, 70],
  shanks: [94, 88, 90, 95, 92, 88, 90, 65, 85],
  levi: [88, 72, 95, 96, 88, 78, 90, 55, 80], eren: [88, 82, 72, 70, 78, 88, 80, 45, 95], mikasa: [86, 72, 90, 92, 82, 80, 85, 55, 85],
  gon: [82, 72, 84, 72, 68, 85, 80, 70, 97], killua: [84, 72, 96, 90, 88, 78, 88, 55, 95], hisoka: [86, 80, 86, 95, 93, 82, 92, 60, 85],
  kurapika: [85, 72, 82, 90, 90, 65, 82, 50, 85], meruem: [97, 94, 96, 95, 99, 92, 99, 60, 95],
  edward: [78, 72, 80, 92, 88, 78, 92, 55, 85], roy: [88, 65, 72, 92, 90, 65, 82, 45, 82],
  deku: [86, 75, 88, 82, 85, 80, 88, 60, 97], bakugo: [88, 72, 88, 88, 82, 82, 85, 50, 92], todoroki: [85, 80, 78, 88, 82, 78, 82, 50, 90],
  allmight: [97, 90, 92, 85, 85, 80, 85, 60, 70], endeavor: [92, 82, 84, 86, 84, 82, 80, 50, 80], shigaraki: [92, 85, 85, 82, 82, 85, 85, 60, 95],
  tanjiro: [82, 74, 84, 86, 82, 85, 85, 60, 92], zenitsu: [80, 60, 97, 90, 60, 70, 72, 65, 85], rengoku: [88, 78, 88, 92, 85, 88, 80, 50, 82],
  giyu: [85, 80, 86, 93, 85, 80, 82, 50, 82], inosuke: [80, 75, 85, 78, 62, 85, 85, 60, 85], akaza: [92, 85, 92, 92, 85, 95, 88, 50, 85],
  shinobu: [70, 60, 95, 93, 88, 65, 80, 55, 75],
  natsu: [88, 80, 82, 72, 65, 90, 85, 75, 95], denji: [82, 75, 78, 65, 68, 95, 85, 70, 85], kaneki: [86, 82, 85, 82, 82, 88, 88, 50, 92],
  mob: [97, 90, 72, 80, 70, 72, 85, 60, 99], asta: [85, 82, 86, 82, 68, 92, 82, 65, 95], yuno: [85, 72, 90, 88, 82, 78, 82, 60, 92],
  power: [78, 65, 78, 70, 55, 82, 72, 60, 75], yor: [85, 65, 95, 92, 72, 82, 72, 55, 75],
  jotaro: [92, 85, 90, 90, 92, 85, 88, 65, 85], dio: [92, 88, 90, 88, 90, 92, 85, 55, 88], jinwoo: [95, 88, 95, 90, 90, 92, 95, 70, 99],
  gilgamesh: [95, 85, 85, 90, 85, 85, 80, 70, 85], saber: [90, 88, 88, 95, 88, 85, 82, 50, 80], kirito: [82, 72, 90, 90, 80, 80, 85, 65, 85],
  frieren: [90, 82, 75, 99, 97, 75, 92, 55, 85], escanor: [97, 92, 72, 82, 70, 88, 70, 50, 85],
};

/** The canon sheet for a character id like "legend:goku", if it has one. */
export function canonStats(charId: string): Stats | null {
  const sheet = charId.startsWith('legend:') ? SHEETS[charId.slice(7)] : undefined;
  if (!sheet) return null;
  return Object.fromEntries(SHEET_ORDER.map((k, i) => [k, sheet[i]])) as Stats;
}
