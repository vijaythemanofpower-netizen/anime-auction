import { useState } from 'react';
import type { GameState, Player } from '../../engine/types';
import { analyzeTeam } from '../../engine/analysis';
import { progressedStats } from '../../engine/progression';
import { truePower } from '../../engine/hidden';
import { store } from '../../store/store';
import { CharArt } from './Portrait';
import { AbilityLine, Coins, HiddenDetails, Modal, PowerRing, PublicProfile, StatBars, TagChip } from './common';
import { ARCHETYPES } from '../../engine/data/archetypes';
import { getAbility } from '../../engine/data/abilities';

export function ConditionBadges({ g, id }: { g: GameState; id: string }) {
  const c = g.conditions[id];
  if (!c) return null;
  return (
    <div className="row" style={{ gap: 4 }}>
      {c.fatigue > 0 && <span className="tag" style={{ color: c.fatigue > 50 ? 'var(--bad)' : 'var(--warn)' }} title={`Fatigue reduces combat stats by up to ${Math.round(c.fatigue / 4)}%`}>FATIGUE {c.fatigue}</span>}
      {c.injuries.map((i) => <span key={i.id} className="tag" style={{ color: 'var(--bad)' }} title={`-${Math.round(i.penalty * 100)}% ${i.stat} for ${i.matchesRemaining} more match(es)`}>✚ {i.name}</span>)}
      {c.evolved && <span className="tag" style={{ color: 'var(--gold)' }}>EVOLVED</span>}
      {(c.wins || c.losses) ? <span className="tag">{c.wins}W–{c.losses}L</span> : null}
      {c.xp > 0 && <span className="tag">XP {c.xp}</span>}
    </div>
  );
}

/** A player's roster. Hidden information shows only when the viewer is allowed to see it. */
export function RosterView({ g, player, viewer }: { g: GameState; player: Player; viewer: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const own = viewer === player.id;
  const members = player.roster.map((id) => ({ id, pc: g.characters[id], h: store.hiddenFor(id, viewer), c: g.conditions[id] }));
  const known = members.filter((m) => m.h && m.c) as Array<{ id: string; pc: (typeof members)[number]['pc']; h: NonNullable<(typeof members)[number]['h']>; c: NonNullable<(typeof members)[number]['c']> }>;
  const discovered = [...new Set(player.roster.flatMap((id) => g.conditions[id]?.discoveredSynergies ?? []))];
  const analysis = own && known.length === members.length && members.length ? analyzeTeam(known, discovered) : null;
  const sel = open ? members.find((m) => m.id === open) : null;

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {members.map((m) => {
          const stats = m.h && m.c ? progressedStats(m.h, m.c) : null;
          return (
            <div key={m.id} className="panel tight col" style={{ gap: 8, cursor: 'pointer' }} onClick={() => setOpen(m.id)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') setOpen(m.id); }} aria-label={`Details for ${m.pc.name}`}>
              <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden' }}><CharArt c={m.pc} /></div>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.c?.evolved && m.h ? m.h.evolution.formName : m.pc.name}</strong>
                  <div className="faint">{m.pc.archetype} · {ARCHETYPES[m.pc.archetype].role}</div>
                  <div className="faint">Bought for <Coins n={g.prices[m.id] ?? 0} /></div>
                </div>
              </div>
              {stats ? (
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="faint">ATK {stats.attack} · DEF {stats.defense} · SPD {stats.speed}</span>
                  <span className="tag" style={{ color: 'var(--cyan)' }}>PWR {truePower(stats)}</span>
                </div>
              ) : <div className="faint">Stats hidden{own ? '' : ' — scout during preparation to learn more'}.</div>}
              <div className="row" style={{ gap: 4 }}>{m.pc.tags.map((t) => <TagChip key={t} t={t} />)}</div>
              <ConditionBadges g={g} id={m.id} />
            </div>
          );
        })}
      </div>

      {analysis && (
        <div className="panel">
          <h3>Team analysis</h3>
          <div className="grid grid-3" style={{ gap: 10, marginBottom: 10 }}>
            {([['Offense', analysis.offense], ['Defense', analysis.defense], ['Speed', analysis.speed], ['Stamina', analysis.stamina], ['Flexibility', analysis.flexibility]] as const).map(([l, v]) => (
              <div key={l} className="stat-row" style={{ gridTemplateColumns: '84px 1fr 34px' }}><span className="muted">{l}</span><div className="stat-bar"><span style={{ width: `${v}%` }} /></div><span className="stat-val">{v}</span></div>
            ))}
          </div>
          <div className="faint" style={{ marginBottom: 6 }}>Roles: {Object.entries(analysis.roles).map(([r, n]) => `${n} ${r}`).join(' · ')} · Effective values include fatigue and injuries.</div>
          {analysis.synergies.map((s) => <div key={s.id} style={{ fontSize: 14 }}>✦ <strong>{s.name}</strong> <span className="faint">{s.description}{s.hidden ? ' (discovered)' : ''}</span></div>)}
          {analysis.strengths.map((s) => <div key={s} style={{ fontSize: 14, color: 'var(--good)' }}>▲ {s}</div>)}
          {analysis.weaknesses.map((s) => <div key={s} style={{ fontSize: 14, color: 'var(--warn)' }}>▼ {s}</div>)}
          <div className="faint" style={{ marginTop: 6 }}>Synergies apply only to the fighters taking part in a battle.</div>
        </div>
      )}

      {sel && (
        <Modal title={sel.c?.evolved && sel.h ? `${sel.h.evolution.formName} (${sel.pc.name})` : sel.pc.name} onClose={() => setOpen(null)} wide>
          <div className="reveal-card">
            <div className="col">
              <div className="lot-art"><CharArt c={sel.pc} /></div>
              <ConditionBadges g={g} id={sel.id} />
            </div>
            <div className="col">
              {sel.h && sel.c ? (
                <>
                  <div className="row"><PowerRing stats={progressedStats(sel.h, sel.c)} /><div className="faint">Base stats in violet; training and evolution bonuses in gold. Fatigue and injuries are applied in battle on top of these.</div></div>
                  <StatBars stats={progressedStats(sel.h, sel.c)} base={sel.h.stats} />
                  <HiddenDetails h={sel.h} />
                  {sel.c.unlockedAbilities.length > 0 && <div><div className="label">Unlocked by evolution</div>{sel.c.unlockedAbilities.map((a) => <AbilityLine key={a} id={a} />)}</div>}
                </>
              ) : <p className="muted">True stats are hidden from you.</p>}
              <div className="divider" />
              <PublicProfile c={sel.pc} />
              {sel.h && <div className="faint">All abilities in battle: {[...sel.pc.knownAbilities, sel.h.hiddenAbility, ...(sel.c?.unlockedAbilities ?? [])].map((a) => getAbility(a).name).join(', ')}.</div>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
