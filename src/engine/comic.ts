// Comic director: turns a finished battle's event log into a comic script.
// It picks the fight's biggest moments, frames each one as a panel (shot,
// angle, size, sound word, caption) and writes the drawing prompt for it.
// Pure and seeded: the same battle always gives the same comic, a different
// battle (or a rematch) gives a different one.
import type { BattleEvent, BattleRecord, PublicCharacter, Tag } from './types';
import { ABILITIES } from './data/abilities';
import { Rng, hashString } from './rng';

export type Shot = 'establish' | 'versus' | 'taunt' | 'charge' | 'strike' | 'impact' | 'block' | 'dodge' | 'clash' | 'injury' | 'knockdown' | 'awaken' | 'finisher' | 'victory';
export type PanelSize = 'small' | 'wide' | 'tall' | 'splash';

export interface ComicPanel {
  id: string;
  /** The event this panel belongs to; it appears when playback reaches it. */
  seq: number;
  shot: Shot;
  size: PanelSize;
  /** Main subject, and the second fighter for two-part panels (clash, versus). */
  focus: string;
  other?: string;
  sfx?: string;
  caption?: string;
  /** What the fighter says in this panel (taunts and trash talk). */
  balloon?: string;
  /** One drawing per subject: [focus] or [focus, other]. */
  drawings: ComicDrawing[];
}

export interface ComicDrawing {
  key: string;
  prompt: string;
  seed: number;
  width: number;
  height: number;
  /** The character's portrait, used as a look reference when the drawing app can. */
  ref?: string;
}

export interface ComicScript { battleId: string; panels: ComicPanel[] }

export type ComicStyle = 'color' | 'manga';
/** Panels per fight for each comic length setting. */
export const COMIC_LENGTHS = { short: 16, full: 32, epic: 50 } as const;
export type ComicLength = keyof typeof COMIC_LENGTHS;
export const MAX_PANELS = COMIC_LENGTHS.full;

const QUALITY = 'masterpiece, high score, great score, absurdres';
// Our page supplies the panels, so the model draws one scene: 'comic' made it draw whole
// multi-panel pages, and 'comic panel' / 'thick outlines' gave the fast sampler scanlines.
const STYLES: Record<ComicStyle, string> = {
  color: 'solo, anime coloring, bold lineart, cel shading, dynamic composition, dramatic lighting',
  manga: 'solo, monochrome, greyscale, manga style, screentone, ink, hatching, high contrast, dynamic composition, dramatic lighting',
};
const SAFE = 'safe';
export const NEGATIVE = 'lowres, bad anatomy, bad hands, extra digits, missing fingers, cropped, worst quality, low quality, jpeg artifacts, text, speech bubble, signature, watermark, username, blurry, nsfw, gore, blood, nude';

// Danbooru-style tags the anime model knows the famous fighters by.
const LEGEND_TAGS: Record<string, string> = {
  naruto: 'uzumaki naruto, naruto (series)', sasuke: 'uchiha sasuke, naruto (series)', itachi: 'uchiha itachi, naruto (series)', kakashi: 'hatake kakashi, naruto (series)',
  luffy: 'monkey d. luffy, one piece', zoro: 'roronoa zoro, one piece', sanji: 'sanji (one piece), one piece', ace: 'portgas d. ace, one piece',
  goku: 'son goku, dragon ball z', vegeta: 'vegeta, dragon ball z', frieza: 'frieza, dragon ball z',
  ichigo: 'kurosaki ichigo, bleach', byakuya: 'kuchiki byakuya, bleach', aizen: 'aizen sousuke, bleach',
  gojo: 'gojou satoru, jujutsu kaisen', yuji: 'itadori yuuji, jujutsu kaisen', sukuna: 'ryoumen sukuna (jujutsu kaisen), jujutsu kaisen', megumi: 'fushiguro megumi, jujutsu kaisen',
  tanjiro: 'kamado tanjirou, kimetsu no yaiba', zenitsu: 'agatsuma zenitsu, kimetsu no yaiba', rengoku: 'rengoku kyoujurou, kimetsu no yaiba',
  deku: 'midoriya izuku, boku no hero academia', bakugo: 'bakugou katsuki, boku no hero academia', todoroki: 'todoroki shouto, boku no hero academia', allmight: 'all might, boku no hero academia',
  levi: 'levi (shingeki no kyojin), shingeki no kyojin', eren: 'eren yeager, shingeki no kyojin', mikasa: 'mikasa ackerman, shingeki no kyojin',
  gon: 'gon freecss, hunter x hunter', killua: 'killua zoldyck, hunter x hunter', hisoka: 'hisoka morow, hunter x hunter',
  edward: 'edward elric, fullmetal alchemist', roy: 'roy mustang, fullmetal alchemist', saitama: 'saitama (one-punch man), one-punch man',
  natsu: 'natsu dragneel, fairy tail', denji: 'denji (chainsaw man), chainsaw man', minato: 'namikaze minato, naruto (series)', madara: 'uchiha madara, naruto (series)',
  pain: 'pain (naruto), naruto (series)', gaara: 'gaara (naruto), naruto (series)', lee: 'rock lee, naruto (series)', law: 'trafalgar law, one piece',
  whitebeard: 'edward newgate, one piece', shanks: 'shanks (one piece), one piece', gohan: 'son gohan, dragon ball z', piccolo: 'piccolo, dragon ball z',
  broly: 'broly (dragon ball super), dragon ball', kenpachi: 'zaraki kenpachi, bleach', toshiro: 'hitsugaya toushirou, bleach', rukia: 'kuchiki rukia, bleach',
  yuta: 'okkotsu yuuta, jujutsu kaisen', todo: 'toudou aoi (jujutsu kaisen), jujutsu kaisen', nanami: 'nanami kento, jujutsu kaisen', nobara: 'kugisaki nobara, jujutsu kaisen',
  giyu: 'tomioka giyuu, kimetsu no yaiba', inosuke: 'hashibira inosuke, kimetsu no yaiba', akaza: 'akaza (kimetsu no yaiba), kimetsu no yaiba', shinobu: 'kochou shinobu, kimetsu no yaiba',
  shigaraki: 'shigaraki tomura, boku no hero academia', endeavor: 'endeavor (boku no hero academia), boku no hero academia', kurapika: 'kurapika, hunter x hunter', meruem: 'meruem, hunter x hunter',
  jinwoo: 'sung jin-woo, ore dake level up na ken', jotaro: 'kujo jotaro, jojo no kimyou na bouken', dio: 'dio brando, jojo no kimyou na bouken', mob: 'kageyama shigeo, mob psycho 100',
  kaneki: 'kaneki ken, tokyo ghoul', asta: 'asta (black clover), black clover', yuno: 'yuno (black clover), black clover', power: 'power (chainsaw man), chainsaw man',
  yor: 'yor briar, spy x family', gilgamesh: 'gilgamesh (fate), fate/zero', saber: 'artoria pendragon (fate), saber (fate), fate/zero', kirito: 'kirito, sword art online',
  frieren: 'frieren, sousou no frieren', escanor: 'escanor, nanatsu no taizai',
};

const SERIES_TAGS: Record<string, string> = {
  'naruto': 'naruto (series)', 'naruto shippuden': 'naruto (series)', 'boruto': 'boruto: naruto next generations', 'dragon ball z': 'dragon ball z', 'dragon ball super': 'dragon ball super',
  'dragon ball': 'dragon ball', 'demon slayer': 'kimetsu no yaiba', 'my hero academia': 'boku no hero academia', 'attack on titan': 'shingeki no kyojin',
  'fullmetal alchemist: brotherhood': 'fullmetal alchemist', 'one-punch man': 'one-punch man', 'solo leveling': 'ore dake level up na ken', 'mob psycho 100': 'mob psycho 100',
  'the seven deadly sins': 'nanatsu no taizai', 'frieren: beyond journey\'s end': 'sousou no frieren', 'spy x family': 'spy x family',
};

const ELEMENT_TAGS: Partial<Record<Tag, string>> = {
  FIRE: 'fire, flames, embers', ICE: 'ice, frost, ice crystals', LIGHTNING: 'electricity, lightning', WATER: 'water, splashing', WIND: 'wind, swirling air',
  DARK: 'dark aura, black energy', HOLY: 'light rays, holy light', DIVINE: 'golden aura, glowing', DEMON: 'demonic aura, red eyes glowing', MAGIC: 'magic circle, glowing runes',
  SHADOW: 'shadows, darkness', SPIRIT: 'spirit energy, blue aura', DRAGON: 'dragon aura', EARTH: 'rocks, cracked ground', WARRIOR: 'fighting spirit', ASSASSIN: 'afterimage',
};

const ARENA_TAGS: Record<string, string> = {
  volcano: 'volcano, lava, embers, red sky', tundra: 'snow, blizzard, icy mountains', storm: 'storm clouds, lightning in background', temple: 'golden light, stone pillars',
  rooftops: 'night city, rooftops, neon lights', forest: 'dark forest, moonlight, mist', ocean: 'flooded colosseum, ocean waves', colosseum: 'arena, colosseum, crowd, stone floor',
};

const SFX: Record<string, string[]> = {
  strike: ['BAM!', 'WHAM!', 'KRAK!', 'THOOM!', 'SMASH!'], slash: ['SHING!', 'ZANN!', 'SLASH!', 'KSHHK!'], beam: ['FWOOOM!', 'ZZZAAP!', 'VWOOM!', 'KABOOM!'],
  impact: ['GAH!', 'KRUNCH!', 'DOOM!', 'BOOM!'], block: ['KLANG!', 'GUARD!', 'THUNK!'], dodge: ['SWISH!', 'WHOOSH!', 'FWIP!'], clash: ['KRA-KOOOM!', 'DOOOOM!', 'KRZZAK!'],
  knockdown: ['THUD!', 'KRASH!', 'DOWN!'], charge: ['GOGOGOGO', 'ZZZMMM', 'HAAAAA!'], finisher: ['KA-BOOOOM!', 'DOOOOOM!', 'ZWAAAAM!'], awaken: ['GOGOGO', 'DOKUN!', 'ROOOAR!'],
};

/** How the anime model is told who a character is. */
export function characterTags(c: PublicCharacter | undefined, fallbackName: string): string {
  const gender = c?.gender === 'female' ? '1girl' : '1boy';
  if (c?.id.startsWith('legend:')) {
    const t = LEGEND_TAGS[c.id.slice(7)];
    if (t) return `${gender}, ${t}`;
  }
  const name = (c?.name ?? fallbackName).toLowerCase().replace(/[()]/g, '').trim();
  // Anime databases write Japanese names given-name first; the model learned them surname first.
  const parts = name.split(/\s+/);
  const tag = parts.length === 2 ? `${parts[1]} ${parts[0]}` : name;
  const series = c?.series && c.series !== 'MyAnimeList' && c.source !== 'original' ? (SERIES_TAGS[c.series.toLowerCase()] ?? c.series.toLowerCase()) : '';
  const look = c?.source === 'original' ? `original character, ${c.weapon.toLowerCase()}` : '';
  return [gender, tag, series, look].filter(Boolean).join(', ');
}

const sizeFor: Record<PanelSize, [number, number]> = { small: [1024, 1024], wide: [1344, 768], tall: [832, 1216], splash: [1536, 640] };

interface Candidate { e: BattleEvent; shot: Shot; focus: string; other?: string; score: number }

function candidates(record: BattleRecord): Candidate[] {
  const ev = record.result.events;
  const out: Candidate[] = [];
  const seenTaunt = new Set<string>();
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    const a = e.actor, t = e.target;
    const ab = e.ability ? ABILITIES[e.ability] : undefined;
    switch (e.type) {
      case 'rival': if (a && t) out.push({ e, shot: 'versus', focus: a, other: t, score: 9 }); break;
      case 'banter':
        // Every line can become a panel; a fighter's first mocking line is the one most worth drawing.
        if (a && e.context?.line) { const first = !seenTaunt.has(a) && e.context?.kind === 'mock'; if (first) seenTaunt.add(a); out.push({ e, shot: 'taunt', focus: a, score: first ? 3.5 : 1.8 }); }
        break;
      case 'ability': case 'desperation':
        if (a && ab && (ab.kind === 'ultimate' || ab.kind === 'buff' || ab.kind === 'summon')) out.push({ e, shot: 'charge', focus: a, score: ab.kind === 'ultimate' ? 8 : 4.5 });
        break;
      case 'attack': case 'counter': {
        if (!a || !t) break;
        const impact = String(e.context?.impact ?? '');
        const big = impact === 'devastating' || e.crit;
        const heavy = impact === 'heavy';
        out.push({ e, shot: 'strike', focus: a, score: (big ? 6 : heavy ? 4.5 : ab ? 3 : 1.6) + (ab?.kind === 'ultimate' ? 2 : 0) });
        if (big || heavy) out.push({ e, shot: 'impact', focus: t, score: big ? 4 : 2.2 });
        break;
      }
      case 'miss': if (a && t && e.response === 'dodge') out.push({ e, shot: 'dodge', focus: t, score: 1.5 }); break;
      case 'guard_break': if (t) out.push({ e, shot: 'block', focus: t, score: 4.5 }); break;
      case 'block': if (t) out.push({ e, shot: 'block', focus: t, score: 1.2 }); break;
      case 'parry': if (t) out.push({ e, shot: 'block', focus: t, score: 2.4 }); break;
      case 'get_up': if (a) out.push({ e, shot: 'awaken', focus: a, score: 4 }); break;
      case 'clash': if (a && t) out.push({ e, shot: 'clash', focus: a, other: t, score: e.context?.rival ? 9 : 7 }); break;
      case 'injury': if (t && e.injury) out.push({ e, shot: 'injury', focus: t, score: e.injury.severity === 2 ? 6 : 2.5 }); break;
      case 'knockdown': if (t) out.push({ e, shot: 'knockdown', focus: t, score: 7.5 }); break;
      case 'awakening': if (a) out.push({ e, shot: 'awaken', focus: a, score: 8 }); break;
      case 'twist': {
        const kind = String(e.context?.twist);
        if (a && ['laststand', 'secondwind', 'avenge', 'hidden'].includes(kind)) out.push({ e, shot: 'awaken', focus: a, score: 7 });
        // Plot twists always get a big panel: they are the moment people remember.
        else if (kind.startsWith('plot-')) {
          const who = t ?? a ?? record.input.sides[0].fighters[0].charId;
          const shot: Shot = kind === 'plot-intruder' || kind === 'plot-betrayal' ? 'impact' : kind === 'plot-sealed' ? 'injury' : 'awaken';
          out.push({ e, shot, focus: who, score: 11 });
        }
        break;
      }
      case 'reinforcement': if (a) out.push({ e, shot: 'strike', focus: a, score: 7 }); break;
      case 'combo': if (a && e.context?.duo) out.push({ e, shot: 'strike', focus: a, score: 6.5 }); break;
      case 'defeat': {
        if (!t) break;
        // The blow that ended it, drawn big.
        let k = i - 1;
        while (k >= 0 && !(ev[k].target === t && (ev[k].type === 'attack' || ev[k].type === 'counter' || ev[k].type === 'reinforcement'))) k--;
        const finisher = k >= 0 ? ev[k].actor : undefined;
        if (finisher && finisher !== t) out.push({ e: k >= 0 ? ev[k] : e, shot: 'finisher', focus: finisher, score: 10 });
        out.push({ e, shot: 'knockdown', focus: t, score: 9 });
        break;
      }
    }
  }
  return out;
}

function sizeOf(shot: Shot, rng: Rng): PanelSize {
  switch (shot) {
    case 'establish': return 'tall';
    case 'versus': case 'clash': case 'finisher': return 'splash';
    case 'victory': return rng.next() < 0.5 ? 'tall' : 'wide';
    case 'knockdown': return 'wide';
    case 'charge': case 'awaken': return rng.next() < 0.6 ? 'tall' : 'wide';
    case 'strike': return rng.next() < 0.5 ? 'wide' : rng.next() < 0.5 ? 'tall' : 'small';
    default: return 'small';
  }
}

const ANGLES = ['from below', 'from above', 'dutch angle', 'from side', 'close-up', 'cowboy shot', 'foreshortening', 'wide shot'];

function action(shot: Shot, e: BattleEvent, c: PublicCharacter | undefined, record: BattleRecord, injured: string, v: number): string {
  // Each shot has several poses; v (seeded per panel) picks one, so a fighter isn't drawn the same way twice.
  const pose = (...list: string[]) => list[v % list.length];
  const ab = e.ability ? ABILITIES[e.ability] : undefined;
  const move = ab ? `(${ab.name.toLowerCase().replace(/[!?:"()]/g, '')}:0.7)` : '';
  const elem = ab?.element ? ELEMENT_TAGS[ab.element] ?? '' : (c?.tags[0] ? ELEMENT_TAGS[c.tags[0]] ?? '' : '');
  const armed = c && /sword|katana|blade|zangetsu|kusanagi|nichirin|scythe|spear/i.test(c.weapon) ? 'holding sword, sword slash, sword trail'
    : ab?.vfx === 'slash' ? 'slashing, slash effect, cutting, slicing wind' : '';
  const ranged = c?.reach === 'ranged' || (ab && ['beam', 'projectile', 'lightning', 'fire', 'ice', 'wave', 'explosion'].includes(ab.vfx ?? ''));
  switch (shot) {
    case 'establish': return `cowboy shot, ${pose('standing, fighting stance', 'arms crossed, standing tall', 'walking forward, determined', 'crouching, ready to pounce')}, looking at viewer, serious, wind, clothes fluttering`;
    case 'versus': return 'portrait, close-up, face, glaring, intense eyes, serious, looking at viewer, half face shadow';
    case 'taunt': return e.context?.kind === 'mock' ? 'smirk, close-up, upper body, pointing at viewer, smug, looking at viewer' : 'shouting, open mouth, clenched fist, determined, upper body, close-up';
    case 'charge': return `${pose('cowboy shot', 'full body, from below', 'upper body')}, powering up, aura, glowing eyes, energy gathering, hair flowing, clenched fists, ${elem}${move ? `, ${move}` : ''}`;
    case 'strike':
      if (ranged) return `upper body, attacking, outstretched arm, energy blast, beam, motion lines, ${elem}${move ? `, ${move}` : ''}`;
      return `${pose('upper body', 'full body', 'dynamic pose')}, ${armed || pose('punching', 'kicking, high kick', 'elbow strike', 'flying kick, mid-air', 'uppercut')}, attacking, motion lines, speed lines, impact${move ? `, ${move}` : ''}${elem ? `, ${elem}` : ''}`;
    case 'impact': return `${pose('upper body, getting hit, flying backwards', 'punched in face, head snapped back', 'knocked through wall, rubble', 'bent over, hit in stomach, spitting')}, impact, debris, shockwave, pained expression, clenched teeth, ${injured}`;
    case 'block': return `${pose('blocking, crossed arms', 'catching fist, palm block', 'parrying with weapon, sword clash', 'raised forearm guard')}, defensive stance, shockwave, sparks, gritted teeth, sliding back`;
    case 'dodge': return `dodging, ${pose('mid-air, jumping, backflip', 'leaning back, narrow miss', 'sidestep, sliding on ground', 'ducking under attack')}, afterimage, motion blur, agile`;
    case 'clash': return `upper body, face, attacking, energy clash, sparks, shockwave, intense, shouting, ${elem}${move ? `, ${move}` : ''}`;
    case 'injury': return `injured, ${injured}, close-up, upper body, pained expression, sweat, heavy breathing, determined`;
    case 'knockdown': return `lying on ground, on back, defeated, crater, debris, dust cloud, eyes closed, ${injured}`;
    case 'awaken': if (e.type === 'get_up') return `getting up, one knee, wiping mouth, determined, glaring, ${injured || 'dirty clothes'}`;
      return `transformation, power up, glowing aura, glowing eyes, intense, wind, energy swirling, ${elem}, from below`;
    case 'finisher': return `ultimate attack, massive energy, explosion, dramatic, shouting, full power, motion lines${move ? `, ${move}` : ''}, ${elem}`;
    case 'victory': return `${pose('cowboy shot, standing', 'full body, standing over defeated enemy', 'upper body, fist raised', 'walking away, looking back')}, victory, looking at viewer, confident, smile, smoke, wind, ${injured || 'dirty clothes'}${record.input.mode === 'solo' ? '' : ', back to viewer'}`;
  }
}

const INJURY_TAGS: Record<string, string> = { head: 'bandaged head, bruised face', arm: 'bandaged arm, holding own arm', leg: 'limping, bandaged leg', torso: 'torn clothes, holding stomach' };

/** Builds the whole comic for a battle. */
export function buildComic(record: BattleRecord, characters: Record<string, PublicCharacter>, opts: { max?: number; style?: ComicStyle } = {}): ComicScript {
  const max = opts.max ?? MAX_PANELS;
  const STYLE = STYLES[opts.style ?? 'color'];
  const { input, result } = record;
  const rng = new Rng(hashString(`${input.battleId}:${input.seed}:comic`));
  const ev = result.events;
  const leads = input.sides.map((s) => (s.fighters.find((f) => f.position === 'front') ?? s.fighters[0]).charId);
  const intro = ev[0];

  // Greedy pick: biggest moments first, nudged to spread through the fight.
  const all = candidates(record);
  const chosen: Candidate[] = [];
  const reserved = 2 + 1; // two establishing shots and the victory panel
  const budget = Math.max(1, max - reserved);
  const pool = [...all].sort((x, y) => y.score - x.score || x.e.seq - y.e.seq);
  while (chosen.length < budget && pool.length) {
    let bestI = 0, best = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      const gap = chosen.length ? Math.min(...chosen.map((x) => Math.abs(x.e.turn - c.e.turn))) : 20;
      // One panel per subject per moment: a finishing blow is not also drawn as a plain strike.
      const sameShot = chosen.some((x) => x.e.seq === c.e.seq && (x.shot === c.shot || x.focus === c.focus));
      const v = sameShot ? -Infinity : c.score + Math.min(gap, 10) * 0.35 - (gap === 0 && c.shot !== 'impact' && c.shot !== 'knockdown' ? 3 : 0) + rng.next() * 0.8;
      if (v > best) { best = v; bestI = i; }
    }
    if (best === -Infinity) break;
    chosen.push(pool.splice(bestI, 1)[0]);
  }
  chosen.sort((x, y) => x.e.seq - y.e.seq || order(x.shot) - order(y.shot));

  const winner = result.fighters.filter((f) => f.side === result.winnerSide).sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)[0]?.charId ?? leads[result.winnerSide];
  const verdict = ev.find((e) => e.type === 'verdict') ?? ev[ev.length - 1];
  const list: Candidate[] = [
    { e: intro, shot: 'establish', focus: leads[0], score: 0 },
    { e: intro, shot: 'establish', focus: leads[1], score: 0 },
    ...chosen,
    { e: verdict, shot: 'victory', focus: winner, score: 0 },
  ];

  const names = new Map(input.sides.flatMap((s) => [...s.fighters, ...(s.reserves ?? [])]).map((f) => [f.charId, f.name]));
  const injuriesAt = (id: string, seq: number) => {
    const parts = new Set<string>();
    for (const e of ev) { if (e.seq > seq) break; if (e.type === 'injury' && e.target === id && e.injury) parts.add(e.injury.part); }
    // Injuries carried in from earlier fights show too.
    const snap = input.sides.flatMap((s) => s.fighters).find((f) => f.charId === id);
    if (snap?.injuries.length) parts.add('torso');
    return [...parts].map((p) => INJURY_TAGS[p]).filter(Boolean).join(', ');
  };
  const arena = ARENA_TAGS[input.environmentId] ?? ARENA_TAGS.colosseum;

  const usedText = new Set<string>();
  const panels: ComicPanel[] = list.map((c, i) => {
    const size = c.shot === 'establish' && input.mode === 'solo' ? 'tall' : sizeOf(c.shot, rng);
    const subjects = c.other ? [c.focus, c.other] : [c.focus];
    // Two fighters share one picture at medium range (tested: close enough that both stay
    // recognisable; wider shots shrink them to silhouettes).
    const duo = c.other ? duoDrawing(c, characters, names, i, size, STYLE, input.seed, input.battleId) : null;
    const drawings = duo ? [duo] : subjects.map((who, j): ComicDrawing => {
      const ch = characters[who];
      const [w, h] = c.other ? [832, 1216] : sizeFor[size];
      const angle = c.shot === 'versus' || c.shot === 'taunt' || c.shot === 'injury' ? 'close-up' : c.shot === 'establish' ? 'from below' : ANGLES[rng.int(0, ANGLES.length - 1)];
      const evForDrawing = j === 1 && c.e.context?.counterMove ? { ...c.e, ability: String(c.e.context.counterMove) } : c.e;
      const prompt = [
        // The fighter must win over the scenery and move names (a move called "Shrine" drew a shrine).
        `(${characterTags(ch, names.get(who) ?? who)}:1.15)`, action(c.shot, evForDrawing, ch, record, injuriesAt(who, c.e.seq), hashString(`${input.seed}:${i}:${j}:${who}:pose`) >>> 0), angle, `(${arena}:0.6)`, STYLE, SAFE, QUALITY,
      ].filter(Boolean).join(', ').replace(/,\s*,/g, ',').replace(/,\s*$/, '');
      const seed = hashString(`${input.seed}:${i}:${j}:${who}`) >>> 0;
      // Keyed by content, so panels a corner call doesn't change keep their drawing.
      // The model already knows the built-in fighters (a reference made them look worse in tests);
      // characters found through the Explorer get their portrait as a light look reference.
      const ref = ch && !ch.id.startsWith('legend:') && ch.source !== 'original' ? ch.imageUrl : undefined;
      return { key: `${input.battleId}:${hashString(`${prompt}|${seed}|${w}x${h}|${ref ?? ''}`).toString(36)}`, prompt, seed, width: w, height: h, ref };
    });
    return {
      id: `p${i}`, seq: c.e.seq, shot: c.shot, size, focus: c.focus, other: c.other,
      // Told like a printed comic: the narrator's sentence in the caption box and
      // what the fighters actually say in speech balloons; no sound-effect lettering.
      sfx: (sfxFor(c, rng), undefined), caption: storyCaption(c, record, names, usedText) ?? captionFor(c, names, record), drawings,
      balloon: speechFor(c, record, names, usedText),
    };
  });
  return { battleId: input.battleId, panels };
}

function duoDrawing(c: Candidate, characters: Record<string, PublicCharacter>, names: Map<string, string>, i: number, size: PanelSize, style: string, fightSeed: number, battleId: string): ComicDrawing {
  const a = characters[c.focus], b = characters[c.other!];
  const strip = (tags: string) => tags.split(', ').filter((t) => !/^1(boy|girl)$/.test(t)).join(', ');
  const girls = [a, b].filter((x) => x?.gender === 'female').length;
  const count = girls === 2 ? '2girls' : girls === 1 ? '1boy, 1girl' : '2boys';
  const what = c.shot === 'versus' ? 'face-to-face, glaring at each other, intense, upper body, close-up'
    : 'fighting each other, clash, fists colliding, shockwave, sparks, dynamic angle, cowboy shot, motion lines';
  const prompt = [count, `(${strip(characterTags(a, names.get(c.focus) ?? c.focus))}:1.1)`, `(${strip(characterTags(b, names.get(c.other!) ?? c.other!))}:1.1)`, what, style, SAFE, QUALITY].join(', ');
  const [w, h] = size === 'tall' ? sizeFor.tall : sizeFor.wide;
  const seed = hashString(`${fightSeed}:duo:${i}:${c.focus}:${c.other}`) >>> 0;
  return { key: `${battleId}:${hashString(`${prompt}|${seed}|${w}x${h}`).toString(36)}`, prompt, seed, width: w, height: h };
}

function order(s: Shot): number { return s === 'finisher' || s === 'strike' ? 0 : s === 'impact' ? 1 : 2; }

function sfxFor(c: Candidate, rng: Rng): string | undefined {
  const ab = c.e.ability ? ABILITIES[c.e.ability] : undefined;
  const pick = (k: string) => SFX[k][rng.int(0, SFX[k].length - 1)];
  switch (c.shot) {
    case 'strike': return pick(ab && ['beam', 'projectile', 'lightning', 'fire', 'explosion', 'wave'].includes(ab.vfx ?? '') ? 'beam' : ab?.vfx === 'slash' ? 'slash' : 'strike');
    case 'impact': case 'injury': return pick('impact');
    case 'block': return pick('block');
    case 'dodge': return pick('dodge');
    case 'clash': case 'versus': return c.shot === 'clash' ? pick('clash') : undefined;
    case 'knockdown': return pick('knockdown');
    case 'charge': return pick('charge');
    case 'awaken': return pick('awaken');
    case 'finisher': return pick('finisher');
    default: return undefined;
  }
}

/** Commentary SHOUTED IN CAPITALS reads as a normal sentence in a caption box. */
function sentenceCase(text: string, names: Map<string, string>): string {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (!letters || letters.replace(/[^A-Z]/g, '').length / letters.length < 0.6) return text;
  let out = text.toLowerCase().replace(/(^|[.!?…]\s+|—\s*)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
  // Put each fighter's name back in its proper capitals.
  for (const n of names.values()) out = out.split(n.toLowerCase()).join(n);
  return out;
}

/** The narrator's line for this moment, as a caption. */
function storyCaption(c: Candidate, record: BattleRecord, names: Map<string, string>, used: Set<string>): string | undefined {
  const line = record.narration.find((l) => l.seq === c.e.seq && l.speaker === 'narrator' && !used.has(l.text))
    ?? record.narration.find((l) => l.seq === c.e.seq - 1 && l.speaker === 'narrator' && !used.has(l.text));
  if (!line) return undefined;
  used.add(line.text);
  const t = sentenceCase(line.text, names);
  return t.length > 140 ? `${t.slice(0, 137).replace(/\s+\S*$/, '')}…` : t;
}

/** What a fighter says around this moment, for a speech balloon. */
function speechFor(c: Candidate, record: BattleRecord, names: Map<string, string>, used: Set<string>): string | undefined {
  const who = new Set([names.get(c.focus), c.other ? names.get(c.other) : undefined].filter(Boolean));
  const line = record.narration.find((l) => l.speaker !== 'narrator' && who.has(l.speaker) && Math.abs(l.seq - c.e.seq) <= 2 && !used.has(l.text));
  const raw = line?.text ?? (c.shot === 'taunt' && c.e.context?.line ? String(c.e.context.line) : undefined);
  if (!raw) return undefined;
  used.add(raw);
  return raw.replace(/^[“"]|[”"]$/g, '');
}

function captionFor(c: Candidate, names: Map<string, string>, record: BattleRecord): string | undefined {
  const n = (id?: string) => (id ? names.get(id) ?? '' : '');
  const ab = c.e.ability ? ABILITIES[c.e.ability] : undefined;
  switch (c.shot) {
    case 'establish': return c.focus === (record.input.sides[0].fighters.find((f) => f.position === 'front') ?? record.input.sides[0].fighters[0]).charId ? `${n(c.focus)} steps into the arena…` : `…and ${n(c.focus)} answers.`;
    case 'versus': return String(c.e.context?.title ?? `${n(c.focus)} vs ${n(c.other)}`);
    case 'charge': return ab ? `${n(c.focus)}: ${ab.name}!` : undefined;
    case 'strike': return ab ? ab.name : c.e.type === 'reinforcement' ? `${n(c.focus)} bursts in!` : undefined;
    case 'clash': return `${n(c.focus)} and ${n(c.other)} collide!`;
    case 'injury': return c.e.injury ? `${n(c.focus)}: ${c.e.injury.label}` : undefined;
    case 'knockdown': return c.e.type === 'defeat' ? `${n(c.focus)} goes down for good.` : `${n(c.focus)} hits the floor!`;
    case 'awaken': return c.e.type === 'twist' ? String(c.e.context?.title ?? '') : c.e.type === 'get_up' ? `${n(c.focus)} gets back up!` : `${n(c.focus)} awakens!`;
    case 'finisher': return ab ? `${ab.name}!` : 'The final blow!';
    case 'victory': return `${n(c.focus)} stands victorious.`;
    case 'block': return c.e.type === 'guard_break' ? `${n(c.focus)}'s guard shatters!` : c.e.type === 'parry' ? `${n(c.focus)} turns it aside!` : undefined;
    default: return undefined;
  }
}
