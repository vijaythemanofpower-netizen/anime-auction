// Fight flavour that changes from fight to fight: trash talk built from what is
// actually happening (the move just used, the foe's injury, who cost more, who is
// winning) in each temperament's voice, and plain attacks described by the
// fighter's style and element instead of the same few verbs.
// Everything is drawn from a seeded Rng, so replays stay exact.
import type { Rng } from '../rng';
import type { Archetype, Tag, Temperament } from '../types';
import { BANTER } from './banter';

export type TauntKind = 'mock' | 'pump' | 'fired' | 'ignore' | 'rattled' | 'jump';

export interface TauntContext {
  temperament: Temperament;
  foe?: string;
  /** The speaker's own signature move. */
  move?: string;
  /** The move the foe just used (or their best one). */
  foeMove?: string;
  foeArchetype?: Archetype;
  /** A body part the foe has hurt. */
  foePart?: string;
  /** The speaker is the cheaper fighter / the pricier one. */
  underdog?: boolean;
  favourite?: boolean;
  /** Roughly how the speaker is doing: 'ahead', 'even', 'behind'. */
  standing?: 'ahead' | 'even' | 'behind';
  /** Teammate being helped (jump-ins). */
  ally?: string;
}

const ARCH_WORD: Record<Archetype, string> = {
  Assassin: 'sneaky little cuts', Tank: 'walls and armour', Mage: 'party tricks', Ranger: 'long-range potshots', Berserker: 'wild swinging',
  Strategist: 'clever plans', Support: 'helper tricks', Duelist: 'fancy footwork', Summoner: 'pets', Controller: 'mind games',
};

// {foe} {move} {foeMove} {arch} {part} {ally}; a template is used only when its parts are known.
const TEMPLATES: Record<TauntKind, string[]> = {
  mock: [
    'You call that {foeMove}, {foe}? I barely felt it.',
    'Your {arch} won\'t work on me, {foe}.',
    'How\'s that {part} feeling, {foe}?',
    'Keep favouring that {part}, {foe}. I can see it.',
    'Wait until you see my {move}, {foe}.',
    'I\'ve been holding back my {move}. Want to see it, {foe}?',
    '{foeMove}? I read that one before you even moved.',
    'Is this really all you brought, {foe}?',
    'You\'re slowing down, {foe}. I can hear you breathing.',
    'Look at your hands shaking, {foe}.',
    'Your guard has a hole in it the size of a door, {foe}.',
    'Try that {foeMove} again. I dare you.',
    'You hit like someone who\'s never lost. Let me fix that, {foe}.',
    'I\'ll remember your name, {foe}. For about a minute.',
    'Every time you swing, you leave yourself open, {foe}.',
    'That\'s the face of someone who knows they\'re losing, {foe}.',
    'Go ahead, {foe}. Call for help.',
    'I\'ve fought scarier things in my sleep, {foe}.',
    'Was {foeMove} supposed to scare me?',
    "You fight like you're reading from a manual, {foe}.",
    "I've already seen all your moves, {foe}. Twice.",
    'You should have stayed on the bench, {foe}.',
    'My {move} is going to end this, {foe}. Get ready.',
    'Your {arch}? Cute, {foe}. Now watch a real fighter.',
    'Did your {part} just give out, {foe}?',
    "Breathe, {foe}. You'll want to remember this.",
    'Even your shadow looks tired, {foe}.',
    'I expected more from someone with your reputation, {foe}.',
  ],
  pump: [
    'That {foeMove} hurt. Good. Now I\'m awake.',
    'One clean {move} and this is over.',
    'I didn\'t come all this way to lose to {foe}!',
    'Get up. Breathe. Go again.',
    'Still standing. That\'s all that matters.',
    'They think I\'m finished. Let\'s prove them wrong.',
    'My legs still work. My fists still work. Let\'s go.',
    'Pain\'s just a reminder that I\'m still in this.',
    'Watch closely, {foe}. This is where it turns.',
    'Everyone\'s watching. Don\'t you dare fold now.',
    'One more round. Then one more.',
  ],
  fired: [
    'You\'ll regret saying that, {foe}.',
    'Keep talking, {foe}. It makes this easier.',
    'Say it again after my {move} lands.',
    'Oh, you want my full strength, {foe}? Fine.',
    'That\'s the last thing you\'ll say standing, {foe}.',
    'Now it\'s personal.',
    'You just picked the wrong fighter to insult, {foe}.',
  ],
  ignore: [
    'Talk all you like, {foe}.',
    'Words don\'t leave bruises, {foe}.',
    'Are you fighting or giving a speech?',
    'You talk a lot for someone breathing that hard.',
    'Noted, {foe}. Now hit me with something real.',
    'Save your breath. You\'ll need it.',
  ],
  rattled: [
    'Why can\'t I land a clean hit on {foe}...?',
    'Stay calm. Stay calm...',
    'That {foeMove}... how is it that strong?',
    'My {part}... no, not now...',
    'Don\'t let {foe} get in your head...',
    'I... I can still do this. Right?',
  ],
  jump: [
    'Hold on, {ally}! I\'m coming in!',
    'Step back, {ally}. I\'ll take {foe}.',
    'Nobody does that to {ally} while I\'m watching!',
    '{ally}, catch your breath. My turn.',
    'You want {ally}? Go through me first, {foe}.',
    'Tag me in! {foe} is mine!',
  ],
};

// Each temperament colours the line with its own openers and closers.
const VOICE: Record<Temperament, { pre: string[]; post: string[] }> = {
  aggressive: { pre: ['Hah!', 'Listen up.', ''], post: ['Now FIGHT!', '', ''] },
  patient: { pre: ['Hm.', ''], post: ['Take your time.', '', ''] },
  analytical: { pre: ['Observation:', 'Interesting.', ''], post: ['The numbers agree.', '', ''] },
  reckless: { pre: ['HA!', 'Ooh!', ''], post: ['This is FUN!', 'Again!', ''] },
  defensive: { pre: ['Steady.', ''], post: ['I won\'t fall.', '', ''] },
  'hot-blooded': { pre: ['Hey!', 'Come on!', ''], post: ['I won\'t lose!', 'Let\'s GO!', ''] },
  calculating: { pre: ['As expected.', ''], post: ['All according to plan.', '', ''] },
  stoic: { pre: ['...', ''], post: ['', ''] },
  arrogant: { pre: ['Hmph.', 'How amusing.', ''], post: ['Know your place.', 'Kneel.', ''] },
  cheerful: { pre: ['Hehe,', 'Oh!', ''], post: ['This is great!', 'Hehe!', ''] },
};

function fill(t: string, c: TauntContext): string | null {
  const vals: Record<string, string | undefined> = {
    foe: c.foe, move: c.move, foeMove: c.foeMove, arch: c.foeArchetype ? ARCH_WORD[c.foeArchetype] : undefined, part: c.foePart, ally: c.ally,
  };
  let ok = true;
  const out = t.replace(/\{(\w+)\}/g, (_, k: string) => { const v = vals[k]; if (!v) ok = false; return v ?? ''; });
  return ok ? out : null;
}

function fits(t: string, c: TauntContext): boolean {
  if (/losing|breathing that hard|slowing down|shaking/.test(t)) return c.standing === 'ahead';
  if (/They think I\'m finished|Get up\. Breathe/.test(t)) return c.standing === 'behind';
  return true;
}

/** A taunt or reply nobody has said yet this fight (used holds this fight's lines). */
export function writeTaunt(rng: Rng, kind: TauntKind, c: TauntContext, used: Set<string>): string {
  const classic = BANTER[c.temperament][kind].map((l) => l.replace('{foe}', c.foe ?? 'you'));
  // Stoic fighters stay terse: mostly their own short lines.
  const pool = c.temperament === 'stoic' && kind !== 'jump'
    ? classic
    : [...TEMPLATES[kind].filter((t) => fits(t, c)).map((t) => fill(t, c)).filter((x): x is string => !!x), ...classic];
  for (let i = 0; i < 12; i++) {
    let line = rng.pick(pool);
    const v = VOICE[c.temperament];
    if (!classic.includes(line) && rng.chance(0.45)) {
      const pre = rng.pick(v.pre), post = rng.pick(v.post);
      line = `${pre ? `${pre} ` : ''}${line}${post ? ` ${post}` : ''}`;
    }
    if (!used.has(line) || i === 11) { used.add(line); return line; }
  }
  return rng.pick(pool);
}

// ------------------------------------------------------------------ attacks

const STRIKES: Record<Archetype, string[]> = {
  Assassin: ['a blade from the blind side', 'a knife-hand to the neck', 'a flicker of steel', 'a stab between the ribs', 'a strike from behind', 'a slash too fast to follow'],
  Tank: ['a shoulder charge', 'a crushing hammer-fist', 'a full-body tackle', 'a headbutt', 'a battering-ram shove', 'a stomp that shakes the floor'],
  Mage: ['a bolt of raw energy', 'a burst of spellfire', 'a runic blast', 'a point-blank spell', 'a hail of magic missiles', 'a twisting arcane lance'],
  Ranger: ['a shot from range', 'a volley of projectiles', 'a quick-draw shot', 'a trick shot off the wall', 'a pinning shot', 'a long-range strike'],
  Berserker: ['a wild haymaker', 'a flurry of furious blows', 'a reckless overhead smash', 'a roaring uppercut', 'a two-handed swing', 'a savage knee'],
  Strategist: ['a feint and a hook', 'a set-up jab and a cross', 'a well-timed sweep', 'a trap sprung at the perfect moment', 'a strike at the exposed side', 'a counter-timed elbow'],
  Support: ['a quick palm strike', 'a staff jab', 'a shield-bash of light', 'a disorienting flash', 'a sharp kick', 'a sweep that takes the legs'],
  Duelist: ['a lightning thrust', 'a spinning heel kick', 'a riposte', 'a two-step slash', 'a precise lunge', 'a backhand cut'],
  Summoner: ['a summoned beast\'s charge', 'a swarm of familiars', 'a conjured claw', 'a spirit lunging from the ground', 'a towering summoned fist', 'a summoned blade'],
  Controller: ['a crushing pressure field', 'a sudden pull off balance', 'a binding snap', 'a warped-space strike', 'a gravity slam', 'a mental spike'],
};

const ELEMENT: Partial<Record<Tag, string[]>> = {
  FIRE: ['blazing', 'searing'], LIGHTNING: ['crackling', 'electrified'], ICE: ['frost-edged', 'freezing'], DARK: ['shadow-wreathed', 'pitch-black'],
  WIND: ['whistling', 'cyclone-fast'], EARTH: ['rock-hard', 'quaking'], WATER: ['surging', 'tidal'], DIVINE: ['radiant', 'blinding'], HOLY: ['radiant', 'gleaming'],
  DEMON: ['demonic', 'hellish'], DRAGON: ['draconic', 'scale-splitting'], SPIRIT: ['spirit-charged', 'ghostly'], MAGIC: ['arcane', 'glowing'], SHADOW: ['shadowy', 'silent'],
};

/** How a fighter's plain attack looks: "a crackling spinning heel kick". */
export function strikeLook(rng: Rng, archetype: Archetype, tags: Tag[], used: Set<string>): string {
  const list = STRIKES[archetype] ?? STRIKES.Duelist;
  const fresh = list.filter((x) => !used.has(x));
  const base = rng.pick(fresh.length ? fresh : list);
  used.add(base);
  const adj = tags.map((t) => ELEMENT[t]).find(Boolean);
  if (!adj || !rng.chance(0.55)) return base;
  const a = rng.pick(adj);
  return `${/^[aeiou]/i.test(a) ? 'an' : 'a'} ${a} ${base.replace(/^an? /, '')}`;
}
