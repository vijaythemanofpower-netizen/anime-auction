// Injury report: a body chart that lights up where a fighter is hurt and how
// badly, plus guard and stamina in words. No health bars anywhere.
import type { BattleInjury, BodyPart } from '../../engine/types';

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

const SEV_FILL = ['rgba(255,255,255,0.13)', '#f59e0b', '#ef4444'];

/** A simple figure; each body part is coloured by its worst injury. */
export function BodyChart({ injuries, size = 54, down }: { injuries: BattleInjury[]; size?: number; down?: boolean }) {
  const sev = (p: BodyPart) => injuries.find((i) => i.part === p)?.severity ?? 0;
  const part = (p: BodyPart) => ({ fill: SEV_FILL[sev(p)], className: sev(p) === 2 ? 'bp crit' : sev(p) ? 'bp hurt' : 'bp' });
  const crack = (d: string, p: BodyPart) => sev(p) === 2 ? <path d={d} fill="none" stroke="#fff" strokeWidth="1.4" strokeLinejoin="bevel" /> : null;
  const label = injuries.length ? injuries.map((i) => i.label).join(', ') : 'No injuries';
  return (
    <svg className={`body-chart${down ? ' down' : ''}`} viewBox="0 0 60 100" width={size * 0.6} height={size} role="img" aria-label={label}>
      <title>{label}</title>
      <circle cx="30" cy="11" r="9" {...part('head')} />
      {crack('M26 6 l4 4 l-3 3 l5 4', 'head')}
      <rect x="19" y="22" width="22" height="33" rx="7" {...part('torso')} />
      {crack('M24 30 l6 5 l-4 4 l8 6', 'torso')}
      <rect x="8" y="23" width="9" height="31" rx="4.5" transform="rotate(8 12 23)" {...part('arm')} />
      {crack('M10 30 l4 5 l-3 4 l4 5', 'arm')}
      <rect x="43" y="23" width="9" height="31" rx="4.5" transform="rotate(-8 48 23)" fill={SEV_FILL[0]} />
      <rect x="20" y="56" width="9" height="40" rx="4.5" {...part('leg')} />
      {crack('M22 64 l4 6 l-3 4 l4 7', 'leg')}
      <rect x="31" y="56" width="9" height="40" rx="4.5" fill={SEV_FILL[0]} />
    </svg>
  );
}

/** Compact status under a fighter card in the arena. */
export function FighterStatus({ injuries, guard, staminaPct, down }: { injuries: BattleInjury[]; guard: number; staminaPct: number; down?: boolean }) {
  const g = guardWord(guard), st = staminaWord(staminaPct);
  return (
    <div className="fstatus">
      <BodyChart injuries={injuries} size={50} down={down} />
      <div className="fs-words">
        <div><span className="fs-k">Guard</span> <span className={`fs-v ${g.tone}`}>{g.label}</span></div>
        <div><span className="fs-k">Stamina</span> <span className={`fs-v ${st.tone}`}>{st.label}</span></div>
        <div className="fs-inj">{injuries.length ? injuries.map((i) => <span key={i.part} className={`inj sev${i.severity}`}>{i.label}</span>) : <span className="faint">Unhurt</span>}</div>
      </div>
    </div>
  );
}

/** The full report shown in the corner: every injury and what it does. */
export function InjuryReport({ name, condition, injuries, guard, staminaPct, knockdowns }: {
  name: string; condition: string; injuries: BattleInjury[]; guard: number; staminaPct: number; knockdowns: number;
}) {
  const g = guardWord(guard), st = staminaWord(staminaPct);
  return (
    <div className="injury-report">
      <BodyChart injuries={injuries} size={130} />
      <div className="ir-body">
        <div className="ir-name">{name}</div>
        <div className="ir-cond">{condition}{knockdowns ? ` · knocked down ${knockdowns === 1 ? 'once' : `${knockdowns} times`}` : ''}</div>
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
