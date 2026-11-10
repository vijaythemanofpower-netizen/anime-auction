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
  const [teamMode, setTeamMode] = useState<TeamMode>('solo');
  const [mode, setMode] = useState<SquadMode>('standard');
  const [npcs, setNpcs] = useState(1);
  const [timer, setTimer] = useState(12);
  const [mystery, setMystery] = useState(true);
  const [partnerSize, setPartnerSize] = useState<2 | 3>(2);
  const [overs, setOvers] = useState<5 | 10 | 20>(5);
  const [play, setPlay] = useState(true);
  const [online, setOnline] = useState(false);

  const n = names.length;
  const modes: Array<{ value: TeamMode; label: string; ok: boolean; why: string }> = [
    { value: 'solo', label: 'Everyone for themselves', ok: true, why: 'Each player owns a franchise; computer teams fill the other seats.' },
    { value: 'pairs', label: 'Partners', ok: n >= 4 && n % partnerSize === 0, why: `Teams of ${partnerSize} share one purse and one squad, with captain roles split between partners. Needs ${partnerSize * 2}+ players.` },
    { value: 'handicap', label: 'Handicap 1 v 2/3', ok: n === 3 || n === 4, why: `The first player plays alone against the others with ${HANDICAP.vs2.purse}x purse and +${HANDICAP.vs2.scouts} scouts (1v2) or ${HANDICAP.vs3.purse}x and +${HANDICAP.vs3.scouts} (1v3). Needs 3 or 4 players.` },
    { value: 'boss', label: '1 v 4: the Boss', ok: n >= 2 && n <= 4, why: `All of you share one franchise against a single Boss NPC with a ${HANDICAP.boss.purse}x war chest and +${HANDICAP.boss.scouts} scouts. Made for 4 friends (works with 2-4).` },
  ];
  const current = modes.find((m) => m.value === teamMode)!;
  const valid = current.ok && names.every((x) => x.trim()) && (teamMode !== 'solo' || n + npcs >= 2);

  const start = () => {
    const humans: Human[] = names.map((name, i) => ({ id: `h${i}`, name: name.trim(), color: COLORS[i % COLORS.length] }));
    store.newGame({ humans, teamMode, partnerSize, npcs: teamMode === 'solo' || teamMode === 'pairs' ? npcs : 0, mode, timer, mystery, realNames: settings.realNames, overs, play });
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
        {teamMode === 'pairs' && <div className="row"><span className="dim">Partners per team</span><Seg label="Partners per team" value={partnerSize} onChange={setPartnerSize} options={[{ value: 2, label: '2' }, { value: 3, label: '3' }]} /></div>}
        {(teamMode === 'solo' || teamMode === 'pairs') && (
          <div className="row"><span className="dim">Computer teams</span><Seg label="Computer teams" value={npcs} onChange={setNpcs} options={[0, 1, 2, 3, 4].map((v) => ({ value: v, label: String(v) }))} /></div>
        )}
      </section>

      <section className="panel col">
        <h3>Squads</h3>
        <Seg label="Squad size" value={mode} onChange={setMode} options={[{ value: 'quick', label: 'Quick (6 + 5)' }, { value: 'standard', label: 'Standard (13)' }, { value: 'full', label: 'Full (15)' }]} />
        <p className="dim" style={{ fontSize: 14 }}>
          {mode === 'quick' ? `Buy 6 stars; 5 average players are added for free to make your XI. Purse ${fmtL(PURSE.quick)}.`
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
          <button type="button" className="option" aria-pressed={play} onClick={() => setPlay(true)}>Play every ball<small>You bowl and bat yourself: pick the delivery or shot, then hit the timing meter. Partners split it: the batting captain bats, the bowling captain bowls.</small></button>
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
