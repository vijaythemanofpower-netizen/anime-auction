// The living battlefield, drawn in the DOM between the painted backdrop and the
// fighters: the sky's colour grade (storm darkness, heat, fog, blizzard
// whiteout, lightning flashes), snow and water lying on the ground, every
// crater, crack, scorch and frost patch the fight has left so far, the
// arena's breakable objects in their current state, and the light thrown by
// the move being used. All of it comes from the director's script, so it
// persists through the fight and is the same for every viewer.
import { memo, type CSSProperties } from 'react';
import type { Anchor, BattlefieldScript, Frame, Mark } from './director';
import { marksAt, propStatesAt } from './director';
import type { PropDef, PropKind } from './climate';
import { WEATHER_LABEL } from './climate';
import { Rng } from '../../engine/rng';

export type FighterPos = Record<string, { x: number; y: number; foot: number; w: number }>;

export function resolveAnchor(a: Anchor, pos: FighterPos, w: number, ground: number): { x: number; y: number } {
  if ('x' in a) return { x: a.x * w, y: ground };
  const p = pos[a.fighter];
  if (!p) return { x: w / 2, y: ground };
  return { x: p.x + a.dx * p.w, y: p.foot };
}

const TINT: Record<string, string> = {
  heat: 'rgba(255,120,40,0.14)', embers: 'rgba(255,90,30,0.12)', ash: 'rgba(90,70,60,0.22)', blizzard: 'rgba(225,240,255,0.30)',
  snow: 'rgba(220,235,255,0.10)', fog: 'rgba(200,205,220,0.20)', storm: 'rgba(20,25,70,0.25)', rain: 'rgba(40,60,110,0.14)',
  dust: 'rgba(200,160,100,0.20)', petals: 'rgba(255,190,220,0.08)', fireflies: 'rgba(60,90,40,0.10)', wind: 'rgba(200,220,210,0.05)', clear: 'rgba(255,240,200,0.04)',
};

/** Sky colour grade + ground cover, under the fighters. */
export const SkyAndGround = memo(function SkyAndGround({ frame, seq, envId }: { frame: Frame | undefined; seq: number; envId: string }) {
  const w = frame?.weather;
  if (!w) return null;
  return (
    <>
      <div className={`bf-sky wx-${w.kind}`} aria-hidden="true" style={{ ['--dark' as string]: w.dark, ['--tint' as string]: TINT[w.kind] ?? 'transparent', ['--wi' as string]: w.intensity } as CSSProperties} />
      <div className={`bf-cover ground-${envId}`} aria-hidden="true" style={{ ['--snow' as string]: w.snow, ['--wet' as string]: w.wet } as CSSProperties} />
      {w.flash && <div className="bf-flash" key={`fl${seq}`} aria-hidden="true" />}
    </>
  );
});

/** A short label for the weather and what is causing it, for the HUD. */
export function weatherLabel(f: Frame | undefined): string {
  if (!f) return '';
  const w = f.weather;
  return w.cause ? `${WEATHER_LABEL[w.kind]} · ${w.cause}` : WEATHER_LABEL[w.kind];
}

// ------------------------------------------------------------- ground marks

function jag(rng: Rng, len: number, steps = 5): string {
  let x = 0, y = 0, a = rng.range(-0.6, 0.6), d = 'M0 0';
  // A random walk that keeps heading outward, so a crack never curls back on itself.
  const a0 = a;
  for (let i = 0; i < steps; i++) { a = Math.max(a0 - 0.6, Math.min(a0 + 0.6, a + rng.range(-0.5, 0.5))); x += Math.cos(a) * len / steps; y += Math.sin(a) * len / steps; d += ` L${x.toFixed(1)} ${y.toFixed(1)}`; }
  return d;
}

function MarkShape({ m }: { m: Mark }) {
  const r = new Rng(m.id * 7919 + 13);
  const s = m.size;
  switch (m.kind) {
    case 'crater': return (
      <g>
        <ellipse rx={s * 0.62} ry={s * 0.22} fill="url(#bf-crater)" />
        <ellipse rx={s * 0.62} ry={s * 0.22} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" strokeDasharray="6 5" />
        {Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + r.range(0, 0.6); return <polygon key={i} points="-4,0 0,-4 5,-1 2,3" fill="#2a2420" transform={`translate(${Math.cos(a) * s * 0.7} ${Math.sin(a) * s * 0.26}) scale(${r.range(0.8, 1.8)})`} />; })}
      </g>);
    case 'radial': return (
      // Lying on the ground: flattened by the floor's perspective.
      <g stroke="rgba(0,0,0,0.75)" strokeWidth="2.2" fill="none" strokeLinecap="round" transform="scale(1 0.36)" vectorEffect="non-scaling-stroke">
        {Array.from({ length: 7 }, (_, i) => <path key={i} d={jag(r, s * r.range(0.4, 0.75))} transform={`rotate(${(i / 7) * 360 + r.range(-15, 15)})`} />)}
      </g>);
    case 'crack': return (
      <g fill="none" strokeLinecap="round" transform={`scale(1 0.4) rotate(${m.rot})`}>
        <path d={jag(r, s, 6)} stroke="rgba(0,0,0,0.8)" strokeWidth="2.6" />
        <path d={jag(r, s * 0.5, 4)} stroke="rgba(0,0,0,0.7)" strokeWidth="1.6" transform={`translate(${s * 0.3} 0) rotate(35)`} />
        <path d={jag(r, s * 0.4, 3)} stroke="rgba(0,0,0,0.7)" strokeWidth="1.4" transform={`translate(${s * 0.15} 0) rotate(-40)`} />
      </g>);
    case 'scorch': return <ellipse rx={s * 0.6} ry={s * 0.22} fill="url(#bf-scorch)" />;
    case 'melt': return <ellipse rx={s * 0.55} ry={s * 0.2} fill="rgba(20,20,30,0.35)" />;
    case 'frost': return (
      <g>
        <ellipse rx={s * 0.6} ry={s * 0.22} fill="url(#bf-frost)" />
        {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M0 0 L${s * r.range(0.3, 0.6)} 0`} stroke="rgba(224,242,254,0.85)" strokeWidth="1.5" transform={`scale(1 0.36) rotate(${i * 45 + r.range(-10, 10)})`} />)}
      </g>);
    case 'slash': return (
      <g transform={`rotate(${m.rot * 0.3})`}>
        <path d={`M${-s * 0.6} 0 Q0 ${-s * 0.05} ${s * 0.6} 0 Q0 ${s * 0.04} ${-s * 0.6} 0Z`} fill="rgba(0,0,0,0.85)" />
        <path d={`M${-s * 0.55} -1.5 Q0 ${-s * 0.06} ${s * 0.55} -1.5`} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      </g>);
    case 'trench': return <ellipse rx={s * 1.1} ry={s * 0.09} fill="url(#bf-scorch)" transform={`translate(${m.rot === 180 ? s * 0.6 : -s * 0.6} 0)`} />;
    case 'puddle': return (
      <g className="bf-puddle">
        <ellipse rx={s * 0.6} ry={s * 0.16} fill="url(#bf-water)" />
        <ellipse className="ripple" rx={s * 0.2} ry={s * 0.06} fill="none" stroke="rgba(224,242,254,0.6)" strokeWidth="1" />
      </g>);
    case 'rubble': return (
      <g>
        <ellipse rx={s * 0.7} ry={s * 0.16} fill="rgba(0,0,0,0.45)" />
        {Array.from({ length: 9 }, (_, i) => <polygon key={i} points="-6,2 -2,-6 5,-4 7,3 0,5" fill={i % 3 ? '#4b4038' : '#6b5d52'} stroke="#1c1714" strokeWidth="0.8" transform={`translate(${r.range(-s * 0.55, s * 0.55)} ${r.range(-s * 0.12, s * 0.06)}) rotate(${r.range(0, 360)}) scale(${r.range(0.9, 2.2)})`} />)}
      </g>);
    case 'glow': return <ellipse className="bf-glow" rx={s * 0.6} ry={s * 0.2} fill={m.color} style={{ filter: `blur(${Math.max(4, s * 0.08)}px)` }} />;
  }
}

/** Every mark the fight has left on the ground up to now. */
export const GroundMarks = memo(function GroundMarks({ script, seq, pos, w, h, ground }: { script: BattlefieldScript; seq: number; pos: FighterPos; w: number; h: number; ground: number }) {
  const marks = marksAt(script, seq);
  if (!marks.length) return null;
  return (
    <svg className="bf-marks" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <defs>
        <radialGradient id="bf-crater"><stop offset="0" stopColor="#000" stopOpacity="0.85" /><stop offset="0.65" stopColor="#120c08" stopOpacity="0.6" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        <radialGradient id="bf-scorch"><stop offset="0" stopColor="#050302" stopOpacity="0.85" /><stop offset="0.6" stopColor="#2a1408" stopOpacity="0.45" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        <radialGradient id="bf-frost"><stop offset="0" stopColor="#f0f9ff" stopOpacity="0.85" /><stop offset="0.7" stopColor="#bae6fd" stopOpacity="0.35" /><stop offset="1" stopColor="#bae6fd" stopOpacity="0" /></radialGradient>
        <radialGradient id="bf-water"><stop offset="0" stopColor="#bae6fd" stopOpacity="0.45" /><stop offset="0.7" stopColor="#0ea5e9" stopOpacity="0.3" /><stop offset="1" stopColor="#0369a1" stopOpacity="0" /></radialGradient>
      </defs>
      {marks.map((m) => {
        const at = resolveAnchor(m.at, pos, w, ground);
        return <g key={m.id} className={`bf-mark k-${m.kind}`} transform={`translate(${at.x.toFixed(1)} ${(at.y + 4).toFixed(1)})`}><g className={m.seq === seq ? 'fresh' : undefined}><MarkShape m={m} /></g></g>;
      })}
    </svg>
  );
});

// ----------------------------------------------------------------- props

function PropArt({ kind, state }: { kind: PropKind; state: 0 | 1 | 2 }) {
  const broken = state === 2;
  const cracks = state >= 1 ? <g stroke="#0b0a0c" strokeWidth="2" fill="none" strokeLinecap="round"><path d="M44 40 L52 62 L46 80 L56 104" /><path d="M52 62 L64 70" /><path d="M46 80 L36 88" /></g> : null;
  // Destroyed props keep only their lower part, snapped off at an angle.
  const clip = broken ? <clipPath id={`snap-${kind}`}><polygon points="0,200 0,120 40,108 60,126 100,104 100,200" /></clipPath> : null;
  const g = (children: React.ReactNode) => <g clipPath={broken ? `url(#snap-${kind})` : undefined}>{children}{cracks}</g>;
  let body: React.ReactNode;
  switch (kind) {
    case 'pillar': case 'column-ruin': body = g(<><rect x="30" y="20" width="40" height="160" fill={kind === 'pillar' ? '#2b2650' : '#21455c'} /><rect x="22" y="10" width="56" height="14" fill={kind === 'pillar' ? '#3b3570' : '#2e5b75'} /><rect x="22" y="176" width="56" height="14" fill="#1a1736" />{[40, 50, 60].map((x) => <line key={x} x1={x} y1="26" x2={x} y2="174" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />)}</>); break;
    case 'statue': body = g(<><rect x="25" y="160" width="50" height="30" fill="#1a1736" /><path d="M50 40 C38 40 36 56 42 66 L34 160 L66 160 L58 66 C64 56 62 40 50 40Z" fill="#363063" /><circle cx="50" cy="32" r="12" fill="#3f3a72" /></>); break;
    case 'rock': body = g(<path d="M10 190 L18 120 L40 90 L70 96 L90 130 L94 190Z" fill="#3a3330" stroke="#1c1714" strokeWidth="2" />); break;
    case 'lava-rock': body = g(<><path d="M8 190 L14 110 L42 70 L72 84 L92 126 L96 190Z" fill="#241412" stroke="#120806" strokeWidth="2" /><path className="bf-lava" d="M40 78 L48 110 L38 140 L50 186" stroke="#ff6a3d" strokeWidth="4" fill="none" /></>); break;
    case 'ice-spike': body = g(<><path d="M20 190 L42 30 L52 190Z" fill="#bae6fd" opacity="0.85" /><path d="M46 190 L66 60 L82 190Z" fill="#e0f2fe" opacity="0.9" /><path d="M42 30 L46 190" stroke="#fff" strokeWidth="2" /></>); break;
    case 'snow-pine': case 'tree': body = g(<g className="bf-sway"><rect x="44" y="120" width="12" height="70" fill="#2a1d12" /><path d="M50 10 L86 80 L64 80 L92 130 L8 130 L36 80 L14 80Z" fill={kind === 'tree' ? '#0b1f17' : '#1f3b33'} />{kind === 'snow-pine' && <path d="M50 10 L64 38 L36 38Z M30 80 L70 80 L62 72 L38 72Z" fill="#fff" opacity="0.9" />}</g>); break;
    case 'lantern': body = g(<><rect x="46" y="60" width="8" height="130" fill="#2a1d08" /><g className="bf-swing"><rect x="34" y="30" width="32" height="40" rx="6" fill="#c8961e" /><rect x="38" y="36" width="24" height="28" rx="4" className="bf-flicker" fill="#fde68a" /></g></>); break;
    case 'bell': body = g(<><rect x="14" y="20" width="72" height="8" fill="#2a1d08" /><rect x="20" y="28" width="6" height="162" fill="#2a1d08" /><rect x="74" y="28" width="6" height="162" fill="#2a1d08" /><g className="bf-swing"><path d="M50 36 C32 36 30 66 28 90 L72 90 C70 66 68 36 50 36Z" fill="#b8860b" /><rect x="26" y="88" width="48" height="6" rx="3" fill="#8a6408" /></g></>); break;
    case 'shrine': body = g(<><rect x="18" y="80" width="64" height="110" fill="#2a1d08" /><path d="M8 84 L50 50 L92 84Z" fill="#7f1d1d" /><rect x="40" y="120" width="20" height="40" className="bf-flicker" fill="#fde68a" opacity="0.7" /></>); break;
    case 'water-tank': body = g(<><rect x="20" y="40" width="60" height="80" rx="10" fill="#334155" /><rect x="26" y="120" width="6" height="70" fill="#1e293b" /><rect x="68" y="120" width="6" height="70" fill="#1e293b" /><rect x="20" y="70" width="60" height="5" fill="#22d3ee" opacity="0.5" /></>); break;
    case 'sign': body = g(<><rect x="46" y="100" width="8" height="90" fill="#1e1b4b" /><rect x="6" y="40" width="88" height="56" rx="6" fill="#0c0a24" stroke="#f472b6" strokeWidth="4" className="bf-neon" /><text x="50" y="76" textAnchor="middle" fontSize="18" fontWeight="800" fill="#22d3ee" className="bf-neon">FIGHT</text></>); break;
    case 'ac-unit': body = g(<><rect x="10" y="110" width="80" height="80" fill="#475569" /><circle cx="50" cy="150" r="26" fill="#1e293b" /><g className="bf-spin" style={{ transformOrigin: '50px 150px' }}><rect x="47" y="126" width="6" height="48" fill="#94a3b8" /><rect x="26" y="147" width="48" height="6" fill="#94a3b8" /></g></>); break;
    case 'crate': body = g(<><rect x="14" y="110" width="72" height="80" fill="#7c5a32" stroke="#3f2d17" strokeWidth="3" /><path d="M14 110 L86 190 M86 110 L14 190" stroke="#3f2d17" strokeWidth="3" /></>); break;
    case 'buoy': body = g(<g className="bf-bob"><path d="M30 150 L50 60 L70 150Z" fill="#dc2626" /><rect x="26" y="146" width="48" height="16" rx="6" fill="#f8fafc" /><circle cx="50" cy="56" r="6" className="bf-flicker" fill="#fde68a" /></g>); break;
    case 'banner': body = g(<><rect x="20" y="10" width="6" height="180" fill="#1a1530" /><path className="bf-wave" d="M26 20 L86 24 L82 110 L56 98 L26 112Z" fill="#7c3aed" stroke="#c4b5fd" strokeWidth="2" /></>); break;
    case 'brazier': body = g(<><path d="M30 120 L70 120 L62 150 L38 150Z" fill="#3a2d1a" /><rect x="46" y="150" width="8" height="40" fill="#2a2010" />{!broken && <g className="bf-fire"><path d="M38 120 C36 96 50 90 50 70 C56 90 66 98 62 120Z" fill="#f97316" /><path d="M44 120 C44 104 52 100 52 88 C56 102 60 108 58 120Z" fill="#fde047" /></g>}</>); break;
  }
  return <svg viewBox="0 0 100 200" className="bf-prop-art">{clip && <defs>{clip}</defs>}{body}</svg>;
}

/** The arena's breakable objects, each in its current state. */
export const PropsLayer = memo(function PropsLayer({ script, seq, layer, hitNow, wind }: { script: BattlefieldScript; seq: number; layer: 'back' | 'front'; hitNow: string[]; wind: number }) {
  const states = propStatesAt(script, seq);
  return (
    <div className={`bf-props ${layer}`} aria-hidden="true" style={{ ['--wind' as string]: wind } as CSSProperties}>
      {script.props.filter((p: PropDef) => p.layer === layer).map((p) => (
        <div key={p.id} data-prop={p.id} className={`bf-prop k-${p.kind} s-${states[p.id]}${hitNow.includes(p.id) ? ' hit' : ''}`}
          style={{ left: `${p.x * 100}%`, ['--ps' as string]: p.scale } as CSSProperties}>
          <PropArt kind={p.kind} state={states[p.id]} />
          {states[p.id] === 2 && <div className="bf-smoke" />}
        </div>
      ))}
    </div>
  );
});

/** The colour of the move lighting up the arena around where it happens. */
export function MoveLight({ frame, seq, at }: { frame: Frame | undefined; seq: number; at: { x: number; y: number } | undefined }) {
  if (!frame?.light || !at) return null;
  return <div className="bf-light" key={`l${seq}`} aria-hidden="true" style={{ left: at.x, top: at.y, ['--c' as string]: frame.light.color, ['--p' as string]: frame.light.power } as CSSProperties} />;
}

/** Colosseum crowd: rows of silhouettes that jump on big moments. */
export function Crowd({ hype, seq }: { hype: number; seq: number }) {
  const r = new Rng(77);
  return (
    <div className={`bf-crowd${hype > 0.75 ? ' roar' : ''}`} key={hype > 0.75 ? `c${seq}` : 'calm'} aria-hidden="true" style={{ ['--hype' as string]: hype } as CSSProperties}>
      {Array.from({ length: 46 }, (_, i) => <i key={i} style={{ left: `${(i / 46) * 100 + r.range(-0.6, 0.6)}%`, animationDelay: `${r.range(0, 0.6)}s`, height: `${r.range(14, 22)}px` }} />)}
    </div>
  );
}
