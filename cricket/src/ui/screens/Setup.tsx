import { useState } from 'react';
import { store, useApp } from '../../store/store';
import { Seg } from '../components/common';
import type { TeamMode, Human } from '../../engine/game';
import { HANDICAP } from '../../engine/game';
import type { SquadMode } from '../../engine/squad';
import { PURSE, RULES, fmtL } from '../../engine/squad';

const COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#c084fc', '#facc15'];

export function Setup() {
  const settings = useApp((s) => s.settings);
  const [names, setNames] = useState<string[]>(['Player 1']);
  const [teamMode, setTeamMode] = useState<TeamMode>('teams');
  const [teams, setTeams] = useState<number[]>([0]);
  const [mode, setMode] = useState<SquadMode>('ipl');
  const [npcs, setNpcs] = useState(1);
  const [timer, setTimer] = useState(12);
  const [mystery, setMystery] = useState(true);
  const partnerSize = 2;
  const [overs, setOvers] = useState<5 | 10 | 20>(5);
  const [play, setPlay] = useState(true);
  const [online, setOnline] = useState(false);

  const n = names.length;
  const team = (i: number) => teams[i] ?? i;
  const teamCount = new Set(names.map((_, i) => team(i))).size;
  const PRESETS: Record<number, Array<[string, number[]]>> = {
    2: [['1 v 1', [0, 1]], ['Together v computer', [0, 0]]],
    3: [['1 v 1 v 1', [0, 1, 2]], ['1 v 2', [0, 1, 1]], ['2 v 1', [0, 0, 1]]],
    4: [['1 v 1 v 1 v 1', [0, 1, 2, 3]], ['2 v 2', [0, 0, 1, 1]], ['1 v 3', [0, 1, 1, 1]], ['3 v 1', [0, 0, 0, 1]]],
    5: [['Everyone alone', [0, 1, 2, 3, 4]], ['2 v 3', [0, 0, 1, 1, 1]]],
    6: [['3 v 3', [0, 0, 0, 1, 1, 1]], ['2 v 2 v 2', [0, 0, 1, 1, 2, 2]]],
  };
  const modes: Array<{ value: TeamMode; label: string; ok: boolean; why: string }> = [
    { value: 'teams', label: 'Teams', ok: true, why: 'Put players on the same team or on their own. Every team gets the same purse, however many players it has; teammates share it and split the roles (one bats, one bowls).' },
    { value: 'boss', label: '1 v 4: the Boss', ok: n >= 2 && n <= 4, why: `All of you share one franchise against a single Boss NPC with a ${HANDICAP.boss.purse}x war chest and +${HANDICAP.boss.scouts} scouts. Made for 4 friends (works with 2-4).` },
  ];
  const current = modes.find((m) => m.value === teamMode)!;
  const valid = current.ok && names.every((x) => x.trim());

  const start = () => {
    const humans: Human[] = names.map((name, i) => ({ id: `h${i}`, name: name.trim(), color: COLORS[i % COLORS.length] }));
    store.newGame({ humans, teamMode, partnerSize, teams: names.map((_, i) => team(i)), npcs: teamMode === 'teams' ? npcs : 0, mode, timer, mystery, realNames: settings.realNames, overs, play });
    if (online) void store.hostRoom();
  };

  return (
    <div className="col" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div>
        <span className="label">New game</span>
        <h1>Set up the auction</h1>
      </div>

      <section className="panel col">
        <div className="panel-head"><h3>Who's playing</h3><span className="faint">{n} of 6</span></div>
        {names.map((name, i) => (
          <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[i % COLORS.length], flex: 'none' }} />
            <input type="text" className="grow" aria-label={`Player ${i + 1} name`} value={name} maxLength={20} onChange={(e) => setNames(names.map((x, k) => (k === i ? e.target.value : x)))} />
            {teamMode === 'teams' && n > 1 && <Seg label={`Team for ${name || `player ${i + 1}`}`} value={team(i)} onChange={(t) => setTeams(names.map((_, k) => (k === i ? t : team(k))))} options={names.slice(0, 4).map((_, t) => ({ value: t, label: 'ABCD'[t] }))} />}
            {n > 1 && <button className="btn ghost sm" onClick={() => setNames(names.filter((_, k) => k !== i))} aria-label={`Remove ${name || 'player'}`}>Remove</button>}
          </div>
        ))}
        {n < 6 && <div><button className="btn sm" onClick={() => setNames([...names, `Player ${n + 1}`])}>Add player</button></div>}
        <label className="check"><input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} /><span>Online room<br /><small className="faint">You get a 5-letter code. Friends open the game on their own phone or PC, enter the code and pick their name. You are {names[0] || 'Player 1'}.</small></span></label>
      </section>

      <section className="panel col">
        <h3>Teams</h3>
        <div className="options">
          {modes.map((m) => (
            <button key={m.value} type="button" className="option" aria-pressed={teamMode === m.value} disabled={!m.ok} style={{ opacity: m.ok ? 1 : 0.45 }} onClick={() => setTeamMode(m.value)}>
              {m.label}
              <small>{m.why}</small>
            </button>
          ))}
        </div>
        {teamMode === 'teams' && PRESETS[n] && (
          <div className="row"><span className="dim">Quick split</span>{PRESETS[n].map(([label, t]) => <button key={label} type="button" className="btn sm" aria-pressed={t.every((x, i) => x === team(i))} onClick={() => setTeams(t)}>{label}</button>)}</div>
        )}
        {teamMode === 'teams' && <p className="faint" style={{ margin: 0, fontSize: 13 }}>{teamCount} human team{teamCount === 1 ? '' : 's'}{teamCount === 1 ? ' playing together against the computer' : ''}. Every team: the same purse.</p>}
        {teamMode === 'teams' && (
          <div className="row"><span className="dim">Computer teams</span><Seg label="Computer teams" value={npcs} onChange={setNpcs} options={[0, 1, 2, 3, 4].map((v) => ({ value: v, label: String(v) }))} /></div>
        )}
      </section>

      <section className="panel col">
        <h3>Squads</h3>
        <Seg label="Squad size" value={mode} onChange={setMode} options={[{ value: 'ipl', label: 'IPL rules (18-25)' }, { value: 'quick', label: 'Quick (6 + 5)' }, { value: 'standard', label: 'Standard (13)' }, { value: 'full', label: 'Full (15)' }]} />
        <p className="dim" style={{ fontSize: 14 }}>
          {mode === 'ipl' ? `IPL mega-auction rules: retain up to 6 of your previous players (₹18/14/11/18/14 Cr capped, ₹4 Cr uncapped), then the auction with Right to Match cards, official bid steps and an accelerated round. Squad of 18-25, at most 8 overseas, purse ${fmtL(PURSE.ipl)}.`
            : mode === 'quick' ? `Buy 6 stars; 5 average players are added for free to make your XI. Purse ${fmtL(PURSE.quick)}.`
            : `Buy ${RULES[mode].size}: at least 1 keeper, 4 batters, 2 all-rounders and 5 bowlers (2 pace, 1 spin), 2 uncapped, at most ${RULES[mode].maxOverseas} overseas. Purse ${fmtL(PURSE[mode])}. Empty compulsory slots are filled at double price.`}
        </p>
        <div className="row"><span className="dim">Seconds per lot</span><Seg label="Seconds per lot" value={timer} onChange={setTimer} options={[8, 12, 18].map((v) => ({ value: v, label: `${v}s` }))} /></div>
        <label className="check"><input type="checkbox" checked={mystery} onChange={(e) => setMystery(e.target.checked)} /><span>Mystery lot<br /><small className="faint">One hidden player near the end: a star or a flop.</small></span></label>
        <label className="check"><input type="checkbox" checked={settings.realNames} onChange={(e) => store.settings({ realNames: e.target.checked })} /><span>Show real player names<br /><small className="faint">Off: playful name-alikes. Only changes what this device shows.</small></span></label>
      </section>

      <section className="panel col">
        <h3>Matches</h3>
        <div className="row"><span className="dim">Overs per side</span><Seg label="Overs per side" value={overs} onChange={setOvers} options={[{ value: 5, label: '5 (quick)' }, { value: 10, label: '10' }, { value: 20, label: '20 (full T20)' }]} /></div>
        <div className="options">
          <button type="button" className="option" aria-pressed={play} onClick={() => setPlay(true)}>Play every ball<small>You bat and bowl on the pitch yourself: time your shot as the ball arrives, land your delivery on the spot. Each player's skill sets how hard that is. Teammates each play their own players: you choose who plays whom when you pick the XI.</small></button>
          <button type="button" className="option" aria-pressed={!play} onClick={() => setPlay(false)}>Captain only<small>Watch the match and make the big calls: toss, bowlers, DRS, Impact Player, last-over mind games.</small></button>
        </div>
      </section>

      <div className="row between">
        <button className="btn ghost" onClick={() => store.go('home')}>Back</button>
        <button className="btn primary lg" disabled={!valid} onClick={start}>Start the auction</button>
      </div>
    </div>
  );
}
