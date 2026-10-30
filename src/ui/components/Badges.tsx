// Roast badges next to a player's name (engine/badges.ts). Tap or hover for why.
import { useMemo } from 'react';
import type { GameState } from '../../engine/types';
import { playerBadges, type Badge } from '../../engine/badges';

export function useBadges(g: GameState): Record<string, Badge[]> {
  return useMemo(() => playerBadges(g), [g]);
}

export function BadgeChips({ badges }: { badges: Badge[] | undefined }) {
  if (!badges?.length) return null;
  return (
    <span className="badge-chips">
      {badges.map((b) => <span key={b.id} className="roast-badge" title={b.why} tabIndex={0} aria-label={`${b.name}: ${b.why}`}>{b.icon} {b.name}</span>)}
    </span>
  );
}

/** End of the game: everyone's badges, with the reasons spelled out. */
export function HallOfShame({ g }: { g: GameState }) {
  const all = useBadges(g);
  const rows = g.players.filter((p) => all[p.id]?.length);
  if (!rows.length) return null;
  return (
    <div className="panel col" style={{ gap: 10 }}>
      <h3 style={{ margin: 0 }}>Hall of Shame</h3>
      {rows.map((p) => (
        <div key={p.id} className="col" style={{ gap: 4 }}>
          <strong style={{ color: p.color }}>{p.name}</strong>
          {all[p.id].map((b) => <div key={b.id} className="faint">{b.icon} <b style={{ color: 'var(--text)' }}>{b.name}</b>: {b.why}</div>)}
        </div>
      ))}
    </div>
  );
}
