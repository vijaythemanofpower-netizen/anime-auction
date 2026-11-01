import { useState } from 'react';
import type { GameState, JumpInRule, MentalApproach, Player, StatKey, Strategy } from '../../engine/types';
import * as G from '../../engine/game';
import { modeSize } from '../../engine/tournament';
import { progressedStats } from '../../engine/progression';
import { STAT_LABELS, truePower } from '../../engine/hidden';
import { TRAINABLE, activeSynergies, getEnvironment, getSynergy } from '../../engine/data/world';
import { arenaFit } from '../../engine/arenaFit';
import { store, useApp } from '../../store/store';
import { CharArt } from '../components/Portrait';
import { Emblem, HiddenDetails, PlayerChip, PrivacyGate, StatBars } from '../components/common';
import { ConditionBadges } from '../components/Roster';

export const STRATEGIES: Array<{ v: Strategy; label: string; desc: string }> = [
  { v: 'aggressive', label: 'Aggressive', desc: '+10% damage, −8% defense, attacks more often.' },
  { v: 'defensive', label: 'Defensive', desc: '+15% defense, −8% damage, guards far more.' },
  { v: 'balanced', label: 'Balanced', desc: 'No modifiers; fighters follow their instincts.' },
  { v: 'counter', label: 'Counterattack', desc: '+15% counter chance, +6% defense, guards to bait attacks.' },
  { v: 'control', label: 'Tactical Control', desc: 'Prefers abilities and debuffs, −10% ability cost, targets supports first.' },
  { v: 'highrisk', label: 'High-Risk Offensive', desc: '+20% damage, +8% crit, −15% defense, abilities cost 20% more.' },
];
export const MENTALS: Array<{ v: MentalApproach; label: string; desc: string }> = [
  { v: 'intimidate', label: 'Intimidate', desc: 'Opponents deal −6% damage for 5 actions unless composed or strong-minded.' },
  { v: 'silent', label: 'Stay Silent', desc: 'Immune to taunts. No other effect.' },
  { v: 'taunt', label: 'Taunt', desc: 'Rattles opponents (−8% accuracy) — but hot-blooded and arrogant fighters get stronger instead.' },
  { v: 'analyze', label: 'Analyze', desc: '+5% dodge for 4 actions and a head start on adapting to enemy patterns.' },
  { v: 'provoke', label: 'Provoke', desc: 'Forces their strongest attacker to target your frontliner for 3 actions.' },
  { v: 'composure', label: 'Maintain Composure', desc: 'Immune to intimidation, taunts and provocation; +3% defense.' },
];

export function PrepPhase() {
  const g = useApp((s) => s.game)!;
  const viewer = useApp((s) => s.viewer);
  const m = G.currentMatch(g)!;
  const players = m.players.map((id) => g.players.find((p) => p.id === id)!);
  const humans = g.players.filter((p) => store.isLocalPlayer(p));
  const pending = players.find((p) => store.isLocalPlayer(p) && !g.prep[p.id]?.locked);
  // Online, other players prepare on their own devices.
  const waitingFor = players.filter((p) => !g.prep[p.id]?.locked);
  const stage = g.tournament!.stages[m.stageIndex];

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow">{stage.name} · {m.label} · {m.mode === 'solo' ? '1v1 Solo Duel' : m.mode === 'tag' ? '2v2 Tag Team' : `${g.config.rosterSize}v${g.config.rosterSize} Squad Battle`}</div>
          <h3 style={{ margin: '4px 0' }}>{players[0].name} vs {players[1].name}</h3>
          <div className={`format-badge ${m.mode}`}>{m.mode === 'solo' ? '1 vs 1 · pick 1 fighter' : m.mode === 'tag' ? '2 vs 2 tag team · pick 2 fighters' : `${g.config.rosterSize} vs ${g.config.rosterSize} squad · everyone fights`}</div>
        </div>
        <div className="row">
          {players.map((p) => <PlayerChip key={p.id} p={p} suffix={<span className="faint">{g.prep[p.id]?.locked ? '· ready ✓' : '· preparing'}</span>} />)}
        </div>
      </div>
      {pending ? (
        <PrivacyGate player={pending} enabled={g.config.privacyScreens && humans.length > 1} viewer={viewer} reason="Battle preparation is secret. Your opponent should look away.">
          <PrepPanel g={g} player={pending} key={pending.id} />
        </PrivacyGate>
      ) : waitingFor.length ? (
        <div className="panel col" style={{ alignItems: 'center', textAlign: 'center', padding: 32 }}>
          <div className="spinner" />
          <h3>Waiting for {waitingFor.map((p) => p.name).join(' and ')} to lock in…</h3>
          <p className="muted">They&apos;re choosing fighters and strategy on their own device.</p>
        </div>
      ) : (
        <div className="panel col reveal-anim" style={{ alignItems: 'center', textAlign: 'center', padding: 32 }}>
          <div className="eyebrow">Both sides are locked in</div>
          <h2>Fighters, take your places!</h2>
          <p className="muted">Lineups, strategies and mental approaches will be revealed as the battle begins{g.matchArena ? ` in ${getEnvironment(g.matchArena).name}` : ''}.</p>
          {store.isGuest() ? <p className="faint">Waiting for the host to start the fight…</p>
            : <button className="btn primary lg" onClick={() => { store.setViewer(null); store.runBattle(); }}>⚔ Enter the arena</button>}
        </div>
      )}
    </div>
  );
}

function PrepPanel({ g, player }: { g: GameState; player: Player }) {
  const m = G.currentMatch(g)!;
  const prep = g.prep[player.id];
  const size = modeSize(m.mode, g.config.rosterSize);
  const oppId = m.players.find((x) => x !== player.id)!;
  const opp = g.players.find((p) => p.id === oppId)!;
  const [trainStat, setTrainStat] = useState<StatKey>('attack');
  const [actChar, setActChar] = useState(prep.fighters[0] ?? player.roster[0]);
  const [view, setView] = useState<string | null>(null);
  const set = (patch: Parameters<typeof G.setPrep>[2]) => store.move(player.id, { t: 'prep', patch });
  const toggleFighter = (id: string) => {
    if (prep.fighters.includes(id)) {
      if (size === 1) return;
      return set({ fighters: prep.fighters.filter((x) => x !== id) });
    }
    // Full: the earliest pick makes room for the new one.
    const next = size === 1 ? [id] : prep.fighters.length < size ? [...prep.fighters, id] : [...prep.fighters.slice(1), id];
    set({ fighters: next });
  };
  const toggleFront = (id: string) => {
    const front = prep.front.includes(id) ? prep.front.filter((x) => x !== id) : [...prep.front, id];
    set({ front });
  };
  const syns = activeSynergies(prep.fighters.map((id) => ({ tags: g.characters[id].tags, archetype: g.characters[id].archetype })));
  const discovered = new Set(player.roster.flatMap((id) => g.conditions[id]?.discoveredSynergies ?? []));
  const intel = g.intel[player.id] ?? [];
  // The arena is known before the fight: suggest who suits it (a better chance, not a sure win).
  const arena = g.matchArena ? getEnvironment(g.matchArena) : null;
  const fitOf = (id: string) => (arena ? arenaFit({ tags: g.characters[id].tags, archetype: g.characters[id].archetype, abilities: g.characters[id].knownAbilities }, arena.id) : 0);
  const fits = Object.fromEntries(player.roster.map((id) => [id, fitOf(id)]));
  const bestFit = Math.max(...Object.values(fits));
  // The best fit, or when nobody has an edge, whoever is least hurt by the arena.
  const recommended = Math.min(...Object.values(fits)) < bestFit || bestFit > 0 ? player.roster.filter((id) => fits[id] === bestFit) : [];

  return (
    <div className="grid prep-grid">
      <div className="col" style={{ gap: 16, minWidth: 0 }}>
        {arena && (
          <div className="panel arena-card" style={{ borderColor: arena.palette[2] }}>
            <div className="eyebrow">Tonight's arena</div>
            <h3 style={{ margin: '2px 0' }}>{arena.name}</h3>
            <div className="muted">{arena.description}{arena.hazard ? ` Hazard: ${arena.hazard.name}.` : ''}</div>
            {recommended.length > 0
              ? <div style={{ marginTop: 6 }}>⭐ {bestFit > 0 ? 'Suits this arena best' : 'Safest pick here'}: <b>{recommended.map((id) => g.characters[id].name).join(', ')}</b> <span className="faint">(a better chance, not a sure win)</span></div>
              : <div className="faint" style={{ marginTop: 6 }}>None of your fighters has an edge here. Pure skill decides it.</div>}
          </div>
        )}
        <div className="panel">
          <div className="panel-title"><h3 style={{ margin: 0 }}>Choose {size} fighter{size > 1 ? 's' : ''} <span className="faint" style={{ fontWeight: 500 }}>({prep.fighters.length}/{size} picked)</span></h3><span className="faint">{player.prepPoints} prep point{player.prepPoints === 1 ? '' : 's'} left</span></div>
          <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {player.roster.map((id) => {
              const pc = g.characters[id];
              const h = store.hiddenFor(id, player.id);
              const st = h ? progressedStats(h, g.conditions[id]) : null;
              const picked = prep.fighters.includes(id);
              return (
                <div key={id} className={`panel tight col${picked ? ' flash' : ''}`} style={{ gap: 6, borderColor: picked ? 'var(--cyan)' : undefined }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '54px 1fr', gap: 8, alignItems: 'center' }}>
                    <div style={{ width: 54, height: 54, borderRadius: 10, overflow: 'hidden' }}><CharArt c={pc} /></div>
                    <div style={{ minWidth: 0 }}><strong style={{ fontSize: 14 }}>{pc.name}</strong><div className="faint">{pc.archetype} · PWR {st ? truePower(st) : '?'}</div></div>
                  </div>
                  <ConditionBadges g={g} id={id} />
                  {arena && (fits[id] !== 0 || recommended.includes(id)) && <span className={`tag arena-fit ${fits[id] >= 0 ? 'good' : 'bad'}`}>{recommended.includes(id) ? '⭐ Best pick here' : fits[id] > 0 ? '▲ Suits the arena' : '▼ Struggles here'}</span>}
                  <div className="row" style={{ gap: 6 }}>
                    <button className={`btn sm ${picked ? 'active' : ''}`} onClick={() => toggleFighter(id)} aria-pressed={picked}>{picked ? '✓ Selected' : 'Select'}</button>
                    {picked && size > 1 && <button className="btn sm" onClick={() => toggleFront(id)}>{prep.front.includes(id) ? 'Frontline' : 'Backline'}</button>}
                    <button className="btn sm ghost" onClick={() => setView(view === id ? null : id)}>Stats</button>
                  </div>
                  {view === id && h && <StatBars stats={progressedStats(h, g.conditions[id])} base={h.stats} />}
                </div>
              );
            })}
          </div>
          {size > 1 && <p className="faint" style={{ marginTop: 8 }}>Melee fighters can only reach the enemy backline once their frontline falls (assassins and ranged fighters ignore this). In tag battles the backliner can tag in for a wounded partner.</p>}
          {syns.length > 0 && <div style={{ marginTop: 8 }}>{syns.map((id) => { const s = getSynergy(id)!; return s.hidden && !discovered.has(id) ? <div key={id} className="faint">✦ This lineup has an undiscovered synergy…</div> : <div key={id} style={{ fontSize: 14 }}>✦ <strong>{s.name}</strong> <span className="faint">{s.description}</span></div>; })}</div>}
        </div>

        {player.roster.some((id) => !prep.fighters.includes(id)) && (
          <div className="panel col" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>Bench</h3>
            <p className="faint" style={{ margin: 0 }}>Bench fighters can be sent in once by your corner. Some will also want to jump in on their own when a teammate is in trouble, depending on their nature: hot-blooded and loyal fighters are eager, arrogant ones rarely bother.</p>
            {player.roster.filter((id) => !prep.fighters.includes(id)).map((id) => {
              const rule: JumpInRule = prep.jumpIn?.[id] ?? 'ask';
              const pc = g.characters[id];
              return (
                <div key={id} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}><CharArt c={pc} /></div>
                  <div style={{ flex: 1, minWidth: 120 }}><strong>{pc.name}</strong> <span className="faint">· {pc.temperament}</span></div>
                  <div className="seg" role="group" aria-label={`${pc.name} may jump in`}>
                    {([['never', 'Never'], ['ask', 'Ask me'], ['auto', 'Let them decide']] as Array<[JumpInRule, string]>).map(([v, label]) => (
                      <button key={v} className={rule === v ? 'active' : ''} aria-pressed={rule === v} onClick={() => set({ jumpIn: { [id]: v } })}>{label}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="panel col">
          <h3 style={{ margin: 0 }}>Strategy</h3>
          <div className="grid grid-3" style={{ gap: 8 }}>
            {STRATEGIES.map((s) => (
              <button key={s.v} className={`btn ${prep.strategy === s.v ? 'active' : ''}`} style={{ flexDirection: 'column', alignItems: 'flex-start', whiteSpace: 'normal', height: 'auto', padding: 10, textAlign: 'left' }} aria-pressed={prep.strategy === s.v} onClick={() => set({ strategy: s.v })}>
                <span>{s.label}</span><span className="faint" style={{ fontWeight: 400 }}>{s.desc}</span>
              </button>
            ))}
          </div>
          <h3 style={{ margin: '8px 0 0' }}>Mental approach</h3>
          <div className="grid grid-3" style={{ gap: 8 }}>
            {MENTALS.map((s) => (
              <button key={s.v} className={`btn ${prep.mental === s.v ? 'active' : ''}`} style={{ flexDirection: 'column', alignItems: 'flex-start', whiteSpace: 'normal', height: 'auto', padding: 10, textAlign: 'left' }} aria-pressed={prep.mental === s.v} onClick={() => set({ mental: s.v })}>
                <span>{s.label}</span><span className="faint" style={{ fontWeight: 400 }}>{s.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="col" style={{ gap: 16, minWidth: 0 }}>
        <div className="panel col">
          <div className="panel-title"><h3 style={{ margin: 0 }}>Preparation actions</h3><span className="tag" style={{ color: 'var(--gold)' }}>{player.prepPoints} point{player.prepPoints === 1 ? '' : 's'}</span></div>
          <select className="input" value={actChar} onChange={(e) => setActChar(e.target.value)} aria-label="Character for preparation action">
            {player.roster.map((id) => <option key={id} value={id}>{g.characters[id].name}</option>)}
          </select>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
            <select className="input" style={{ flex: 1 }} value={trainStat} onChange={(e) => setTrainStat(e.target.value as StatKey)} aria-label="Stat to train">
              {TRAINABLE.map((k) => <option key={k} value={k}>{STAT_LABELS[k]} (+3, +5 fatigue)</option>)}
            </select>
            <button className="btn sm" disabled={player.prepPoints <= 0} onClick={() => store.move(player.id, { t: 'prepAction', act: { kind: 'train', charId: actChar, stat: trainStat } })}>Train</button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" disabled={player.prepPoints <= 0 || !g.conditions[actChar]?.fatigue} onClick={() => store.move(player.id, { t: 'prepAction', act: { kind: 'recover', charId: actChar } })}>Recover stamina (−35 fatigue)</button>
            <button className="btn sm" disabled={player.prepPoints <= 0 || !g.conditions[actChar]?.injuries.length} onClick={() => store.move(player.id, { t: 'prepAction', act: { kind: 'treat', charId: actChar } })}>Treat injury</button>
          </div>
          <p className="faint">Training is permanent (max +6 per stat). Benched fighters recover 20 fatigue per match.</p>
        </div>

        <div className="panel col">
          <div className="panel-title"><h3 style={{ margin: 0 }}>Opponent: <Emblem p={opp} size={20} /> {opp.name}</h3></div>
          {opp.roster.map((id) => {
            const pc = g.characters[id];
            const known = intel.includes(id);
            const h = known ? store.hiddenFor(id, player.id) : null;
            return (
              <div key={id} className="col" style={{ gap: 6, padding: 8, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)' }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}><CharArt c={pc} /></div>
                    <div style={{ minWidth: 0 }}><strong style={{ fontSize: 14 }}>{pc.name}</strong><div className="faint">{pc.archetype} · {g.conditions[id]?.wins ?? 0}W–{g.conditions[id]?.losses ?? 0}L</div></div>
                  </div>
                  {!known && <button className="btn sm" disabled={player.prepPoints <= 0} onClick={() => store.move(player.id, { t: 'prepAction', act: { kind: 'scout', charId: id } })}>Scout (1 pt)</button>}
                </div>
                <ConditionBadges g={g} id={id} />
                {h && <><StatBars stats={progressedStats(h, g.conditions[id])} base={h.stats} /><HiddenDetails h={h} /></>}
              </div>
            );
          })}
          <p className="faint">You don&apos;t know which of their fighters they will field.</p>
        </div>

        <button className="btn primary lg" disabled={prep.fighters.length !== size} onClick={() => { store.move(player.id, { t: 'lock' }); store.setViewer(null); }}>Lock in preparation</button>
      </div>
    </div>
  );
}
