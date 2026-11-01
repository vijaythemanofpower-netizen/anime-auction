// Event-driven combat simulation. The engine is the single source of truth
// for battle outcomes: given the same BattleInput (including seed and engine
// version) it produces an identical event log and result.
import type {
  Ability, BattleEvent, BattleEventType, BattleInjury, BattleInput, BattleResult, BodyPart, CallKind, CoachCall, DefenseResponse, StatusType, Strategy, Synergy,
  Tag,
} from '../types';
import { CALLS_PER_BATTLE, ENGINE_VERSION } from '../types';
import type { FighterSnapshot } from '../types';
import { arenaFit, fitEdge } from '../arenaFit';
import type { KitTrigger } from '../data/kits';
import { Rng, deriveSeed, hashString } from '../rng';
import { duoOf, rivalryBetween, type Rivalry } from '../data/rivals';
import { EAGERNESS, reactionTo } from '../data/banter';
import { truePower } from '../hidden';
import { writeTaunt, type TauntContext, type TauntKind } from '../data/flavor';
import { ARCHETYPES, TEMPERAMENTS } from '../data/archetypes';
import { ABILITIES, BASIC_ATTACK, getAbility } from '../data/abilities';
import { elementMultiplier, getEnvironment, getSynergy, type Environment } from '../data/world';
import { type CombatFighter, INJURY_LIMIT, createFighter, hasStatus, hpPct, injuryLoad, injuryPenalty } from './fighter';


type PlotKind = 'intruder' | 'shift' | 'sealed' | 'flashback' | 'suddendeath' | 'betrayal';
/** Share of fights that get a plot twist. */
const PLOT_CHANCE = 0.35;
export const MAX_ACTIONS = 320;

const STRATEGY: Record<Strategy, { dmg: number; def: number; attackW: number; abilityW: number; guardW: number; counter: number; crit: number; cost: number; speed: number }> = {
  aggressive: { dmg: 1.1, def: 0.92, attackW: 1.35, abilityW: 1.05, guardW: 0.5, counter: 0, crit: 0.02, cost: 1, speed: 1.02 },
  defensive: { dmg: 0.92, def: 1.15, attackW: 0.85, abilityW: 0.95, guardW: 1.7, counter: 0.04, crit: 0, cost: 1, speed: 0.98 },
  balanced: { dmg: 1, def: 1, attackW: 1, abilityW: 1, guardW: 1, counter: 0, crit: 0, cost: 1, speed: 1 },
  counter: { dmg: 0.97, def: 1.06, attackW: 0.85, abilityW: 0.9, guardW: 1.5, counter: 0.15, crit: 0, cost: 1, speed: 0.97 },
  control: { dmg: 0.97, def: 1, attackW: 0.8, abilityW: 1.45, guardW: 0.9, counter: 0, crit: 0, cost: 0.9, speed: 1 },
  highrisk: { dmg: 1.2, def: 0.85, attackW: 1.4, abilityW: 1.2, guardW: 0.25, counter: 0, crit: 0.08, cost: 1.2, speed: 1.03 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface StrikeOpts { noCounter?: boolean; accBonus?: number; label?: string; isCounter?: boolean }

/** What the corner shouts for each call. */
const CALL_SHOUT: Record<Exclude<CallKind, 'none'>, string> = {
  all_out: 'GO ALL OUT!', defend: 'GUARD UP! WEATHER IT!', ultimate: 'USE IT NOW!', callback: 'FALL BACK!', reinforce: 'SEND IN BACKUP!',
  taunt: 'GET IN THEIR HEAD!', focus: 'EVERYONE ON THE WEAK ONE!', transform: 'TRANSFORM NOW!', secret: 'NO MORE HOLDING BACK!',
};
interface Order { kind: 'all_out' | 'defend'; left: number }

const INJURY_LABELS: Record<BodyPart, [string, string]> = {
  head: ['Dazed', 'Concussed'], arm: ['Bruised arm', 'Broken arm'], leg: ['Twisted ankle', 'Damaged leg'], torso: ['Cracked rib', 'Broken ribs'],
};
const INJURY_EFFECT: Record<BodyPart, string> = {
  head: 'Easier to knock out, aim suffers.', arm: 'Weaker strikes.', leg: 'Slower, harder to dodge.', torso: 'Breath comes short; stamina recovers slower.',
};

interface SideEffects { damageMult: number; defenseMult: number; speedMult: number; healMult: number; critBonus: number; staminaRegen: number; element: Synergy['effect']['elementDamage'][] }

type Option =
  | { kind: 'ability'; ability: Ability; weight: number }
  | { kind: 'guard'; weight: number }
  | { kind: 'recover'; weight: number }
  | { kind: 'protect'; ally: CombatFighter; weight: number }
  | { kind: 'combo'; partner: CombatFighter; weight: number }
  | { kind: 'tag'; partner: CombatFighter; weight: number };

export class BattleSim {
  private rng: Rng;
  private events: BattleEvent[] = [];
  private fighters: CombatFighter[] = [];
  private env: Environment;
  private sideFx: [SideEffects, SideEffects];
  private momentum = 0; // positive favours side 0
  private turn = 0;
  private finalExchange = false;
  private comboCooldown: [number, number] = [0, 0];
  private hpLeadSign = 0;
  private turningPoint: string | null = null;
  private swings = 0;
  private lastHow: 'knockout' | 'finisher' | 'stoppage' | 'collapse' | null = null;
  // Corner calls
  private coachRng: Rng;
  private corners: [number, number] = [0, 0];
  private callsUsed: [number, number] = [0, 0];
  private lastCornerTurn: [number, number] = [-99, -99];
  private reinforced: [boolean, boolean] = [false, false];
  private orders: [Order | null, Order | null] = [null, null];
  private forceUltimate = new Set<string>();
  private pendingCorners: Array<{ side: 0 | 1; focus: string; reason: string; reserve?: string }> = [];
  // Banter, jump-ins and twists draw from their own random stream.
  private flavorRng: Rng;
  /** Story events that change some fights midway (their own dice, so other rolls stay the same). */
  private plotRng: Rng;
  /** Health multiplier from the matchup (see setFightLength). */
  private lengthMult = 1;
  private plot: { kind: PlotKind; at: number; done: boolean } | null = null;
  private banterAt = new Map<string, number>();
  /** Lines already said this fight, and each fighter's last named move, for fresh trash talk. */
  private saidLines = new Set<string>();
  private lastMove = new Map<string, string>();
  private usedReserves = new Set<string>();
  private lastJumpTurn: [number, number] = [-99, -99];
  private twists = new Set<string>();
  private secondWind = new Set<string>();
  // Rivalries from the series
  private rivals: Rivalry[] = [];
  private pendingCounter: Ability | null = null;

  constructor(private input: BattleInput) {
    this.rng = new Rng(input.seed);
    this.env = getEnvironment(input.environmentId);
    for (const side of input.sides) for (const f of side.fighters) this.fighters.push(createFighter(f));
    this.setFightLength();
    this.sideFx = [this.buildSideFx(0), this.buildSideFx(1)];
    this.coachRng = new Rng(deriveSeed('coach', input.seed));
    this.flavorRng = new Rng(deriveSeed('flavor', input.seed));
    this.plotRng = new Rng(deriveSeed('plot', input.seed));
    if (this.plotRng.chance(PLOT_CHANCE)) {
      const kinds: PlotKind[] = ['intruder', 'shift', 'sealed', 'flashback', 'suddendeath', ...(input.mode !== 'solo' ? ['betrayal' as const] : [])];
      this.plot = { kind: this.plotRng.pick(kinds), at: this.plotRng.int(16, 44), done: false };
    }
  }

  private buildSideFx(side: 0 | 1): SideEffects {
    const fx: SideEffects = { damageMult: 1, defenseMult: 1, speedMult: 1, healMult: 1, critBonus: 0, staminaRegen: 0, element: [] };
    for (const id of this.input.sides[side].synergies) {
      const s = getSynergy(id);
      if (!s) continue;
      const e = s.effect;
      if (e.damageMult) fx.damageMult *= e.damageMult;
      if (e.defenseMult) fx.defenseMult *= e.defenseMult;
      if (e.speedMult) fx.speedMult *= e.speedMult;
      if (e.healMult) fx.healMult *= e.healMult;
      if (e.critBonus) fx.critBonus += e.critBonus;
      if (e.staminaRegen) fx.staminaRegen += e.staminaRegen;
      if (e.elementDamage) fx.element.push(e.elementDamage);
    }
    return fx;
  }

  // ---------------------------------------------------------------- events

  private emit(type: BattleEventType, explanation: string, extra: Partial<BattleEvent> = {}): BattleEvent {
    if (extra.actor && extra.ability && extra.ability !== BASIC_ATTACK.id) this.lastMove.set(extra.actor, getAbility(extra.ability).name);
    const ev: BattleEvent = {
      id: `${this.input.battleId}-${this.events.length + 1}`,
      battleId: this.input.battleId,
      seq: this.events.length + 1,
      turn: this.turn,
      type,
      explanation,
      environment: this.env.id,
      momentum: [Math.round(this.momentum), Math.round(-this.momentum)],
      ...extra,
    };
    // Guard readings let the arena show each fighter's guard as it changes.
    const byId = (id?: string) => (id ? this.fighters.find((f) => f.id === id) : undefined);
    const act = byId(ev.actor), tgt = byId(ev.target);
    if (act) ev.actorGuard = Math.round(act.guard);
    if (tgt && ev.guardAfter === undefined) ev.guardAfter = Math.round(tgt.guard);
    this.events.push(ev);
    return ev;
  }

  private name(f: CombatFighter) { return f.snap.name; }
  private alive(side: 0 | 1) { return this.fighters.filter((f) => f.side === side && !f.defeated); }
  private strat(f: CombatFighter) { return STRATEGY[this.input.sides[f.side].strategy]; }

  private shiftMomentum(side: 0 | 1, amount: number, reason: string) {
    const before = this.momentum;
    this.momentum = clamp(this.momentum + (side === 0 ? amount : -amount), -100, 100);
    const flipped = Math.sign(before) !== Math.sign(this.momentum) && Math.abs(this.momentum) >= 10;
    if (flipped || Math.abs(this.momentum - before) >= 18) {
      this.swings++;
      const leader = this.momentum > 0 ? 0 : 1;
      this.emit('momentum', `Momentum swings to side ${leader === 0 ? 'A' : 'B'} after ${reason}.`, {
        context: { side: leader, reason, value: Math.round(Math.abs(this.momentum)) },
      });
    }
  }

  // ------------------------------------------------------------- simulate

  run(): BattleResult {
    const inp = this.input;
    const names = (s: 0 | 1) => inp.sides[s].fighters.map((f) => f.name).join(' & ');
    this.emit('intro', `${inp.mode.toUpperCase()} battle in ${this.env.name}: ${names(0)} vs ${names(1)}.`, {
      context: { mode: inp.mode, env: this.env.name, rivalry: inp.rivalry?.intensity ?? 0 },
    });
    this.rollForm();
    this.applyMental(0);
    this.applyMental(1);
    for (const side of [0, 1] as const) for (const id of inp.sides[side].synergies) {
      const s = getSynergy(id);
      if (s) this.emit('synergy', `${s.name} is active for side ${side === 0 ? 'A' : 'B'}: ${s.description}`, { context: { side, synergy: s.name, hidden: s.hidden } });
    }
    if (inp.rivalry && inp.rivalry.intensity >= 2) {
      for (const f of this.fighters) f.mods.dmg += 0.03;
    }
    for (const a of this.fighters.filter((f) => f.side === 0)) for (const b of this.fighters.filter((f) => f.side === 1)) {
      const rv = rivalryBetween(a.id, b.id);
      if (!rv) continue;
      this.rivals.push(rv);
      a.mods.dmg += 0.05; b.mods.dmg += 0.05;
      const first = rv.a === a.id ? a : b, second = first === a ? b : a;
      this.emit('rival', `A legendary rivalry: ${rv.title}. ${this.name(a)} and ${this.name(b)} bring out the best in each other (+5% power each).`, {
        actor: first.id, target: second.id, context: { title: rv.title, lineA: rv.lines[0], lineB: rv.lines[1] },
      });
    }
    this.emit('opening', 'The fighters take their positions. The opening exchange begins.');

    while (this.turn < MAX_ACTIONS) {
      const winner = this.checkWinner();
      if (winner !== null) return this.finish(winner, 'ko');
      const actor = this.nextActor();
      this.turn++;
      this.takeTurn(actor);
      this.momentum *= 0.985;
      this.environmentTick();
      if (this.turn % 16 === 0) for (const side of [0, 1] as const) {
        const focus = this.alive(side).sort((x, y) => hpPct(x) - hpPct(y))[0];
        if (focus) this.queueCorner(side, focus, 'check');
      }
      this.processCorners();
      this.worldTwists();
    }
    const winner = this.checkWinner();
    if (winner !== null) return this.finish(winner, 'ko');
    return this.finish(this.judgesDecision(), 'judges');
  }

  /** Battle form: every fighter has good and bad days (deterministic from the seed). */
  private rollForm() {
    for (const f of this.fighters) {
      const form = Math.round(this.rng.range(0.88, 1.12) * 100) / 100;
      f.form = form;
      for (const k of ['attack', 'defense', 'speed', 'technique'] as const) f.eff[k] = Math.round(f.eff[k] * form * 10) / 10;
      if (form >= 1.06) this.emit('prebattle', `${f.snap.name} is in top form today (+${Math.round((form - 1) * 100)}% to attack, defense, speed and technique).`, { actor: f.id, action: 'form', context: { form, side: f.side } });
      else if (form <= 0.94) this.emit('prebattle', `${f.snap.name} is having an off day (${Math.round((form - 1) * 100)}% to attack, defense, speed and technique).`, { actor: f.id, action: 'form', context: { form, side: f.side } });
    }
  }

  private applyMental(side: 0 | 1) {
    const me = this.input.sides[side];
    const foes = this.fighters.filter((f) => f.side !== side);
    const mine = this.fighters.filter((f) => f.side === side);
    const foeComposed = this.input.sides[side === 0 ? 1 : 0].mental === 'composure';
    const foeSilent = this.input.sides[side === 0 ? 1 : 0].mental === 'silent';
    const label = `side ${side === 0 ? 'A' : 'B'}`;
    switch (me.mental) {
      case 'intimidate': {
        const affected = foes.filter((f) => !foeComposed && !TEMPERAMENTS[f.snap.temperament].resistsMind);
        for (const f of affected) f.mods.intimidated = 5;
        this.emit('prebattle', `${label} tries to intimidate. ${affected.length ? affected.map((f) => f.snap.name).join(', ') + ' falter (-6% damage for 5 actions).' : 'Nobody flinches.'}`, { action: 'intimidate', context: { side, affected: affected.length } });
        break;
      }
      case 'taunt': {
        const parts: string[] = [];
        for (const f of foes) {
          if (foeComposed || foeSilent) continue;
          const t = TEMPERAMENTS[f.snap.temperament];
          if (t.provokeBonus > 0 && !f.snap.traits.includes('Short Fuse')) {
            f.mods.dmg += t.provokeBonus;
            parts.push(`${f.snap.name} feeds on it (+${Math.round(t.provokeBonus * 100)}% damage) — the taunt backfires!`);
          } else if (!t.resistsMind || f.snap.traits.includes('Short Fuse')) {
            f.mods.provokedTurns = 4;
            parts.push(`${f.snap.name} is rattled (-8% accuracy for 4 actions).`);
          }
        }
        this.emit('prebattle', `${label} taunts the opposition. ${parts.join(' ') || 'It has no effect.'}`, { action: 'taunt', context: { side, backfire: parts.some((p) => p.includes('backfires')) } });
        break;
      }
      case 'provoke': {
        const target = foes.slice().sort((a, b) => b.eff.attack - a.eff.attack)[0];
        const bait = mine.find((f) => f.position === 'front') ?? mine[0];
        if (target && bait && !foeComposed) {
          const t = TEMPERAMENTS[target.snap.temperament];
          target.forcedTarget = { id: bait.id, turns: 3 };
          if (t.provokeBonus > 0) target.mods.dmg += t.provokeBonus / 2;
          this.emit('prebattle', `${bait.snap.name} provokes ${target.snap.name}, who will focus on them for 3 actions${t.provokeBonus > 0 ? ' — with extra fury' : ''}.`, { actor: bait.id, target: target.id, action: 'provoke', context: { side } });
        } else {
          this.emit('prebattle', `${label} attempts a provocation, but the opponent stays composed.`, { action: 'provoke', context: { side } });
        }
        break;
      }
      case 'analyze':
        for (const f of mine) { f.mods.earlyDodgeTurns = 4; for (const foe of foes) f.adaptation[foe.id] = 0.04; }
        this.emit('prebattle', `${label} studies the opponents carefully (+5% dodge for 4 actions, early adaptation).`, { action: 'analyze', context: { side } });
        break;
      case 'composure':
        for (const f of mine) f.mods.def += 0.03;
        this.emit('prebattle', `${label} maintains composure, immune to mind games (+3% defense).`, { action: 'composure', context: { side } });
        break;
      case 'silent':
        this.emit('prebattle', `${label} stays silent. Taunts will not reach them.`, { action: 'silent', context: { side } });
        break;
    }
  }

  private nextActor(): CombatFighter {
    const alive = this.fighters.filter((f) => !f.defeated);
    for (let guard = 0; guard < 1000; guard++) {
      let best: CombatFighter | null = null;
      for (const f of alive) if (f.gauge >= 100 && (!best || f.gauge > best.gauge)) best = f;
      if (best) { best.gauge -= 100; return best; }
      for (const f of alive) {
        let spd = f.eff.speed * this.env.speedMult * this.sideFx[f.side].speedMult * this.strat(f).speed;
        if (hasStatus(f, 'haste')) spd *= 1 + hasStatus(f, 'haste')!.magnitude;
        if (hasStatus(f, 'freeze')) spd *= 0.5;
        spd *= 1 - injuryPenalty(f, 'speed');
        if (f.snap.traits.includes('Overthinker') && f.actionsTaken < 3) spd *= 0.8;
        f.gauge += 40 + spd * 0.3 + this.rng.range(0, 12);
      }
    }
    return alive[0];
  }

  private takeTurn(f: CombatFighter) {
    f.actionsTaken++;
    f.res.actions++;
    f.guarding = false;
    f.protecting = null;
    if (f.stunImmune > 0) f.stunImmune--;
    for (const k of Object.keys(f.cooldowns)) if (f.cooldowns[k] > 0) f.cooldowns[k]--;
    if (this.comboCooldown[f.side] > 0) this.comboCooldown[f.side]--;

    // Status ticks
    for (const s of f.statuses) {
      if (s.duration <= 0) continue;
      if (s.type === 'burn' || s.type === 'bleed') {
        const dmg = Math.max(1, Math.round(f.maxHp * s.magnitude));
        const before = f.hp;
        this.applyDamage(f, dmg);
        this.emit('status_tick', `${s.type === 'burn' ? 'The burns wear' : 'The bleeding wears'} ${this.name(f)} down.`, { target: f.id, damage: dmg, hpBefore: before, hpAfter: f.hp, status: { type: s.type, applied: true, duration: s.duration } });
        if (f.defeated) { this.onDefeat(f, null, 'collapse'); return; }
      } else if (s.type === 'regen') {
        const h = Math.round(f.maxHp * s.magnitude);
        const before = f.hp;
        f.hp = Math.min(f.maxHp, f.hp + h);
        this.emit('status_tick', `${this.name(f)}'s body knits itself back together.`, { target: f.id, heal: f.hp - before, hpBefore: before, hpAfter: f.hp, status: { type: 'regen', applied: true } });
      }
    }
    if (f.mendCd > 0) f.mendCd--;
    if (this.healerTurn(f)) return;
    const stunned = hasStatus(f, 'stun') || (hasStatus(f, 'freeze') && this.rng.chance(0.5));
    for (const s of f.statuses) if (s.type !== 'shield') s.duration--;
    f.statuses = f.statuses.filter((s) => s.duration > 0 || (s.type === 'shield' && s.magnitude > 0));
    if (f.mods.intimidated > 0) f.mods.intimidated--;
    if (f.mods.provokedTurns > 0) f.mods.provokedTurns--;
    if (f.mods.earlyDodgeTurns > 0) f.mods.earlyDodgeTurns--;

    // Stamina regen
    const torso = f.injuries.filter((i) => i.part === 'torso').reduce((n, i) => n + i.severity, 0);
    const regen = 3 + (f.snap.traits.includes('Second Wind') ? 3 : 0) + this.sideFx[f.side].staminaRegen - this.env.staminaDrain - torso;
    f.st = clamp(f.st + regen, 0, f.maxSt);
    // Regaining balance and resetting the guard between exchanges.
    f.staggered = false;
    f.guard = clamp(f.guard + 10 + f.eff.defense / 10, 0, 100);

    if (stunned) {
      f.stunImmune = 2;
      this.emit('status', `${this.name(f)} is unable to move!`, { actor: f.id, status: { type: hasStatus(f, 'stun') ? 'stun' : 'freeze', applied: true } });
      return;
    }

    this.checkTransform(f);
    this.checkAwakening(f);
    const forced = this.forceUltimate.has(f.id) ? this.bestMove(f, true) : null;
    this.forceUltimate.delete(f.id);
    const opt: Option = forced ? { kind: 'ability', ability: forced, weight: 1 } : this.chooseAction(f);
    if (opt.kind === 'ability' && opt.ability.secret) {
      f.secretUsed = true;
      this.emit('secret', `${this.name(f)} is done holding back. SECRET MOVE: ${opt.ability.name}!`, { actor: f.id, action: opt.ability.name, context: { move: opt.ability.id, why: opt.ability.secret } });
      this.shiftMomentum(f.side, 10, `${this.name(f)}'s secret move`);
    }
    this.execute(f, opt);
    const order = this.orders[f.side];
    if (order && --order.left <= 0) this.orders[f.side] = null;
  }

  // ---------------------------------------------------------- corner calls

  /** Marks a moment where a side's corner may step in; handled between actions. */
  private queueCorner(side: 0 | 1, focus: CombatFighter, reason: string, reserve?: string) {
    if (this.pendingCorners.some((c) => c.side === side && (c.reason === 'jump_in') === (reason === 'jump_in'))) return;
    this.pendingCorners.push({ side, focus: focus.id, reason, reserve });
  }

  private processCorners() {
    const queue = this.pendingCorners;
    this.pendingCorners = [];
    for (const c of queue) {
      if (this.checkWinner() !== null) return;
      const side = c.side;
      if (c.reason === 'jump_in') { this.jumpInMoment(side, c.focus, c.reserve!); continue; }
      if (this.callsUsed[side] >= CALLS_PER_BATTLE || this.turn - this.lastCornerTurn[side] < 4) continue;
      // The focus may be a bench fighter who has already left, or someone just knocked out.
      let focus = this.fighters.find((f) => f.id === c.focus);
      if (!focus || focus.defeated) focus = this.alive(side)[0];
      if (!focus) continue;
      this.lastCornerTurn[side] = this.turn;
      const n = this.corners[side]++;
      const options = this.callOptions(side, focus);
      this.emit('corner', `Side ${side === 0 ? 'A' : 'B'}'s corner can make a call (${CALLS_PER_BATTLE - this.callsUsed[side]} left).`, {
        actor: focus.id, context: { side, corner: n, reason: c.reason, options: options.join(','), callsLeft: CALLS_PER_BATTLE - this.callsUsed[side] },
      });
      const call = this.input.sides[side].coach === 'auto' ? this.autoCall(side, focus, c.reason, options, n) : this.input.calls?.find((x) => x.side === side && x.corner === n);
      const br = this.input.branch;
      if (br && br.side === side && br.corner === n) this.rng = new Rng(deriveSeed('branch', this.input.seed, br.salt));
      if (call && call.kind !== 'none' && options.includes(call.kind)) this.applyCall(side, focus, call);
    }
  }

  private reservesLeft(side: 0 | 1) {
    return this.reinforced[side] ? [] : (this.input.sides[side].reserves ?? []).filter((r) => !this.usedReserves.has(r.charId));
  }

  // ------------------------------------------------- bench fighters jumping in

  /** A teammate is in trouble: an eager bench fighter may want to jump in. */
  private considerJumpIn(side: 0 | 1, endangered: CombatFighter, by: CombatFighter | null) {
    if (this.turn - this.lastJumpTurn[side] < 8) return;
    const rules = this.input.sides[side].jumpIn ?? {};
    const auto = this.input.sides[side].coach === 'auto';
    const bench = (this.input.sides[side].reserves ?? []).filter((r) => !this.usedReserves.has(r.charId) && (auto || (rules[r.charId] ?? 'ask') !== 'never'));
    const keen = bench.map((r) => ({
      r, eager: EAGERNESS[r.temperament] + (duoOf(r.charId, endangered.id) ? 0.35 : 0) + (by && rivalryBetween(r.charId, by.id) ? 0.25 : 0),
    })).sort((a, b) => b.eager - a.eager);
    for (const k of keen) {
      if (!this.flavorRng.chance(Math.min(0.85, k.eager))) continue;
      this.lastJumpTurn[side] = this.turn;
      this.queueCorner(side, endangered, 'jump_in', k.r.charId);
      return;
    }
  }

  private jumpInMoment(side: 0 | 1, focusId: string, reserveId: string) {
    const snap = (this.input.sides[side].reserves ?? []).find((r) => r.charId === reserveId);
    const focus = this.fighters.find((f) => f.id === focusId);
    if (!snap || !focus || this.usedReserves.has(reserveId)) return;
    const line = this.say('jump', snap.temperament, { ally: this.name(focus), foe: this.fighters.find((f) => f.snap.side !== side && !f.defeated)?.snap.name, move: this.signature(snap.abilities) });
    const rule = this.input.sides[side].jumpIn?.[reserveId] ?? 'ask';
    const auto = this.input.sides[side].coach === 'auto';
    let go: boolean;
    if (auto) go = this.coachRng.chance(0.75);
    else if (rule === 'auto') go = true;
    else {
      const n = this.corners[side]++;
      this.emit('corner', `${snap.name} wants to jump in to help ${this.name(focus)}.`, {
        actor: focus.id, context: { side, corner: n, reason: 'jump_in', options: 'reinforce,none', reserve: reserveId, line, callsLeft: CALLS_PER_BATTLE - this.callsUsed[side] },
      });
      const br = this.input.branch;
      if (br && br.side === side && br.corner === n) this.rng = new Rng(deriveSeed('branch', this.input.seed, br.salt));
      go = this.input.calls?.find((x) => x.side === side && x.corner === n)?.kind === 'reinforce';
    }
    if (!go) return;
    this.usedReserves.add(reserveId);
    this.emit('banter', `${snap.name}: "${line}"`, { actor: reserveId, target: focus.id, context: { line, kind: 'jump' } });
    const rf = createFighter({ ...snap, side, position: 'front' });
    const target = this.pickTarget(rf, true);
    if (!target) return;
    // Hot-headed helpers sometimes just get in the way.
    if ((snap.temperament === 'reckless' || snap.temperament === 'hot-blooded') && this.flavorRng.chance(0.2)) {
      focus.staggered = true;
      this.emit('reinforcement', `${snap.name} charges in too fast and crashes into ${this.name(focus)}!`, { actor: rf.id, target: focus.id, action: 'reinforcement', context: { name: snap.name, jumped: true, backfire: true } });
      this.shiftMomentum(side === 0 ? 1 : 0, 10, `${snap.name}'s clumsy entrance`);
      return;
    }
    const move = this.bestMove(rf, false) ?? BASIC_ATTACK;
    this.emit('reinforcement', `${snap.name} jumps in on their own with ${move.name} on ${this.name(target)}!`, {
      actor: rf.id, target: target.id, ability: ABILITIES[move.id] ? move.id : undefined, action: 'reinforcement', context: { name: snap.name, jumped: true },
    });
    this.strike(rf, target, move, { noCounter: true, label: 'reinforcement' });
    this.shiftMomentum(side, 10, `${snap.name} jumping in`);
  }

  // ------------------------------------------------------ banter and twists

  /** Mid-fight trash talk and self-motivation, with real effects. */
  private banter(speaker: CombatFighter, kind: 'mock' | 'pump', target?: CombatFighter) {
    if (speaker.defeated || this.turn - (this.banterAt.get(speaker.id) ?? -99) < 10) return;
    const t = speaker.snap.temperament;
    const chance = kind === 'mock'
      ? ({ arrogant: 0.6, reckless: 0.5, aggressive: 0.45, 'hot-blooded': 0.4, cheerful: 0.35, calculating: 0.3 } as Record<string, number>)[t] ?? 0.15
      : ({ 'hot-blooded': 0.55, cheerful: 0.45, defensive: 0.45, reckless: 0.4, aggressive: 0.35 } as Record<string, number>)[t] ?? 0.2;
    if (!this.flavorRng.chance(chance)) return;
    this.banterAt.set(speaker.id, this.turn);
    const line = this.say(kind, t, this.tauntContext(speaker, target ?? this.fighters.find((f) => f.snap.side !== speaker.snap.side && !f.defeated)));
    if (kind === 'pump') {
      speaker.statuses.push({ type: 'focus', duration: 2, magnitude: 0.12 });
      this.emit('banter', `${this.name(speaker)}: "${line}" (fired up: +12% power for 2 actions)`, { actor: speaker.id, context: { line, kind } });
      return;
    }
    this.emit('banter', `${this.name(speaker)} mocks ${this.name(target!)}: "${line}"`, { actor: speaker.id, target: target!.id, context: { line, kind } });
    const tt = target!;
    if (tt.defeated) return;
    const reaction = reactionTo(tt.snap.temperament);
    const reply = this.say(reaction, tt.snap.temperament, this.tauntContext(tt, speaker));
    if (reaction === 'fired') tt.mods.dmg += 0.06;
    if (reaction === 'rattled') tt.statuses.push({ type: 'weaken', duration: 3, magnitude: 0.12 });
    const effect = reaction === 'fired' ? 'fired up (+6% power for the rest of the fight)' : reaction === 'rattled' ? 'rattled (weakened for 3 actions)' : 'unbothered';
    this.emit('banter', `${this.name(tt)}: "${reply}" (${effect})`, { actor: tt.id, target: speaker.id, context: { line: reply, kind: reaction } });
  }

  private say(kind: TauntKind, t: CombatFighter['snap']['temperament'], c: Omit<TauntContext, 'temperament'>): string {
    return writeTaunt(this.flavorRng, kind, { ...c, temperament: t }, this.saidLines);
  }

  private signature(abilities: string[]): string | undefined {
    const named = abilities.filter((id) => id !== BASIC_ATTACK.id && ABILITIES[id]).map((id) => getAbility(id));
    return (named.find((a) => a.kind === 'ultimate') ?? named[0])?.name;
  }

  /** What the speaker can talk about: moves, the foe's injuries, price, who is ahead. */
  private tauntContext(me: CombatFighter, foe?: CombatFighter): Omit<TauntContext, 'temperament'> {
    if (!foe) return { move: this.signature(me.snap.abilities) };
    const mine = me.hp / me.maxHp, theirs = foe.hp / foe.maxHp;
    return {
      foe: this.name(foe), move: this.signature(me.snap.abilities),
      foeMove: this.lastMove.get(foe.id) ?? this.signature(foe.snap.abilities),
      foeArchetype: foe.snap.archetype, foePart: foe.injuries[foe.injuries.length - 1]?.part,
      underdog: me.snap.price < foe.snap.price * 0.7, favourite: me.snap.price > foe.snap.price * 1.4,
      standing: mine - theirs > 0.2 ? 'ahead' : theirs - mine > 0.2 ? 'behind' : 'even',
    };
  }

  private twist(key: string, title: string, text: string, actor?: CombatFighter, target?: CombatFighter) {
    if (this.twists.has(key)) return false;
    this.twists.add(key);
    this.emit('twist', `${title} ${text}`, { actor: actor?.id, target: target?.id, context: { twist: key.split(':')[0], title } });
    return true;
  }

  /**
   * Plot twists: about a third of fights get one story event at a random moment
   * that really changes the fight. Rolled on its own dice (plotRng).
   */
  private plotTwist() {
    const p = this.plot;
    if (!p || p.done || this.turn < p.at) return;
    const live = this.fighters.filter((f) => !f.defeated);
    if (this.alive(0).length === 0 || this.alive(1).length === 0) return;
    const R = this.plotRng;
    const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
    // Every health change is logged after the twist itself, so the log matches the result.
    const before = new Map(live.map((f) => [f, f.hp]));
    const hit = (f: CombatFighter, share: number) => this.applyDamage(f, Math.max(1, Math.round(f.maxHp * share)));
    switch (p.kind) {
      case 'intruder': {
        const who = R.pick(['a masked ronin', 'a rogue shinigami', 'a wandering demon', 'a mercenary from the stands', 'a cursed spirit', 'a rogue ninja', 'a fallen hero']);
        const victim = live.slice().sort((a, b) => hpPct(b) - hpPct(a))[0];
        for (const f of live) { hit(f, 0.1); f.guard = clamp(f.guard - 30, 0, 100); f.staggered = true; }
        this.momentum = 0;
        this.twist('plot-intruder', 'AN INTRUDER!', `${cap(who)} crashes into the battle and attacks everyone!`, victim, victim);
        break;
      }
      case 'shift': {
        const shifts: Array<[title: string, text: string, up: Tag[], down: Tag[]]> = [
          ['THE SKY TURNS BLACK!', 'A sudden eclipse swallows the arena. Darkness feeds the shadows.', ['DARK', 'SHADOW', 'DEMON'], ['HOLY', 'DIVINE']],
          ['THE ARENA FLOODS!', 'Water roars in from every side. Flames sputter out.', ['WATER', 'ICE'], ['FIRE', 'LIGHTNING']],
          ['THE GROUND SPLITS OPEN!', 'Lava pours across the floor. The heat is unbearable.', ['FIRE', 'DRAGON', 'EARTH'], ['ICE', 'WATER']],
          ['A BLIZZARD HITS!', 'Snow and wind tear across the battlefield.', ['ICE', 'WIND'], ['FIRE', 'EARTH']],
          ['A STORM BREAKS!', 'Lightning strikes the arena again and again.', ['LIGHTNING', 'WIND'], ['WATER', 'EARTH']],
        ];
        const [title, text, up, down] = R.pick(shifts);
        for (const f of live) {
          if (f.snap.tags.some((t) => up.includes(t))) f.mods.dmg += 0.15;
          if (f.snap.tags.some((t) => down.includes(t))) f.mods.dmg -= 0.1;
        }
        const favoured = live.find((f) => f.snap.tags.some((t) => up.includes(t)));
        this.twist('plot-shift', title, favoured ? `${text} ${this.name(favoured)} thrives in it!` : text, favoured);
        break;
      }
      case 'sealed': {
        const target = live.slice().sort((a, b) => b.eff.attack - a.eff.attack)[0];
        for (const id of target.snap.abilities) if (ABILITIES[id]?.kind === 'ultimate') target.cooldowns[id] = Math.max(target.cooldowns[id] ?? 0, 14);
        this.twist('plot-sealed', 'TECHNIQUE SEALED!', `A binding seal locks away ${this.name(target)}'s strongest technique! They'll have to win without it.`, target, target);
        break;
      }
      case 'flashback': {
        const low = live.filter((f) => hpPct(f) < 0.3).sort((a, b) => hpPct(a) - hpPct(b))[0];
        if (!low) { if (this.turn > p.at + 30) p.kind = 'intruder'; return; }
        low.hp = Math.min(low.maxHp, low.hp + Math.round(low.maxHp * 0.2));
        low.mods.dmg += 0.08;
        low.statuses.push({ type: 'focus', duration: 3, magnitude: 0.2 });
        this.shiftMomentum(low.side, 25, `${this.name(low)}'s flashback`);
        this.twist('plot-flashback', 'A FLASHBACK!', `${this.name(low)} remembers why they fight, and rises with new power!`, low);
        break;
      }
      case 'suddendeath': {
        if (live.some((f) => hpPct(f) < 0.25)) { p.kind = 'intruder'; return; }
        for (const f of live) f.hp = Math.min(f.hp, Math.max(1, Math.round(f.maxHp * 0.2)));
        this.momentum = 0;
        this.twist('plot-suddendeath', 'SUDDEN DEATH!', 'A shockwave drains everyone to their last reserves. The next clean hit could end it!');
        break;
      }
      case 'betrayal': {
        const side = (this.alive(0).length >= 2 ? (this.alive(1).length >= 2 && R.chance(0.5) ? 1 : 0) : 1) as 0 | 1;
        const team = this.alive(side);
        if (team.length < 2) { p.kind = 'intruder'; return; }
        const traitor = R.pick(team);
        const victim = R.pick(team.filter((f) => f !== traitor));
        hit(victim, 0.12);
        victim.staggered = true;
        this.shiftMomentum(side === 0 ? 1 : 0, 25, 'the betrayal');
        this.twist('plot-betrayal', 'BETRAYAL?!', `${this.name(traitor)} turns and strikes ${this.name(victim)}! Mind control? A grudge? Nobody knows!`, traitor, victim);
        break;
      }
    }
    p.done = true;
    for (const [f, hp0] of before) {
      if (f.hp < hp0) {
        this.emit('attack', `${this.name(f)} is caught in it.`, { target: f.id, damage: hp0 - f.hp, hpBefore: hp0, hpAfter: f.hp, action: 'plot twist', context: { environmental: true } });
        if (f.defeated || f.hp <= 0) this.onDefeat(f, null, 'collapse');
      } else if (f.hp > hp0) {
        this.emit('heal', `${this.name(f)} surges back.`, { target: f.id, heal: f.hp - hp0, hpBefore: hp0, hpAfter: f.hp });
      }
    }
  }

  /**
   * How long a fight lasts comes from the matchup, not from who is playing: a mismatch
   * ends quickly, an even fight runs longer, and the stronger both sides are, the
   * longer it goes (two monsters trade blows for a while). Everyone's health pool is
   * scaled by the same amount, so it changes the length, not who is favoured.
   */
  private setFightLength() {
    const sidePower = (side: 0 | 1) => {
      const list = this.fighters.filter((f) => f.side === side);
      return list.reduce((n, f) => n + truePower(f.snap.stats), 0) / Math.max(1, list.length);
    };
    const a = sidePower(0), b = sidePower(1);
    const closeness = clamp(1 - Math.abs(a - b) / 18, 0, 1);
    const level = clamp(((a + b) / 2 - 55) / 40, 0, 1);
    this.lengthMult = Math.round((0.8 + 0.9 * closeness * level) * 100) / 100;
    // The stronger side gets a small edge in proportion to the gap, so a clearly stronger
    // fighter wins most of the time while upsets still happen. Raid bosses are tuned separately.
    if (!this.fighters.some((f) => f.snap.boss)) {
      const edge = clamp((a - b) * 0.012, -0.12, 0.12);
      for (const f of this.fighters) f.mods.dmg += f.side === 0 ? edge : -edge;
    }
    for (const f of this.fighters) {
      f.maxHp = Math.max(1, Math.round(f.maxHp * this.lengthMult));
      f.hp = f.maxHp;
      f.res.maxHp = f.maxHp;
      f.res.hp = f.maxHp;
    }
  }

  /**
   * Healers (Support fighters, or anyone with a healing technique) look after the team:
   * once per fight they can pull a knocked-out teammate back to their feet, and every few
   * turns they mend the most hurt teammate (a solid chunk, never a full refill).
   * Uses the plot dice so ordinary fights keep their other rolls.
   */
  private healerTurn(f: CombatFighter): boolean {
    const healer = f.snap.archetype === 'Support' || f.snap.abilities.some((id) => ABILITIES[id]?.kind === 'heal');
    if (!healer || f.defeated || hasStatus(f, 'stun')) return false;
    const skill = 1 + f.eff.technique / 300;
    const down = this.fighters.filter((x) => x.side === f.side && x.defeated && x !== f);
    if (!f.reviveUsed && down.length && this.plotRng.chance(0.6)) {
      const ally = down.sort((a, b) => b.maxHp - a.maxHp)[0];
      f.reviveUsed = true;
      ally.defeated = false;
      ally.res.defeated = false;
      ally.res.howDown = undefined;
      ally.staggered = false;
      ally.guard = 60;
      ally.knockdowns = 0;
      const before = ally.hp;
      ally.hp = Math.max(1, Math.round(ally.maxHp * 0.25 * skill));
      this.twist(`revive:${ally.id}`, 'BACK ON THEIR FEET!', `${this.name(f)} pours everything into ${this.name(ally)}, who stands up and rejoins the fight!`, f, ally);
      this.emit('heal', `${this.name(f)} revives ${this.name(ally)}.`, { actor: f.id, target: ally.id, heal: ally.hp - before, hpBefore: before, hpAfter: ally.hp, context: { revive: true } });
      this.shiftMomentum(f.side, 20, `${this.name(ally)}'s return`);
      return true;
    }
    if (f.mendCd > 0) return false;
    const hurt = this.alive(f.side).filter((x) => x !== f && hpPct(x) < 0.45).sort((a, b) => hpPct(a) - hpPct(b))[0];
    if (!hurt || !this.plotRng.chance(0.55)) return false;
    const before = hurt.hp;
    hurt.hp = Math.min(hurt.maxHp, hurt.hp + Math.round(hurt.maxHp * 0.16 * skill * this.sideFx[f.side].healMult));
    f.mendCd = 3;
    this.emit('heal', `${this.name(f)} patches up ${this.name(hurt)}.`, { actor: f.id, target: hurt.id, heal: hurt.hp - before, hpBefore: before, hpAfter: hurt.hp, context: { mend: true } });
    return true;
  }

  /** Arena-wide twists and crowd rallies, checked between actions. */
  private worldTwists() {
    this.plotTwist();
    // The arena only breaks in long, close fights.
    const close = Math.abs(this.momentum) < 25;
    if (this.turn >= 40 && close && !this.twists.has('arena') && this.flavorRng.chance(0.012)) {
      const T: Record<string, string> = {
        volcano: 'THE VOLCANO ERUPTS!', storm: 'LIGHTNING SPLITS THE ARENA!', tundra: 'THE ICE SHEET CRACKS!', ocean: 'A TIDAL SURGE FLOODS THE ARENA!',
        temple: 'THE TEMPLE PILLARS COLLAPSE!', rooftops: 'THE ROOFTOP GIVES WAY!', forest: 'THE ANCIENT TREES COME CRASHING DOWN!', colosseum: 'THE CROWD STORMS THE BARRIERS!',
      };
      this.twist('arena', T[this.env.id] ?? 'THE ARENA BREAKS APART!', 'Everyone is thrown off balance; guards drop and the momentum resets.');
      this.momentum = 0;
      for (const f of this.fighters.filter((x) => !x.defeated)) { f.guard = clamp(f.guard - 40, 0, 100); if (this.flavorRng.chance(0.5)) f.staggered = true; }
    }
    for (const side of [0, 1] as const) {
      const mine = side === 0 ? this.momentum : -this.momentum;
      const worse = (s: 0 | 1) => this.alive(s).reduce((a, f) => a + hpPct(f), 0) / Math.max(1, this.alive(s).length);
      // Only a side that is badly behind on both momentum and condition gets the crowd.
      if (mine <= -85 && worse(side) < worse(side === 0 ? 1 : 0) - 0.25 && this.flavorRng.chance(0.08)) {
        const f = this.alive(side).sort((a, b) => hpPct(a) - hpPct(b))[0];
        if (f && this.twist(`rally:${side}`, 'THE CROWD RALLIES!', `The whole arena gets behind ${this.name(f)}!`, f)) {
          for (const x of this.alive(side)) { x.st = clamp(x.st + 20, 0, x.maxSt); x.statuses.push({ type: 'focus', duration: 2, magnitude: 0.15 }); }
          this.shiftMomentum(side, 30, 'the crowd');
        }
      }
    }
  }

  /** The calls that make sense for this fighter right now. */
  callOptions(side: 0 | 1, focus: CombatFighter): CallKind[] {
    const out: CallKind[] = ['all_out', 'defend'];
    if (this.bestMove(focus, true, true)) out.push('ultimate');
    out.push('callback');
    if (this.reservesLeft(side).length) out.push('reinforce');
    out.push('taunt');
    if (this.alive(side === 0 ? 1 : 0).length > 1) out.push('focus');
    if (focus.kit?.forms[focus.stage]) out.push('transform');
    if (focus.kit && !focus.secretUsed && !focus.secretOpen) out.push('secret');
    out.push('none');
    return out;
  }

  private autoCall(side: 0 | 1, focus: CombatFighter, reason: string, options: CallKind[], corner: number): CoachCall {
    const hurt = hpPct(focus) < 0.35 || focus.knockdowns > 0 || injuryLoad(focus) >= 3;
    const foe = this.alive(side === 0 ? 1 : 0);
    const foeHurt = foe.some((x) => hpPct(x) < 0.35 || x.staggered);
    const w: Partial<Record<CallKind, number>> = {
      none: 1.2,
      all_out: foeHurt ? 2.2 : 0.6,
      defend: hurt ? 1.6 : 0.4,
      ultimate: foeHurt ? 1.8 : 0.3,
      callback: hurt ? 1.4 : 0.1,
      reinforce: hurt || foeHurt ? 1.2 : 0.3,
      taunt: hurt ? 0.3 : 0.6,
      focus: foeHurt ? 1.6 : 0.5,
      transform: hurt ? 1.8 : 0.7,
      secret: hurt || foeHurt ? 1.3 : 0.3,
    };
    if (reason === 'check') w.none = 2.5;
    const opts = options.filter((o) => w[o]);
    return { side, corner, kind: this.coachRng.weighted(opts, opts.map((o) => w[o]!)) };
  }

  private applyCall(side: 0 | 1, focus: CombatFighter, call: CoachCall) {
    const kind = call.kind as Exclude<CallKind, 'none'>;
    this.callsUsed[side]++;
    const ctx = { side, call: kind, shout: CALL_SHOUT[kind] };
    switch (kind) {
      case 'all_out':
        this.orders[side] = { kind, left: 4 };
        this.emit('call', `${CALL_SHOUT[kind]} ${this.name(focus)}'s side throws caution away for the next few exchanges.`, { actor: focus.id, context: ctx });
        this.shiftMomentum(side, 6, 'the corner call');
        return;
      case 'defend':
        this.orders[side] = { kind, left: 4 };
        for (const f of this.alive(side)) { f.guard = clamp(f.guard + 40, 0, 100); f.staggered = false; }
        this.emit('call', `${CALL_SHOUT[kind]} ${this.name(focus)}'s side tightens up and rebuilds its guard.`, { actor: focus.id, context: ctx });
        return;
      case 'ultimate':
        this.forceUltimate.add(focus.id);
        focus.st = clamp(focus.st + 15, 0, focus.maxSt);
        this.emit('call', `${CALL_SHOUT[kind]} ${this.name(focus)} will unleash their strongest technique next.`, { actor: focus.id, context: ctx });
        return;
      case 'callback': {
        const back = this.alive(side).filter((a) => a.id !== focus.id && a.position === 'back').sort((a, b) => hpPct(b) - hpPct(a))[0];
        focus.guard = 100;
        focus.staggered = false;
        focus.st = clamp(focus.st + focus.maxSt * 0.3, 0, focus.maxSt);
        if (back && focus.position === 'front') {
          focus.position = 'back';
          back.position = 'front';
          this.emit('call', `${CALL_SHOUT[kind]} ${this.name(focus)} is pulled back to recover and ${this.name(back)} takes the front.`, { actor: focus.id, target: back.id, context: ctx });
          this.emit('replacement', `${this.name(back)} steps in for ${this.name(focus)}.`, { actor: back.id, target: focus.id, action: 'tag' });
        } else {
          focus.hp = Math.min(focus.maxHp, focus.hp + Math.round(focus.maxHp * 0.05));
          this.emit('call', `${CALL_SHOUT[kind]} ${this.name(focus)} backs off, resets their guard and gets their breath back.`, { actor: focus.id, hpAfter: focus.hp, context: ctx });
          this.shiftMomentum(side === 0 ? 1 : 0, 8, `${this.name(focus)} giving ground`);
        }
        return;
      }
      case 'taunt': {
        // The enemy loses their cool: they chase this fighter and swing wilder for a few actions.
        for (const e of this.alive(side === 0 ? 1 : 0)) { e.forcedTarget = { id: focus.id, turns: 3 }; e.mods.acc -= 0.04; e.mods.provokedTurns = Math.max(e.mods.provokedTurns, 3); }
        focus.guard = clamp(focus.guard + 20, 0, 100);
        this.emit('call', `${CALL_SHOUT[kind]} ${this.name(focus)} mocks the other side, and they take the bait.`, { actor: focus.id, context: ctx });
        this.shiftMomentum(side, 5, 'the taunt');
        return;
      }
      case 'focus': {
        const weak = this.alive(side === 0 ? 1 : 0).sort((a, b) => hpPct(a) - hpPct(b))[0];
        if (!weak) return;
        for (const f of this.alive(side)) f.forcedTarget = { id: weak.id, turns: 3 };
        this.emit('call', `${CALL_SHOUT[kind]} Everyone turns on ${this.name(weak)}.`, { actor: focus.id, target: weak.id, context: ctx });
        return;
      }
      case 'transform':
        this.checkTransform(focus, true);
        this.emit('call', `${CALL_SHOUT[kind]} ${this.name(focus)}'s corner wants their next form, right now.`, { actor: focus.id, context: ctx });
        return;
      case 'secret':
        focus.secretOpen = true;
        focus.st = clamp(focus.st + 20, 0, focus.maxSt);
        this.emit('call', `${CALL_SHOUT[kind]} ${this.name(focus)} is told to use the move they've been hiding.`, { actor: focus.id, context: ctx });
        return;
      case 'reinforce': {
        const pool = this.reservesLeft(side);
        const snap = pool.find((x) => x.charId === call.reserveId) ?? pool.slice().sort((a, b) => b.stats.attack - a.stats.attack)[0];
        if (!snap) return;
        this.reinforced[side] = true;
        this.usedReserves.add(snap.charId);
        const rf = createFighter({ ...snap, side, position: 'front' });
        const move = this.bestMove(rf, false) ?? BASIC_ATTACK;
        const target = this.pickTarget(rf, true);
        if (!target) return;
        this.emit('call', `${CALL_SHOUT[kind]} ${snap.name} charges in from the bench!`, { actor: focus.id, context: { ...ctx, reserve: snap.charId } });
        this.emit('reinforcement', `${snap.name} bursts in with ${move.name} on ${this.name(target)}, then returns to the bench.`, {
          actor: rf.id, target: target.id, ability: ABILITIES[move.id] ? move.id : undefined, action: 'reinforcement', context: { name: snap.name },
        });
        this.strike(rf, target, move, { noCounter: true, label: 'reinforcement' });
        this.shiftMomentum(side, 10, `${snap.name}'s surprise entrance`);
      }
    }
  }

  /** The fighter's strongest offensive technique that they can afford now. */
  private bestMove(f: CombatFighter, preferUltimate: boolean, peek = false): Ability | null {
    const moves = f.moves.map((id) => ABILITIES[id]).filter((m): m is Ability => !!m && ['attack', 'ultimate', 'summon', 'aoe'].includes(m.kind) && !m.secret && this.unlocked(f, m));
    const usable = moves.filter((m) => (f.cooldowns[m.id] ?? 0) === 0 && (peek || f.st + 15 >= m.cost));
    usable.sort((a, b) => (preferUltimate ? Number(b.kind === 'ultimate') - Number(a.kind === 'ultimate') : 0) || b.power - a.power);
    return usable[0] ?? null;
  }

  // ------------------------------------------------------------ decisions

  private triggerOk(f: CombatFighter, a: Ability): boolean {
    switch (a.trigger) {
      case 'always': return true;
      case 'hp_below_50': return hpPct(f) < 0.5;
      case 'hp_below_30': return hpPct(f) < 0.3;
      case 'ally_low': return this.alive(f.side).some((x) => hpPct(x) < 0.4);
      case 'enemy_low': return this.alive(f.side === 0 ? 1 : 0).some((x) => hpPct(x) < 0.35);
      case 'momentum_positive': return (f.side === 0 ? this.momentum : -this.momentum) > 5;
    }
  }

  private chooseAction(f: CombatFighter): Option {
    const arch = ARCHETYPES[f.snap.archetype];
    const temp = TEMPERAMENTS[f.snap.temperament];
    const strat = this.strat(f);
    const hp = hpPct(f);
    const stPct = f.st / f.maxSt;
    const enemies = this.alive(f.side === 0 ? 1 : 0);
    const allies = this.alive(f.side).filter((a) => a.id !== f.id);
    const opts: Option[] = [];
    const conserve = (f.snap.archetype === 'Strategist' || f.snap.temperament === 'calculating');
    const provoked = f.mods.provokedTurns > 0 || !!f.forcedTarget;

    // Basic attack
    const order = this.orders[f.side]?.kind;
    let attackW = 1.0 * arch.behavior.attack * temp.aggression * strat.attackW * (order === 'all_out' ? 1.5 : order === 'defend' ? 0.7 : 1);
    if (f.snap.archetype === 'Berserker') attackW *= 1 + (1 - hp) * 0.6;
    if (provoked) attackW *= 1.3;
    opts.push({ kind: 'ability', ability: BASIC_ATTACK, weight: attackW });

    for (const id of f.moves) {
      const a = getAbility(id);
      const cost = Math.round(a.cost * strat.cost);
      if (f.st < cost || (f.cooldowns[id] ?? 0) > 0 || !this.triggerOk(f, a) || !this.unlocked(f, a)) continue;
      let w = arch.behavior.ability * strat.abilityW * (order === 'all_out' && a.kind !== 'heal' && a.kind !== 'shield' ? 1.3 : 1);
      switch (a.kind) {
        case 'attack': case 'summon': w *= 0.9 + a.power * 0.35; break;
        case 'aoe': w *= (0.7 + a.power * 0.3) * Math.pow(enemies.length, 0.7); break;
        case 'ultimate': w *= 2.2; break;
        case 'heal': {
          // A pure healer on their own can't stall a fight forever: two self-heals, then they must fight.
          if (f.snap.archetype === 'Support' && allies.length === 0 && f.selfHeals >= 2) { w = 0; break; }
          const targets = a.target === 'self' ? [f] : [f, ...allies];
          const missing = Math.max(...targets.map((t) => 1 - hpPct(t)));
          w *= missing > 0.35 ? 1 + missing * 3 : 0.05;
          break;
        }
        case 'shield': {
          const low = a.target === 'self' ? 1 - hp : Math.max(1 - hp, ...allies.map((t) => 1 - hpPct(t)));
          w *= (low > 0.3 ? 0.8 + low * 2 : 0.3) * (hasStatus(f, 'shield') ? 0.2 : 1);
          break;
        }
        case 'buff': w *= hasStatus(f, a.status?.type ?? 'focus') ? 0.05 : 0.9; break;
        case 'debuff': w *= this.input.sides[f.side].strategy === 'control' ? 1.6 : 1; break;
      }
      // A secret move, once its moment comes, is what they reach for; new forms favour their new moves.
      if (a.secret) w *= 6;
      else if (a.form) w *= 1.6;
      // Strategists hold big moves until the enemy is softened up.
      if (conserve && a.power >= 1.9 && enemies.every((e) => hpPct(e) > 0.6) && f.actionsTaken < 6) w *= 0.35;
      opts.push({ kind: 'ability', ability: a, weight: w });
    }

    let guardW = 0.35 * arch.behavior.guard * temp.caution * strat.guardW * (hp < 0.4 ? 1.6 : 0.8) * (order === 'all_out' ? 0.2 : order === 'defend' ? 2.5 : 1);
    if (provoked) guardW *= 0.4;
    if (f.snap.temperament === 'patient') guardW *= 1.2;
    opts.push({ kind: 'guard', weight: guardW });

    if (stPct < 0.25) opts.push({ kind: 'recover', weight: 1.6 * temp.caution });

    const lowAlly = allies.filter((a) => hpPct(a) < 0.35).sort((a, b) => a.hp - b.hp)[0];
    if (lowAlly && hp > 0.4) opts.push({ kind: 'protect', ally: lowAlly, weight: 0.6 * arch.behavior.protect * temp.caution });

    if (this.input.mode !== 'solo' && allies.length > 0 && this.comboCooldown[f.side] === 0) {
      const mySideMomentum = f.side === 0 ? this.momentum : -this.momentum;
      const ready = allies.filter((a) => a.st >= 20 && !hasStatus(a, 'stun'));
      const duoPartner = ready.find((a) => duoOf(f.id, a.id));
      const partner = duoPartner ?? ready.sort((a, b) => b.eff.attack - a.eff.attack)[0];
      if (partner && f.st >= 20 && mySideMomentum >= (duoPartner ? 5 : 20)) opts.push({ kind: 'combo', partner, weight: duoPartner ? 2.4 : 1.3 });
    }

    if (this.input.mode === 'tag' && f.position === 'back') {
      const front = allies.find((a) => a.position === 'front');
      if (front && hpPct(front) < 0.3 && hp > 0.5) opts.push({ kind: 'tag', partner: front, weight: 1.8 });
    }

    // Battle IQ sharpens choice: high IQ picks the best option more often.
    const sharp = 1 + f.eff.battleIQ / 45;
    const weights = opts.map((o) => Math.pow(Math.max(0.001, o.weight), sharp));
    return this.rng.weighted(opts, weights);
  }

  private validTargets(f: CombatFighter, piercing: boolean): CombatFighter[] {
    const enemies = this.alive(f.side === 0 ? 1 : 0);
    const front = enemies.filter((e) => e.position === 'front');
    const canReachBack = piercing || f.snap.reach === 'ranged' || ARCHETYPES[f.snap.archetype].behavior.dive > 0.5;
    return front.length && !canReachBack ? front : enemies;
  }

  private pickTarget(f: CombatFighter, piercing: boolean): CombatFighter | null {
    const targets = this.validTargets(f, piercing);
    if (!targets.length) return null;
    if (f.forcedTarget) {
      const forced = targets.find((t) => t.id === f.forcedTarget!.id);
      f.forcedTarget.turns--;
      if (f.forcedTarget.turns <= 0) f.forcedTarget = null;
      if (forced) return forced;
    }
    const strategy = this.input.sides[f.side].strategy;
    const w = targets.map((t) => {
      let v = 0.5 + (1 - hpPct(t)) * 1.4 + t.eff.attack / 120;
      if (strategy === 'control' && (t.snap.archetype === 'Support' || t.snap.archetype === 'Controller' || t.snap.archetype === 'Summoner')) v += 1;
      if (f.snap.archetype === 'Assassin' && t.position === 'back') v += 0.8;
      if (t.guarding) v *= 0.7;
      return v;
    });
    const sharp = 1 + f.eff.battleIQ / 60;
    return this.rng.weighted(targets, w.map((x) => Math.pow(x, sharp)));
  }

  // ------------------------------------------------------------ execution

  private execute(f: CombatFighter, opt: Option) {
    switch (opt.kind) {
      case 'guard':
        f.guarding = true;
        f.st = clamp(f.st + 8, 0, f.maxSt);
        f.guard = clamp(f.guard + 25, 0, 100);
        this.emit('guard', `${this.name(f)} raises their guard and catches their breath.`, { actor: f.id, action: 'guard', staminaDelta: 8, guardAfter: Math.round(f.guard) });
        return;
      case 'recover': {
        const gain = Math.round(f.maxSt * 0.35);
        f.st = clamp(f.st + gain, 0, f.maxSt);
        this.emit('recover', `${this.name(f)} steps back to recover stamina (+${gain}).`, { actor: f.id, action: 'recover', staminaDelta: gain });
        return;
      }
      case 'protect':
        f.protecting = opt.ally.id;
        f.guarding = true;
        this.emit('protect', `${this.name(f)} moves to shield ${this.name(opt.ally)}.`, { actor: f.id, target: opt.ally.id, action: 'protect' });
        return;
      case 'tag': {
        const front = opt.partner;
        front.position = 'back';
        f.position = 'front';
        this.emit('replacement', `TAG! ${this.name(f)} switches in for the wounded ${this.name(front)}.`, { actor: f.id, target: front.id, action: 'tag' });
        return;
      }
      case 'combo': {
        const target = this.pickTarget(f, true);
        if (!target) return;
        f.st -= 20; opt.partner.st -= 20;
        this.comboCooldown[f.side] = 6;
        const duo = duoOf(f.id, opt.partner.id);
        const comboName = duo?.name ?? 'Combo Assault';
        this.emit('combo', duo ? `${this.name(f)} and ${this.name(opt.partner)} unleash ${duo.name} on ${this.name(target)}! ${duo.look}` : `${this.name(f)} and ${this.name(opt.partner)} launch a coordinated attack on ${this.name(target)}!`, {
          actor: f.id, target: target.id, action: 'combo', context: duo ? { partner: opt.partner.id, duo: duo.name, look: duo.look, color: duo.color } : { partner: opt.partner.id },
        });
        this.strike(f, target, { ...BASIC_ATTACK, id: 'combo', name: comboName, power: duo ? 1.8 : 1.4 }, { noCounter: true, label: 'combo' });
        if (!target.defeated && !opt.partner.defeated) this.strike(opt.partner, target, { ...BASIC_ATTACK, id: 'combo', name: comboName, power: duo ? 1.6 : 1.2 }, { noCounter: true, label: 'combo' });
        this.shiftMomentum(f.side, 8, 'a coordinated assault');
        return;
      }
      case 'ability':
        this.useAbility(f, opt.ability);
    }
  }

  private useAbility(f: CombatFighter, a: Ability) {
    const isBasic = a.id === 'basic';
    const cost = Math.round(a.cost * this.strat(f).cost);
    f.st = clamp(f.st - cost, 0, f.maxSt);
    if (!isBasic) {
      f.cooldowns[a.id] = a.cooldown;
      f.res.abilitiesUsed++;
    }
    const allies = this.alive(f.side);

    if (a.kind === 'heal' || a.kind === 'shield' || a.kind === 'buff') {
      const targets = a.target === 'self' ? [f]
        : a.target === 'all_allies' ? allies
          : a.target === 'lowest_ally' || a.target === 'ally' ? [allies.slice().sort((x, y) => hpPct(x) - hpPct(y))[0]]
            : [f];
      const isDesperation = a.kind === 'heal' && a.trigger === 'hp_below_30';
      this.emit(isDesperation ? 'desperation' : 'ability', `${this.name(f)} uses ${a.name}${targets.length > 1 ? ' on the whole team' : targets[0] !== f ? ` on ${this.name(targets[0])}` : ''}.`, {
        actor: f.id, ability: a.id, action: a.name, staminaDelta: -cost, context: { shout: a.shout, kind: a.kind },
      });
      if (a.kind === 'heal' && targets.every((t) => t === f)) f.selfHeals++;
      for (const t of targets) {
        if (a.kind === 'heal') {
          const amt = Math.round(t.maxHp * a.power * this.sideFx[f.side].healMult * (1 + f.eff.technique / 300));
          const before = t.hp;
          t.hp = Math.min(t.maxHp, t.hp + amt);
          this.emit('heal', `${this.name(t)} gets a second wind.`, { actor: f.id, target: t.id, heal: t.hp - before, hpBefore: before, hpAfter: t.hp, ability: a.id });
        } else if (a.kind === 'shield') {
          const amt = Math.round(t.maxHp * a.power);
          const existing = hasStatus(t, 'shield');
          if (existing) existing.magnitude = Math.max(existing.magnitude, amt);
          else t.statuses.push({ type: 'shield', duration: 99, magnitude: amt });
          this.emit('status', `${this.name(t)} is wrapped in a protective barrier.`, { target: t.id, ability: a.id, status: { type: 'shield', applied: true } });
        }
        if (a.status && (a.kind !== 'shield')) this.applyStatus(f, t, a.status.type, a.status.chance, a.status.duration, a.status.magnitude, a.id);
      }
      if (!isBasic) this.shiftMomentum(f.side, 4, `${this.name(f)}'s ${a.name}`);
      return;
    }

    // Offensive abilities
    const aoe = a.target === 'all_enemies';
    if (!isBasic) {
      const isDesperation = a.kind === 'ultimate' && hpPct(f) < 0.5;
      this.emit(isDesperation ? 'desperation' : 'ability', `${this.name(f)} activates ${a.name}!`, {
        actor: f.id, ability: a.id, action: a.name, staminaDelta: -cost, context: { shout: a.shout, kind: a.kind, aoe },
      });
    }
    if (aoe) {
      for (const t of this.alive(f.side === 0 ? 1 : 0)) {
        if (f.defeated) break;
        this.strike(f, t, a, { noCounter: true, accBonus: 0.06 });
      }
    } else {
      const target = this.pickTarget(f, !!a.piercing);
      if (!target) return;
      this.strike(f, target, a, {});
      // Partner assist (tag/squad)
      if (!isBasic || this.rng.chance(0.5)) this.maybeAssist(f, target);
    }
    if (!isBasic) this.shiftMomentum(f.side, 3, `${this.name(f)}'s ${a.name}`);
  }

  private maybeAssist(f: CombatFighter, target: CombatFighter) {
    if (this.input.mode === 'solo' || target.defeated) return;
    const helpers = this.alive(f.side).filter((a) => a.id !== f.id && a.st >= 6 && !hasStatus(a, 'stun'));
    for (const h of helpers) {
      const chance = 0.08 + ARCHETYPES[h.snap.archetype].behavior.assist * 0.06 + (h.snap.temperament === 'cheerful' ? 0.05 : 0);
      if (this.rng.chance(chance)) {
        h.st -= 6;
        this.emit('assist', `${this.name(h)} follows up to assist ${this.name(f)}!`, { actor: h.id, target: target.id, action: 'assist', staminaDelta: -6 });
        this.strike(h, target, { ...BASIC_ATTACK, id: 'assist', name: 'Assist', power: 0.45 }, { noCounter: true, label: 'assist' });
        return;
      }
    }
  }

  /**
   * Resolves one attack as an exchange: the defender reads it and answers with
   * a dodge, block, parry or a clashing move of their own, or gets caught clean.
   * Only clean contact can injure or knock a fighter out.
   */
  private strike(att: CombatFighter, def: CombatFighter, a: Ability, opts: StrikeOpts) {
    if (att.defeated || def.defeated) return;
    // Protection redirect
    let target = def;
    let protectMult = 1;
    if (a.target !== 'all_enemies') {
      const guardian = this.alive(def.side).find((g) => g.protecting === def.id && g.id !== def.id);
      if (guardian) {
        this.emit('protect', `${this.name(guardian)} intercepts the attack meant for ${this.name(def)}!`, { actor: guardian.id, target: def.id, action: 'intercept' });
        target = guardian;
        protectMult = 0.7;
      }
    }
    const adapt = target.adaptation[att.id] ?? 0;
    this.recordSeen(target, att, a.id);
    const moveId = ABILITIES[a.id] ? a.id : undefined;
    const what = a.id === 'basic' ? 'strike' : a.id === 'assist' || a.id === 'combo' || a.id === 'counter' ? 'attack' : a.name;

    const resp = this.chooseResponse(target, att, a, opts);
    let mult = protectMult;
    let response: DefenseResponse = 'clean';

    switch (resp) {
      case 'dodge': {
        target.st = clamp(target.st - 4, 0, target.maxSt);
        const p = this.dodgeChance(target, att, a, opts, adapt);
        if (this.rng.chance(p)) {
          this.emit('miss', `${this.name(target)} reads it and slips past ${att.snap.name}'s ${what}.`, {
            actor: att.id, target: target.id, ability: moveId, action: 'dodge', response: 'dodge', context: { dodgeChance: Math.round(p * 100) },
          });
          this.shiftMomentum(target.side, 4, `${this.name(target)}'s dodge`);
          if (!opts.noCounter && !opts.isCounter) this.maybeCounter(target, att, adapt + 0.05);
          return;
        }
        break; // caught mid-dodge: clean hit
      }
      case 'parry': {
        const p = clamp(0.3 + (target.eff.technique + target.eff.battleIQ - att.eff.technique - att.eff.battleIQ) / 260 + adapt + this.strat(target).counter, 0.08, 0.7);
        if (this.rng.chance(p)) {
          this.emit('parry', `${this.name(target)} deflects ${att.snap.name}'s ${what} and opens them up!`, {
            actor: target.id, target: att.id, ability: moveId, action: 'parry', response: 'parry', context: { parryChance: Math.round(p * 100) },
          });
          att.staggered = true;
          this.strike(target, att, { ...BASIC_ATTACK, id: 'counter', name: 'Counter', power: 0.9 }, { isCounter: true, label: 'counter' });
          if (!att.defeated) this.shiftMomentum(target.side, 8, `${this.name(target)}'s parry`);
          return;
        }
        mult *= 1.1; // misread: wide open
        break;
      }
      case 'clash': {
        const rivalClash = !!this.pendingCounter;
        const counterMove = this.pendingCounter ?? this.readyMove(target)!;
        this.pendingCounter = null;
        const cost = Math.round(counterMove.cost * this.strat(target).cost);
        target.st = clamp(target.st - cost, 0, target.maxSt);
        target.cooldowns[counterMove.id] = counterMove.cooldown;
        target.res.abilitiesUsed++;
        const power = (f: CombatFighter, m: Ability) => m.power * f.eff.attack * (1 + f.mods.dmg) * (1 - injuryPenalty(f, 'attack')) * this.rng.range(0.75, 1.25);
        const pa = power(att, a), pd = power(target, counterMove);
        const margin = (pa - pd) / Math.max(pa, pd);
        const winner = margin > 0.15 ? att : margin < -0.15 ? target : null;
        this.emit('clash', winner
          ? `${a.name} meets ${counterMove.name} head-on. ${this.name(winner)} overpowers it!`
          : `${a.name} and ${counterMove.name} collide and cancel each other out!`, {
          actor: att.id, target: target.id, ability: moveId, action: 'clash', response: 'clash',
          context: { counterMove: counterMove.id, winner: winner?.id ?? '', margin: Math.round(margin * 100), rival: rivalClash },
        });
        if (!winner) {
          for (const f of [att, target]) { f.guard = clamp(f.guard - 25, 0, 100); f.st = clamp(f.st - 6, 0, f.maxSt); }
          return;
        }
        if (winner === target) {
          this.shiftMomentum(target.side, 10, `${this.name(target)} winning the clash`);
          this.land(target, att, counterMove, 0.55, 'clash', {});
          return;
        }
        this.shiftMomentum(att.side, 10, `${this.name(att)} winning the clash`);
        mult *= 0.55;
        response = 'clash';
        break;
      }
      case 'block':
        response = 'block';
        break;
    }
    this.land(att, target, a, mult, response, opts);
  }

  /** The attack connects: blocked, or clean. */
  private land(att: CombatFighter, target: CombatFighter, a: Ability, mult0: number, response: DefenseResponse, opts: StrikeOpts) {
    if (att.defeated || target.defeated) return;
    const wasStaggered = target.staggered;
    const focus = hasStatus(att, 'focus');
    let critChance = 0.07 + att.eff.luck / 450 + att.eff.technique / 900 + this.sideFx[att.side].critBonus + this.strat(att).crit + att.mods.crit + (focus ? focus.magnitude * 0.4 : 0);
    if (wasStaggered) critChance += 0.1;
    const crit = response !== 'block' && this.rng.chance(clamp(critChance, 0.02, 0.55));

    const offenseStat = a.kind === 'summon' ? (att.eff.attack + att.eff.technique) / 2 : att.eff.attack;
    let atk = offenseStat * (1 + att.mods.dmg) * (focus ? 1 + focus.magnitude : 1) * (1 - injuryPenalty(att, 'attack'));
    const weakA = hasStatus(att, 'weaken');
    if (weakA) atk *= 1 - weakA.magnitude;
    if (att.mods.intimidated > 0) atk *= 0.94;
    let dfn = target.eff.defense * (1 + target.mods.def) * this.strat(target).def * this.sideFx[target.side].defenseMult;
    const weakD = hasStatus(target, 'weaken');
    if (weakD) dfn *= 1 - weakD.magnitude * 0.5;

    let dmg = 50 * a.power * Math.pow(atk / 50, 0.65) * (100 / (100 + dfn * 0.7));
    let mult = mult0 * elementMultiplier(a.element, target.snap.tags, target.snap.vulnerability);
    if (a.element && this.env.boost.includes(a.element)) mult *= 1.12;
    if (a.element && this.env.weaken.includes(a.element)) mult *= 0.9;
    for (const e of this.sideFx[att.side].element) if (e && a.element === e.tag) mult *= e.mult;
    mult *= this.sideFx[att.side].damageMult * this.strat(att).dmg;
    // Fighters suited to the arena hit a little harder (arenaFit.ts); a nudge, not a guarantee.
    mult *= this.arenaEdge(att.snap) / Math.sqrt(this.arenaEdge(target.snap));
    if (this.orders[att.side]?.kind === 'all_out') mult *= 1.12;
    const sideMom = att.side === 0 ? this.momentum : -this.momentum;
    mult *= 1 + clamp(sideMom, -50, 100) / 500;
    if (att.snap.archetype === 'Berserker') mult *= 1 + (1 - hpPct(att)) * 0.3;
    if (att.snap.archetype === 'Assassin' && ['Mage', 'Support', 'Ranger', 'Summoner'].includes(target.snap.archetype)) mult *= 1.1;
    if (target.snap.archetype === 'Tank' && att.snap.archetype === 'Assassin') mult *= 0.92;
    if (att.snap.traits.includes('Big Game Player') && this.input.mode === 'squad') mult *= 1.08;
    mult *= att.snap.traits.includes('Steady Hands') ? this.rng.range(0.9, 1.1) : this.rng.range(0.8, 1.2);
    if (crit) mult *= target.snap.traits.includes('Glass Jaw') ? 1.75 : 1.6;

    // Blocking: the guard soaks most of it until it breaks.
    let guardBroke = false;
    if (response === 'block') {
      const guardLoss = Math.round(14 * a.power * Math.pow(atk / Math.max(20, dfn), 0.5) * (target.guarding ? 0.7 : 1));
      target.guard = clamp(target.guard - guardLoss, 0, 100);
      if (target.guard <= 0) { guardBroke = true; mult *= 0.6; }
      else mult *= target.guarding ? 0.18 : 0.28;
    }
    dmg = clamp(Math.round(dmg * mult), 1, Math.round(target.maxHp * 0.4));
    const heavy = dmg / (target.maxHp * 0.1);
    const impact = heavy >= 1.8 ? 'devastating' : heavy >= 1.1 ? 'heavy' : heavy >= 0.5 ? 'solid' : 'glancing';

    const before = target.hp;
    const absorbed = this.applyDamage(target, dmg);
    const clean = response !== 'block' || guardBroke;
    const type: BattleEventType = opts.isCounter ? 'counter' : response === 'block' && !guardBroke ? 'block' : 'attack';
    const verb = a.id === 'basic' ? 'catches' : a.id === 'assist' || a.id === 'combo' ? 'hits' : `lands ${a.name} on`;
    this.emit(type, response === 'block' && !guardBroke
      ? `${this.name(target)} blocks ${att.snap.name}'s ${a.id === 'basic' ? 'strike' : a.name}; the guard holds.`
      : `${this.name(att)} ${verb} ${this.name(target)}: a ${impact} ${clean ? 'clean ' : ''}hit${crit ? ' (CRITICAL)' : ''}${wasStaggered ? ' while they are off balance' : ''}${absorbed ? ', partly absorbed by a shield' : ''}.`, {
      actor: att.id, target: target.id, ability: ABILITIES[a.id] ? a.id : undefined, action: opts.label ?? (a.id === 'basic' ? 'strike' : a.name),
      damage: dmg, crit, hpBefore: before, hpAfter: target.hp, guardAfter: Math.round(target.guard), response: clean && response === 'block' ? 'clean' : response,
      context: { element: a.element ?? '', mult: Math.round(mult * 100) / 100, absorbed, impact },
    });
    att.res.damageDealt += dmg - absorbed;
    if (clean) att.res.cleanHits++;
    if (guardBroke) {
      target.staggered = true;
      this.emit('guard_break', `${this.name(target)}'s guard shatters! They are wide open.`, { actor: att.id, target: target.id, guardAfter: 0 });
      this.queueCorner(target.side, target, 'guard_broken');
      this.shiftMomentum(att.side, 8, `breaking ${this.name(target)}'s guard`);
    } else if (wasStaggered && clean) target.staggered = false;
    if (crit) { att.res.crits++; this.shiftMomentum(att.side, 10, `${this.name(att)}'s critical hit`); }
    if (!target.defeated && clean && (crit || impact === 'devastating') && this.fighters.includes(att)) this.banter(att, 'mock', target);
    if (!target.defeated && before / target.maxHp >= 0.5 && target.hp / target.maxHp < 0.5) this.banter(target, 'pump');
    else if (clean) this.shiftMomentum(att.side, 3, `${this.name(att)}'s clean hit`);

    if (a.status && !target.defeated && response !== 'block') this.applyStatus(att, target, a.status.type, a.status.chance, a.status.duration, a.status.magnitude, a.id);
    this.trackLead(`${this.name(att)}'s ${a.id === 'basic' ? 'strike' : a.name}`);

    if (target.defeated) { this.onDefeat(target, att, 'collapse'); return; }
    if (clean) {
      this.maybeInjure(att, target, a, heavy, crit);
      if (target.defeated) return;
      if (this.knockoutCheck(att, target, a, heavy, crit, wasStaggered)) return;
    }
    this.checkCritical(target);
    if (!opts.noCounter && !opts.isCounter && a.target === 'enemy' && att.snap.reach === 'melee' && response === 'block') this.maybeCounter(target, att, target.adaptation[att.id] ?? 0);
  }

  /** How the defender meets the attack, chosen from their style and state. */
  private chooseResponse(t: CombatFighter, att: CombatFighter, a: Ability, opts: StrikeOpts): DefenseResponse {
    if (hasStatus(t, 'stun') || hasStatus(t, 'freeze') || t.staggered) return 'clean';
    const rc = this.rivalCounter(t, att, a);
    if (rc) { this.pendingCounter = rc; return 'clash'; }
    const aoe = a.target === 'all_enemies';
    const follow = !!opts.isCounter || opts.label === 'assist' || opts.label === 'combo';
    const arch = t.snap.archetype;
    const spd = t.eff.speed * (1 - injuryPenalty(t, 'speed'));
    const opts2: DefenseResponse[] = [];
    const w: number[] = [];
    const add = (r: DefenseResponse, v: number) => { if (v > 0) { opts2.push(r); w.push(v); } };
    add('dodge', (spd / 60) * (arch === 'Assassin' || arch === 'Duelist' ? 1.3 : arch === 'Tank' ? 0.55 : 1) * (t.st >= 4 ? 1 : 0.1));
    const order = this.orders[t.side]?.kind;
    add('block', (order === 'defend' ? 1.8 : order === 'all_out' ? 0.6 : 1) * (t.eff.defense / 60) * (arch === 'Tank' ? 1.6 : 1) * (t.guarding ? 2.5 : 1) * (t.guard > 15 ? 1 : 0.15) * Math.sqrt(this.strat(t).guardW));
    if (!aoe && !follow) add('parry', ((t.eff.technique + t.eff.battleIQ) / 150) * Math.sqrt(t.eff.technique / Math.max(10, att.eff.technique)) * (arch === 'Duelist' ? 1.5 : 1) * (t.snap.temperament === 'patient' ? 1.2 : 1) * (1 + this.strat(t).counter * 3));
    if (!aoe && !follow && a.id !== 'basic' && this.readyMove(t)) add('clash', a.power >= 1.5 ? 1.0 : 0.4);
    add('clean', 0.2 + (t.st < 10 ? 0.6 : 0));
    const sharp = 1 + t.eff.battleIQ / 60;
    return this.rng.weighted(opts2, w.map((x) => Math.pow(x, sharp)));
  }

  private dodgeChance(t: CombatFighter, att: CombatFighter, a: Ability, opts: StrikeOpts, adapt: number): number {
    const spd = t.eff.speed * (1 - injuryPenalty(t, 'speed'));
    const aim = att.eff.technique * (1 - injuryPenalty(att, 'technique'));
    let p = 0.45 + (spd - aim) / 160 + adapt * 0.8 - this.env.accuracyMod - (opts.accBonus ?? 0) - att.mods.acc + injuryPenalty(att, 'accuracy');
    if (a.target === 'all_enemies') p -= 0.1;
    if (att.snap.traits.includes('Steady Hands')) p -= 0.03;
    if (att.mods.provokedTurns > 0) p += att.snap.traits.includes('Short Fuse') ? 0.12 : 0.08;
    if (t.snap.traits.includes('Lucky Star')) p += 0.05;
    if (t.mods.earlyDodgeTurns > 0) p += 0.05;
    return clamp(p, 0.08, 0.8);
  }

  /** Rivals answer each other's signature move with their own, whatever the situation. */
  private rivalCounter(t: CombatFighter, att: CombatFighter, a: Ability): Ability | null {
    for (const rv of this.rivals) {
      const [mine, theirs] = rv.a === att.id && rv.b === t.id ? rv.clash : rv.b === att.id && rv.a === t.id ? [rv.clash[1], rv.clash[0]] : [null, null];
      if (!mine || a.id !== mine) continue;
      const m = ABILITIES[theirs!];
      if (m && t.snap.abilities.includes(m.id) && (t.cooldowns[m.id] ?? 0) === 0 && t.st >= Math.round(m.cost * 0.5)) return m;
    }
    return null;
  }

  /** An offensive move the defender could throw back right now, for a clash. */
  private readyMove(t: CombatFighter): Ability | null {
    for (const id of t.moves) {
      const m = ABILITIES[id];
      if (!m || m.secret || !this.unlocked(t, m) || !(m.kind === 'attack' || m.kind === 'ultimate' || m.kind === 'summon') || m.target !== 'enemy') continue;
      if ((t.cooldowns[id] ?? 0) > 0 || t.st < Math.round(m.cost * this.strat(t).cost) || !this.triggerOk(t, m)) continue;
      return m;
    }
    return null;
  }

  private maybeInjure(att: CombatFighter, t: CombatFighter, a: Ability, heavy: number, crit: boolean) {
    const vfx = a.vfx ?? (a.fx.style === 'slash' ? 'slash' : 'punch');
    let p = 0.04 + Math.min(1.5, heavy) * 0.1 + (crit ? 0.22 : 0) + (vfx === 'slash' ? 0.05 : 0);
    if (t.snap.traits.includes('Glass Jaw')) p += 0.05;
    if (!this.rng.chance(clamp(p, 0, 0.6))) return;
    const parts: Record<string, BodyPart[]> = {
      slash: ['arm', 'torso', 'leg', 'arm'], punch: ['head', 'torso', 'head', 'arm'], barrage: ['head', 'torso', 'arm'],
      beam: ['torso', 'arm', 'leg'], explosion: ['torso', 'leg', 'head'], projectile: ['torso', 'arm'], lightning: ['torso', 'arm', 'head'],
      fire: ['torso', 'arm'], ice: ['leg', 'arm'], wave: ['torso', 'leg'], summon: ['torso', 'leg', 'arm'],
    };
    const part = this.rng.pick(parts[vfx] ?? ['torso', 'arm', 'leg', 'head']);
    const sev: 1 | 2 = crit || heavy >= 1.3 ? 2 : 1;
    const existing = t.injuries.find((i) => i.part === part);
    let injury: BattleInjury;
    if (existing) {
      if (existing.severity === 2) return;
      existing.severity = 2;
      existing.label = INJURY_LABELS[part][1];
      injury = existing;
    } else {
      injury = { part, severity: sev, label: INJURY_LABELS[part][sev - 1] };
      t.injuries.push(injury);
    }
    this.emit('injury', `${this.name(t)} is hurt: ${injury.label.toLowerCase()}. ${INJURY_EFFECT[part]}`, { actor: att.id, target: t.id, injury: { ...injury } });
    if (injury.severity === 2) this.queueCorner(t.side, t, 'serious_injury');
    if (injuryLoad(t) >= INJURY_LIMIT + (this.secondWind.has(t.id) ? 2 : 0)) {
      if (this.trySecondWind(t)) return;
      this.onDefeat(t, att, 'stoppage');
    }
  }

  /** Once per fight, a fighter about to be stopped may find a second wind. */
  private trySecondWind(t: CombatFighter): boolean {
    if (this.secondWind.has(t.id)) return false;
    if (!this.flavorRng.chance(0.18 + t.eff.potential / 500)) return false;
    this.secondWind.add(t.id);
    this.twist(`secondwind:${t.id}`, 'SECOND WIND!', `The referee moves to stop it, but ${this.name(t)} refuses! They fight on.`, t);
    t.guard = 60; t.staggered = false; t.st = clamp(t.st + 25, 0, t.maxSt);
    return true;
  }

  /** Clean hits can end a fight at any time; the more worn down, the likelier. */
  private knockoutCheck(att: CombatFighter, t: CombatFighter, a: Ability, heavy: number, crit: boolean, staggered: boolean): boolean {
    const wear = 1 - hpPct(t);
    let p = Math.pow(wear, 2.4) * (0.12 + Math.min(1.6, heavy) * 0.45);
    if (crit) p *= 1.5;
    if (staggered) p *= 1.4;
    for (const i of t.injuries) if (i.part === 'head') p *= 1 + 0.25 * i.severity;
    p *= 1 + 0.35 * t.knockdowns;
    if (a.kind === 'ultimate') p *= 1.6;
    p *= 1.15 - (t.eff.stamina + t.eff.defense) / 400;
    if (t.snap.traits.includes('Glass Jaw')) p *= 1.2;
    p = clamp(p, 0, 0.92);
    const r = this.rng.next();
    // A fresh fighter can be dropped but not finished: knockouts need real punishment first.
    const canFinish = wear >= 0.4 || t.knockdowns >= 2;
    if (r < p && canFinish) {
      if (t.snap.traits.includes('Iron Will') && !t.ironWillUsed) {
        t.ironWillUsed = true;
        t.staggered = true;
        t.guard = 0;
        this.emit('iron_will', `That should have finished ${this.name(t)}, but Iron Will drags them back to their feet!`, { target: t.id, actor: att.id });
        return false;
      }
      this.onDefeat(t, att, a.kind === 'ultimate' ? 'finisher' : 'knockout');
      return true;
    }
    if (r < p * 2.2 && wear > 0.3) {
      t.knockdowns++;
      t.res.knockdowns = t.knockdowns;
      t.guard = 0;
      t.staggered = true;
      t.st = clamp(t.st - 15, 0, t.maxSt);
      this.emit('knockdown', `${this.name(t)} goes DOWN!`, { actor: att.id, target: t.id, context: { knockdowns: t.knockdowns } });
      this.shiftMomentum(att.side, 15, `knocking ${this.name(t)} down`);
      if (t.knockdowns >= 3 + (this.secondWind.has(t.id) ? 1 : 0)) {
        if (!this.trySecondWind(t)) { this.onDefeat(t, att, 'stoppage'); return true; }
      }
      if (this.fighters.includes(att)) this.banter(att, 'mock', t);
      this.considerJumpIn(t.side, t, att);
      this.emit('get_up', t.knockdowns === 1 ? `${this.name(t)} gets back up, shaking it off.` : `${this.name(t)} staggers up again, barely.`, { actor: t.id, context: { knockdowns: t.knockdowns } });
      this.queueCorner(t.side, t, 'knocked_down');
      this.queueCorner(att.side, att, 'opponent_down');
    }
    return false;
  }

  private maybeCounter(def: CombatFighter, att: CombatFighter, adapt: number) {
    if (def.defeated || att.defeated || hasStatus(def, 'stun') || def.staggered) return;
    let c = 0.05 + (def.eff.technique - att.eff.technique) / 400 + this.strat(def).counter + adapt * 0.6;
    if (def.snap.archetype === 'Duelist') c += 0.08;
    if (def.snap.temperament === 'patient') c += 0.05;
    if (def.guarding) c += 0.1;
    if (hasStatus(def, 'focus') && def.snap.abilities.includes('riposte_stance')) c += 0.15;
    if (this.rng.chance(clamp(c, 0, 0.45))) {
      this.strike(def, att, { ...BASIC_ATTACK, id: 'counter', name: 'Counter', power: 0.85 }, { isCounter: true, label: 'counter' });
      if (!att.defeated) this.shiftMomentum(def.side, 8, `${this.name(def)}'s counter`);
    }
  }

  private recordSeen(target: CombatFighter, att: CombatFighter, action: string) {
    const list = (target.seen[att.id] ??= []);
    list.push(action);
    if (list.length > 4) list.shift();
    const repeats = list.filter((x) => x === action).length;
    const temp = TEMPERAMENTS[target.snap.temperament];
    const rate = (temp.adapts ? 0.05 : target.eff.adaptability > 70 ? 0.025 : 0) * (target.snap.traits.includes('Cold Reader') ? 2 : 1);
    if (repeats >= 2 && rate > 0) {
      const prev = target.adaptation[att.id] ?? 0;
      const next = Math.min(0.3, prev + rate);
      target.adaptation[att.id] = next;
      if (prev < 0.1 && next >= 0.1) {
        this.emit('adapt', `${this.name(target)} has read ${this.name(att)}'s pattern and adapts (harder to hit, more counters).`, { actor: target.id, target: att.id, action: 'adapt', context: { adaptation: Math.round(next * 100) } });
      }
    }
  }

  private applyStatus(src: CombatFighter, t: CombatFighter, type: StatusType, chance: number, duration: number, magnitude: number, abilityId: string) {
    if (t.defeated) return;
    const offensive = type === 'stun' || type === 'freeze' || type === 'burn' || type === 'bleed' || type === 'weaken';
    if (offensive && t.side === src.side) return;
    if ((type === 'stun' || type === 'freeze') && t.stunImmune > 0) {
      this.emit('status', `${this.name(t)} shrugs off the ${type} (recently disabled).`, { target: t.id, ability: abilityId, status: { type, applied: false } });
      return;
    }
    if (!this.rng.chance(chance)) return;
    const existing = t.statuses.find((s) => s.type === type);
    if (existing) { existing.duration = Math.max(existing.duration, duration); existing.magnitude = Math.max(existing.magnitude, magnitude); }
    else t.statuses.push({ type, duration, magnitude });
    this.emit('status', `${this.name(t)} is afflicted with ${type}${duration ? ` for ${duration} action(s)` : ''}.`, {
      actor: src.id, target: t.id, ability: abilityId, status: { type, applied: true, duration },
    });
  }

  /** Wears down endurance through shields; returns amount absorbed. Handles Iron Will. */
  private applyDamage(t: CombatFighter, dmg: number): number {
    let absorbed = 0;
    const sh = hasStatus(t, 'shield');
    if (sh && sh.magnitude > 0) {
      absorbed = Math.min(sh.magnitude, dmg);
      sh.magnitude -= absorbed;
      if (sh.magnitude <= 0) { sh.duration = 0; t.statuses = t.statuses.filter((s) => s !== sh); }
    }
    const real = dmg - absorbed;
    t.hp = clamp(t.hp - real, 0, t.maxHp);
    t.res.damageTaken += real;
    if (t.hp === 0 && t.snap.traits.includes('Iron Will') && !t.ironWillUsed) {
      t.ironWillUsed = true;
      t.hp = 1;
      this.emit('iron_will', `${this.name(t)} should have collapsed, but Iron Will keeps them standing!`, { target: t.id, hpAfter: 1 });
    }
    if (t.hp === 0) t.defeated = true;
    t.res.minHpPct = Math.min(t.res.minHpPct, t.hp / t.maxHp);
    return absorbed;
  }

  private onDefeat(t: CombatFighter, by: CombatFighter | null, how: 'knockout' | 'finisher' | 'stoppage' | 'collapse') {
    if (t.res.howDown) return;
    t.defeated = true;
    t.statuses = [];
    t.protecting = null;
    t.res.howDown = how;
    this.lastHow = how;
    const text = how === 'finisher' ? `${by ? this.name(by) : 'The finisher'} puts ${this.name(t)} away for good. KNOCKOUT!`
      : how === 'knockout' ? `${this.name(t)} is out cold${by ? ` from ${this.name(by)}'s hit` : ''}. KNOCKOUT!`
        : how === 'stoppage' ? `${this.name(t)} is too hurt to continue. The fight is stopped!`
          : `${this.name(t)} collapses and cannot get up.`;
    this.emit('defeat', text, { actor: by?.id, target: t.id, hpAfter: t.hp, context: { how } });
    if (by) this.shiftMomentum(by.side, 22, `${this.name(t)}'s defeat`);
    // Twists in team fights: avenging a fallen partner, and the last one standing.
    const allies = this.alive(t.side);
    if (allies.length) {
      for (const a of allies) {
        const bond = !!duoOf(a.id, t.id);
        const t0 = a.snap.temperament;
        if ((bond || t0 === 'hot-blooded' || t0 === 'cheerful' || t0 === 'defensive') && this.flavorRng.chance(bond ? 0.9 : 0.5)
          && this.twist(`avenge:${a.id}`, 'AVENGE!', `${this.name(a)} watches ${this.name(t)} fall, and something snaps!`, a)) {
          a.mods.dmg += 0.15; a.guard = 100; a.staggered = false;
          a.statuses.push({ type: 'focus', duration: 3, magnitude: 0.2 });
        }
      }
      if (allies.length === 1 && hpPct(allies[0]) < 0.6 && this.twist(`laststand:${t.side}`, 'LAST STAND!', `${this.name(allies[0])} is the last one standing and refuses to go down quietly!`, allies[0])) {
        allies[0].st = allies[0].maxSt; allies[0].mods.dmg += 0.12; allies[0].guard = 100;
      }
      this.considerJumpIn(t.side, allies[0], by);
    }
    // Replacement: if the frontline collapses, the backline steps up.
    const side = this.alive(t.side);
    if (side.length && !side.some((f) => f.position === 'front')) {
      const next = side.slice().sort((a, b) => b.eff.defense - a.eff.defense)[0];
      next.position = 'front';
      this.emit('replacement', `${this.name(next)} steps up to the frontline.`, { actor: next.id, action: 'replace' });
    }
    // Final exchange
    if (!this.finalExchange) {
      const a = this.alive(0), b = this.alive(1);
      if (a.length === 1 && b.length === 1 && hpPct(a[0]) < 0.4 && hpPct(b[0]) < 0.4) {
        this.finalExchange = true;
        this.emit('final_exchange', `It comes down to ${this.name(a[0])} and ${this.name(b[0])}. The final exchange begins!`, { actor: a[0].id, target: b[0].id });
      }
    }
  }

  private checkCritical(t: CombatFighter) {
    if (!t.criticalShown && hpPct(t) < 0.15) {
      t.criticalShown = true;
      this.emit('critical_moment', `${this.name(t)} is barely standing!`, { target: t.id, hpAfter: t.hp });
      this.queueCorner(t.side, t, 'barely_standing');
      this.banter(t, 'pump');
      this.considerJumpIn(t.side, t, null);
      // A hidden technique can surface exactly when it is needed.
      const hidden = this.bestMove(t, true, true);
      if (hidden && hidden.kind === 'ultimate' && this.flavorRng.chance(0.35) && this.twist(`hidden:${t.id}`, 'A HIDDEN TECHNIQUE!', `With nothing left to lose, ${this.name(t)} reaches for ${hidden.name}!`, t)) {
        this.forceUltimate.add(t.id);
        t.st = clamp(t.st + hidden.cost, 0, t.maxSt);
      }
    }
    if (!this.finalExchange) {
      const a = this.alive(0), b = this.alive(1);
      if (a.length === 1 && b.length === 1 && hpPct(a[0]) < 0.3 && hpPct(b[0]) < 0.3) {
        this.finalExchange = true;
        this.emit('final_exchange', `Both ${this.name(a[0])} and ${this.name(b[0])} are nearly spent. The final exchange begins!`, { actor: a[0].id, target: b[0].id });
      }
    }
  }

  /** Kit moves need their form; a secret move waits for its moment and comes out once. */
  private unlocked(f: CombatFighter, a: Ability): boolean {
    if (a.form && f.stage < a.form) return false;
    if (a.secret) return !f.secretUsed && (f.secretOpen || this.kitMoment(f, a.secret));
    return true;
  }

  /** The moments that bring out a form or a secret move. In a 1-on-1 there are no teammates,
   *  so "a teammate falls" means being badly hurt and "last one standing" means nearly beaten. */
  private kitMoment(f: CombatFighter, when: KitTrigger): boolean {
    const hp = hpPct(f);
    const team = this.fighters.filter((x) => x.side === f.side);
    const alone = team.length === 1;
    switch (when) {
      case 'hp70': return hp < 0.7;
      case 'hp50': return hp < 0.5;
      case 'hp30': return hp < 0.3;
      case 'ally': return alone ? hp < 0.4 : team.some((x) => x !== f && x.defeated);
      case 'last': return alone ? hp < 0.3 : team.every((x) => x === f || x.defeated);
    }
  }

  /** Transformations: when the moment comes, a fighter may reach their next form. */
  private checkTransform(f: CombatFighter, now = false) {
    const next = f.kit?.forms[f.stage];
    if (!next || (!now && (!this.kitMoment(f, next.trigger) || !this.plotRng.chance(0.55)))) return;
    f.stage++;
    f.mods.dmg += 0.1;
    f.eff.speed = Math.round(f.eff.speed * 1.05 * 10) / 10;
    f.eff.defense = Math.round(f.eff.defense * 1.05 * 10) / 10;
    const before = f.hp;
    f.hp = Math.min(f.maxHp, f.hp + Math.round(f.maxHp * 0.06));
    f.guard = 100;
    f.staggered = false;
    const unlocked = f.kit!.moves.filter((m) => m.form === f.stage).map((m) => m.name);
    this.emit('transform', `${this.name(f)} transforms: ${next.name.toUpperCase()}!${unlocked.length ? ` New moves: ${unlocked.join(', ')}.` : ''}`, {
      actor: f.id, action: next.name, heal: f.hp - before, hpBefore: before, hpAfter: f.hp,
      context: { form: next.name, stage: f.stage, color: next.color, look: next.look, unlocked: unlocked.join(', ') },
    });
    this.shiftMomentum(f.side, 12, `${this.name(f)}'s transformation`);
  }

  private checkAwakening(f: CombatFighter) {
    // A fighter who has already transformed has had their power-up.
    if (f.awakened || f.stage > 0 || hpPct(f) >= 0.25) return;
    let chance = 0.2 + f.eff.potential / 400 + f.eff.adaptability / 800;
    if (f.snap.traits.includes('Late Bloomer')) chance += 0.35;
    if (this.input.rivalry && this.input.rivalry.intensity >= 2) chance += 0.05;
    f.awakened = true; // one roll per battle
    if (!this.rng.chance(chance)) return;
    f.res.awakened = true;
    f.mods.dmg += 0.2;
    f.mods.crit += 0.05;
    const heal = Math.round(f.maxHp * 0.12);
    const before = f.hp;
    f.hp = Math.min(f.maxHp, f.hp + heal);
    f.st = clamp(f.st + 30, 0, f.maxSt);
    f.guard = 100;
    f.staggered = false;
    this.emit('awakening', `${this.name(f)} AWAKENS! Hidden power surges (+20% damage, +5% crit, a second wind and a fresh guard).`, {
      actor: f.id, heal: f.hp - before, hpBefore: before, hpAfter: f.hp, staminaDelta: 30, context: { chance: Math.round(chance * 100) },
    });
    this.shiftMomentum(f.side, 20, `${this.name(f)}'s awakening`);
    this.trackLead(`${this.name(f)}'s awakening`);
  }

  private fitCache = new Map<string, number>();
  private arenaEdge(f: FighterSnapshot): number {
    let v = this.fitCache.get(f.charId);
    if (v === undefined) { v = fitEdge(arenaFit(f, this.env.id)); this.fitCache.set(f.charId, v); }
    return v;
  }

  private environmentTick() {
    const hz = this.env.hazard;
    if (!hz) return;
    const alive = this.fighters.filter((f) => !f.defeated).length;
    if (this.turn % Math.max(2, alive) !== 0) return;
    if (!this.rng.chance(hz.chance)) return;
    const hit = this.fighters.filter((f) => !f.defeated && !f.snap.tags.some((t) => hz.spares.includes(t)));
    if (!hit.length) return;
    this.emit('environment', `${hz.text}! ${hz.name} strikes ${hit.map((f) => f.snap.name).join(', ')} (${hz.spares.join('/')} fighters are spared).`, { action: hz.name });
    for (const f of hit) {
      const dmg = Math.max(1, Math.round(f.maxHp * hz.damagePct));
      const before = f.hp;
      this.applyDamage(f, dmg);
      this.emit('attack', `${hz.name} batters ${this.name(f)}.`, { target: f.id, damage: dmg, hpBefore: before, hpAfter: f.hp, action: hz.name, context: { environmental: true } });
      if (f.defeated) this.onDefeat(f, null, 'collapse');
    }
  }

  private trackLead(reason: string) {
    const score = (s: 0 | 1) => {
      const fs = this.fighters.filter((f) => f.side === s);
      return fs.reduce((a, f) => a + f.hp / f.maxHp, 0) / fs.length;
    };
    const diff = score(0) - score(1);
    const sign = Math.abs(diff) < 0.05 ? 0 : Math.sign(diff);
    if (sign !== 0 && this.hpLeadSign !== 0 && sign !== this.hpLeadSign) this.turningPoint = reason;
    if (sign !== 0) this.hpLeadSign = sign;
  }

  private checkWinner(): 0 | 1 | null {
    const a = this.alive(0).length, b = this.alive(1).length;
    if (a === 0 && b === 0) return this.judgesDecision();
    if (b === 0) return 0;
    if (a === 0) return 1;
    return null;
  }

  /** Judges score clean hits, knockdowns, injuries and who is still standing strong. */
  private judgesDecision(): 0 | 1 {
    const pct = (s: 0 | 1) => this.fighters.filter((f) => f.side === s).reduce((n, f) =>
      n + (f.defeated ? 0 : 4 + (f.hp / f.maxHp) * 6) - f.knockdowns * 3 - injuryLoad(f) * 1.5 + f.res.cleanHits * 0.3, 0);
    const pa = pct(0), pb = pct(1);
    if (Math.abs(pa - pb) > 1e-9) return pa > pb ? 0 : 1;
    const dmg = (s: 0 | 1) => this.fighters.filter((f) => f.side === s).reduce((n, f) => n + f.res.damageDealt, 0);
    return dmg(0) >= dmg(1) ? 0 : 1;
  }

  private finish(winner: 0 | 1, decision0: 'ko' | 'judges'): BattleResult {
    const decision = decision0 === 'ko' && this.lastHow === 'stoppage' ? 'stoppage' : decision0;
    const wNames = this.input.sides[winner].fighters.map((f) => f.name).join(' & ');
    if (decision === 'judges') this.emit('conclusion', `Time! The battle goes to the judges, who score clean hits, knockdowns and injuries.`, { context: { decision } });
    else this.emit('conclusion', `The last opponent is finished. ${wNames} stand victorious.`, { context: { decision } });
    for (const f of this.fighters) {
      f.res.hp = f.hp; f.res.stamina = Math.round(f.st); f.res.defeated = f.defeated; f.res.form = f.form;
      f.res.knockdowns = f.knockdowns; f.res.injuries = f.injuries.map((i) => ({ ...i }));
      f.res.minHpPct = Math.round(f.res.minHpPct * 1000) / 1000;
    }
    const winners = this.fighters.filter((f) => f.side === winner);
    const standout = winners.slice().sort((a, b) => b.res.cleanHits - a.res.cleanHits || b.res.damageDealt - a.res.damageDealt)[0];
    this.emit('verdict', `Winner: side ${winner === 0 ? 'A' : 'B'} (${wNames}) by ${decision === 'ko' ? 'knockout' : decision === 'stoppage' ? 'stoppage' : "judges' decision"} after ${this.turn} actions.`, {
      context: { winnerSide: winner, decision, turns: this.turn },
    });
    const events = this.events;
    const hash = hashString(JSON.stringify(events.map((e) => [e.seq, e.type, e.actor, e.target, e.damage, e.heal, e.hpAfter, e.response, e.guardAfter, e.injury?.label])) + winner).toString(16);
    return {
      battleId: this.input.battleId,
      winnerSide: winner,
      decision,
      turns: this.turn,
      events,
      fighters: this.fighters.map((f) => ({ ...f.res })),
      turningPoint: this.turningPoint,
      standout: standout?.id ?? null,
      momentumSwings: this.swings,
      hash,
    };
  }
}

export function simulateBattle(input: BattleInput): BattleResult {
  if (input.engineVersion !== ENGINE_VERSION) {
    throw new Error(`Battle was recorded with engine ${input.engineVersion}; this build runs ${ENGINE_VERSION}. Exact replay is not possible.`);
  }
  if (!input.sides[0].fighters.length || !input.sides[1].fighters.length) throw new Error('Both sides need at least one fighter.');
  return new BattleSim(structuredClone(input)).run();
}
