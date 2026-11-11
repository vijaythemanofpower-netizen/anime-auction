// Player portraits: original drawn cards (no real photos are shipped). The
// owner can set a photo from their own computer; it stays in this browser.
import type { Cricketer, Form } from '../../engine/types';
import { FORM_LABEL } from '../../engine/types';
import { bowlTypeLabel } from '../../engine/match';
import { fmtL } from '../../engine/squad';
import { displayName } from '../../store/store';
import { pickPhoto, usePhoto } from '../../store/photos';
import { PHOTOS } from '../../engine/data/photos';
import { hashString } from '../../engine/rng';

/** Two-tone colours per country, used only for the drawn portrait cards. */
const COUNTRY: Record<string, [string, string]> = {
  IND: ['#1d4ed8', '#f97316'], AUS: ['#ca8a04', '#166534'], ENG: ['#1e3a8a', '#dc2626'], SA: ['#15803d', '#facc15'],
  NZ: ['#111827', '#9ca3af'], WI: ['#7f1d1d', '#facc15'], AFG: ['#1e40af', '#b91c1c'], SL: ['#1e3a8a', '#eab308'],
  BAN: ['#166534', '#dc2626'], ZIM: ['#b91c1c', '#16a34a'],
};
export const COUNTRY_NAME: Record<string, string> = { IND: 'India', AUS: 'Australia', ENG: 'England', SA: 'South Africa', NZ: 'New Zealand', WI: 'West Indies', AFG: 'Afghanistan', SL: 'Sri Lanka', BAN: 'Bangladesh', ZIM: 'Zimbabwe' };
export const ROLE_NAME: Record<string, string> = { opener: 'Opener', middle: 'Middle order', finisher: 'Finisher', keeper: 'Wicketkeeper', allrounder: 'All-rounder', pace: 'Pace bowler', spin: 'Spin bowler' };

function initials(name: string) {
  const parts = name.replace(/\./g, ' ').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

/** A small original illustration: a figure in the pose of the role, in country colours. */
function Art({ c }: { c: Cricketer }) {
  const [a, b] = COUNTRY[c.country] ?? ['#334155', '#64748b'];
  const h = hashString(c.id);
  const tilt = (h % 14) - 7;
  const bowler = c.role === 'pace' || c.role === 'spin';
  return (
    <svg className="art" viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`g${h}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#g${h})`} />
      <path d={`M0 ${70 + (h % 9)} L100 ${55 + (h % 11)} L100 100 L0 100 Z`} fill="rgba(0,0,0,0.22)" />
      <g transform={`translate(52 58) rotate(${tilt})`} fill="rgba(0,0,0,0.38)">
        <circle cx="0" cy="-30" r="9" />
        <path d="M-11 -19 Q0 -23 11 -19 L14 12 L-14 12 Z" />
        {bowler
          ? <path d="M9 -16 L26 -40 L31 -37 L15 -12 Z" />
          : c.role === 'keeper'
            ? <><circle cx="-18" cy="-6" r="6" /><circle cx="18" cy="-6" r="6" /></>
            : <path d="M10 -12 L34 -44 L38 -41 L15 -8 Z" />}
        <path d="M-12 12 L-16 40 L-8 40 L-2 16 L2 16 L8 40 L16 40 L12 12 Z" />
      </g>
    </svg>
  );
}

export function Portrait({ c, size = 'md', editable = false }: { c: Cricketer; size?: 'sm' | 'md' | 'lg'; editable?: boolean }) {
  // Your own photo first, then a freely licensed real photo (credited on hover and in Photo credits).
  const mine = usePhoto(c.id);
  const free = PHOTOS[c.id];
  const photo = mine ?? free?.src;
  const fs = size === 'lg' ? 44 : size === 'sm' ? 13 : 20;
  return (
    <div className={`portrait ${size === 'md' ? '' : size}`} title={!mine && free ? `Photo: ${free.author}, ${free.license} (Wikimedia Commons)` : undefined}>
      <Art c={c} />
      {photo ? <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="initials" style={{ fontSize: fs }}>{initials(c.name)}</span>}
      {editable && <button type="button" className="photo-btn" onClick={() => pickPhoto(c.id)} aria-label={`Set photo for ${displayName(c)}`}>Set photo</button>}
    </div>
  );
}

export function Chips({ c, form, price }: { c: Cricketer; form?: Form; price?: number }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <span className="chip">{ROLE_NAME[c.role]}</span>
      {c.overseas && <span className="chip os">Overseas</span>}
      {c.uncapped && <span className="chip unc">Uncapped</span>}
      {form !== undefined && <span className={`chip form-${form}`}>{FORM_LABEL[form]}</span>}
      {price !== undefined && <span className="chip gold">{fmtL(price)}</span>}
    </div>
  );
}

export function PlayerLine({ c, form, price, right, size = 'sm' }: { c: Cricketer; form?: Form; price?: number; right?: React.ReactNode; size?: 'sm' | 'md' }) {
  return (
    <div className="pc">
      <Portrait c={c} size={size} />
      <div className="row between" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
        <div className="grow">
          <div className="pc-name">{displayName(c)}</div>
          <div className="pc-meta">
            {ROLE_NAME[c.role]} · {c.country}{c.overseas ? ' (OS)' : ''}{c.uncapped ? ' · uncapped' : ''}
            {form !== undefined && form !== 0 ? <span className={form > 0 ? 'good' : 'bad'}> · {FORM_LABEL[form]}</span> : null}
            {price !== undefined ? <span className="gold"> · {fmtL(price)}</span> : null}
          </div>
        </div>
        {right}
      </div>
    </div>
  );
}

export function skillRows(c: Cricketer): Array<[string, number]> {
  const rows: Array<[string, number]> = [];
  const bowler = c.role === 'pace' || c.role === 'spin';
  if (!bowler || c.bat.vsPace > 45) {
    rows.push(['vs pace', c.bat.vsPace], ['vs spin', c.bat.vsSpin], ['Strike rate', c.bat.tempo], ['Power', c.bat.power]);
  }
  if (c.bowling) rows.push([`Bowling (${bowlTypeLabel(c)})`, (c.bowling.attack + c.bowling.control) / 2], ['Death overs', c.bowling.death], ['Powerplay', c.bowling.powerplay]);
  if (c.keeping) rows.push(['Keeping', c.keeping]);
  rows.push(['Fielding', c.fielding], ['Clutch', c.clutch]);
  return rows.slice(0, 7);
}
