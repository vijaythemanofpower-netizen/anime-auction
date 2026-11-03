// The fight stage: animated, cut-out fighters standing on the arena floor and actually
// fighting. Melee attackers run across the ground (their run cycle plays as they move),
// stop at striking distance and throw the strike; the target reacts with their hit clip
// and is knocked back; ranged and special moves are thrown from where the fighter stands
// (the effects layer flies the projectile); dodges hop back, knockdowns fall and stay
// down. A transformed fighter plays that form's own clips for the rest of the fight.
// Feet kick up dust, landings crack the floor. Clips come from fighterClips.ts.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { BattleEvent, BattleInput } from '../../engine/types';
import { ABILITIES } from '../../engine/data/abilities';
import type { LiveFighter } from '../components/Arena';
import { clipFor, clipUrl, type ClipName, type FighterClip, type FighterClips } from './fighterClips';
import { RigStage, type RigStageHandle } from '../rig/RigStage';
import { ANIMS, type AnimName } from '../rig/animations';
import { rigBase, useRigIndex } from '../rig/rigIndex';
import { planMove, reactionFor, type MovePlan } from '../rig/moves';
import './battlefield.css';

type Cmd =
  | { k: 'idle' }
  | { k: 'rush'; tx: number; heavy: boolean }
  | { k: 'cast' | 'strike' | 'transform' }
  | { k: 'move'; plan: MovePlan; tx?: number; delay: number; hit?: AnimName }
  | { k: 'hit'; delay: number; heavy: boolean; reaction?: AnimName }
  | { k: 'dodge'; delay: number }
  | { k: 'block'; delay: number }
  | { k: 'knock'; delay: number };

/** How long one event has on screen at 1x (kept a little under the battle screen's own timing). */
const windowFor = (e: BattleEvent | null) => (!e ? 900 : e.type === 'attack' || e.type === 'counter' || e.type === 'block' || e.type === 'miss' ? (e.ability ? 1250 : 900) : e.type === 'clash' ? 1700 : e.type === 'knockdown' ? 1500 : 1300);

export function FightStage({ input, fighters, live, done, clips, melee, speed, reduced, register }: {
  input: BattleInput; fighters: Map<string, LiveFighter>; live: BattleEvent | null; done: boolean; clips: Record<string, FighterClips>;
  melee: boolean; speed: number; reduced: boolean; register: (id: string, el: HTMLDivElement | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const rigStage = useRef<RigStageHandle>(null);
  const rigs = useRigIndex();
  const [box, setBox] = useState({ w: 800, h: 450 });
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Where everyone stands: front liners near the middle, back liners further out and a little smaller.
  const size = Math.max(input.sides[0].fighters.length, input.sides[1].fighters.length);
  const ground = box.h * 0.9;
  const tall = Math.min(box.h * 0.62, 330) * (size > 2 ? 0.82 : 1);
  const homes = new Map<string, { x: number; scale: number; side: 0 | 1; z: number }>();
  for (const side of [0, 1] as const) {
    const list = input.sides[side].fighters.map((f) => fighters.get(f.charId)).filter((f): f is LiveFighter => !!f);
    const front = list.filter((f) => f.position === 'front'), back = list.filter((f) => f.position === 'back');
    const place = (arr: LiveFighter[], start: number, step: number, scale: number, z: number) => arr.forEach((f, i) => {
      const x = start - i * step;
      homes.set(f.snap.charId, { x: side === 0 ? x * box.w : (1 - x) * box.w, scale, side, z: z - i });
    });
    place(front, 0.3, 0.1, 1, 20);
    place(back, front.length > 1 ? 0.1 : 0.14, 0.07, 0.86, 10);
  }

  // What each fighter does for the current event.
  const win = windowFor(live) / Math.max(0.5, speed);
  const cmds = new Map<string, Cmd>();
  if (live && !done) {
    const a = live.actor, t = live.target;
    const strike = ['attack', 'counter', 'miss', 'block', 'parry'].includes(live.type);
    const heavy = !!live.crit || live.context?.impact === 'heavy' || live.context?.impact === 'devastating';
    const runMs = Math.min(420, win * 0.3);
    const landAt = melee ? runMs + win * 0.2 : win * 0.35;
    if (a && strike) {
      const th = t ? homes.get(t) : undefined, ah = homes.get(a);
      if (melee && th && ah) {
        const gap = tall * 0.42;
        cmds.set(a, { k: 'rush', tx: th.x + (ah.x < th.x ? -gap : gap), heavy });
      } else cmds.set(a, { k: live.ability ? 'cast' : 'strike' });
    }
    if (a && live.type === 'clash') {
      const th = t ? homes.get(t) : undefined, ah = homes.get(a);
      if (th && ah) cmds.set(a, { k: 'rush', tx: (th.x + ah.x) / 2 + (ah.x < th.x ? -tall * 0.2 : tall * 0.2), heavy: true });
      if (t && th && ah) cmds.set(t, { k: 'rush', tx: (th.x + ah.x) / 2 + (th.x < ah.x ? -tall * 0.2 : tall * 0.2), heavy: true });
    }
    if (a && live.type === 'transform') cmds.set(a, { k: 'transform' });
    else if (a && ['ability', 'desperation', 'awakening', 'secret', 'reinforcement'].includes(live.type)) cmds.set(a, { k: 'cast' });
    // Rig fighters use the authored move choreography. Clip fighters retain the original commands.
    if (a && homes.has(a) && rigBase(rigs, a, fighters.get(a)?.stage ?? 0) && (strike || ['ability', 'desperation', 'awakening', 'secret', 'reinforcement'].includes(live.type))) {
      const ability = live.action ?? (live.ability ? ABILITIES[live.ability]?.name : undefined) ?? 'Strike';
      const abilityData = live.ability ? ABILITIES[live.ability] : undefined;
      const plan = planMove(a, ability, String(live.context?.kind ?? abilityData?.kind ?? 'attack'), String(live.context?.color ?? live.context?.fxColor ?? abilityData?.fx.color ?? ''));
      const th = t ? homes.get(t) : undefined, ah = homes.get(a);
      const tx = th && ah ? th.x + (ah.x < th.x ? -tall * 0.25 : tall * 0.25) : undefined;
      const damage = live.damage ?? 0;
      const target = t ? fighters.get(t) : undefined;
      const hit = target && damage > 0 ? reactionFor(damage, target.maxHp, target.hp <= 0 || !!target.down) : undefined;
      const delay = plan.approach === 'stay' || plan.range !== 'melee' ? win * 0.35 : runMs;
      cmds.set(a, { k: 'move', plan, tx, delay, hit });
    }
    if (t && t !== a && live.type !== 'clash') {
      if ((live.type === 'attack' || live.type === 'counter') && (live.damage ?? 0) > 0) cmds.set(t, { k: 'hit', delay: landAt, heavy });
      else if (['ability', 'desperation', 'awakening', 'secret'].includes(live.type) && (live.damage ?? 0) > 0) {
        const tf = fighters.get(t);
        if (tf && rigBase(rigs, t, tf.stage ?? 0)) cmds.set(t, { k: 'hit', delay: landAt, heavy, reaction: reactionFor(live.damage ?? 0, tf.maxHp, tf.hp <= 0 || tf.down) });
      }
      else if (live.type === 'miss') cmds.set(t, { k: 'dodge', delay: landAt * 0.7 });
      else if (live.type === 'block' || live.type === 'parry') cmds.set(t, { k: 'block', delay: landAt });
      else if (live.type === 'knockdown') cmds.set(t, { k: 'knock', delay: 0 });
      else if (live.type === 'status_tick' && (live.damage ?? 0) > 0) cmds.set(t, { k: 'hit', delay: 0, heavy: false });
    }
  }

  // Lasting damage to the floor: cracks where fighters slammed down or took a heavy blow, skid
  // marks where they charged in. Built from the events so every viewer sees the same floor.
  const marks = useRef<{ battle: string; seen: Set<number>; list: Array<{ x: number; kind: 'crack' | 'skid'; seq: number; dir: number }> }>({ battle: '', seen: new Set(), list: [] });
  if (marks.current.battle !== input.battleId) marks.current = { battle: input.battleId, seen: new Set(), list: [] };
  if (live && !done && !marks.current.seen.has(live.seq)) {
    marks.current.seen.add(live.seq);
    for (const [id, c] of cmds) {
      const h = homes.get(id);
      if (!h) continue;
      const away = h.side === 0 ? -1 : 1;
      if (c.k === 'knock' || (c.k === 'hit' && c.heavy)) marks.current.list.push({ x: h.x + tall * (c.k === 'knock' ? 0.3 : 0.12) * away, kind: 'crack', seq: live.seq, dir: away });
      if (c.k === 'rush' && c.heavy) marks.current.list.push({ x: c.tx, kind: 'skid', seq: live.seq, dir: -away });
    }
    if (marks.current.list.length > 14) marks.current.list.splice(0, marks.current.list.length - 14);
  }

  return (
    <div className="fstage" ref={host} style={{ ['--ground' as string]: `${ground}px` } as CSSProperties}>
      <svg className="fs-floor" width={box.w} height={box.h} aria-hidden="true">
        {marks.current.list.map((m) => m.kind === 'crack'
          ? <g key={`c${m.seq}${m.x}`} className={`fs-crack${live && m.seq === live.seq ? ' fresh' : ''}`} transform={`translate(${m.x} ${ground + 4})`}>
              <path d={`M0 0 L${-26 * m.dir} -3 L${-44 * m.dir} 2 M0 0 L${18 * m.dir} -4 L${40 * m.dir} -1 L${58 * m.dir} 4 M0 0 L${-8 * m.dir} 6 L${-20 * m.dir} 9 M0 0 L${10 * m.dir} 7`} />
              <ellipse rx="34" ry="5" />
            </g>
          : <path key={`s${m.seq}${m.x}`} className="fs-skid" d={`M${m.x} ${ground + 2} l${60 * m.dir} 3 M${m.x + 6 * m.dir} ${ground + 7} l${46 * m.dir} 2`} />)}
      </svg>
      {[...homes.entries()].map(([id, home]) => {
        const f = fighters.get(id)!;
        return (
      <StageFighter key={id} id={id} f={f} clips={clips[id]} rig={rigBase(rigs, id, f.stage ?? 0)} rigStage={rigStage} home={home} targetHome={live?.target ? homes.get(live.target) : undefined} ground={ground} tall={tall * home.scale}
            cmd={cmds.get(id) ?? { k: 'idle' }} seq={live?.seq ?? 0} win={win} speed={speed} reduced={reduced} done={done} register={register} />
        );
      })}
      <RigStage handle={rigStage} fighters={[...homes.entries()].flatMap(([id, home]) => { const f = fighters.get(id)!; const base = rigBase(rigs, id, f.stage ?? 0); return base ? [{ id, base, x: home.x, ground, height: tall * home.scale, flip: home.side === 1, form: f.stage, tint: f.formColor }] : []; })} />
      {done && <div className="fs-ko-call" role="status">K.O.</div>}
    </div>
  );
}

/**
 * Plays one strip on an element, one whole frame at a time (no in-between positions, so a
 * neighbouring frame never shows). One player per element: starting a clip replaces the last.
 */
const players = new WeakMap<HTMLDivElement, number>();
function playStrip(el: HTMLDivElement, clip: FighterClip, h: number, ms: number, loop: boolean, hold = false): void {
  const w = (h * clip.frameW) / clip.frameH;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.left = `${-clip.ax * w}px`;
  el.style.top = `${-clip.ay * h}px`;
  el.style.backgroundImage = `url(${clipUrl(clip.url)})`;
  el.style.backgroundSize = `${clip.frames * w}px ${h}px`;
  const prev = players.get(el);
  if (prev) cancelAnimationFrame(prev);
  const n = clip.frames;
  const show = (i: number) => { el.style.backgroundPosition = `${-Math.round(i * w)}px 0px`; };
  if (hold || n < 2) { show(hold ? n - 1 : 0); players.delete(el); return; }
  const start = performance.now(), dur = Math.max(120, ms);
  const tick = (now: number) => {
    const p = (now - start) / dur;
    if (!loop && p >= 1) { show(n - 1); players.delete(el); return; }
    show(Math.min(n - 1, Math.floor((p % 1) * n)));
    players.set(el, requestAnimationFrame(tick));
  };
  show(0);
  players.set(el, requestAnimationFrame(tick));
}

function StageFighter({ id, f, clips, rig, rigStage, home, targetHome, ground, tall, cmd, seq, win, speed, reduced, done, register }: {
  id: string; f: LiveFighter; clips: FighterClips | undefined; rig: string | undefined; home: { x: number; side: 0 | 1; z: number }; targetHome?: { x: number; side: 0 | 1; z: number }; ground: number; tall: number;
  rigStage: React.RefObject<RigStageHandle | null>;
  cmd: Cmd; seq: number; win: number; speed: number; reduced: boolean; done: boolean; register: (id: string, el: HTMLDivElement | null) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [rigAnim, setRigAnim] = useState<AnimName>('idle');
  const flip = useRef<HTMLDivElement>(null);
  const sprite = useRef<HTMLDivElement>(null);
  const stage = f.stage ?? 0;
  useEffect(() => {
    if (!rig) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (f.down) setRigAnim('defeated');
    else if (done) setRigAnim('victory');
    else if (cmd.k === 'rush') { setRigAnim('run'); timer = setTimeout(() => setRigAnim('cross'), Math.min(420, win * 0.3)); }
    else if (cmd.k === 'strike') setRigAnim('cross');
    else if (cmd.k === 'move') setRigAnim(cmd.plan.approach === 'walk' ? 'walk' : cmd.plan.approach === 'dash' ? 'dash' : cmd.plan.approach === 'jump' ? 'jump' : cmd.plan.approach === 'run' ? 'run' : cmd.plan.windup ?? cmd.plan.anim);
    else if (cmd.k === 'transform') setRigAnim('transform');
    else if (cmd.k === 'cast') { setRigAnim('chargeUp'); timer = setTimeout(() => setRigAnim('castForward'), Math.min(420, win * 0.3)); }
    else if (cmd.k === 'hit') setRigAnim(cmd.reaction ?? (cmd.heavy ? 'hitHeavy' : 'hit'));
    else if (cmd.k === 'dodge') setRigAnim('dodge');
    else if (cmd.k === 'block') setRigAnim('block');
    else if (cmd.k === 'knock') { setRigAnim('knockdown'); if (!f.down) timer = setTimeout(() => setRigAnim('getUp'), win * 0.55); }
    else setRigAnim('idle');
    return () => { if (timer) clearTimeout(timer); };
  }, [rig, cmd.k, seq, done, f.down, win]);
  useEffect(() => { if (rig) rigStage.current?.play(id, ANIMS[rigAnim], { speed, key: `${seq}-${rigAnim}`, onImpact: () => { const wrist = rigStage.current?.joint(id, 'wristF'); if (wrist && root.current) root.current.dataset.castX = String(wrist.x); } }); }, [rig, rigAnim, rigStage, id, seq, speed]);
  const rest: ClipName = f.down || f.floored ? 'knockdown' : 'idle';
  // The loop the fighter returns to between moves (stance, or lying down).
  const settle = useRef<() => void>(() => undefined);
  settle.current = () => {
    const el = sprite.current;
    const c = clipFor(clips, stage, rest);
    if (!el || !c) return;
    playStrip(el, c, tall, (c.frames / c.fps) * 1000, rest === 'idle', rest === 'knockdown');
  };

  useEffect(() => () => { const el = sprite.current; const id2 = el && players.get(el); if (id2) cancelAnimationFrame(id2); }, []);
  // Settle whenever the fighter's form or state changes (a transformation swaps their whole look).
  useEffect(() => { settle.current(); }, [stage, rest, tall, clips]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = sprite.current, r = root.current;
    if ((!el && !(cmd.k === 'move' && rig)) || !r || cmd.k === 'idle' || f.down) return;
    const anims: Animation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const play = (name: ClipName, ms: number, loop = false) => { const c = clipFor(clips, stage, name); if (el && c) playStrip(el, c, tall, ms, loop); };
    const move = (frames: Keyframe[], ms: number, easing = 'cubic-bezier(.2,.7,.25,1)') => { if (rig) { const last = frames[frames.length - 1]?.transform; const match = typeof last === 'string' ? /translateX\((-?[\d.]+)px\)/.exec(last) : null; if (match) rigStage.current?.moveTo(id, home.x + Number(match[1]), reduced ? 0 : Math.max(60, ms)); return; } if (!reduced && typeof r.animate === 'function') anims.push(r.animate(frames, { duration: Math.max(60, ms), easing, fill: 'forwards' })); };
    const away = home.side === 0 ? -1 : 1;
    const dust = (x: number, big = false) => {
      if (reduced) return;
      const d = document.createElement('div');
      d.className = `fs-dust${big ? ' big' : ''}`;
      d.style.left = `${x}px`;
      r.parentElement?.appendChild(d);
      later(900, () => d.remove());
    };
    if (cmd.k === 'move' && rig) {
      const { plan } = cmd;
      const targetX = cmd.tx;
      const approach = plan.approach;
      const distance = targetX === undefined ? 0 : targetX - home.x;
      const travel = approach === 'teleport' ? 140 : approach === 'jump' ? 260 : approach === 'stay' || plan.range !== 'melee' ? 0 : Math.min(420, win * 0.3);
      const hide = () => { if (approach === 'teleport') r.style.opacity = '0'; };
      const appear = () => { if (approach === 'teleport') { r.style.opacity = '1'; } };
      if (approach === 'teleport') { setRigAnim('teleport'); later(travel * .55, hide); later(travel, () => { if (targetX !== undefined) move([{ transform: `translateX(${distance}px)` }], 1); appear(); setRigAnim('appear'); }); }
      else if (travel > 0 && targetX !== undefined) move([{ transform: 'translateX(0px)' }, { transform: `translateX(${distance}px)` }], travel);
      const hitAt = travel + (plan.windup ? Math.min(260, win * .2) : 0);
      if (plan.windup) { setRigAnim(plan.windup); later(travel + Math.min(260, win * .2), () => setRigAnim(plan.anim)); }
      later(hitAt, () => {
        setRigAnim(plan.anim);
        const stageEl = r.parentElement;
        const joint = rigStage.current?.joint(id, plan.effect.from);
        const startX = home.x + (joint?.x ?? 0), startY = ground + (joint?.y ?? -tall * .55);
        const color = plan.effect.color, size = plan.effect.size;
        const add = (cls: string, left: number, top: number, width: number, height: number, duration = 520) => {
          if (reduced || !stageEl) return;
          const node = document.createElement('div'); node.className = `fs-move-fx ${cls}`; node.style.left = `${left}px`; node.style.top = `${top}px`; node.style.width = `${width}px`; node.style.height = `${height}px`; node.style.setProperty('--fx-color', color); node.style.setProperty('--fx-size', String(size)); stageEl.appendChild(node); later(duration, () => node.remove()); return node;
        };
        const endX = targetHome?.x ?? startX + (home.side === 0 ? tall * 2 : -tall * 2);
        if (plan.effect.kind === 'palmOrb' || plan.effect.kind === 'chargeHand') add('orb', startX, startY, 28 * size, 28 * size, Math.max(500, hitAt + 150));
        else if (plan.effect.kind === 'beam') add('beam', Math.min(startX, endX), startY, Math.abs(endX - startX), Math.max(8, 12 * size));
        else if (plan.effect.kind === 'projectile') { const shot = add('shot', startX, startY, 20 * size, 20 * size); if (shot) shot.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${endX - startX}px)` }], { duration: 360, easing: 'ease-in' }); }
        else if (plan.effect.kind === 'slashArc' || plan.effect.kind === 'impact') add('arc', endX, ground - tall * .55, 90 * size, 70 * size);
        else if (plan.effect.kind !== 'none') add('burst', plan.effect.kind === 'aura' ? home.x : endX, ground - tall * .55, 100 * size, 100 * size);
        if (targetHome && cmd.hit) { /* target reaction is selected by the same move plan */ }
        if (plan.shake > 0 && stageEl && !reduced) stageEl.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${plan.shake * 8}px)` }, { transform: `translateX(${-plan.shake * 8}px)` }, { transform: 'translateX(0)' }], { duration: 180 });
        if (plan.label && stageEl) { const label = document.createElement('div'); label.className = 'fs-move-label'; label.textContent = plan.label; stageEl.appendChild(label); later(900, () => label.remove()); }
      });
      if (plan.followUp) later(hitAt + Math.min(240, win * .18), () => setRigAnim(plan.followUp!));
      later(win * .9, () => { r.style.opacity = ''; settle.current(); });
      return () => { anims.forEach((a) => a.cancel()); timers.forEach(clearTimeout); r.style.opacity = ''; };
    }
    switch (cmd.k) {
      case 'rush': {
        // Run across the floor, strike at arm's length, then hop back to the start.
        const dx = cmd.tx - home.x;
        const runMs = Math.min(420, win * 0.3), strikeMs = win * 0.45, backMs = win * 0.25;
        play('run', 380 / Math.max(0.5, speed), true);
        dust(home.x);
        move([{ transform: 'translateX(0px)' }, { transform: `translateX(${dx}px)` }], runMs, 'cubic-bezier(.4,0,.6,1)');
        later(runMs, () => { play('strike', strikeMs); dust(cmd.tx, cmd.heavy); });
        later(runMs + strikeMs, () => {
          settle.current();
          move([{ transform: `translateX(${dx}px)` }, { transform: `translateX(${dx * 0.4}px) translateY(${-tall * 0.08}px)` }, { transform: 'translateX(0px)' }], backMs);
        });
        break;
      }
      case 'cast': case 'strike':
        play(cmd.k === 'cast' ? 'special' : 'strike', win * 0.8);
        later(win * 0.85, () => settle.current());
        break;
      case 'hit':
        later(cmd.delay, () => {
          play('hit', win * 0.5);
          const kb = tall * (cmd.heavy ? 0.28 : 0.14) * away;
          move([{ transform: 'translateX(0px)' }, { transform: `translateX(${kb}px)`, offset: 0.35 }, { transform: 'translateX(0px)' }], win * 0.6, 'ease-out');
          if (cmd.heavy) dust(home.x + kb, true);
        });
        later(cmd.delay + win * 0.55, () => settle.current());
        break;
      case 'dodge':
        later(cmd.delay, () => move([{ transform: 'translate(0px,0px)' }, { transform: `translate(${tall * 0.3 * away}px, ${-tall * 0.16}px)`, offset: 0.4 }, { transform: `translate(${tall * 0.36 * away}px, 0px)`, offset: 0.6 }, { transform: 'translate(0px,0px)' }], win * 0.6));
        break;
      case 'block':
        later(cmd.delay, () => move([{ transform: 'translateX(0px)' }, { transform: `translateX(${tall * 0.06 * away}px)`, offset: 0.3 }, { transform: 'translateX(0px)' }], win * 0.4, 'ease-out'));
        break;
      case 'knock':
        later(cmd.delay, () => {
          play('knockdown', win * 0.6);
          move([{ transform: 'translateX(0px)' }, { transform: `translateX(${tall * 0.32 * away}px)` }, { transform: 'translateX(0px)' }], win * 0.9, 'ease-out');
          later(win * 0.45, () => {
            dust(home.x + tall * 0.3 * away, true);
            if (reduced) return;
            // Chunks of floor thrown up by the landing.
            for (let i = 0; i < 7; i++) {
              const rock = document.createElement('div');
              rock.className = 'fs-rock';
              rock.style.left = `${home.x + tall * 0.3 * away + (i - 3) * 9}px`;
              rock.style.setProperty('--rx', `${(i - 3) * 22 + away * 30}px`);
              rock.style.setProperty('--ry', `${-40 - ((i * 37) % 60)}px`);
              r.parentElement?.appendChild(rock);
              later(1100, () => rock.remove());
            }
          });
        });
        break;
    }
    return () => { anims.forEach((a) => a.cancel()); timers.forEach(clearTimeout); };
  }, [seq]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`sf${f.down ? ' down' : ''}${f.stage ? ' formed' : ''}`} ref={root}
      style={{ left: home.x, top: ground, zIndex: home.z, ['--form' as string]: f.formColor ?? '#f5c451' } as CSSProperties}>
      <div className="sf-shadow" style={{ width: tall * 0.5 }} />
      {f.injuries.map((w, i) => <span key={`${w.part}-${i}`} aria-label={`${w.part} injury: ${w.label}`} className={`sf-wound ${w.part} severity-${w.severity}`} />)}
      {f.hp > 0 && f.hp / Math.max(1, f.maxHp) < .28 && <span className="sf-hurt-breath" aria-hidden="true" />}
      {!rig && <div className="sf-flip" ref={flip} style={{ transform: home.side === 1 ? 'scaleX(-1)' : undefined }}><div className="sf-sprite" ref={sprite} /></div>}
      {/* The body box: where the effects layer aims hits and auras. */}
      <div className="sf-body" ref={(el) => register(id, el)} style={{ width: tall * 0.42, height: tall * 0.9, left: -tall * 0.21, top: -tall * 0.9 }} />
    </div>
  );
}


