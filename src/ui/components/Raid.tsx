// Raid Boss: pick a real anime villain, send the party's strongest fighters in, and
// see who carried the fight. The host starts raids; everyone in the room can watch
// them and see the results (engine/raid.ts).
import { useEffect, useMemo, useState } from 'react';
import type { GameState, PublicCharacter, RaidResult } from '../../engine/types';
import { ANILIST_VILLAINS, RAID_MAX_TEAM, RAID_TEAM_PER_PLAYER, legendVillains } from '../../engine/raid';
import { aniListProvider } from '../../engine/providers/anilist';
import { store, useApp } from '../../store/store';
import { CharArt } from './Portrait';

/** AniList villains, looked up once per session (they come with canon stats when we have a sheet). */
let extraVillains: Promise<PublicCharacter[]> | null = null;
function loadExtraVillains(): Promise<PublicCharacter[]> {
  // A few results per name, keeping only the one from the right anime (a plain name search
  // found Shun Kaidou for "Kaidou" and Bruno Bucciarati for "Cell").
  extraVillains ??= Promise.all(ANILIST_VILLAINS.map(([name, series]) => aniListProvider.search({ text: name, field: 'name', sort: 'popular', page: 1, perPage: 8 })
    .then((r) => r.items.find((c) => c.series.toLowerCase().includes(series) && c.name.toLowerCase().replace(/[^a-z]/g, '').includes(name.toLowerCase().split(' ')[0].replace(/[^a-z]/g, '').replace(/u$/, ''))))
    .catch(() => undefined)))
    .then((list) => list.filter((c): c is PublicCharacter => !!c));
  return extraVillains;
}

export function RaidHub({ g }: { g: GameState }) {
  const guest = store.isGuest();
  const [extra, setExtra] = useState<PublicCharacter[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => { void loadExtraVillains().then(setExtra); }, []);
  const bosses = useMemo(() => [...legendVillains(), ...extra.filter((c) => !c.id.startsWith('legend:'))], [extra]);
  const chosen = bosses.find((b) => b.id === pick);
  const raids = (g.raids ?? []).slice().reverse();
  const record = useApp((s) => s.battles);
  const wins = (g.raids ?? []).filter((r) => r.won).length;

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="panel col" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>Raid Boss</h3>
        <p className="muted" style={{ margin: 0 }}>Everyone's strongest fighters ({RAID_TEAM_PER_PLAYER} per player, up to {RAID_MAX_TEAM}) team up against a real anime villain. Bosses are scaled to your party and win more often than not. Raids never change the tournament: no injuries, fatigue or coins.</p>
        {(g.raids?.length ?? 0) > 0 && <div className="faint">Record: {wins} won, {(g.raids?.length ?? 0) - wins} lost</div>}
      </div>

      {guest ? <div className="panel faint">The host chooses the boss and starts the raid. You'll be able to watch it here.</div> : (
        <div className="panel col" style={{ gap: 10 }}>
          <strong>Choose your villain</strong>
          <div className="boss-grid">
            {bosses.map((b) => (
              <button key={b.id} className={`boss-card${pick === b.id ? ' picked' : ''}`} onClick={() => setPick(b.id)} aria-pressed={pick === b.id}>
                <span className="boss-art"><CharArt c={b} /></span>
                <b>{b.name}</b><span className="faint">{b.series}</span>
              </button>
            ))}
            {!extra.length && <span className="faint">Loading more villains from AniList…</span>}
          </div>
          <button className="btn primary lg" disabled={!chosen} onClick={() => chosen && store.startRaid(chosen)}>
            {chosen ? `⚔ Raid ${chosen.name}` : 'Pick a villain'}
          </button>
        </div>
      )}

      {raids.map((r) => <RaidCard key={r.id} r={r} g={g} canWatch={!!record[r.battleId]} />)}
    </div>
  );
}

/** One raid's result: won or lost, the MVP, and everyone's share of the work. */
export function RaidCard({ r, g, canWatch }: { r: RaidResult; g: GameState; canWatch?: boolean }) {
  const top = Math.max(1, ...r.contributions.map((c) => c.score));
  const owner = (pid: string) => g.players.find((p) => p.id === pid);
  const mvp = r.contributions.find((c) => c.charId === r.mvp);
  return (
    <div className={`panel col raid-card ${r.won ? 'won' : 'lost'}`} style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{r.won ? `${r.bossName} defeated!` : `${r.bossName} wins.`}</h3>
        {canWatch && <button className="btn sm" onClick={() => store.watch(r.battleId)}>Watch</button>}
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
