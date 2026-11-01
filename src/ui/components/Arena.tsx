// Visual battle stage. Everything shown is driven by the verified event at
// the current playback position: effects never invent hits or damage.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { BattleEvent, BattleInjury, BattleRecord, FighterSnapshot, Player, PublicCharacter, VfxKind } from '../../engine/types';
import { ABILITIES, getAbility, vfxOf } from '../../engine/data/abilities';
import { getEnvironment } from '../../engine/data/world';
import { Rng } from '../../engine/rng';
import { ArenaBackdrop } from './ArenaBackdrop';
import { CharArt } from './Portrait';
import { FighterStatus } from './InjuryReport';
import { FxLayer } from '../fx/FxLayer';
import { useApp } from '../../store/store';
import { useFormPicture } from '../formPortraits';

export interface LiveFighter {
  snap: FighterSnapshot; hp: number; maxHp: number; st: number; maxSt: number; down: boolean; awakened: boolean; position: 'front' | 'back'; form: number;
  guard: number; injuries: BattleInjury[]; knockdowns: number; floored: boolean; staggered: boolean; howDown?: string;
  /** A bench fighter stepping in for one move. */
  fromBench?: boolean;
  /** Transformation reached mid-fight (Sage Mode, Bankai...), shown on the portrait. */
  formName?: string; formColor?: string; stage?: number;
}

/** A fighter's state in words, the way a commentator would describe it. */
export function conditionOf(f: { hp: number; maxHp: number }): { label: string; tone: string } {
  const p = f.hp / f.maxHp;
  if (p >= 0.85) return { label: 'Fresh', tone: 'fresh' };
  if (p >= 0.6) return { label: 'Bruised', tone: 'ok' };
  if (p >= 0.35) return { label: 'Hurt', tone: 'mid' };
  if (p >= 0.15) return { label: 'Battered', tone: 'low' };
  return { label: 'Barely standing', tone: 'crit' };
}
type Pt = { x: number; y: number };

const ENV_HAZARD_FX: Record<string, VfxKind> = { volcano: 'explosion', storm: 'lightning', tundra: 'ice', ocean: 'wave' };

function fxKindFor(e: BattleEvent, snap: FighterSnapshot | undefined, envId: string): VfxKind | null {
  if (e.context?.environmental) return ENV_HAZARD_FX[envId] ?? 'explosion';
  if (e.ability && ABILITIES[e.ability]) return vfxOf(ABILITIES[e.ability]);
  if (e.action === 'combo') return 'barrage';
  if (!snap) return 'punch';
  return snap.reach === 'ranged' ? 'projectile' : snap.archetype === 'Duelist' || snap.archetype === 'Assassin' ? 'slash' : 'punch';
}

function colorsFor(e: BattleEvent, envId: string): [string, string] {
  if (e.ability && ABILITIES[e.ability]) { const a = ABILITIES[e.ability]; return [a.fx.color, a.color2 ?? '#ffffff']; }
  if (e.context?.environmental) return [getEnvironment(envId).palette[2], '#ffffff'];
  return ['#e5e7eb', '#ffffff'];
}

export function ArenaStage({ record, cur, done, fighters, momentum, players, characters }: {
  record: BattleRecord; cur: BattleEvent | null; done: boolean; fighters: Map<string, LiveFighter>; momentum: number;
  players: Player[]; characters: Record<string, PublicCharacter>;
}) {
  const { input, result } = record;
  const env = getEnvironment(input.environmentId);
  const arenaRef = useRef<HTMLDivElement>(null);
  const standRefs = useRef(new Map<string, HTMLDivElement>());
  const [pos, setPos] = useState<Record<string, Pt>>({});
  // GPU effects replace the simpler CSS effects once the canvas is ready.
  const [gpu, setGpu] = useState(false);
  const motionSetting = useApp((s) => s.settings.reducedMotion);
  const reduced = motionSetting === 'on' || (motionSetting === 'system' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const stageRef = useRef<HTMLDivElement>(null);
  const size = Math.max(input.sides[0].fighters.length, input.sides[1].fighters.length);
  const pcolor = (side: 0 | 1) => players.find((p) => p.id === input.sides[side].playerId)?.color ?? (side ? '#f472b6' : '#a78bfa');

  useLayoutEffect(() => {
    const measure = () => {
      const a = arenaRef.current?.getBoundingClientRect();
      if (!a) return;
      const next: Record<string, Pt> = {};
      standRefs.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        next[id] = { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height * 0.45 };
      });
      setPos((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  const live = cur && !done ? cur : null;
  const actorSnap = live?.actor ? fighters.get(live.actor)?.snap : undefined;
  const isStrike = !!live && ['attack', 'counter', 'block', 'miss', 'parry'].includes(live.type);
  const isClash = live?.type === 'clash';
  const kind = isStrike && live ? fxKindFor(live, actorSnap, input.environmentId) : null;
  const melee = kind === 'punch' || kind === 'slash' || (kind === 'barrage' && actorSnap?.reach === 'melee');
  const bigHit = !!live && (live.crit || kind === 'explosion' || (!!live.ability && ABILITIES[live.ability]?.kind === 'ultimate'));
  const heavy = live?.context?.impact === 'heavy' || live?.context?.impact === 'devastating';
  const shake = live && isStrike && live.type !== 'miss' && live.type !== 'block' ? (bigHit ? 'shake-big' : heavy ? 'shake' : '')
    : live?.type === 'knockdown' || isClash ? 'shake-big' : live?.type === 'awakening' || live?.type === 'environment' || live?.type === 'guard_break' ? 'shake' : '';

  // Restart the shake animation on each qualifying event without remounting the stage.
  useLayoutEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    el.classList.remove('shake', 'shake-big');
    if (shake) { void el.offsetWidth; el.classList.add(shake); }
  }, [live?.seq, shake]);

  // Move banner: the most recent move announcement within the current action.
  let banner: BattleEvent | null = null;
  if (live) {
    for (let i = live.seq - 1; i >= 0; i--) {
      const e = result.events[i];
      if (e.turn !== live.turn) break;
      if ((e.type === 'ability' || e.type === 'desperation') && e.ability && ABILITIES[e.ability]) { banner = e; break; }
    }
  }
  const bannerAbility = banner?.ability ? getAbility(banner.ability) : null;
  const cutIn = live && (live.type === 'ability' || live.type === 'desperation') && live.ability && ABILITIES[live.ability] && (getAbility(live.ability).kind === 'ultimate' || getAbility(live.ability).kind === 'buff' || vfxOf(getAbility(live.ability)) === 'domain');

  // A bench fighter sent in (corner call or jumping in on their own) steps into the arena for their moment.
  const benchId = live ? (live.type === 'call' && typeof live.context?.reserve === 'string' ? live.context.reserve
    : live.type === 'reinforcement' || (live.type === 'banter' && live.context?.kind === 'jump') ? live.actor : undefined) : undefined;
  const renderSide = (side: 0 | 1) => {
    const list = input.sides[side].fighters.map((f) => fighters.get(f.charId)!);
    const bench = benchId ? (input.sides[side].reserves ?? []).find((r) => r.charId === benchId) : undefined;
    if (bench) list.push({ snap: bench, hp: 100, maxHp: 100, st: 100, maxSt: 100, down: false, awakened: false, position: 'front', form: 1, guard: 100, injuries: [], knockdowns: 0, floored: false, staggered: false, fromBench: true });
    const front = list.filter((f) => f.position === 'front');
    const back = list.filter((f) => f.position === 'back');
    const sw = size === 1 ? 'clamp(130px, 20vw, 220px)' : size === 2 ? 'clamp(96px, 14vw, 170px)' : size === 3 ? 'clamp(84px, 11vw, 156px)' : 'clamp(72px, 8.8vw, 128px)';
    const stand = (f: LiveFighter) => {
      const cond = conditionOf(f);
      const acting = live?.actor === f.snap.charId;
      const hit = !!live && live.target === f.snap.charId && ['attack', 'counter', 'status_tick'].includes(live.type);
      const blocking = !!live && live.target === f.snap.charId && live.type === 'block';
      const pc = characters[f.snap.charId];
      return (
        <div key={f.snap.charId} className={`stand${f.fromBench ? ' from-bench' : ''}${f.hp / f.maxHp < 0.3 && !f.down ? ' hurt' : ''}${acting ? ' acting' : ''}${acting && (melee || isClash) ? ' lunge' : ''}${hit ? ' hit' : ''}${blocking ? ' blocking' : ''}${f.floored ? ' floored' : ''}${f.staggered && !f.down ? ' staggered' : ''}${f.down ? ' down' : ''}${f.awakened ? ' awakened' : ''}${f.stage ? ` formed stage-${Math.min(3, f.stage)}` : ''}`}
          style={{ ['--form' as string]: f.formColor ?? '#f5c451', ['--sw' as string]: sw, ['--side' as string]: pcolor(side), ['--lx' as string]: side === 0 ? '46px' : '-46px', ['--fall' as string]: side === 0 ? '-14deg' : '14deg' } as CSSProperties}>
          <div className="pf" ref={(el) => { if (el) standRefs.current.set(f.snap.charId, el); else standRefs.current.delete(f.snap.charId); }}>
            {pc ? <FighterArt c={pc} stage={f.stage ?? 0} /> : null}
            <InjuryCracks injuries={f.injuries} fresh={live?.type === 'injury' && live.target === f.snap.charId ? live.seq : null} flip={side === 1} />
            {f.fromBench && <span className="badge bench-badge">FROM THE BENCH</span>}
            {f.formName && <span className="badge form-badge">{f.formName}</span>}
            {f.form >= 1.06 && <span className="badge good">TOP FORM</span>}
            {f.form <= 0.94 && <span className="badge bad">OFF DAY</span>}
            {input.mode !== 'solo' && <span className="pos">{f.position === 'front' ? 'FRONT' : 'BACK'}</span>}
            <div className="plate"><b>{f.snap.name}</b><span className={`cond ${cond.tone}`}>{input.mode !== 'solo' ? `${f.position === 'front' ? 'FRONT' : 'BACK'} · ` : ''}{f.down ? (f.howDown === 'stoppage' ? 'Stopped' : 'Knocked out') : cond.label}</span></div>
            {f.knockdowns > 0 && !f.down && <span className="kd-mark" title={`Knocked down ${f.knockdowns} time(s)`}>{'▼'.repeat(f.knockdowns)}</span>}
            {f.down && <div className="ko">{f.howDown === 'stoppage' ? 'STOP' : 'K.O.'}</div>}
          </div>
          <FighterStatus injuries={f.injuries} guard={f.guard} staminaPct={f.st / f.maxSt} down={f.down || f.floored} />
          <div className="shadow" />
        </div>
      );
    };
    return (
      <div className={`team ${side === 0 ? 'left' : 'right'}`}>
        {back.length > 0 && <div className="line back">{back.map(stand)}</div>}
        <div className="line front">{front.map(stand)}</div>
      </div>
    );
  };

  const from = live?.actor ? pos[live.actor] : undefined;
  const to = live?.target ? pos[live.target] : undefined;
  const w = arenaRef.current?.clientWidth ?? 800;
  const h = arenaRef.current?.clientHeight ?? 500;
  const css = !gpu;

  const staging = {
    impactFrame: () => {
      const el = arenaRef.current;
      if (!el) return;
      el.classList.remove('impact-frame');
      void el.offsetWidth;
      el.classList.add('impact-frame');
      setTimeout(() => el.classList.remove('impact-frame'), 140);
    },
    zoom: (at: Pt) => {
      const el = stageRef.current;
      if (!el) return;
      el.style.setProperty('--zx', `${at.x}px`);
      el.style.setProperty('--zy', `${at.y}px`);
      el.classList.add('zoom');
      setTimeout(() => el.classList.remove('zoom'), 950);
    },
  };
  const fxKind = live ? (isStrike || live.type === 'ability' || live.type === 'desperation' || live.type === 'reinforcement' ? fxKindFor(live, actorSnap, input.environmentId) : null) : null;
  const fxCtx = live ? {
    e: live, from, to: to ?? (live.type === 'awakening' ? from : undefined), kind: fxKind, colors: colorsFor(live, input.environmentId),
    partnerAt: typeof live.context?.partner === 'string' ? pos[live.context.partner] : undefined, stage: staging, reduced,
  } : null;

  return (
    <>
    <div ref={arenaRef} className={`arena2${size > 2 ? ' squad' : ''}`} style={{ ['--env-accent' as string]: env.palette[2] + '55' } as CSSProperties}>
      <ArenaBackdrop envId={input.environmentId} />
      <div className="arena-hud">
        <div><div className="env-name">{env.name}</div><div className="faint" style={{ fontSize: 11 }}>{input.mode === 'solo' ? 'Solo Duel' : input.mode === 'tag' ? 'Tag Team' : 'Squad Battle'}</div></div>
        <div className="faint" style={{ fontSize: 11, textAlign: 'right' }}>Action {cur?.turn ?? 0}</div>
      </div>
      <div className="mom-bar" aria-label="Momentum" title="Momentum">
        <span style={{ background: momentum >= 0 ? pcolor(0) : pcolor(1), left: momentum >= 0 ? '50%' : `${50 + momentum / 2}%`, width: `${Math.abs(momentum) / 2}%` }} />
      </div>
      <div className="stage" ref={stageRef}>{renderSide(0)}{renderSide(1)}</div>
      <FxLayer ctx={fxCtx} seq={live?.seq ?? 0} onReady={setGpu} />

      <div className="fx-layer" key={live?.seq ?? 'none'}>
        {css && live && kind && from && to && live.type !== 'parry' && <Effect kind={kind} from={from} to={to} colors={colorsFor(live, input.environmentId)} seq={live.seq} miss={live.type === 'miss' || live.type === 'block'} w={w} h={h} />}
        {css && live?.type === 'block' && to && <div className="fx-dome" style={{ left: to.x, top: to.y, ['--c' as string]: '#93c5fd' } as CSSProperties} />}
        {css && live?.type === 'parry' && from && <div className="fx-slash" style={{ left: from.x, top: from.y, ['--c' as string]: '#e5e7eb', ['--r' as string]: '70deg' } as CSSProperties} />}
        {css && isClash && live && from && to && <Clash e={live} from={from} to={to} snap={actorSnap} defSnap={live.target ? fighters.get(live.target)?.snap : undefined} envId={input.environmentId} w={w} h={h} />}
        {isClash && <div className="big-call" style={{ ['--c' as string]: live?.context?.rival ? '#f472b6' : '#fde047' } as CSSProperties}>{live?.context?.rival ? 'RIVAL CLASH!' : 'CLASH!'}</div>}
        {live?.type === 'banter' && (from ?? to) && <div className={`speech${String(live.context?.kind) === 'mock' ? ' mock' : ''}`} style={{ left: (from ?? to)!.x, top: (from ?? to)!.y - 120 } as CSSProperties}>{String(live.context?.line)}</div>}
        {live?.type === 'twist' && <div className="big-call twist" style={{ ['--c' as string]: '#f97316' } as CSSProperties}>{String(live.context?.title)}</div>}
        {live?.type === 'call' && <div className="big-call call" style={{ ['--c' as string]: pcolor(Number(live.context?.side) as 0 | 1) } as CSSProperties}>{String(live.context?.shout)}</div>}
        {live?.type === 'combo' && live.context?.duo && <div className="big-call duo" style={{ ['--c' as string]: String(live.context.color ?? '#22d3ee') } as CSSProperties}>{String(live.context.duo)}</div>}
        {live?.type === 'knockdown' && <div className="big-call" style={{ ['--c' as string]: '#f97316' } as CSSProperties}>DOWN!</div>}
        {css && live?.type === 'guard_break' && to && <div className="fx-ring" style={{ left: to.x, top: to.y, ['--c' as string]: '#93c5fd', ['--bs' as string]: 22 } as CSSProperties} />}
        {css && live && kind && !from && to && <Effect kind={kind} from={{ x: to.x, y: -40 }} to={to} colors={colorsFor(live, input.environmentId)} seq={live.seq} miss={false} w={w} h={h} />}
        {css && live && (live.type === 'ability' || live.type === 'desperation') && live.ability && ABILITIES[live.ability] && from && (
          ['buff'].includes(getAbility(live.ability).kind) || vfxOf(getAbility(live.ability)) === 'aura'
            ? <Aura at={from} c={getAbility(live.ability).fx.color} c2={getAbility(live.ability).color2} seq={live.seq} />
            : <Charge at={from} c={getAbility(live.ability).fx.color} />
        )}
        {css && live?.ability && ABILITIES[live.ability] && vfxOf(ABILITIES[live.ability]) === 'domain' && isStrike && from && <Domain at={from} c={getAbility(live.ability!).fx.color} c2={getAbility(live.ability!).color2 ?? '#000'} w={w} h={h} />}
        {live?.type === 'transform' && <>{css && from && <Aura at={from} c={String(live.context?.color ?? '#f5c451')} c2="#ffffff" seq={live.seq} />}<div className="big-call transform-call" style={{ ['--c' as string]: String(live.context?.color ?? '#f5c451') } as CSSProperties}><small>TRANSFORMATION</small>{String(live.context?.form ?? '')}{live.context?.unlocked ? <span className="unlocked">New: {String(live.context.unlocked)}</span> : null}</div></>}
        {live?.type === 'secret' && <div className="big-call secret-call" style={{ ['--c' as string]: '#f43f5e' } as CSSProperties}><small>{live.context?.why === 'ally' ? 'NO MORE HOLDING BACK' : live.context?.why === 'last' ? 'LAST ONE STANDING' : 'SECRET MOVE'}</small>{live.action}</div>}
        {live?.type === 'awakening' && from && <>{css && <Aura at={from} c="#f5c451" c2="#fff7d6" seq={live.seq} />}<div className="big-call" style={{ ['--c' as string]: '#f5c451' } as CSSProperties}>AWAKENING!</div></>}
        {css && live?.type === 'heal' && to && <HealFx at={to} />}
        {live?.type === 'status' && live.status?.type === 'shield' && to && <div className="fx-dome" style={{ left: to.x, top: to.y, ['--c' as string]: '#93c5fd' } as CSSProperties} />}
        {live?.type === 'defeat' && <div className="big-call" style={{ ['--c' as string]: '#ef4444' } as CSSProperties}>{live.context?.how === 'stoppage' ? 'STOPPED!' : 'K.O.!'}</div>}
        {live?.type === 'final_exchange' && <div className="big-call" style={{ ['--c' as string]: '#f472b6' } as CSSProperties}>FINAL EXCHANGE</div>}
        {live?.type === 'iron_will' && <div className="big-call" style={{ ['--c' as string]: '#fde68a' } as CSSProperties}>IRON WILL!</div>}
        {live?.type === 'combo' && !live.context?.duo && <div className="big-call" style={{ ['--c' as string]: '#22d3ee' } as CSSProperties}>COMBO!</div>}
        {live?.type === 'environment' && <div className="fx-flash fx-full" style={{ ['--c' as string]: env.palette[2], ['--fo' as string]: 0.45 } as CSSProperties} />}
        {live?.type === 'verdict' && <div className="big-call" style={{ ['--c' as string]: '#f5c451' } as CSSProperties}>VICTORY!</div>}
        {live && <ImpactText e={live} at={to} actorAt={from} />}
        {live?.type === 'twist' && String(live.context?.twist).startsWith('plot-') && (
          <div className="plot-banner" key={live.seq}><b>PLOT TWIST!</b><span>{String(live.context?.title ?? '')}</span></div>
        )}
      </div>

      {live?.type === 'rival' && live.actor && live.target && (
        <div className="versus" key={`vs${live.seq}`}>
          <div className="vs-half left">{characters[live.actor] ? <CharArt c={characters[live.actor]} /> : null}</div>
          <div className="vs-half right">{characters[live.target] ? <CharArt c={characters[live.target]} /> : null}</div>
          <div className="vs-title"><small>RIVALRY</small>{String(live.context?.title)}</div>
        </div>
      )}
      {((live?.type === 'reinforcement' && live.actor) || (live?.type === 'combo' && live.context?.duo && live.actor)) && (
        <div className={`cutin${live.type === 'combo' ? ' duo' : ''}${fighters.get(live.actor!)?.snap.side === 1 || input.sides[1].reserves?.some((x) => x.charId === live.actor) ? ' right' : ''}`} key={`ri${live.seq}`} style={{ ['--c' as string]: live.type === 'combo' ? String(live.context?.color ?? '#22d3ee') : '#fde047' } as CSSProperties}>
          <div className="ci-lines" />
          <div className="ci-img">{characters[live.actor!] ? <CharArt c={characters[live.actor!]} /> : null}</div>
          {live.type === 'combo' && typeof live.context?.partner === 'string' && characters[live.context.partner] && <div className="ci-img second"><CharArt c={characters[live.context.partner]} /></div>}
        </div>
      )}
      {(live?.type === 'transform' || live?.type === 'secret') && live.actor && characters[live.actor] && (
        <div className={`cutin${fighters.get(live.actor)?.snap.side === 1 ? ' right' : ''}`} key={`tf${live.seq}`} style={{ ['--c' as string]: live.type === 'secret' ? '#f43f5e' : String(live.context?.color ?? '#f5c451') } as CSSProperties}>
          <div className="ci-lines" />
          <div className={`ci-img formed stage-${Math.min(3, Number(live.context?.stage ?? 1))}`} style={{ ['--form' as string]: String(live.context?.color ?? '#f43f5e') } as CSSProperties}><FighterArt c={characters[live.actor]} stage={live.type === 'transform' ? Number(live.context?.stage ?? 1) : fighters.get(live.actor)?.stage ?? 0} /></div>
        </div>
      )}
      {cutIn && live?.actor && characters[live.actor] && (
        <div className={`cutin${fighters.get(live.actor)?.snap.side === 1 ? ' right' : ''}`} key={`ci${live.seq}`} style={{ ['--c' as string]: getAbility(live.ability!).fx.color } as CSSProperties}>
          <div className="ci-lines" />
          <div className="ci-img"><CharArt c={characters[live.actor]} /></div>
        </div>
      )}
      {banner && bannerAbility && banner.actor && (
        <div className="move-banner" key={`mb${banner.seq}`} style={{ ['--c' as string]: bannerAbility.fx.color } as CSSProperties}>
          <div className="mb-img">{characters[banner.actor] ? <CharArt c={characters[banner.actor]} /> : null}</div>
          <div>
            <div className="mb-who">{fighters.get(banner.actor)?.snap.name}{bannerAbility.element ? ` · ${bannerAbility.element}` : ''}{bannerAbility.kind === 'ultimate' ? ' · ULTIMATE' : ''}</div>
            <div className="mb-name">{bannerAbility.name}</div>
            <div className="mb-look">{bannerAbility.look ?? bannerAbility.description}</div>
          </div>
        </div>
      )}
    </div>
    <PlayByPlay events={result.events} upto={cur && !done ? cur.seq : -1} names={(id) => fighters.get(id)?.snap.name ?? id} />
    </>
  );
}

// Where each body part sits on a 3:4 portrait (percent), and a jagged crack drawn from there.
const PART_AT: Record<BattleInjury['part'], [number, number]> = { head: [50, 20], arm: [24, 50], torso: [52, 55], leg: [42, 84] };
function crackPath(seed: number, len: number): string {
  let x = 0, y = 0, a = (seed % 360) * (Math.PI / 180), d = 'M0 0';
  for (let i = 0; i < 5; i++) {
    a += (((seed >> (i * 3)) % 7) - 3) * 0.35;
    x += Math.cos(a) * len; y += Math.sin(a) * len;
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/** Cracks over injured body parts: drawn in with a flash when the injury happens, then stay. */
function InjuryCracks({ injuries, fresh, flip }: { injuries: BattleInjury[]; fresh: number | null; flip: boolean }) {
  if (!injuries.length) return null;
  return (
    <svg className="cracks" viewBox="0 0 100 133" preserveAspectRatio="none" aria-hidden="true">
      {injuries.map((inj, i) => {
        const [px, py] = PART_AT[inj.part];
        const x = flip ? 100 - px : px, y = py * 1.33;
        const big = inj.severity === 2;
        const newest = fresh !== null && i === injuries.length - 1;
        const seed = (i + 1) * 977 + inj.part.length * 131;
        const rays = big ? 5 : 3;
        // Each ray is a main fracture with a smaller branch off it, drawn as a dark split with a
        // thin light edge (how real cracks catch the light), over a bruise.
        const len = big ? 6 : 4.5;
        const rayPaths = Array.from({ length: rays }, (_, r) => {
          const main = crackPath(seed + r * 72 * 7, len);
          const branch = crackPath(seed * 3 + r * 131, len * 0.55);
          return { main, branch, rot: (360 / rays) * r + ((seed >> r) % 17) - 8, brot: 28 + ((seed >> (r + 2)) % 30) };
        });
        return (
          <g key={`${inj.part}-${i}`} className={`crack${big ? ' fracture' : ''}${newest ? ' fresh' : ''}`} transform={`translate(${x} ${y})`}>
            <ellipse className="bruise" rx={big ? 15 : 10} ry={big ? 12 : 8} />
            {newest && <circle className="crack-flash" r={big ? 16 : 10} />}
            {rayPaths.map((p, r) => (
              <g key={r} transform={`rotate(${p.rot})`}>
                <path className="split" d={p.main} />
                <path className="edge" d={p.main} transform="translate(0.45 0.35)" />
                <g transform={`translate(${len * 2} 0) rotate(${p.brot})`}><path className="split thin" d={p.branch} /><path className="edge" d={p.branch} transform="translate(0.35 0.3)" /></g>
              </g>
            ))}
            <polygon className="chip" points={big ? '-2.4,-1 0.4,-2.8 2.6,-0.4 1,2.2 -1.8,1.8' : '-1.4,-0.6 0.3,-1.6 1.5,-0.2 0.5,1.3 -1,1'} />
          </g>
        );
      })}
    </svg>
  );
}

function v(o: Record<string, string | number>): CSSProperties { return o as CSSProperties; }

function Effect({ kind, from, to, colors, seq, miss, w, h }: { kind: VfxKind; from: Pt; to: Pt; colors: [string, string]; seq: number; miss: boolean; w: number; h: number }) {
  const [c, c2] = colors;
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const rng = new Rng(seq * 7919);
  const at = (p: Pt, extra: Record<string, string | number> = {}) => v({ left: p.x, top: p.y, '--c': c, '--c2': c2, ...extra });
  const burst = (delay: number, scale = 16, debris = 8): ReactNode => miss ? null : (
    <>
      <div className="fx-boom" style={at(to, { '--d': `${delay}s`, '--bs': scale })} />
      <div className="fx-ring" style={at(to, { '--d': `${delay}s`, '--bs': scale * 0.9 })} />
      {Array.from({ length: debris }, (_, i) => {
        const a = rng.range(0, Math.PI * 2), r = rng.range(50, 130);
        return <div key={i} className="fx-debris" style={at(to, { '--d': `${delay}s`, '--px': `${Math.cos(a) * r}px`, '--py': `${Math.sin(a) * r}px` })} />;
      })}
    </>
  );
  switch (kind) {
    case 'beam':
      return <><div className="fx-beam" style={v({ left: from.x, top: from.y, width: len, '--a': `${ang}deg`, '--c': c, '--c2': c2 })} />{burst(0.3, 14, 6)}</>;
    case 'projectile':
      return <><div className="fx-orb" style={at(from, { '--dx': `${dx}px`, '--dy': `${dy}px` })} />{burst(0.45, 14, 8)}</>;
    case 'barrage':
      return <>{Array.from({ length: 8 }, (_, i) => <div key={i} className="fx-orb" style={at(from, { '--dx': `${dx}px`, '--dy': `${dy}px`, '--d': `${i * 0.06}s`, '--oy': `${rng.range(-40, 40)}px`, '--os': '26px', '--dur': '0.35s' })} />)}{burst(0.5, 10, 6)}</>;
    case 'explosion':
      return <><div className="fx-orb" style={at(from, { '--dx': `${dx}px`, '--dy': `${dy}px`, '--os': '40px' })} />{burst(0.45, 28, 14)}<div className="fx-flash fx-full" style={v({ '--c': c, '--fo': 0.35, animationDelay: '0.45s' })} /></>;
    case 'slash':
      return miss ? <div className="fx-slash" style={at({ x: to.x + 40, y: to.y - 30 }, { '--r': '-30deg' })} /> : <>{[-38, -12, 22].map((r, i) => <div key={i} className="fx-slash" style={at(to, { '--r': `${r}deg`, '--d': `${i * 0.07}s` })} />)}<div className="fx-ring" style={at(to, { '--bs': 10, '--d': '0.1s' })} /></>;
    case 'punch':
      return miss ? null : <><div className="fx-impact" style={at(to)} /><div className="fx-ring" style={at(to, { '--bs': 14 })} /></>;
    case 'lightning': {
      const pts: string[] = [`${from.x},${from.y}`];
      const n = 7;
      for (let i = 1; i < n; i++) pts.push(`${from.x + (dx * i) / n + rng.range(-28, 28)},${from.y + (dy * i) / n + rng.range(-28, 28)}`);
      pts.push(`${to.x},${to.y}`);
      return (
        <>
          <svg className="fx-bolt" viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0 }}>
            <polyline points={pts.join(' ')} fill="none" stroke={c} strokeWidth="10" strokeLinejoin="bevel" opacity="0.5" style={{ filter: `drop-shadow(0 0 10px ${c})` }} />
            <polyline points={pts.join(' ')} fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="bevel" />
          </svg>
          <div className="fx-flash fx-full" style={v({ '--c': c, '--fo': 0.3 })} />
          {burst(0.15, 10, 6)}
        </>
      );
    }
    case 'fire':
      return <>{Array.from({ length: 10 }, (_, i) => <div key={i} className="fx-flame" style={at(from, { '--dx': `${dx}px`, '--dy': `${dy}px`, '--d': `${i * 0.045}s`, '--oy': `${rng.range(-22, 22)}px` })} />)}{burst(0.5, 18, 10)}</>;
    case 'ice':
      return <>{Array.from({ length: 7 }, (_, i) => <div key={i} className="fx-shard" style={at(from, { '--dx': `${dx}px`, '--dy': `${dy}px`, '--d': `${i * 0.05}s`, '--oy': `${rng.range(-30, 30)}px` })} />)}{!miss && <div className="fx-dome" style={at(to, { '--c': c })} />}</>;
    case 'wave':
      return <><div className="fx-crescent" style={at(from, { '--dx': `${dx}px`, '--dy': `${dy}px`, transform: `rotate(${ang}deg)` })} />{burst(0.45, 12, 6)}</>;
    case 'genjutsu': {
      const pctX = `${(to.x / w) * 100}%`, pctY = `${(to.y / h) * 100}%`;
      return (
        <>
          <div className="fx-genjutsu fx-full" style={v({ '--c': c, '--tx': pctX, '--ty': pctY })} />
          <svg className="fx-spiral" viewBox="-110 -110 220 220" style={{ left: to.x, top: to.y }}>
            {[30, 55, 80, 100].map((r, i) => <circle key={r} r={r} fill="none" stroke={i % 2 ? c2 : c} strokeWidth={4 - i * 0.5} strokeDasharray={`${8 + i * 6} ${10 + i * 4}`} />)}
            <circle r="10" fill={c} />
          </svg>
        </>
      );
    }
    case 'domain':
      return burst(0.9, 20, 10);
    case 'summon':
      return <><div className="fx-beast" style={at({ x: from.x, y: from.y - 20 }, { '--dx': `${dx}px`, '--dy': `${dy + 20}px` })} />{!miss && [-30, 10].map((r, i) => <div key={i} className="fx-slash" style={at(to, { '--r': `${r}deg`, '--d': `${0.6 + i * 0.06}s` })} />)}</>;
    case 'aura':
      return <Aura at={from} c={c} c2={c2} seq={seq} />;
    case 'shield':
      return <div className="fx-dome" style={at(to)} />;
    case 'heal':
      return <HealFx at={to} />;
  }
}

function Charge({ at, c }: { at: Pt; c: string }) {
  return <div className="fx-groundring" style={v({ left: at.x, top: at.y + 70, '--c': c })} />;
}

function Aura({ at, c, c2, seq }: { at: Pt; c: string; c2?: string; seq: number }) {
  const rng = new Rng(seq * 31);
  return (
    <>
      <div className="fx-aura" style={v({ left: at.x, top: at.y, '--c': c, '--c2': c2 ?? c })} />
      <div className="fx-groundring" style={v({ left: at.x, top: at.y + 80, '--c': c })} />
      {Array.from({ length: 14 }, (_, i) => <div key={i} className="fx-spark" style={v({ left: at.x + rng.range(-60, 60), top: at.y + rng.range(0, 80), '--c': c, '--d': `${rng.range(0, 0.6)}s`, '--px': `${rng.range(-20, 20)}px` })} />)}
    </>
  );
}

function Domain({ at, c, c2, w, h }: { at: Pt; c: string; c2: string; w: number; h: number }) {
  return (
    <>
      <div className="fx-domain fx-full" style={v({ '--c': c, '--c2': c2, '--sx': `${(at.x / w) * 100}%`, '--sy': `${(at.y / h) * 100}%` })} />
      <svg className="fx-rune" viewBox="-150 -150 300 300" style={{ left: w / 2, top: h / 2 }}>
        <circle r="140" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="4 8" />
        <circle r="110" fill="none" stroke={c} strokeWidth="3" />
        {Array.from({ length: 12 }, (_, i) => <rect key={i} x="-4" y="-132" width="8" height="18" fill="#fff" opacity="0.7" transform={`rotate(${i * 30})`} />)}
      </svg>
    </>
  );
}

function HealFx({ at }: { at: Pt }) {
  return <>{Array.from({ length: 8 }, (_, i) => <div key={i} className="fx-heal" style={v({ left: at.x - 50 + i * 14, top: at.y + 30 - (i % 3) * 10, '--d': `${i * 0.08}s`, '--px': '0px' })}>+</div>)}</>;
}

/** Floating words for what happened in the exchange: never health numbers. */
function ImpactText({ e, at, actorAt }: { e: BattleEvent; at?: Pt; actorAt?: Pt }) {
  const show = (p: Pt | undefined, text: string, cls = '') => p ? <div className={`dmg-num ${cls}`} style={{ left: p.x, top: p.y - 40 }}>{text}</div> : null;
  switch (e.type) {
    case 'miss': return show(at, 'DODGED', 'miss');
    case 'block': return show(at, 'BLOCKED', 'miss');
    case 'parry': return show(actorAt, 'PARRIED!', 'parry');
    case 'guard_break': return show(at, 'GUARD BROKEN', 'crit');
    case 'injury': return e.injury ? show(at, e.injury.label.toUpperCase(), 'injury') : null;
    case 'heal': return show(at, 'SECOND WIND', 'heal');
    case 'attack': case 'counter': {
      if (e.context?.environmental) return show(at, 'CAUGHT!');
      const impact = String(e.context?.impact ?? 'solid');
      if (e.crit) return show(at, 'CRITICAL!', 'crit');
      const word = impact === 'devastating' ? 'DEVASTATING!' : impact === 'heavy' ? 'HEAVY HIT' : impact === 'glancing' ? 'GRAZED' : e.type === 'counter' ? 'COUNTER!' : 'CLEAN HIT';
      return show(at, word, impact === 'devastating' || impact === 'heavy' ? 'heavy' : '');
    }
  }
  return null;
}

/** Two techniques meet in the middle of the arena. */
function Clash({ e, from, to, snap, defSnap, envId, w, h }: { e: BattleEvent; from: Pt; to: Pt; snap?: FighterSnapshot; defSnap?: FighterSnapshot; envId: string; w: number; h: number }) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const counterId = typeof e.context?.counterMove === 'string' ? e.context.counterMove : undefined;
  const theirs: BattleEvent = { ...e, ability: counterId, actor: e.target };
  const k1 = fxKindFor(e, snap, envId) ?? 'beam';
  const k2 = fxKindFor(theirs, defSnap, envId) ?? 'beam';
  return (
    <>
      <Effect kind={k1 === 'aura' || k1 === 'domain' ? 'beam' : k1} from={from} to={mid} colors={colorsFor(e, envId)} seq={e.seq} miss w={w} h={h} />
      <Effect kind={k2 === 'aura' || k2 === 'domain' ? 'beam' : k2} from={to} to={mid} colors={colorsFor(theirs, envId)} seq={e.seq + 1} miss w={w} h={h} />
      <div className="fx-boom" style={v({ left: mid.x, top: mid.y, '--c': '#fde047', '--c2': '#fff', '--d': '0.3s', '--bs': 26 })} />
      <div className="fx-ring" style={v({ left: mid.x, top: mid.y, '--c': '#fff', '--d': '0.3s', '--bs': 30 })} />
      <div className="fx-flash fx-full" style={v({ '--c': '#fff', '--fo': 0.4, animationDelay: '0.3s' })} />
    </>
  );
}

/** The last few actions in plain words: who used what on whom, how hard it hit, what it caused. */
function PlayByPlay({ events, upto, names }: { events: BattleEvent[]; upto: number; names: (id: string) => string }) {
  if (upto < 0) return null;
  const lines: Array<{ seq: number; text: string; tone: string }> = [];
  for (let i = Math.min(upto, events.length - 1); i >= 0 && lines.length < 3; i--) {
    const e = events[i];
    const who = e.actor ? names(e.actor) : '', tgt = e.target ? names(e.target) : '';
    const move = e.ability && ABILITIES[e.ability] ? ABILITIES[e.ability].name : e.action === 'combo' ? 'combo' : 'a strike';
    const el = e.ability && ABILITIES[e.ability]?.element ? ` (${ABILITIES[e.ability].element!.toLowerCase()})` : '';
    let text = '', tone = '';
    if ((e.type === 'attack' || e.type === 'counter') && e.actor && e.target && (e.damage ?? 0) > 0) {
      text = `${who}${e.type === 'counter' ? ' counters with' : ' ·'} ${move}${el} → ${tgt}: ${e.damage} damage${e.crit ? ', CRITICAL' : ''}${e.context?.impact === 'devastating' ? ', devastating' : e.context?.impact === 'heavy' ? ', heavy' : ''}${e.hpAfter === 0 ? ', down!' : ''}`;
      tone = e.crit ? 'crit' : '';
    } else if (e.type === 'miss' && e.actor) { text = `${who} · ${move} misses ${tgt || 'the mark'}`; tone = 'dim'; }
    else if (e.type === 'block' && e.target) { text = `${tgt} blocks ${who}'s ${move}${(e.damage ?? 0) > 0 ? ` (${e.damage} through)` : ''}`; tone = 'dim'; }
    else if (e.type === 'heal' && e.target) { text = `${who || tgt} heals ${e.actor === e.target ? 'themself' : tgt}: +${e.heal ?? 0} HP${e.context?.revive ? ', back on their feet!' : ''}`; tone = 'good'; }
    else if (e.type === 'status' && e.status?.applied && e.target) { text = `${tgt} is hit with ${e.status.type}`; tone = 'dim'; }
    else if (e.type === 'transform' && e.actor) { text = `${who} transforms: ${String(e.context?.form)}`; tone = 'form'; }
    else if (e.type === 'secret' && e.actor) { text = `${who} unleashes a secret move: ${e.action}`; tone = 'crit'; }
    else continue;
    lines.unshift({ seq: e.seq, text, tone });
  }
  if (!lines.length) return null;
  return <div className="pbp" aria-live="polite">{lines.map((l) => <div key={l.seq} className={`pbp-line ${l.tone}`}>{l.text}</div>)}</div>;
}

/** The fighter's picture: their form's picture once they transform (if there is one), else their portrait. */
function FighterArt({ c, stage }: { c: PublicCharacter; stage: number }) {
  const url = useFormPicture(c, stage);
  if (!url) return <CharArt c={c} />;
  return <img className="form-pic" key={url} src={url} alt={`${c.name} transformed`} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 18%' }} />;
}
