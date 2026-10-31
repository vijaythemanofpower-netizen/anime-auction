// Canon stat sheets for more popular characters, matched by name when they come
// from AniList (any order of given/family name; long vowels like "ou"/"uu" ignored).
// Same order and scale as canonStats.ts. AniList's copies of the built-in
// characters also get their built-in sheet through this lookup.
import type { Stats } from '../types';
import { LEGEND_CHARACTERS } from './legends';
import { SHEET_ORDER, canonStats } from './canonStats';

const BY_NAME: Record<string, number[]> = {
  // Naruto
  'Hinata Hyuuga': [72, 70, 78, 85, 78, 72, 75, 55, 80], 'Sakura Haruno': [86, 78, 74, 82, 80, 85, 75, 55, 82], 'Jiraiya': [88, 80, 80, 90, 90, 82, 85, 50, 70],
  'Tsunade': [92, 85, 74, 88, 85, 88, 78, 30, 65], 'Obito Uchiha': [92, 88, 88, 92, 85, 85, 88, 55, 88], 'Hashirama Senju': [96, 92, 88, 94, 88, 97, 90, 60, 85],
  'Shikamaru Nara': [65, 62, 70, 85, 98, 60, 85, 55, 80], 'Neji Hyuuga': [80, 78, 82, 90, 82, 72, 75, 45, 78], 'Kisame Hoshigaki': [88, 85, 75, 82, 80, 95, 78, 50, 75],
  'Orochimaru': [86, 80, 82, 92, 92, 80, 90, 55, 80], 'Might Guy': [94, 82, 92, 90, 82, 92, 75, 55, 75], 'Kurama': [95, 92, 80, 70, 85, 99, 75, 50, 80],
  // One Piece
  'Nami': [55, 50, 70, 75, 80, 55, 75, 70, 70], 'Usopp': [60, 50, 65, 82, 75, 55, 80, 90, 78], 'Nico Robin': [78, 65, 70, 90, 92, 70, 82, 55, 78],
  'Boa Hancock': [88, 82, 85, 85, 75, 80, 75, 55, 75], 'Dracule Mihawk': [97, 88, 90, 99, 92, 90, 85, 55, 75], 'Kaidou': [98, 99, 80, 82, 75, 99, 85, 50, 80],
  'Donquixote Doflamingo': [90, 82, 86, 92, 92, 85, 88, 55, 75], 'Sabo': [88, 80, 86, 86, 84, 85, 82, 60, 85], 'Sakazuki': [96, 92, 80, 85, 82, 92, 75, 45, 75],
  'Borsalino': [92, 85, 99, 85, 82, 85, 80, 50, 75], 'Kuzan': [93, 88, 82, 88, 88, 88, 82, 50, 75], 'Monkey D. Garp': [96, 90, 82, 85, 80, 92, 80, 55, 65],
  'Yamato': [90, 88, 84, 84, 75, 90, 80, 55, 88], 'Jinbe': [88, 88, 76, 88, 85, 88, 82, 55, 75], 'Brook': [75, 60, 88, 88, 75, 70, 78, 60, 70],
  'Franky': [82, 85, 65, 82, 75, 82, 78, 55, 70], 'Tony Tony Chopper': [70, 70, 72, 75, 80, 70, 85, 60, 78], 'Crocodile': [86, 85, 78, 85, 88, 82, 78, 50, 70],
  'Charlotte Linlin': [96, 97, 70, 80, 72, 97, 75, 50, 70], 'Eustass Kid': [90, 82, 80, 84, 72, 85, 80, 50, 85],
  // Dragon Ball
  'Trunks': [88, 78, 88, 85, 80, 82, 80, 55, 88], 'Cell': [94, 90, 92, 88, 85, 92, 92, 50, 85], 'Beerus': [99, 95, 97, 95, 92, 92, 90, 60, 80],
  'Jiren': [99, 97, 92, 85, 80, 95, 80, 50, 75], 'Krillin': [72, 65, 78, 82, 82, 72, 80, 45, 65], 'Majin Buu': [90, 95, 82, 70, 55, 99, 95, 55, 80],
  // Bleach
  'Uryuu Ishida': [82, 70, 85, 90, 88, 72, 80, 55, 85], 'Orihime Inoue': [55, 85, 65, 80, 70, 70, 75, 60, 85], 'Yoruichi Shihouin': [88, 75, 98, 92, 88, 80, 85, 60, 75],
  'Kisuke Urahara': [88, 82, 85, 96, 99, 80, 95, 60, 80], 'Ulquiorra Cifer': [92, 88, 92, 88, 88, 92, 85, 50, 80], 'Grimmjow Jaegerjaquez': [90, 82, 90, 82, 70, 85, 78, 50, 80],
  'Shunsui Kyouraku': [92, 85, 88, 95, 95, 85, 88, 65, 75], 'Genryuusai Shigekuni Yamamoto': [99, 92, 82, 95, 92, 90, 85, 50, 65], 'Yhwach': [97, 95, 90, 95, 95, 92, 99, 60, 85],
  // Jujutsu Kaisen
  'Maki Zenin': [88, 78, 90, 90, 82, 85, 82, 50, 85], 'Toji Fushiguro': [94, 85, 96, 95, 92, 90, 90, 55, 70], 'Suguru Getou': [88, 82, 82, 92, 92, 80, 88, 50, 80],
  'Mahito': [86, 88, 84, 90, 85, 85, 95, 55, 92], 'Kinji Hakari': [88, 90, 82, 82, 78, 92, 80, 95, 80], 'Choso': [85, 80, 82, 88, 82, 82, 78, 45, 78],
  // Demon Slayer
  'Nezuko Kamado': [82, 85, 85, 70, 60, 92, 88, 60, 90], 'Muzan Kibutsuji': [96, 97, 94, 88, 88, 99, 92, 55, 85], 'Kokushibou': [95, 88, 92, 98, 92, 92, 85, 50, 80],
  'Douma': [90, 90, 88, 92, 92, 92, 88, 55, 80], 'Tengen Uzui': [88, 80, 90, 88, 88, 85, 82, 55, 78], 'Mitsuri Kanroji': [86, 75, 90, 88, 78, 82, 82, 60, 80],
  'Gyoumei Himejima': [95, 90, 82, 90, 88, 92, 82, 55, 78], 'Sanemi Shinazugawa': [88, 80, 88, 88, 80, 88, 80, 55, 78], 'Muichirou Tokitou': [84, 72, 92, 92, 85, 78, 85, 55, 85],
  // My Hero Academia
  'Ochaco Uraraka': [68, 62, 72, 80, 78, 70, 78, 60, 82], 'Eijirou Kirishima': [80, 90, 70, 72, 70, 85, 75, 55, 82], 'Hawks': [84, 70, 97, 90, 92, 75, 88, 60, 80],
  'Dabi': [92, 70, 80, 85, 82, 75, 80, 50, 85], 'Himiko Toga': [70, 60, 85, 82, 75, 70, 92, 60, 82], 'All For One': [97, 90, 85, 92, 97, 85, 95, 55, 80],
  'Shouta Aizawa': [75, 70, 85, 90, 92, 70, 85, 50, 70], 'Tenya Iida': [78, 72, 92, 80, 78, 78, 72, 50, 80],
  // Attack on Titan
  'Armin Arlert': [80, 70, 60, 70, 97, 65, 82, 55, 85], 'Reiner Braun': [88, 92, 70, 78, 78, 88, 75, 45, 78], 'Erwin Smith': [72, 68, 70, 82, 99, 72, 85, 45, 70],
  'Annie Leonhart': [85, 85, 82, 90, 82, 82, 80, 50, 78], 'Zeke Yeager': [88, 82, 70, 88, 92, 82, 80, 50, 78], 'Hange Zoe': [70, 65, 75, 82, 92, 72, 85, 50, 70],
  // Hunter x Hunter
  'Chrollo Lucilfer': [88, 82, 88, 95, 96, 80, 95, 60, 85], 'Illumi Zoldyck': [86, 80, 90, 92, 92, 82, 85, 50, 80], 'Isaac Netero': [96, 85, 97, 98, 92, 75, 88, 55, 60],
  'Leorio Paladiknight': [68, 65, 65, 70, 72, 72, 72, 60, 75], 'Kite': [84, 78, 84, 88, 85, 80, 85, 30, 78], 'Neferpitou': [94, 82, 95, 88, 82, 88, 85, 50, 85],
  // Fullmetal Alchemist
  'Alphonse Elric': [80, 92, 72, 88, 85, 95, 85, 55, 82], 'King Bradley': [92, 80, 95, 97, 92, 82, 85, 50, 65], 'Riza Hawkeye': [80, 62, 78, 95, 88, 70, 82, 55, 70],
  'Scar': [88, 78, 85, 90, 82, 85, 78, 45, 75], 'Olivier Mira Armstrong': [86, 80, 85, 90, 92, 82, 85, 50, 72],
  // One-Punch Man
  'Genos': [86, 78, 88, 82, 78, 80, 85, 40, 88], 'Tatsumaki': [97, 92, 85, 95, 85, 80, 88, 55, 85], 'Garou': [94, 88, 92, 95, 90, 95, 99, 55, 97], 'Boros': [97, 95, 92, 85, 80, 95, 88, 50, 80],
  // Chainsaw Man, Spy x Family, Tokyo Ghoul, Black Clover
  'Makima': [92, 95, 82, 90, 98, 90, 92, 60, 85], 'Aki Hayakawa': [78, 70, 80, 85, 82, 72, 78, 35, 72], 'Reze': [88, 75, 88, 85, 82, 82, 82, 50, 80],
  'Loid Forger': [80, 75, 85, 90, 95, 80, 92, 60, 70], 'Anya Forger': [20, 25, 40, 30, 70, 40, 70, 85, 70],
  'Touka Kirishima': [80, 70, 90, 82, 75, 75, 78, 50, 80], 'Juuzou Suzuya': [84, 72, 90, 88, 75, 85, 82, 60, 85],
  'Noelle Silva': [85, 85, 72, 80, 72, 75, 78, 55, 90], 'Yami Sukehiro': [92, 85, 85, 92, 85, 88, 85, 60, 85],
  // Fate, SAO, Fairy Tail, Seven Deadly Sins
  'Shirou Emiya': [78, 72, 75, 88, 78, 75, 82, 55, 90], 'Rin Tohsaka': [80, 68, 72, 88, 85, 70, 80, 40, 82], 'Asuna Yuuki': [80, 70, 92, 90, 82, 78, 80, 60, 80],
  'Erza Scarlet': [90, 88, 85, 92, 85, 88, 85, 55, 85], 'Gray Fullbuster': [82, 80, 78, 85, 78, 82, 80, 55, 85], 'Lucy Heartfilia': [65, 60, 65, 78, 78, 65, 80, 70, 82],
  'Meliodas': [96, 88, 92, 92, 88, 92, 88, 60, 92], 'Ban': [88, 85, 88, 85, 78, 99, 85, 55, 85],
  // Classics and isekai
  'Guts': [95, 88, 82, 90, 88, 99, 92, 20, 85], 'Griffith': [86, 78, 88, 95, 99, 78, 90, 85, 90], 'Alucard': [96, 92, 92, 90, 90, 99, 95, 55, 85],
  'Kenshin Himura': [88, 75, 97, 97, 90, 78, 85, 55, 75], 'Inuyasha': [86, 82, 85, 78, 65, 88, 78, 55, 85], 'Sesshoumaru': [94, 88, 92, 92, 88, 90, 85, 55, 85],
  'Yuusuke Urameshi': [90, 80, 88, 82, 78, 88, 85, 60, 92], 'Hiei': [88, 72, 96, 92, 85, 78, 82, 50, 85], 'Spike Spiegel': [80, 70, 88, 90, 85, 75, 88, 70, 70],
  'Gintoki Sakata': [90, 80, 88, 92, 88, 88, 90, 60, 80], 'Rimuru Tempest': [92, 92, 85, 92, 92, 95, 99, 70, 99], 'Ainz Ooal Gown': [95, 92, 75, 92, 95, 99, 85, 55, 80],
  'Anos Voldigoad': [99, 97, 92, 95, 92, 99, 95, 60, 90], 'Ryuuko Matoi': [88, 82, 88, 80, 72, 92, 85, 55, 90], 'Satsuki Kiryuuin': [88, 85, 88, 92, 92, 85, 85, 55, 85],
  'Kamina': [82, 75, 75, 72, 60, 85, 75, 70, 80], 'Simon': [88, 80, 78, 78, 72, 85, 85, 70, 99], 'Yato': [86, 75, 92, 90, 82, 80, 82, 55, 78],
  'Kenshirou': [96, 88, 88, 95, 85, 92, 85, 50, 80], 'Vash the Stampede': [88, 82, 92, 97, 88, 88, 90, 85, 85], 'Kurumi Tokisaki': [80, 70, 85, 88, 90, 75, 85, 60, 82],
  'Subaru Natsuki': [40, 40, 50, 45, 72, 60, 90, 20, 75], 'Rem': [84, 72, 86, 82, 75, 80, 75, 50, 78], 'Emilia': [78, 72, 72, 85, 70, 72, 75, 55, 85],
  'Megumin': [95, 30, 40, 75, 65, 25, 40, 55, 75], 'Kazuma Satou': [50, 45, 60, 70, 82, 55, 88, 99, 60], 'Aqua': [55, 70, 55, 70, 30, 70, 50, 15, 80],
  'Violet Evergarden': [82, 70, 88, 90, 80, 78, 80, 50, 70], 'Lelouch Lamperouge': [30, 35, 45, 70, 99, 35, 90, 60, 85], 'Suzaku Kururugi': [88, 78, 92, 92, 82, 85, 82, 55, 80],
  // More of AniList's most popular
  'Joseph Joestar': [84, 78, 82, 88, 96, 85, 95, 85, 80], 'Thorfinn Karlsefni': [86, 75, 92, 90, 82, 85, 85, 55, 85], 'Askeladd': [82, 72, 82, 92, 97, 78, 90, 60, 70],
  'Kiyotaka Ayanokouji': [85, 75, 85, 90, 99, 80, 95, 55, 80], 'Osamu Dazai': [55, 55, 60, 75, 99, 55, 92, 65, 75], 'Sakura Matou': [70, 60, 55, 80, 70, 65, 70, 40, 90],
  'Arataka Reigen': [40, 45, 50, 70, 90, 50, 92, 70, 60], 'Kurisu Makise': [25, 30, 40, 60, 97, 40, 80, 55, 75], 'Maomao': [25, 30, 45, 75, 95, 45, 85, 60, 65],
  'Marin Kitagawa': [20, 25, 40, 45, 60, 45, 75, 70, 55], 'Chika Fujiwara': [20, 25, 45, 45, 65, 50, 80, 75, 55], 'Itsuki Nakano': [20, 25, 35, 40, 60, 40, 60, 55, 55],
  // More raid-boss villains
  'Kaguya Otsutsuki': [97, 95, 90, 96, 85, 97, 90, 60, 90], 'Marshall D. Teach': [95, 92, 80, 85, 88, 95, 90, 85, 92], 'Zamasu': [93, 97, 92, 92, 90, 99, 92, 55, 90],
  'Kenjaku': [88, 85, 85, 97, 99, 82, 92, 60, 90], 'Kai Chisaki': [86, 80, 85, 95, 92, 78, 88, 50, 80], 'Father': [97, 97, 85, 97, 96, 95, 92, 55, 85],
  'Zeref Dragneel': [96, 90, 85, 97, 95, 95, 90, 55, 90], 'Acnologia': [99, 96, 92, 85, 80, 99, 90, 55, 95], 'Lucius Zogratis': [94, 92, 92, 96, 98, 90, 95, 60, 92],
  'Kishou Arima': [92, 88, 95, 98, 96, 88, 92, 60, 85], 'Kars': [92, 92, 92, 90, 93, 97, 99, 55, 95], 'Yoshikage Kira': [80, 82, 80, 90, 95, 75, 88, 90, 80],
  'Zeke Jaeger': [88, 82, 70, 88, 92, 82, 80, 50, 78],
  // Strategists and non-fighters (they still have to fight in the arena)
  'Light Yagami': [35, 40, 45, 60, 99, 45, 85, 70, 70], 'L Lawliet': [55, 50, 60, 70, 99, 45, 90, 55, 70], 'Senkuu Ishigami': [35, 35, 45, 85, 97, 45, 92, 60, 85],
  'Kaguya Shinomiya': [40, 40, 55, 70, 92, 45, 80, 55, 70], 'Rintarou Okabe': [30, 35, 45, 60, 90, 45, 85, 70, 75], 'Mai Sakurajima': [25, 30, 40, 50, 80, 40, 75, 60, 60],
};

const norm = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/ou/g, 'o').replace(/uu/g, 'u').replace(/oo/g, 'o').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

let index: Map<string, number[]> | null = null;
function nameIndex(): Map<string, number[]> {
  if (index) return index;
  index = new Map(Object.entries(BY_NAME).map(([n, v]) => [norm(n), v]));
  // AniList's own copies of the built-in characters get the built-in sheet.
  for (const c of LEGEND_CHARACTERS) {
    const s = canonStats(c.id);
    // Single-word nicknames ("JoJo") are shared between characters, so only full names count.
    if (s) for (const n of [c.name, ...c.aliases.filter((a) => a.trim().includes(' '))]) if (!index.has(norm(n))) index.set(norm(n), SHEET_ORDER.map((k) => s[k]));
  }
  return index;
}

/** A canon sheet for any character: by built-in id, else by name or alias. */
export function canonFor(pc: { id: string; name: string; aliases?: string[] }): Stats | null {
  const direct = canonStats(pc.id);
  if (direct) return direct;
  const idx = nameIndex();
  for (const n of [pc.name, ...(pc.aliases ?? []).filter((a) => a.trim().includes(' '))]) {
    const sheet = idx.get(norm(n));
    if (sheet) return Object.fromEntries(SHEET_ORDER.map((k, i) => [k, sheet[i]])) as Stats;
  }
  return null;
}

/** How many characters have a canon sheet (built-in plus by name). */
export const CANON_COUNT = () => nameIndex().size;
