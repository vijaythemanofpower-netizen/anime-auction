// Play mode: the match on a live ground. Every ball is shown on the pitch (run-up, flight, shot) and,
// when it is hit, followed across the field from above. When it is your ball you play it here:
// batting, you swing as the ball arrives; bowling, you pick a delivery and land it on the spot.
// The engine still decides the result (from the players' ratings and how well you played the ball);
// this component only shows it and collects your input as "<pick>@<0-3>".
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameState } from '../../engine/game';
import type { BallEvent, Decision, Option } from '../../engine/match';
import { DELIVERY_LABEL } from '../../engine/match';
import { isSpin } from '../../engine/types';
import { PLAYER_MAP, store } from '../../store/store';
import { sfx } from '../sfx';
import { GH, GW, aimQ, drawField, drawPitch, fieldSet, spot, timingQ, type Fig, type Signal } from '../ground';

interface Props {
  g: GameState; events: BallEvent[]; idx: number;
  /** Show the next event (score, commentary and sounds move on). */
  advance: () => void;
  /** This device's ball to play, once everything before it has been shown. */
  call: Decision | null;
  onAnswer: (a: string) => void; onAuto: (m: 'over' | 'innings') => void;
  /** Does this device play for team t? Decides which end the camera stands at. */
  mineTeam: (t: 0 | 1) => boolean;
  speed: number; status: string; who: string; hud: ReactNode;
}
interface Ui { inter: null | 'bat' | 'pick' | 'aim'; live: boolean; opts: Option[]; word: { q: number; text: string } | null; big: { text: string; cls: string } | null; caption: string; chip: string }
type Kind = 'through' | 'bowled' | 'lbw' | 'block' | 'four' | 'six' | 'caught' | 'runs' | 'runout';
interface Ball {
  cam: 'bat' | 'bowl'; batTeam: 0 | 1; m: number; d?: Decision; inter: Ui['inter'];
  t0: number; run0?: number; runMs: number; relX: number; baseT: number; T: number;
  delivery?: string; acc: number; zb: number; x1: number; rel?: number;
  /** null = no shot offered. */
  swing?: { t: number; shot: string; q: number } | null; answered: boolean;
  pick?: string; lock?: { x: number; z: number };
  e?: BallEvent; kind?: Kind; tOut?: number; from?: { x: number; z: number; h: number }; revealed?: boolean;
  trail: { x: number; y: number; r: number }[];
}

const TIM_WORD = ['missed it', 'early', 'well timed', 'PERFECT'];
const ACC_WORD = ['sprayed', 'loose', 'on the spot', 'PERFECT'];
/** Where each delivery pitches, as a share of the pitch measured from the batter. */
const PITCH_AT: Record<string, number> = { length: 0.32, yorker: 0.07, bouncer: 0.56, slower: 0.3, wide: 0.32 };
const WICKET_WORD: Record<string, string> = { bowled: 'BOWLED!', caught: 'CAUGHT!', caughtBehind: 'CAUGHT BEHIND!', lbw: 'LBW!', runout: 'RUN OUT!', stumped: 'STUMPED!' };
const RATE: Record<number, number> = { 1: 1, 2: 1.5, 4: 2.3 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 2;
/** How high the ball reaches the bat, from where it pitched: a yorker at the toes, a bouncer at the head. */
const batHeight = (zb: number) => 5 + 150 * Math.max(0, zb - 0.07) ** 1.3;
const IDLE: Ui = { inter: null, live: false, opts: [], word: null, big: null, caption: '', chip: '' };
/** Between balls: everything cleared except the buttons, which stay on screen (disabled) so the layout never jumps. */
const REST: Partial<Ui> = { inter: null, live: false, word: null, big: null, caption: '', chip: '' };

export function PlayGround(props: Props) {
  const P = useRef(props); P.current = props;
  const [ui, setUi] = useState<Ui>(IDLE);
  const cv = useRef<HTMLCanvasElement>(null);
  const act = useRef<{ shot: (id: string) => void; pick: (id: string) => void; lock: () => void; auto: (m: 'over' | 'innings') => void }>({ shot() {}, pick() {}, lock() {}, auto() {} });

  useEffect(() => {
    const canvas = cv.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = GW * dpr; canvas.height = GH * dpr;
    const patch = (next: Partial<Ui>) => setUi((u) => ({ ...u, ...next }));
    const col = (t: 0 | 1) => { const { g } = P.current; return g.franchises.find((f) => f.id === (t === 0 ? g.match!.home : g.match!.away))?.color ?? '#38bdf8'; };
    let clock = 0, prev = performance.now(), waitIdx = P.current.idx, noteUntil = 0;
    let b: Ball | null = null;
    let idle: { cam: 'bat' | 'bowl'; batTeam: 0 | 1; m: number } = { cam: P.current.mineTeam(0) ? 'bat' : 'bowl', batTeam: 0, m: 1 };

    const flightMs = (bowlerId: string) => {
      const bw = PLAYER_MAP[bowlerId]; const s = bw?.bowling;
      const speed = bw && isSpin(bw) ? 0.6 + (s?.attack ?? 50) / 400 : Math.max(0.7, Math.min(1.6, ((s?.speed ?? 130) - 110) / 30));
      return Math.max(750, Math.min(1700, 1250 / speed));
    };
    const make = (cam: 'bat' | 'bowl', batTeam: 0 | 1, batter: string, bowler: string, d?: Decision): Ball => ({
      cam, batTeam, m: PLAYER_MAP[batter]?.bats === 'L' ? -1 : 1, d, inter: null, t0: clock, runMs: 700, relX: cam === 'bat' ? -16 : 52,
      baseT: flightMs(bowler), T: 0, acc: 2, zb: 0.32, x1: 5, answered: false, trail: [],
    });
    /** Fix the ball's line and length once the delivery is known. */
    const aimBall = (x: Ball, delivery: string, acc: number) => {
      x.delivery = delivery; x.acc = acc; x.T = x.baseT * (delivery === 'slower' ? 1.35 : 1);
      if (x.lock) { x.zb = Math.max(0.02, Math.min(0.8, 1 - x.lock.z)); x.x1 = x.relX + (-x.lock.x - x.relX) / (1 - x.zb); return; }
      x.zb = PITCH_AT[delivery] ?? 0.32;
      // A loose ball drifts off its line.
      x.x1 = (delivery === 'wide' ? 56 : 5) * x.m + (Math.floor(x.t0) % 2 ? 1 : -1) * (3 - acc) * 9;
    };
    const at = (x: Ball, u: number) => { const z = 1 - u; return { x: lerp(x.relX, x.x1, u), z, h: z > x.zb ? 64 * (1 - ((1 - z) / (1 - x.zb)) ** 2) : batHeight(x.zb) * ((x.zb - z) / x.zb) }; };
    const answer = (x: Ball, a: string) => { x.answered = true; x.inter = null; P.current.onAnswer(a); };
    const sound = (q: number) => { if (store.get().settings.sound) sfx(q >= 2 ? 'crack' : 'tap'); };

    act.current = {
      shot(id) {
        if (!b || b.inter !== 'bat' || b.rel === undefined) return;
        const meta = b.d!.meta!;
        const q = timingQ(clock - (b.rel + b.T), meta.zones?.[id] ?? meta.zone), early = clock < b.rel + b.T;
        b.swing = { t: clock, shot: id, q };
        sound(q); answer(b, `${id}@${q}`);
        patch({ inter: null, live: false, word: { q, text: q === 0 ? (early ? 'too early' : 'too late') : q === 1 ? (early ? 'early' : 'late') : TIM_WORD[q] } });
      },
      pick(id) { if (b?.inter === 'pick') { b.pick = id; b.inter = 'aim'; b.t0 = clock; patch({ inter: 'aim' }); } },
      lock() {
        if (!b || b.inter !== 'aim' || !b.pick) return;
        const a = sight(b);
        const q = aimQ(Math.hypot((a.z - a.tz) / 0.15, (a.x - a.tx) / 46));
        b.lock = { x: a.x, z: a.z }; aimBall(b, b.pick, q);
        b.run0 = clock; b.runMs = 450;
        sound(q); answer(b, `${b.pick}@${q}`);
        patch({ inter: null, word: { q, text: ACC_WORD[q] } });
      },
      auto(m) { if (!b?.inter) return; P.current.onAuto(m); P.current.onAnswer('auto'); b = null; patch(REST); },
    };
    /** Bowling: the sight wanders round the spot; a steadier bowler's sight moves slower. View coordinates. */
    function sight(x: Ball) {
      const meta = x.d!.meta!, zone = meta.zones?.[x.pick!] ?? meta.zone;
      const w = (Math.PI * 2 * (0.45 + (0.3 - zone) * 2.6)) / 1000, t = clock - x.t0;
      const tz = 1 - (PITCH_AT[x.pick!] ?? 0.32), tx = -(x.pick === 'wide' ? 56 : 5) * x.m;
      return { tx, tz, x: tx + 46 * Math.sin(1.63 * w * t + 1), z: tz + 0.15 * Math.sin(w * t) };
    }

    /** Players on the pitch, in view coordinates for this camera. */
    const figs = (cam: 'bat' | 'bowl', batTeam: 0 | 1, m: number, run: number, swing: number, sig?: Signal): Fig[] => {
      const bat = col(batTeam), fld = col((1 - batTeam) as 0 | 1);
      const v = (x: number, z: number) => (cam === 'bat' ? { x, z } : { x: -x, z: 1 - z });
      const out: Fig[] = [
        { ...v(-62 * m, -0.02), color: bat, kind: 'batter', back: cam === 'bat', t: swing, left: m < 0 },
        { ...v(cam === 'bat' ? 84 : -84, 1), color: bat, kind: 'batter', back: cam === 'bowl', left: cam === 'bowl' },
        { ...v(cam === 'bat' ? -16 : 70, cam === 'bat' ? 1.5 - run * 0.48 : 1.24 - run * 0.2), color: fld, kind: 'bowler', back: cam === 'bowl', t: run },
      ];
      if (cam === 'bat') out.push({ x: 4, z: 1.13, color: '', kind: 'umpire', back: false, sig });
      else out.push({ x: -14 * m, z: 1.24, color: fld, kind: 'keeper', back: false }, { x: -70 * m, z: 1.3, color: fld, kind: 'fielder', back: false });
      for (const [x, z] of [[-300, 2.3], [260, 2.6], [-120, 3.8], [150, 4.2]]) out.push({ x, z, color: fld, kind: 'fielder', back: false });
      return out;
    };
    const drawIdle = (ts: number) => drawPitch(ctx, { figs: figs(idle.cam, idle.batTeam, idle.m, 0, 0), marks: [], trail: [], time: ts });

    const outcomeKind = (e: BallEvent, contact: boolean): Kind => {
      const w = e.wicket?.kind;
      if (w) return w === 'bowled' || w === 'lbw' || w === 'caught' ? w : w === 'runout' ? 'runout' : 'through';
      return e.runs >= 6 ? 'six' : e.runs >= 4 ? 'four' : e.runs > 0 ? 'runs' : e.extra === 'wide' || !contact ? 'through' : 'block';
    };
    /** When the result is announced (ms after the outcome starts) and how long the ball is followed in the field. */
    const timing = (k: Kind, runs: number) => {
      const F = k === 'four' ? 1500 : k === 'six' ? 1650 : k === 'caught' ? 1600 : k === 'runout' ? 1900 : 900 + 450 * runs;
      const reveal = k === 'through' ? 420 : k === 'bowled' ? 120 : k === 'lbw' ? 450 : k === 'block' ? 380 : 240 + (k === 'four' ? 1100 : k === 'six' ? 1250 : k === 'caught' ? 1150 : k === 'runout' ? 1750 : F - 300);
      return { F, reveal };
    };

    const stepBall = (x: Ball, ts: number): boolean => {
      const p = P.current;
      const view = (w: { x: number; z: number; h: number }) => (x.cam === 'bat' ? w : { x: -w.x, z: 1 - w.z, h: w.h });
      // Bowling, before release: choose and aim.
      if (x.inter === 'pick' || x.inter === 'aim') {
        if (clock - x.t0 > 14000) { answer(x, 'auto'); patch(REST); return false; }
        const a = x.inter === 'aim' ? sight(x) : null;
        drawPitch(ctx, { figs: figs(x.cam, x.batTeam, x.m, 0, 0), marks: a ? [{ x: a.tx, z: a.tz, kind: 'target' }, { x: a.x, z: a.z, kind: 'aim' }] : [], trail: x.trail, time: ts });
        return true;
      }
      // The result arrives from the engine once every answer is in.
      if (!x.e && (x.answered || !x.d) && p.events.length > p.idx && p.idx >= waitIdx) {
        const e = p.events[p.idx];
        if (!e.bowler) return false;
        x.e = e;
        if (!x.delivery) aimBall(x, e.mind?.bowl ?? 'length', e.mind?.acc ?? 2);
      }
      // Someone else has to move first (the other side is still to play this ball).
      if (x.answered && !x.e && p.call && p.call.id !== x.d?.id) return false;
      if (x.run0 === undefined) x.run0 = clock;
      const run = clamp01((clock - x.run0) / x.runMs);
      const humanBat = x.d?.kind === 'batBall';
      if (x.rel === undefined && run >= 1 && x.delivery && (humanBat || x.e)) {
        x.rel = clock;
        if (humanBat) patch({ live: true, chip: (p.call?.meta?.spin ? DELIVERY_LABEL[x.delivery]?.spin : DELIVERY_LABEL[x.delivery]?.pace) ?? '' });
        // Not your shot: the batter plays it as the engine recorded (a mistimed shot comes through late).
        else { const tim = x.e!.mind?.tim ?? 2; x.swing = { t: clock + x.T - 70 + (tim === 0 ? 150 : tim === 1 ? 70 : 0), shot: x.e!.mind?.bat ?? 'drive', q: tim }; }
      }
      const arrive = x.rel !== undefined ? x.rel + x.T : Infinity;
      // Batting: nobody swung, so the ball is left alone.
      if (x.inter === 'bat' && clock > arrive + x.T * 0.28) { x.swing = null; answer(x, 'defend@1'); patch({ inter: null, live: false, word: { q: 1, text: 'no shot' } }); }
      const swung = !!x.swing && clock >= x.swing.t;
      const contact = !!x.swing && x.swing.q > 0;
      if (x.e && x.tOut === undefined && x.rel !== undefined) {
        const start = contact ? Math.max(x.swing!.t, humanBat ? 0 : arrive - 40) : arrive;
        if (clock >= start) { x.tOut = clock; x.kind = outcomeKind(x.e, contact); x.from = at(x, Math.min(1, (Math.min(clock, arrive) - x.rel) / x.T)); }
      }

      let ball: { x: number; z: number; h: number } | undefined;
      let broken: { z: number; t: number } | undefined;
      let sig: Signal | undefined;
      if (x.rel !== undefined && x.tOut === undefined) {
        // In flight; a batter who has made contact holds the ball on the bat until the result is in.
        ball = at(x, Math.min(1.3, ((contact && swung ? Math.min(x.swing!.t, arrive) : clock) - x.rel) / x.T));
      } else if (x.tOut !== undefined) {
        const e = x.e!, k = x.kind!, dt = clock - x.tOut, f = x.from!, { F, reveal } = timing(k, e.runs);
        const inField = k === 'four' || k === 'six' || k === 'caught' || k === 'runs' || k === 'runout';
        if (!x.revealed && dt >= reveal) {
          x.revealed = true;
          const text = e.wicket ? WICKET_WORD[e.wicket.kind] : e.runs === 6 ? 'SIX!' : e.runs === 4 ? 'FOUR!' : e.extra === 'wide' ? 'WIDE' : e.runs > 0 ? `${e.runs} run${e.runs > 1 ? 's' : ''}` : contact || x.swing === null ? 'No run' : 'Beaten!';
          patch({ big: { text: (e.extra === 'noball' ? 'NO-BALL · ' : '') + text, cls: e.wicket ? 'w' : e.runs === 6 ? 'r6' : e.runs === 4 ? 'r4' : '' }, caption: e.text, word: null, chip: '' });
          p.advance(); waitIdx = p.idx + 1;
        }
        if (x.revealed) sig = e.wicket ? 'out' : e.runs === 6 ? 'six' : e.runs === 4 ? 'four' : e.extra === 'wide' ? 'wide' : undefined;
        if (dt > reveal + (e.wicket || e.runs >= 4 ? 1500 : 750)) return false;
        if (inField && dt >= 240) {
          // Follow the ball across the field from above.
          const ft = dt - 240, a = e.angle ?? 60 * x.m, D = k === 'four' ? 1.02 : k === 'six' ? 1.16 : k === 'runout' ? 0.45 : e.dist ?? 0.5;
          const tp = spot(a, D), home = spot(0, 0);
          const pp = e.over < Math.ceil(e.overs * 0.3);
          const men = [...fieldSet(pp, x.m < 0).map((s) => spot(s.a, s.d)), spot(8, 0.3), spot(180, 0.1)];
          let near = 0; men.forEach((mn, i) => { if (i < 9 && Math.hypot(mn.x - tp.x, mn.y - tp.y) < Math.hypot(men[near].x - tp.x, men[near].y - tp.y)) near = i; });
          const chase = clamp01(ft / (k === 'four' ? 1500 : 620)) * (k === 'four' ? 0.75 : k === 'six' ? 0.3 : 1);
          men[near] = { x: lerp(men[near].x, tp.x, chase), y: lerp(men[near].y, tp.y, chase) };
          let pos = tp, h = 0, runs = 0;
          if (k === 'four') { const q = clamp01(ft / 1150); pos = spot(a, lerp(0.06, D, easeOut(q))); h = Math.abs(Math.sin(q * 10)) * 0.06 * (1 - q); runs = Math.min(0.5, ft / 2400); }
          else if (k === 'six') { const q = clamp01(ft / 1250); pos = spot(a, lerp(0.06, D, q)); h = Math.sin(Math.PI * q); }
          else if (k === 'caught') { const q = clamp01(ft / 1150); pos = spot(a, lerp(0.06, D, q)); h = Math.sin(Math.PI * q) * 0.9; runs = Math.min(0.6, ft / 1800); }
          else {
            const back = clamp01((ft - (F - 520)) / 450), q = clamp01(ft / 650);
            pos = back > 0 ? { x: lerp(tp.x, home.x, back), y: lerp(tp.y, home.y, back) } : spot(a, lerp(0.06, D, easeOut(q)));
            h = back > 0 ? Math.sin(Math.PI * back) * 0.25 : 0;
            runs = k === 'runout' ? Math.min(0.86, ft / 1700) : Math.min(e.runs, (ft / (F - 320)) * e.runs);
          }
          drawField(ctx, { time: ts, ball: { ...pos, h }, fielders: men, field: col((1 - x.batTeam) as 0 | 1), bat: col(x.batTeam), run: runs, zoom: 1 + 0.2 * clamp01(ft / F) });
          return true;
        }
        if (inField) { const q = dt / 240, a = ((e.angle ?? 60 * x.m) * Math.PI) / 180, air = k === 'six' || k === 'caught'; ball = { x: f.x + Math.sin(a) * 520 * q, z: f.z + Math.cos(a) * 2.2 * q, h: f.h + (air ? 260 : 12) * q }; }
        else if (k === 'bowled') { ball = { x: 0, z: 0, h: 16 }; broken = { z: x.cam === 'bat' ? 0 : 1, t: clamp01(dt / 450) }; }
        else if (k === 'lbw') ball = { x: f.x, z: 0.03, h: Math.max(0, 22 - dt * 0.06) };
        else if (k === 'block') { const q = easeOut(dt / 400); ball = { x: lerp(f.x, 14 * x.m, q), z: lerp(f.z, 0.22, q), h: f.h * (1 - q) }; }
        else { const u = Math.min(1, (x.tOut - x.rel!) / x.T) + dt / x.T; ball = u < 1.3 ? at(x, u) : undefined; }
      }
      const marks = x.rel !== undefined && x.tOut === undefined && !swung && (x.cam === 'bat' || x.lock) ? [{ ...view({ x: lerp(x.relX, x.x1, 1 - x.zb), z: x.zb, h: 0 }), kind: 'bounce' as const }] : [];
      drawPitch(ctx, { figs: figs(x.cam, x.batTeam, x.m, run, swung ? clamp01((clock - x.swing!.t) / 200) : 0, sig), ball: ball && view(ball), marks, trail: x.trail, time: ts, broken });
      return true;
    };

    let raf = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const p = P.current;
      const real = Math.min(50, ts - prev); prev = ts;
      // Your own input runs in real time; watching a ball or a result follows the speed setting.
      clock += real * (b && (b.inter || (b.d?.kind === 'batBall' && !b.e)) ? 1 : RATE[p.speed] ?? 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // "Skip" moved the match on without us.
      if (p.idx > waitIdx) { waitIdx = p.idx; noteUntil = 0; if (b && !b.inter) { b = null; patch(REST); } }
      if (b) {
        if (stepBall(b, ts)) return;
        idle = { cam: b.cam, batTeam: b.batTeam, m: b.m }; b = null; patch(REST);
      }
      drawIdle(ts);
      if (p.idx < waitIdx || clock < noteUntil) return;
      if (p.idx < p.events.length) {
        const e = p.events[p.idx];
        if (!e.bowler) { patch({ ...REST, caption: e.text }); p.advance(); waitIdx = p.idx + 1; noteUntil = clock + 1100; return; }
        b = make(p.mineTeam(e.team) || !p.mineTeam((1 - e.team) as 0 | 1) ? 'bat' : 'bowl', e.team, e.batter, e.bowler);
        patch(REST);
      } else if (p.call?.meta) {
        const d = p.call, batting = d.kind === 'batBall';
        b = make(batting ? 'bat' : 'bowl', batting ? d.team : ((1 - d.team) as 0 | 1), d.meta!.batter, d.meta!.bowler, d);
        if (batting) { b.inter = 'bat'; b.run0 = clock + 500; b.runMs = 1300; aimBall(b, d.meta!.ball ?? 'length', d.meta!.acc ?? 2); }
        else b.inter = 'pick';
        patch({ ...REST, inter: b.inter, opts: d.options });
      }
      if (b) idle = { cam: b.cam, batTeam: b.batTeam, m: b.m };
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, select, textarea')) return;
      const o = ui.opts[Number(e.key) - 1];
      if (o && ui.inter === 'bat') act.current.shot(o.id);
      else if (o && ui.inter === 'pick') act.current.pick(o.id);
      else if (ui.inter === 'aim' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); act.current.lock(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ui.inter, ui.opts]);

  const { status, who, hud } = props;
  const btn = (o: Option, i: number, go: (id: string) => void, off: boolean) => (
    <button key={o.id} className="option shot" disabled={off} onPointerDown={() => go(o.id)} onClick={() => go(o.id)} title={o.hint}>
      <kbd>{i + 1}</kbd>{o.label.replace(/ \/.*| for one/, '')}
      <span className="skill" aria-label={`Skill ${o.skill ?? 50} of 100`}><i style={{ width: `${o.skill ?? 50}%` }} /></span>
    </button>
  );
  return (
    <section className="play-ground">
      <div className="ground-wrap">
        <canvas ref={cv} className="ground" aria-label="The ground" onPointerDown={() => act.current.lock()} />
        <div className="ground-hud">{hud}</div>
        {ui.chip && <span className="ground-chip">{ui.chip}</span>}
        {ui.word && !ui.big && <div className={`meter-result q${ui.word.q} ground-word`}>{ui.word.text}</div>}
        {ui.big && <div className={`ground-big ${ui.big.cls}`}>{ui.big.text}</div>}
        {ui.caption && <div className="ground-caption">{ui.caption}</div>}
      </div>
      <div className="ground-controls">
        {ui.inter === 'aim' ? <button className="btn primary lg bowl" onClick={() => act.current.lock()}>Bowl!</button>
          : <div className="shots">{ui.opts.map((o, i) => btn(o, i, (id) => (ui.inter === 'pick' ? act.current.pick(id) : act.current.shot(id)), ui.inter === 'pick' ? false : ui.inter !== 'bat' || !ui.live))}</div>}
        <div className="row between" style={{ fontSize: 13 }}>
          <span className="faint">
            {ui.inter === 'bat' ? `${who}: watch the red mark (where the ball lands) and play your shot as the ball reaches the bat. Tap or press 1 to 5. Bars show how good this batter is at each shot.`
              : ui.inter === 'pick' ? `${who}: pick the delivery. The bar is how good this bowler is at it.`
                : ui.inter === 'aim' ? 'Release when the white sight is on the green spot (tap the pitch, the button, or Space).'
                  : status || 'Watch the ball. Your turn comes when one of your players is batting or bowling.'}
          </span>
          {ui.inter && <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <button className="btn sm ghost" onClick={() => act.current.auto('over')}>Auto this over</button>
            <button className="btn sm ghost" onClick={() => act.current.auto('innings')}>Auto innings</button>
          </span>}
        </div>
      </div>
    </section>
  );
}
