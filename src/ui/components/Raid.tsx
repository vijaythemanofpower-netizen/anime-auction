// Raid Boss: pick a real anime villain, send the party's strongest fighters in, and
// see who carried the fight. The host starts raids; everyone in the room can watch
// them and see the results (engine/raid.ts).
import { useMemo } from 'react';
import type { GameState, RaidResult } from '../../engine/types';
import { RAID_LEVELS, RAID_MAX_TEAM, bossCount, foughtBosses, legendVillains, levelBosses, nextRaidLevel, raidSlots } from '../../engine/raid';
import { VILLAINS } from '../../engine/data/villains';
import { store, useApp } from '../../store/store';
import { CharArt } from './Portrait';


export function RaidHub({ g }: { g: GameState }) {
  const guest = store.isGuest();
  const bosses = useMemo(() => [...legendVillains(), ...VILLAINS], []);
  const level = nextRaidLevel(g);
  // The current run: from the latest Level 1 raid onwards.
  const leveled = (g.raids ?? []).filter((r) => r.level);
  const runStart = leveled.map((r) => r.level).lastIndexOf(1);
  const run = runStart >= 0 ? leveled.slice(runStart) : [];
  const lastRun = run[run.length - 1];
  const party = Math.min(RAID_MAX_TEAM, raidSlots(g) * g.players.length);
  const fight = (lv: number) => store.startRaid(levelBosses(bosses, g.secret, lv, Date.now(), foughtBosses(g), party), lv);
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

      <div className="panel col raid-climb" style={{ gap: 12 }}>
        <strong>Boss climb: five levels</strong>
        <ol className="climb-steps">
          {Array.from({ length: RAID_LEVELS }, (_, i) => i + 1).map((n) => {
            const r = run.find((x) => x.level === n);
            const state = r ? (r.won ? 'cleared' : 'failed') : n === level ? 'next' : 'locked';
            return (
              <li key={n} className={`climb-step ${state}`} aria-label={`Level ${n}: ${state === 'next' ? 'up next' : state}`}>
                <b>{n}</b>
                <small>{r ? (r.won ? '✓ ' : '✗ ') + r.bossName : bossCount(n, party) === 2 ? 'Two bosses' : state === 'next' ? 'Up next' : 'Locked'}</small>
              </li>
            );
          })}
        </ol>
        <p className="muted" style={{ margin: 0 }}>
          {level === null
            ? (lastRun?.won ? 'Your party cleared all five levels!' : `The run ended at Level ${lastRun?.level ?? 1}. Start a new run to climb again.`)
            : `Level ${level}: ${bossCount(level, party) === 2 ? (level === RAID_LEVELS ? 'two random villains from the very top' : 'two random villains (your party is big)') : level === 1 ? 'a random villain from the weakest fifth' : 'a random villain'}. Who you face stays secret until the fight starts. Win to unlock the next level; lose and the run ends.`}
        </p>
        {guest ? <div className="faint">The host starts each level. You'll watch it here.</div> : (
          <>
            {waiting.length > 0 && <div className="faint">Still choosing: {waiting.map((p) => p.name).join(', ')}. Anyone who hasn't picked sends their strongest fighters.</div>}
            <button className="btn primary lg" onClick={() => fight(level ?? 1)}>{level === null ? '⚔ New run from Level 1' : `⚔ Fight Level ${level}${waiting.length ? ' anyway' : ''}`}</button>
          </>
        )}
      </div>

      {raids.map((r) => <RaidCard key={r.id} r={{ ...r, title: r.level ? `Level ${r.level}: ${r.won ? `${r.bossName} defeated!` : `${r.bossName} wins.`}` : undefined }} g={g} canWatch={!!record[r.battleId]} />)}
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
