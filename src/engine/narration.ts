// Deterministic, event-grounded narration. Every line is generated from one
// verified engine event and carries that event's id; the narrator never
// creates damage, abilities, or outcomes. validateNarration() checks any
// narration (local or from an optional external model) against the log.
import { strikeLook } from './data/flavor';
import type { BattleEvent, BattleInput, BattleResult, NarrationLine, Temperament } from './types';
import { Rng, deriveSeed } from './rng';
import { getAbility } from './data/abilities';

export interface NarrationContext {
  prices: Record<string, number>;
  playerNames: Record<string, string>;
  previousLoss: Record<string, boolean>;
  stageName: string;
}

const DIALOGUE: Record<Temperament, { intro: string[]; hurt: string[]; win: string[]; lose: string[]; awaken: string[] }> = {
  aggressive: { intro: ['Let\'s get this over with!', 'I\'ll crush you in one go!'], hurt: ['Is that all you\'ve got?!'], win: ['Too easy!'], lose: ['Next time... you\'re mine.'], awaken: ['NOW I\'M ANGRY!'] },
  patient: { intro: ['Show me what you have.', 'Take your time. I will take mine.'], hurt: ['Not yet.'], win: ['Patience wins.'], lose: ['I waited too long.'], awaken: ['The moment has come.'] },
  analytical: { intro: ['I\'ve already calculated three ways to beat you.', 'Interesting. Let me observe.'], hurt: ['A variable I missed...'], win: ['Exactly as calculated.'], lose: ['My model was wrong.'], awaken: ['Recalculating... limiter off.'] },
  reckless: { intro: ['No plan, no problem!', 'Let\'s make this LOUD!'], hurt: ['Ha! That actually hurt!'], win: ['Did you see that?!'], lose: ['Worth it!'], awaken: ['All in! EVERYTHING!'] },
  defensive: { intro: ['You won\'t get through me.', 'I\'ll hold.'], hurt: ['Still standing.'], win: ['Endurance is strength.'], lose: ['I couldn\'t hold...'], awaken: ['I refuse to break!'] },
  'hot-blooded': { intro: ['My blood is BOILING!', 'Come on, give me everything!'], hurt: ['That just makes me stronger!'], win: ['THAT\'S what I\'m talking about!'], lose: ['I\'ll burn hotter next time!'], awaken: ['MY SPIRIT IS ON FIRE!'] },
  calculating: { intro: ['Everything is going according to plan.', 'Your moves are already on my board.'], hurt: ['An acceptable loss.'], win: ['Checkmate.'], lose: ['A gambit that failed.'], awaken: ['Time to play my trump card.'] },
  stoic: { intro: ['...', 'Begin.'], hurt: ['...'], win: ['It is done.'], lose: ['Well fought.'], awaken: ['...Enough.'] },
  arrogant: { intro: ['You should feel honoured to face me.', 'Kneel now and save us both time.'], hurt: ['You DARE?!'], win: ['As expected of me.'], lose: ['Impossible... IMPOSSIBLE!'], awaken: ['You forced me to get serious!'] },
  cheerful: { intro: ['Let\'s have a great fight!', 'Hi! Don\'t hold back, okay?'], hurt: ['Ow ow ow! Okay, okay!'], win: ['Good game!'], lose: ['Aw... that was fun though!'], awaken: ['I can still go! Here I go!'] },
};

const OPENERS = ['AND WE\'RE UNDERWAY!', 'THE BELL RINGS — LET\'S GO!', 'HERE WE GO, FOLKS!', 'FIGHTERS, BEGIN!', 'NO MORE TALKING — THEY CLASH!', 'THE CROWD IS ON ITS FEET!', 'BOTH FIGHTERS EXPLODE OFF THE MARK!', "THIS IS THE ONE WE'VE BEEN WAITING FOR!", 'SILENCE... AND THEN, CHAOS!'];
const CRIT = ['WHAT A HIT!', 'CRITICAL! RIGHT ON TARGET!', 'THAT ONE\'S GOING ON THE HIGHLIGHT REEL!', 'DEVASTATING!', 'RIGHT ON THE BUTTON!', 'YOU COULD HEAR THAT ONE FROM THE CHEAP SEATS!', 'PERFECT PLACEMENT!', "THAT'S GOING TO LEAVE A MARK!", 'OH, THAT WAS NASTY!'];
const DODGE = ['Clean dodge!', 'Not even close!', 'Slipped right past it!', 'Read it perfectly!', 'Gone — like smoke!', 'Too slow!', 'Footwork on display!', 'Swung at nothing but air!', 'Saw it coming a mile away!'];
const BLOCK = ['Blocked!', 'Took it on the guard!', 'Arms up, nothing clean gets through!', 'Ate it on the forearms!', 'Shell up — absorbed!', 'Solid wall!', 'Not this time!'];
const PARRY = ['PARRIED!', 'Turned aside — and now they\'re open!', 'What a read! Knocked it off line!', 'Swatted away!', 'Redirected — beautiful!', 'Steel on steel, and the opening appears!'];
const CLASH = ['THE TECHNIQUES COLLIDE!', 'MOVE MEETS MOVE!', 'A HEAD-ON CLASH!', 'SHOCKWAVES ACROSS THE ARENA!', 'NEITHER ONE GIVES AN INCH!', 'THE AIR ITSELF SPLITS!'];
const KNOCKDOWN = ['DOWN! THEY\'RE DOWN!', 'OFF THEIR FEET!', 'THAT PUT THEM ON THE FLOOR!', 'FLAT ON THE CANVAS!', 'THEY HIT THE GROUND HARD!', 'TIMBER!'];
const IMPACT: Record<string, string[]> = {
  glancing: ['grazes', 'clips', 'nicks', 'brushes', 'skims'],
  solid: ['catches', 'tags', 'connects with', 'cracks', 'stings', 'finds', 'snaps into'],
  heavy: ['rocks', 'hammers', 'slams into', 'staggers', 'crushes', 'blasts', 'rattles'],
  devastating: ['DEMOLISHES', 'FLATTENS', 'OBLITERATES THE GUARD OF', 'DETONATES ON', 'BURIES'],
};
const COUNTER = ['THAT COUNTER CHANGES EVERYTHING!', 'Punished on the spot!', 'COUNTER! What timing!', 'Made them pay instantly!', 'Waited for it — and BANG!', 'Turned defence into offence!'];
const DEFEAT = ['AND THAT\'S IT FOR', 'LIGHTS OUT FOR', 'IT\'S ALL OVER FOR'];
const STILL = ['WAIT — STILL STANDING!', 'REFUSING TO FALL!', 'NOT. GOING. DOWN.', "THEY JUST WON'T STAY DOWN!", 'PURE STUBBORNNESS!', 'HOW ARE THEY STILL UP?!'];

export function narrate(input: BattleInput, result: BattleResult, ctx: NarrationContext): NarrationLine[] {
  const rng = new Rng(deriveSeed('narration', input.seed, input.battleId));
  const fighters = new Map(input.sides.flatMap((s) => [...s.fighters, ...(s.reserves ?? [])]).map((f) => [f.charId, f]));
  const nm = (id?: string) => (id ? fighters.get(id)?.name ?? 'Someone' : 'Someone');
  const temp = (id?: string) => (id ? fighters.get(id)?.temperament : undefined);
  const lines: NarrationLine[] = [];
  const used = new Set<string>();
  const usedLooks = new Set<string>();
  const pick = (arr: string[]) => {
    const fresh = arr.filter((x) => !used.has(x));
    const v = rng.pick(fresh.length ? fresh : arr);
    used.add(v);
    return v;
  };
  const say = (e: BattleEvent, text: string, tone: NarrationLine['tone'] = 'calm', speaker = 'narrator') =>
    lines.push({ eventId: e.id, seq: e.seq, speaker, text, tone });
  const dialogue = (e: BattleEvent, id: string | undefined, kind: keyof (typeof DIALOGUE)['stoic']) => {
    const t = temp(id);
    if (!t || !id) return;
    say(e, pick(DIALOGUE[t][kind]), 'dialogue', nm(id));
  };

  const allSnaps = [...fighters.values()];
  let bigHits = 0;

  for (const e of result.events) {
    switch (e.type) {
      case 'intro': {
        const [a, b] = input.sides;
        say(e, `Welcome to ${ctx.stageName}! ${ctx.playerNames[a.playerId]} versus ${ctx.playerNames[b.playerId]} in ${e.context?.env}!`, 'hype');
        const rv = input.rivalry;
        if (rv && rv.encounters > 0) {
          say(e, `These two have met ${rv.encounters} time${rv.encounters > 1 ? 's' : ''} before — the rivalry stands at ${rv.winsA}–${rv.winsB}!`, 'tense');
        }
        for (const f of allSnaps) {
          if (ctx.previousLoss[f.charId]) { say(e, `${f.name} lost last time out. Redemption is on the line.`, 'tense'); break; }
        }
        for (const f of allSnaps) if (f.injuries.length) { say(e, `${f.name} enters carrying a ${f.injuries[0].name.toLowerCase()}.`, 'tense'); break; }
        const first = input.sides[0].fighters[0];
        dialogue(e, first.charId, 'intro');
        dialogue(e, input.sides[1].fighters[0].charId, 'intro');
        break;
      }
      case 'prebattle':
        say(e, e.explanation, e.context?.backfire ? 'shock' : 'tense');
        if (e.context?.backfire) say(e, 'OH NO — THAT TAUNT JUST WOKE A MONSTER!', 'shock');
        break;
      case 'synergy':
        say(e, `Team synergy online: ${e.context?.synergy}!${e.context?.hidden ? ' A HIDDEN combination!' : ''}`, 'hype');
        break;
      case 'opening':
        say(e, pick(OPENERS), 'hype');
        break;
      case 'attack': {
        if (e.context?.environmental) { say(e, `${nm(e.target)} is caught in it!`, 'tense'); break; }
        const impact = String(e.context?.impact ?? 'solid');
        const verb = rng.pick(IMPACT[impact] ?? IMPACT.solid);
        const big = impact === 'heavy' || impact === 'devastating' || e.crit;
        const move = e.ability ? `${getAbility(e.ability).name} ` : '';
        // Plain attacks are described in the fighter's own style and element.
        const me = e.actor ? fighters.get(e.actor) : undefined;
        const look = me ? strikeLook(rng, me.archetype, me.tags, usedLooks) : '';
        if (e.crit) { say(e, move ? `${pick(CRIT)} ${nm(e.actor)}'s ${move}${verb} ${nm(e.target)}!` : (/ (with|into|on|of)$/.test(verb) ? `${pick(CRIT)} With ${look || 'a huge strike'}, ${nm(e.actor)} ${verb} ${nm(e.target)}!` : `${pick(CRIT)} ${nm(e.actor)} ${verb} ${nm(e.target)} with ${look || 'a huge strike'}!`), 'hype'); bigHits++; }
        else if (e.response === 'clash') say(e, `${nm(e.actor)} pushes through the clash and ${verb} ${nm(e.target)}!`, 'hype');
        else if (e.action === 'combo' || e.action === 'assist') say(e, `${nm(e.actor)} piles on and ${verb} ${nm(e.target)}!`, 'hype');
        else if (move) say(e, `${nm(e.actor)}'s ${move}${verb} ${nm(e.target)}${big ? '!' : '.'}`, big ? 'hype' : 'calm');
        else if (rng.chance(0.6) || big) say(e, `${look && / (with|into|on|of)$/.test(verb) ? `With ${look}, ` : ''}${nm(e.actor)} ${verb} ${nm(e.target)}${look && !/ (with|into|on|of)$/.test(verb) ? ` with ${look}` : ''}${big ? '!' : '.'}`, big ? 'hype' : 'calm');
        if (e.target && e.hpAfter !== undefined && e.hpBefore !== undefined) {
          const max = result.fighters.find((f) => f.charId === e.target)?.maxHp ?? 1;
          if (e.hpBefore / max > 0.5 && e.hpAfter / max <= 0.5 && rng.chance(0.5)) dialogue(e, e.target, 'hurt');
        }
        break;
      }
      case 'rival':
        say(e, `A RIVALRY STRAIGHT FROM THE SERIES: ${String(e.context?.title).toUpperCase()}!`, 'shock');
        if (e.actor) say(e, String(e.context?.lineA), 'dialogue', nm(e.actor));
        if (e.target) say(e, String(e.context?.lineB), 'dialogue', nm(e.target));
        break;
      case 'call': {
        const side = Number(e.context?.side) as 0 | 1;
        say(e, `${ctx.playerNames[input.sides[side].playerId]}'s corner: "${e.context?.shout}"`, 'hype');
        break;
      }
      case 'banter': {
        const k = String(e.context?.kind);
        say(e, String(e.context?.line), 'dialogue', nm(e.actor));
        if (k === 'fired') say(e, `Uh oh. That only made ${nm(e.actor)} angrier!`, 'tense');
        else if (k === 'rattled') say(e, `That got under ${nm(e.actor)}'s skin!`, 'tense');
        else if (k === 'ignore' && rng.chance(0.5)) say(e, `${nm(e.actor)} doesn't even blink.`, 'calm');
        break;
      }
      case 'twist':
        say(e, String(e.context?.title), 'shock');
        say(e, e.explanation.replace(String(e.context?.title), '').trim(), 'tense');
        break;
      case 'reinforcement':
        if (e.context?.backfire) { say(e, `OH NO! ${nm(e.actor).toUpperCase()} CHARGES IN AND CRASHES RIGHT INTO THEIR OWN TEAMMATE!`, 'shock'); break; }
        say(e, e.context?.jumped ? `${nm(e.actor).toUpperCase()} JUMPS IN ON THEIR OWN!` : `REINFORCEMENTS! ${nm(e.actor).toUpperCase()} COMES OFF THE BENCH!`, 'shock');
        if (e.ability) { const a = getAbility(e.ability); if (a.look) say(e, a.look, 'tense'); }
        break;
      case 'block':
        if (rng.chance(0.6)) say(e, `${pick(BLOCK)} ${nm(e.target)} stops ${nm(e.actor)}'s attack cold.`, 'calm');
        break;
      case 'guard_break':
        say(e, `THE GUARD IS BROKEN! ${nm(e.target)} is wide open!`, 'shock');
        break;
      case 'parry':
        say(e, `${pick(PARRY)} ${nm(e.actor)} deflects ${nm(e.target)}.`, 'hype');
        break;
      case 'clash': {
        const mine = e.ability ? getAbility(e.ability).name : 'the attack';
        const theirs = typeof e.context?.counterMove === 'string' ? getAbility(e.context.counterMove).name : 'a counter';
        say(e, e.context?.rival ? `THE RIVALS' SIGNATURE MOVES MEET! ${mine} against ${theirs}!` : `${pick(CLASH)} ${mine} against ${theirs}!`, 'shock');
        const w = e.context?.winner as string;
        say(e, w ? `${nm(w)} wins the clash!` : 'Neither gives an inch. They cancel out!', 'tense');
        break;
      }
      case 'injury':
        if (e.injury) say(e, `${nm(e.target)} is hurt: ${e.injury.label.toLowerCase()}!`, e.injury.severity === 2 ? 'shock' : 'tense');
        break;
      case 'knockdown':
        say(e, `${pick(KNOCKDOWN)} ${nm(e.actor)} drops ${nm(e.target)}!`, 'shock');
        break;
      case 'get_up':
        say(e, e.explanation, 'tense');
        if (rng.chance(0.5)) dialogue(e, e.actor, 'hurt');
        break;
      case 'miss':
        if (rng.chance(0.7)) say(e, `${pick(DODGE)} ${nm(e.target)} evades ${nm(e.actor)}.`, 'calm');
        break;
      case 'counter':
        say(e, `${pick(COUNTER)} ${nm(e.actor)} punishes ${nm(e.target)}${e.crit ? ' — AND IT\'S A CRITICAL' : ''}!`, 'shock');
        break;
      case 'ability': {
        const a = e.ability ? getAbility(e.ability) : null;
        if (!a) break;
        say(e, `${nm(e.actor).toUpperCase()} ACTIVATES ${a.name.toUpperCase()}!`, 'hype');
        if (a.look) say(e, a.look, 'tense');
        if (a.shout && rng.chance(0.6)) say(e, a.shout, 'dialogue', nm(e.actor));
        break;
      }
      case 'desperation': {
        const a = e.ability ? getAbility(e.ability) : null;
        say(e, `Backed into a corner, ${nm(e.actor)} unleashes ${a?.name ?? 'a desperation move'}!`, 'shock');
        if (a?.look) say(e, a.look, 'tense');
        if (a?.shout) say(e, a.shout, 'dialogue', nm(e.actor));
        break;
      }
      case 'heal':
        if (e.context?.revive) break; // announced by its twist
        if (e.context?.mend && e.actor) { say(e, `${nm(e.actor)} patches up ${nm(e.target)}! Back in it!`, 'tense'); break; }
        if ((e.heal ?? 0) > 0) say(e, `${nm(e.target)} finds a second wind.`, 'calm');
        break;
      case 'status':
        if (e.status?.applied && (e.status.type === 'stun' || e.status.type === 'freeze') && !e.target && e.actor) say(e, `${nm(e.actor)} can't move!`, 'tense');
        else if (e.status?.applied && e.target && e.status.type !== 'shield' && rng.chance(0.6)) say(e, `${nm(e.target)} is hit with ${e.status.type}!`, 'tense');
        else if (e.status?.type === 'shield' && e.target) say(e, `A barrier shimmers around ${nm(e.target)}.`, 'calm');
        break;
      case 'status_tick':
        if (rng.chance(0.4)) say(e, e.explanation, 'calm');
        break;
      case 'environment':
        say(e, `THE ARENA ITSELF JOINS THE FIGHT! ${e.explanation}`, 'shock');
        break;
      case 'momentum':
        if (rng.chance(0.7)) say(e, rng.pick(['The momentum has shifted!', 'You can feel the tide turning!', 'The crowd senses it — the pressure has flipped!']), 'tense');
        break;
      case 'adapt':
        say(e, `${nm(e.actor)} isn't just fighting — they're studying. They've adapted to ${nm(e.target)}'s rhythm!`, 'tense');
        break;
      case 'critical_moment':
        say(e, `${nm(e.target)} is hanging by a thread! One more clean hit could end it!`, 'tense');
        break;
      case 'awakening':
        say(e, `WHAT IS THIS?! ${nm(e.actor).toUpperCase()} IS AWAKENING!`, 'shock');
        dialogue(e, e.actor, 'awaken');
        break;
      case 'transform':
        say(e, rng.pick([`${nm(e.actor).toUpperCase()} TRANSFORMS! ${String(e.context?.form ?? '').toUpperCase()}!`, `The air changes. ${nm(e.actor)} enters ${e.context?.form}!`, `Here it comes: ${e.context?.form}! ${nm(e.actor)} is a different fighter now!`]), 'shock');
        dialogue(e, e.actor, 'awaken');
        break;
      case 'secret':
        say(e, e.context?.why === 'ally' ? `${nm(e.actor)} saw their teammate fall. No more holding back: ${e.action}!` : e.context?.why === 'last' ? `${nm(e.actor)} is the last one standing, and pulls out a move nobody has seen: ${e.action}!` : `${nm(e.actor)} was saving this one: ${e.action}!`, 'shock');
        break;
      case 'iron_will':
        say(e, `${pick(STILL)} ${nm(e.target)} survives on pure Iron Will!`, 'shock');
        break;
      case 'defeat':
        say(e, e.context?.how === 'stoppage' ? `The referee steps in! ${nm(e.target)} can't continue!`
          : e.context?.how === 'collapse' ? `${nm(e.target)} collapses. ${pick(DEFEAT)} ${nm(e.target).toUpperCase()}!`
            : `KNOCKOUT! ${pick(DEFEAT)} ${nm(e.target).toUpperCase()}!`, 'shock');
        dialogue(e, e.target, 'lose');
        break;
      case 'replacement':
        say(e, e.action === 'tag' ? `TAG! ${nm(e.actor)} switches in to cover ${nm(e.target)}!` : `${nm(e.actor)} steps into the frontline!`, 'tense');
        break;
      case 'protect':
        if (e.action === 'intercept') say(e, `${nm(e.actor)} throws themselves in front of ${nm(e.target)}!`, 'hype');
        else if (rng.chance(0.5)) say(e, `${nm(e.actor)} stands guard over ${nm(e.target)}.`, 'calm');
        break;
      case 'assist':
        say(e, `${nm(e.actor)} jumps in to back up the attack!`, 'hype');
        break;
      case 'combo':
        if (e.context?.duo) { say(e, `${String(e.context.duo).toUpperCase()}!`, 'shock'); say(e, String(e.context.look), 'tense'); }
        else say(e, `COMBINATION ATTACK! ${nm(e.actor)} and ${nm(e.context?.partner as string)} strike as one!`, 'hype');
        break;
      case 'guard':
        if (rng.chance(0.25)) say(e, `${nm(e.actor)} resets, guard up.`, 'calm');
        break;
      case 'recover':
        say(e, `${nm(e.actor)} backs off to catch their breath.`, 'calm');
        break;
      case 'final_exchange':
        say(e, 'THE FINAL EXCHANGE BEGINS!', 'shock');
        say(e, e.explanation, 'tense');
        break;
      case 'conclusion':
        say(e, e.context?.decision === 'judges' ? 'TIME! We go to the judges\' scorecards!' : 'IT\'S OVER!', 'hype');
        break;
      case 'verdict': {
        const winSide = input.sides[result.winnerSide];
        const winner = winSide.fighters[0];
        const minPct = Math.min(...result.fighters.filter((f) => f.side === result.winnerSide && !f.defeated).map((f) => f.minHpPct));
        say(e, `${ctx.playerNames[winSide.playerId]} WINS${result.decision === 'judges' ? ' ON THE SCORECARDS' : result.decision === 'stoppage' ? ' BY STOPPAGE' : ''}!`, 'hype');
        const downs = result.fighters.filter((f) => f.side === result.winnerSide).reduce((n, f) => n + f.knockdowns, 0);
        if (minPct < 0.15 || downs > 0) say(e, downs > 0 ? 'KNOCKED DOWN AND STILL WON! WHAT A COMEBACK!' : 'WHAT AN INCREDIBLE COMEBACK!', 'shock');
        else if (bigHits >= 3) say(e, 'A brutal, high-impact battle from start to finish!', 'hype');
        dialogue(e, winner.charId, 'win');
        break;
      }
    }
  }
  return lines;
}

/** Verifies narration is grounded in the event log. Returns problems found. */
export function validateNarration(lines: NarrationLine[], input: BattleInput, result: BattleResult, ctx?: { stageName?: string }): string[] {
  // Fighter names, move names, move descriptions and the stage name may contain digits ("36 Pound Phoenix", "Round 1").
  const fixed = new Set<string>();
  for (const f of input.sides.flatMap((x) => [...x.fighters, ...(x.reserves ?? [])])) fixed.add(f.name);
  for (const e of result.events) for (const k of ['title', 'lineA', 'lineB', 'shout', 'duo', 'look', 'line'] as const) if (typeof e.context?.[k] === 'string') fixed.add(e.context[k] as string);
  for (const f of input.sides.flatMap((x) => x.fighters)) for (const id of f.abilities) {
    const a = getAbility(id);
    fixed.add(a.name);
    if (a.look) fixed.add(a.look);
    if (a.shout) fixed.add(a.shout);
  }
  if (ctx?.stageName) fixed.add(ctx.stageName);
  const ordered = [...fixed].sort((x, y) => y.length - x.length);
  const strip = (t: string) => ordered.reduce((acc, f) => acc.split(f).join(' ').split(f.toUpperCase()).join(' '), t);
  const problems: string[] = [];
  const byId = new Map(result.events.map((e) => [e.id, e]));
  const names = new Set(input.sides.flatMap((s) => [...s.fighters, ...(s.reserves ?? [])].map((f) => f.name)));
  for (const l of lines) {
    const e = byId.get(l.eventId);
    if (!e) { problems.push(`Line references unknown event ${l.eventId}`); continue; }
    if (l.speaker !== 'narrator' && !names.has(l.speaker)) problems.push(`Unknown speaker ${l.speaker}`);
    const nums = (strip(l.text).match(/\b\d+\b/g) ?? []).map(Number);
    const allowed = new Set<number>([e.damage, e.heal, e.hpAfter, e.hpBefore, e.turn, e.staminaDelta].filter((x): x is number => typeof x === 'number'));
    for (const v of Object.values(e.context ?? {})) if (typeof v === 'number') allowed.add(v);
    for (const f of input.sides.flatMap((s) => s.fighters)) allowed.add(f.price);
    if (input.rivalry) [input.rivalry.encounters, input.rivalry.winsA, input.rivalry.winsB].forEach((n) => allowed.add(n));
    if (e.type === 'intro' || e.type === 'verdict' || e.type === 'get_up' || e.type === 'twist' || e.type === 'environment' || e.type === 'prebattle' || e.type === 'synergy' || e.type === 'final_exchange' || e.type === 'status_tick' || e.type === 'critical_moment') {
      for (const n of e.explanation.match(/\b\d+\b/g) ?? []) allowed.add(Number(n));
    }
    for (const n of nums) if (!allowed.has(n)) problems.push(`Line "${l.text}" cites ${n}, which is not in event ${e.id}`);
  }
  return problems;
}
