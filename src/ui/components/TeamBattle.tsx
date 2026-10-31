// Team battles between players (engine/teambattle.ts): the host splits everyone into
// Team A and Team B, each player picks their own fighters on their own device, then
// the host starts the fight. Results show the winning team and an MVP from both sides.
import type { GameState, TeamBattleResult } from '../../engine/types';
import { setTeam, teamFighterCount, teamMembers, teamName, teamSlots, teamsOf } from '../../engine/teambattle';
import { store, useApp } from '../../store/store';
import { CharArt } from './Portrait';
import { RaidCard } from './Raid';

export function TeamBattleHub({ g }: { g: GameState }) {
  const guest = store.isGuest();
  const teams = teamsOf(g);
  const a = teamMembers(g, 'A'), b = teamMembers(g, 'B');
  const battles = useApp((s) => s.battles);
  const history = (g.teamBattles ?? []).slice().reverse();
  const mine = g.players.filter((p) => p.kind === 'human' && store.isLocalPlayer(p));
  const waiting = g.players.filter((p) => p.kind === 'human' && !(g.teamSetup?.picks?.[p.id]?.length));
  const ready = a.length > 0 && b.length > 0;
  const n = teamFighterCount(g);

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="panel col" style={{ gap: 6 }}>
        <h3 style={{ margin: 0 }}>Team Battle</h3>
        <p className="muted" style={{ margin: 0 }}>Players team up: {n}v{n}. Each player sends their own fighter{n > a.length || n > b.length ? 's (a smaller team sends more each)' : ''}. Healers mend and revive teammates. Team battles never change the tournament.</p>
      </div>

      <div className="grid grid-2" style={{ gap: 12 }}>
        {(['A', 'B'] as const).map((t) => (
          <div key={t} className={`panel col team-panel team-${t}`} style={{ gap: 8 }}>
            <strong>Team {t}: {teamName(g, t)}</strong>
            {g.players.filter((p) => teams[p.id] === t).map((p) => {
              const picks = g.teamSetup?.picks?.[p.id] ?? [];
              return (
                <div key={p.id} className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span className="player-chip" style={{ borderColor: p.color }}>{p.name}: {picks.length ? picks.map((id) => g.characters[id]?.name ?? id).join(', ') : p.kind === 'npc' ? 'sends its best' : 'choosing…'}</span>
                  {!guest && <button className="btn sm ghost" onClick={() => store.act((d) => setTeam(d, p.id, t === 'A' ? 'B' : 'A'))}>Move to {t === 'A' ? 'B' : 'A'}</button>}
                </div>
              );
            })}
            {!g.players.some((p) => teams[p.id] === t) && <span className="faint">No one yet{guest ? '' : ': move a player here'}.</span>}
          </div>
        ))}
      </div>

      {mine.map((p) => {
        const picked = g.teamSetup?.picks?.[p.id] ?? [];
        const slots = teamSlots(g, p.id);
        const toggle = (id: string) => store.move(p.id, { t: 'teamPick', ids: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-slots) });
        return (
          <div key={p.id} className="panel col" style={{ gap: 6 }}>
            <span className="faint">{mine.length > 1 ? `${p.name}` : 'You'} (Team {teams[p.id]}): send {slots} fighter{slots > 1 ? 's' : ''} ({picked.length}/{slots})</span>
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

      {guest ? <div className="panel faint">The host starts the team battle once everyone has picked. You'll be able to watch it here.</div> : (
        <div className="panel col" style={{ gap: 8 }}>
          {!ready && <div className="faint">Both teams need at least one player.</div>}
          {ready && waiting.length > 0 && <div className="faint">Still choosing: {waiting.map((p) => p.name).join(', ')}. Anyone who hasn't picked sends their best.</div>}
          <button className="btn primary lg" disabled={!ready} onClick={() => store.startTeamBattle()}>🤝 Start the team battle{ready && waiting.length ? ' anyway' : ''}</button>
        </div>
      )}

      {history.map((r, i) => <TeamResult key={r.id} r={r} g={g} canWatch={!!battles[r.battleId]} latest={i === 0} />)}
    </div>
  );
}

function TeamResult({ r, g, canWatch, latest }: { r: TeamBattleResult; g: GameState; canWatch: boolean; latest: boolean }) {
  const names = (ids: string[]) => ids.map((id) => g.players.find((p) => p.id === id)?.name ?? id).join(' & ');
  const winners = r.winner === 'A' ? r.teamA : r.teamB;
  // Reuses the raid result card: win frame, MVP and everyone's share.
  return <RaidCard g={g} canWatch={canWatch} r={{ id: r.id, battleId: r.battleId, bossId: '', bossName: names(r.winner === 'A' ? r.teamB : r.teamA), won: true, mvp: r.mvp, contributions: r.contributions, at: r.at, title: `Team ${r.winner} wins: ${names(winners)}` }} again={latest ? { label: 'Rematch', run: () => store.startTeamBattle() } : undefined} />;
}
