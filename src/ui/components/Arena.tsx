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

export interface LiveFighter {
  snap: FighterSnapshot; hp: number; maxHp: number; st: number; maxSt: number; down: boolean; awakened: boolean; position: 'front' | 'back'; form: number;
  guard: number; injuries: BattleInjury[]; knockdowns: number; floored: boolean; staggered: boolean; howDown?: string;
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

  const renderSide = (side: 0 | 1) => {
    const list = input.sides[side].fighters.map((f) => fighters.get(f.charId)!);
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
        <div key={f.snap.charId} className={`stand${f.hp / f.maxHp < 0.3 && !f.down ? ' hurt' : ''}${acting ? ' acting' : ''}${acting && (melee || isClash) ? ' lunge' : ''}${hit ? ' hit' : ''}${blocking ? ' blocking' : ''}${f.floored ? ' floored' : ''}${f.staggered && !f.down ? ' staggered' : ''}${f.down ? ' down' : ''}${f.awakened ? ' awakened' : ''}`}
          style={{ ['--sw' as string]: sw, ['--side' as string]: pcolor(side), ['--lx' as string]: side === 0 ? '46px' : '-46px', ['--fall' as string]: side === 0 ? '-14deg' : '14deg' } as CSSProperties}>
          <div className="pf" ref={(el) => { if (el) standRefs.current.set(f.snap.charId, el); else standRefs.current.delete(f.snap.charId); }}>
            {pc ? <CharArt c={pc} /> : null}
            <InjuryCracks injuries={f.injuries} fresh={live?.type === 'injury' && live.target === f.snap.charId ? live.seq : null} flip={side === 1} />
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
        return (
          <g key={`${inj.part}-${i}`} className={`crack${big ? ' fracture' : ''}${newest ? ' fresh' : ''}`} transform={`translate(${x} ${y})`}>
            {newest && <circle className="crack-flash" r={big ? 16 : 10} />}
            {Array.from({ length: rays }, (_, r) => <path key={r} d={crackPath(seed + r * 72 * 7, big ? 4.2 : 3)} transform={`rotate(${(360 / rays) * r})`} />)}
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
