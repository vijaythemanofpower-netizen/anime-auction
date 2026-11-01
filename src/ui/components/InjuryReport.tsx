// Injury report: a body chart that lights up where a fighter is hurt and how
// badly, plus guard and stamina in words. No health bars anywhere.
import { useId } from 'react';
import type { BattleInjury, BodyPart } from '../../engine/types';
import { REGIONS, REGION_NAME, injuryRegion, type BodyDamage, type Region } from '../bodyDamage';

export const INJURY_EFFECT: Record<BodyPart, [string, string]> = {
  head: ['Seeing stars: aim is off and a clean hit could drop them.', 'Concussed: one more clean hit to the head could end it.'],
  arm: ['Bruised arm: strikes hit a little softer.', 'Broken arm: strikes are badly weakened.'],
  leg: ['Twisted ankle: a step slower, dodging is harder.', 'Damaged leg: slow, and dodging is much harder.'],
  torso: ['Cracked rib: stamina comes back slower.', 'Broken ribs: every breath hurts; stamina barely recovers.'],
};

export function guardWord(g: number): { label: string; tone: string } {
  if (g >= 70) return { label: 'Solid', tone: 'good' };
  if (g >= 35) return { label: 'Cracking', tone: 'mid' };
  if (g > 0) return { label: 'Shaky', tone: 'low' };
  return { label: 'Broken', tone: 'crit' };
}

export function staminaWord(pct: number): { label: string; tone: string } {
  if (pct >= 0.7) return { label: 'Fresh legs', tone: 'good' };
  if (pct >= 0.4) return { label: 'Breathing hard', tone: 'mid' };
  if (pct >= 0.15) return { label: 'Winded', tone: 'low' };
  return { label: 'Exhausted', tone: 'crit' };
}

/** Colour for a damaged area: unhurt is a neutral body tone, then amber to deep red. */
function tint(p: number): string {
  if (p <= 0) return '#7b8496';
  const t = Math.min(1, p / 100);
  return `hsl(${Math.round(42 - 42 * t)} ${Math.round(70 + 20 * t)}% ${Math.round(56 - 18 * t)}%)`;
}

// Front-view figure (viewer's left is the fighter's right arm/leg), viewBox 0 0 60 120.
const SHAPES: Record<Region, string> = {
  head: 'M30 2.5c4.6 0 7.6 3.6 7.6 8.6 0 3.3-1.3 6.4-3.4 8.1-1.2 1-2.6 1.5-4.2 1.5s-3-.5-4.2-1.5c-2.1-1.7-3.4-4.8-3.4-8.1 0-5 3-8.6 7.6-8.6z',
  torso: 'M27.2 20.4h5.6l.5 2.6c3.4.6 6.7 1.4 8.6 2.9 1.4 1.1 1.9 2.8 1.8 5l-.9 9.4c-.5 3.5-1.3 6.2-1.6 9.6-.2 2.3.4 4.6 1.2 7.2l-1 4.4c-3.3 1.4-7.4 2.1-11.4 2.1s-8.1-.7-11.4-2.1l-1-4.4c.8-2.6 1.4-4.9 1.2-7.2-.3-3.4-1.1-6.1-1.6-9.6l-.9-9.4c-.1-2.2.4-3.9 1.8-5 1.9-1.5 5.2-2.3 8.6-2.9z',
  larm: 'M16.6 26.5c-2.6.9-4.2 2.9-4.7 6.2l-1.8 11.3c-.4 2.6-1 4.9-1.7 7.4l-1.6 6.4c-.4 1.6-.4 3 .2 4.2l1 1.8c.5.9 1.8 1 2.4.1l.6-1.1c.5-1.9.9-3.6 1.6-5.8l2.4-7.2c.7-2.2 1.2-4.4 1.6-6.6l1.5-8.7z',
  rarm: 'M43.4 26.5c2.6.9 4.2 2.9 4.7 6.2l1.8 11.3c.4 2.6 1 4.9 1.7 7.4l1.6 6.4c.4 1.6.4 3-.2 4.2l-1 1.8c-.5.9-1.8 1-2.4.1l-.6-1.1c-.5-1.9-.9-3.6-1.6-5.8l-2.4-7.2c-.7-2.2-1.2-4.4-1.6-6.6l-1.5-8.7z',
  lleg: 'M18.4 62.2c3.3 1.3 7.2 2 10.9 2.1l-.6 13.6c-.2 4.1-.5 7.6-1.1 11.4l-1.1 12.6c-.1 2 .1 3.8.5 5.6l.5 3c.2 1.3-.7 2.3-2 2.3h-3.6c-1 0-1.6-.9-1.3-1.8l.9-3.1c.3-1.3.4-2.7.2-4.2l-.9-11.9c-.3-3.9-.8-7.6-1.5-11.6-.8-4.6-1.1-9.3-.9-13.9z',
  rleg: 'M41.6 62.2c-3.3 1.3-7.2 2-10.9 2.1l.6 13.6c.2 4.1.5 7.6 1.1 11.4l1.1 12.6c.1 2-.1 3.8-.5 5.6l-.5 3c-.2 1.3.7 2.3 2 2.3h3.6c1 0 1.6-.9 1.3-1.8l-.9-3.1c-.3-1.3-.4-2.7-.2-4.2l.9-11.9c.3-3.9.8-7.6 1.5-11.6.8-4.6 1.1-9.3.9-13.9z',
};
/** Where a fracture mark goes on each area. */
const FRACTURE: Record<Region, string> = {
  head: 'M27 6l3 3-2 2.5 3.5 3', torso: 'M25 31l5 4-3 3.5 6 5-2 3', larm: 'M13 38l2.5 3-2 2.5 2 3', rarm: 'M47 38l-2.5 3 2 2.5-2 3',
  lleg: 'M22 76l2.5 4-2 3 2.5 4', rleg: 'M38 76l-2.5 4 2 3-2.5 4',
};
/** Muscle and joint lines, so it reads as a body and not as blocks. */
const DETAIL = 'M30 24.5v32 M23.5 32.5c2.2 1.6 4.3 2.1 6.5 2.1s4.3-.5 6.5-2.1 M25 43.5h10 M25.5 49.5h9 M14.8 44.6l2.6.6 M45.2 44.6l-2.6.6 M22.4 88.2l3.6-.2 M37.6 88.2l-3.6-.2';

/** An anatomical figure; each area is coloured by how damaged it is, with fracture marks. */
export function BodyChart({ injuries, size = 54, down, damage, target = '' }: { injuries: BattleInjury[]; size?: number; down?: boolean; damage?: BodyDamage; target?: string }) {
  const id = useId().replace(/:/g, '');
  const sevAt = (r: Region) => Math.max(0, ...injuries.filter((i) => injuryRegion(target, i.part) === r).map((i) => i.severity));
  const pct = (r: Region) => damage?.[r] ?? 0;
  const label = REGIONS.map((r) => `${REGION_NAME[r]} ${pct(r)}%`).join(', ') + (injuries.length ? `. ${injuries.map((i) => i.label).join(', ')}` : '');
  return (
    <svg className={`body-chart${down ? ' down' : ''}`} viewBox="0 0 60 120" width={size / 2} height={size} role="img" aria-label={label}>
      <title>{label}</title>
      <defs>
        <linearGradient id={`sh${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" /><stop offset="0.45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.38" />
        </linearGradient>
      </defs>
      {REGIONS.map((r) => (
        <g key={r} className={`bp${sevAt(r) === 2 ? ' crit' : sevAt(r) || pct(r) >= 50 ? ' hurt' : ''}`}>
          <path d={SHAPES[r]} fill={tint(pct(r))} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
          <path d={SHAPES[r]} fill={`url(#sh${id})`} />
        </g>
      ))}
      <path d={DETAIL} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="0.55" strokeLinecap="round" />
      {REGIONS.filter((r) => sevAt(r) > 0).map((r) => (
        <g key={`f${r}`}>
          <path d={FRACTURE[r]} fill="none" stroke="#120406" strokeWidth={sevAt(r) === 2 ? 1.6 : 1} strokeLinejoin="bevel" />
          {sevAt(r) === 2 && <path d={FRACTURE[r]} fill="none" stroke="#fecaca" strokeWidth="0.45" transform="translate(0.4 0.3)" strokeLinejoin="bevel" />}
        </g>
      ))}
    </svg>
  );
}

/** Overall damage and the worst-hit area, as percentages. */
function damageLine(damage: BodyDamage | undefined, hp: number | undefined, maxHp: number | undefined) {
  if (!damage || hp === undefined || !maxHp) return null;
  const total = Math.round((1 - hp / maxHp) * 100);
  const worst = REGIONS.slice().sort((a, b) => damage[b] - damage[a])[0];
  return { total, worst: damage[worst] > 0 ? `${REGION_NAME[worst]} ${damage[worst]}%` : '' };
}
const tone = (p: number) => (p >= 70 ? 'crit' : p >= 40 ? 'low' : p >= 15 ? 'mid' : 'good');

/** Compact status under a fighter card in the arena. */
export function FighterStatus({ injuries, guard, staminaPct, down, damage, hp, maxHp, target }: { injuries: BattleInjury[]; guard: number; staminaPct: number; down?: boolean; damage?: BodyDamage; hp?: number; maxHp?: number; target?: string }) {
  const g = guardWord(guard), st = staminaWord(staminaPct);
  const d = damageLine(damage, hp, maxHp);
  return (
    <div className="fstatus">
      <BodyChart injuries={injuries} size={62} down={down} damage={damage} target={target} />
      <div className="fs-words">
        {d && <div><span className="fs-k">Damage</span> <span className={`fs-v ${tone(d.total)}`}>{d.total}%</span>{d.worst && <span className="fs-worst">{d.worst}</span>}</div>}
        <div><span className="fs-k">Guard</span> <span className={`fs-v ${g.tone}`}>{g.label}</span></div>
        <div><span className="fs-k">Stamina</span> <span className={`fs-v ${st.tone}`}>{st.label}</span></div>
        <div className="fs-inj">{injuries.length ? injuries.map((i) => <span key={i.part} className={`inj sev${i.severity}`}>{i.label}</span>) : <span className="faint">Unhurt</span>}</div>
      </div>
    </div>
  );
}

/** The full report shown in the corner: every injury and what it does. */
export function InjuryReport({ name, condition, injuries, guard, staminaPct, knockdowns, damage, hp, maxHp, target }: {
  name: string; condition: string; injuries: BattleInjury[]; guard: number; staminaPct: number; knockdowns: number; damage?: BodyDamage; hp?: number; maxHp?: number; target?: string;
}) {
  const g = guardWord(guard), st = staminaWord(staminaPct);
  const d = damageLine(damage, hp, maxHp);
  return (
    <div className="injury-report">
      <BodyChart injuries={injuries} size={150} damage={damage} target={target} />
      <div className="ir-body">
        <div className="ir-name">{name}</div>
        <div className="ir-cond">{condition}{knockdowns ? ` · knocked down ${knockdowns === 1 ? 'once' : `${knockdowns} times`}` : ''}</div>
        {d && damage && <div className="ir-row"><span className="fs-k">Damage</span> <span className={`fs-v ${tone(d.total)}`}>{d.total}% overall</span></div>}
        {damage && <div className="ir-parts">{REGIONS.map((r) => <span key={r} className={`fs-v ${tone(damage[r])}`}>{REGION_NAME[r]} {damage[r]}%</span>)}</div>}
        <div className="ir-row"><span className="fs-k">Guard</span> <span className={`fs-v ${g.tone}`}>{g.label}</span></div>
        <div className="ir-row"><span className="fs-k">Stamina</span> <span className={`fs-v ${st.tone}`}>{st.label}</span></div>
        {injuries.length ? (
          <ul className="ir-list">
            {injuries.map((i) => (
              <li key={i.part}><span className={`inj sev${i.severity}`}>{i.severity === 2 ? 'SERIOUS' : 'MINOR'}</span> {INJURY_EFFECT[i.part][i.severity - 1]}</li>
            ))}
          </ul>
        ) : <div className="faint">No injuries yet.</div>}
      </div>
    </div>
  );
}
