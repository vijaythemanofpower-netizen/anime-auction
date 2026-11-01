// Raid Boss: pick a real anime villain, send the party's strongest fighters in, and
// see who carried the fight. The host starts raids; everyone in the room can watch
// them and see the results (engine/raid.ts).
import { useMemo, useState } from 'react';
import type { GameState, RaidResult } from '../../engine/types';
import { RAID_MAX_BOSSES, RAID_MAX_TEAM, legendVillains, raidSlots } from '../../engine/raid';
import { VILLAINS } from '../../engine/data/villains';
import { store, useApp } from '../../store/store';
import { CharArt } from './Portrait';


export function RaidHub({ g }: { g: GameState }) {
  const guest = store.isGuest();
  const [picks, setPicks] = useState<string[]>([]);
  const bosses = useMemo(() => [...legendVillains(), ...VILLAINS], []);
  const chosen = picks.map((id) => bosses.find((b) => b.id === id)).filter((b): b is (typeof bosses)[number] => !!b);
  const toggleBoss = (id: string) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-RAID_MAX_BOSSES)));
  const names = chosen.map((b) => b.name).join(' & ');
  const raids = (g.raids ?? []).slice().reverse();
  const record = useApp((s) => s.battles);
  const wins = (g.raids ?? []).filter((r) => r.won).length;
  const waiting = g.players.filter((p) => p.kind === 'human' && !(g.raidPicks?.[p.id]?.length));

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="panel col" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>Raid Boss</h3>
        <p className="muted" style={{ margin: 0 }}>Every player sends up to {raidSlots(g)} of their own fighters (a party of up to {RAID_MAX_TEAM}) against a real anime villain. Healers mend the team and can bring a fallen teammate back once. Bosses are scaled to your party and win more often than not. Raids never change the tournament: no injuries, fatigue or coins.</p>
        {(g.raids?.length ?? 0) > 0 && <div className="faint">Record: {wins} won, {(g.raids?.length ?? 0) - wins} lost</div>}
      </div>

      <TeamPicker g={g} />

      {guest ? <div className="panel faint">The host chooses the boss and starts the raid once everyone has picked. You'll be able to watch it here.</div> : (
        <div className="panel col" style={{ gap: 10 }}>
          <strong>Choose 1 to {RAID_MAX_BOSSES} villains <span className="faint" style={{ fontWeight: 500 }}>({chosen.length} picked · more bosses, harder raid)</span></strong>
          <div className="boss-grid">
            {bosses.map((b) => (
              <button key={b.id} className={`boss-card${picks.includes(b.id) ? ' picked' : ''}`} onClick={() => toggleBoss(b.id)} aria-pressed={picks.includes(b.id)}>
                <span className="boss-art"><CharArt c={b} /></span>
                <b>{b.name}</b><span className="faint">{b.series}</span>
              </button>
            ))}
          </div>
          {waiting.length > 0 && <div className="faint">Still choosing: {waiting.map((p) => p.name).join(', ')}. Anyone who hasn't picked sends their strongest fighters.</div>}
          {/* Stays in view while scrolling the villain list. */}
          <button className="btn primary lg" style={{ position: 'sticky', bottom: 8, zIndex: 2 }} disabled={!chosen.length} onClick={() => chosen.length && store.startRaid(chosen)}>
            {chosen.length ? `⚔ Raid ${names}${waiting.length ? ' anyway' : ''}` : 'Pick a villain'}
          </button>
        </div>
      )}

      {raids.map((r, i) => {
        const team = (r.bossIds ?? [r.bossId]).map((id) => bosses.find((b) => b.id === id) ?? g.characters[id]).filter(Boolean);
        return <RaidCard key={r.id} r={r} g={g} canWatch={!!record[r.battleId]} again={i === 0 && team.length ? { label: r.won ? `Raid ${r.bossName} again` : `Try ${r.bossName} again`, run: () => store.startRaid(team) } : undefined} />;
      })}
    </div>
  );
}

/** Each player picks which of their own fighters go into the raid; everyone sees who's ready. */
function TeamPicker({ g }: { g: GameState }) {
  const slots = raidSlots(g);
  const mine = g.players.filter((p) => p.kind === 'human' && store.isLocalPlayer(p));
  return (
    <div className="panel col" style={{ gap: 12 }}>
      <strong>Raid party</strong>
      {mine.map((p) => {
        const picked = g.raidPicks?.[p.id] ?? [];
        const toggle = (id: string) => {
          const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-slots);
          store.move(p.id, { t: 'raidPick', ids: next });
        };
        return (
          <div key={p.id} className="col" style={{ gap: 6 }}>
            <span className="faint">{mine.length > 1 ? `${p.name}: ` : 'You: '}choose up to {slots} ({picked.length}/{slots})</span>
            <div className="raid-pick">
              {p.roster.map((id) => {
                const c = g.characters[id];
                const on = picked.includes(id);
                return (
                  <button key={id} className={`raid-pick-card${on ? ' on' : ''}`} onClick={() => toggle(id)} aria-pressed={on}>
                    <span className="boss-art">{c && <CharArt c={c} />}</span>
                    <b>{c?.name ?? id}</b>{c?.archetype === 'Support' && <span className="tag">HEALER</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="raid-ready">
        {g.players.map((p) => {
          const n = g.raidPicks?.[p.id]?.length ?? 0;
          return <span key={p.id} className={`player-chip${n ? ' ready' : ''}`} style={{ borderColor: p.color }}>{p.name}: {n ? `${n} picked ✓` : p.kind === 'npc' ? 'sends its best' : 'choosing…'}</span>;
        })}
      </div>
    </div>
  );
}

/** One raid's result: won or lost, the MVP, and everyone's share of the work. */
export function RaidCard({ r, g, canWatch, again }: { r: RaidResult & { title?: string }; g: GameState; canWatch?: boolean; again?: { label: string; run: () => void } }) {
  const top = Math.max(1, ...r.contributions.map((c) => c.score));
  const owner = (pid: string) => g.players.find((p) => p.id === pid);
  const mvp = r.contributions.find((c) => c.charId === r.mvp);
  return (
    <div className={`panel col raid-card ${r.won ? 'won' : 'lost'}`} style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{r.title ?? (r.won ? `${r.bossName} defeated!` : `${r.bossName} wins.`)}</h3>
        <span className="row" style={{ gap: 6 }}>
          {again && !store.isGuest() && <button className="btn sm primary" onClick={again.run}>{again.label}</button>}
          {canWatch && <button className="btn sm" onClick={() => store.watch(r.battleId)}>Watch</button>}
        </span>
      </div>
      {mvp && (
        <div className="raid-mvp">
          <span className="mvp-art">{g.characters[mvp.charId] && <CharArt c={g.characters[mvp.charId]} />}</span>
          <div><div className="eyebrow">👑 MVP{r.won ? '' : ' (in defeat)'}</div><b>{mvp.name}</b><div className="faint">{owner(mvp.playerId)?.name ?? ''} · {mvp.role || 'Carried the party'}</div></div>
        </div>
      )}
      <div className="col" style={{ gap: 6 }}>
        {r.contributions.map((c) => (
          <div key={c.charId} className="raid-row" title={`${c.dealt} damage dealt · ${c.tanked} absorbed · ${c.healed} healed${c.finalBlow ? ' · final blow' : ''}`}>
            <span className="raid-name"><b>{c.name}</b> <span className="faint">{owner(c.playerId)?.name ?? ''}</span></span>
            <span className="raid-bar"><span style={{ width: `${(c.score / top) * 100}%` }} /></span>
            <span className="raid-role">{c.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
