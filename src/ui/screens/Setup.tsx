import { useState } from 'react';
import * as G from '../../engine/game';
import { describeFormat, matchOrder } from '../../engine/tournament';
import { LEGEND_CHARACTERS } from '../../engine/data/legends';
import { randomPopular } from '../../engine/providers/anilist';
import { getApiKey, rateAll, withAiMoves } from '../ai/moveWriter';
import type { PublicCharacter } from '../../engine/types';
import { store, useApp } from '../../store/store';
import { Emblem, Seg } from '../components/common';
import type { AuctionMode, PlayerKind } from '../../engine/types';

export const COLORS = ['#a78bfa', '#22d3ee', '#f472b6', '#f5c451', '#34d399', '#fb923c'];
export const EMBLEMS = ['◆', '✦', '❖', '☾', '✸', '♞', '⚡', '❂'];
const NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6'];
const NPC_NAMES = ['House Kurogane', 'Syndicate Vale', 'Baron Ashcroft', 'The Collector', 'Madame Zhou'];

export function Setup() {
  const privacyDefault = useApp((s) => s.settings.privacyDefault);
  const [name, setName] = useState('Friday Night Showdown');
  const [players, setPlayers] = useState<G.PlayerSetup[]>(NAMES.slice(0, 4).map((n, i) => ({ name: n, color: COLORS[i], emblem: EMBLEMS[i], kind: 'human' as PlayerKind })));
  const [rosterSize, setRosterSize] = useState<3 | 4>(3);
  const [mode, setMode] = useState<AuctionMode>('live');
  const [openingBid, setOpeningBid] = useState(100);
  const [timer, setTimer] = useState(15);
  const [scoutTokens, setScoutTokens] = useState(3);
  const [soloRounds, setSoloRounds] = useState(1);
  const [tagRound, setTagRound] = useState(true);
  const [persistent, setPersistent] = useState(true);
  const [events, setEvents] = useState(true);
  const [privacy, setPrivacy] = useState(privacyDefault);
  const [poolSource, setPoolSource] = useState<'mix' | 'all' | 'builtin'>('mix');
  const hasKey = !!getApiKey();
  const [aiRate, setAiRate] = useState(hasKey);

  const setup: G.GameSetup = {
    name, players, rosterSize, privacyScreens: privacy,
    auction: { ...G.DEFAULT_AUCTION, mode, openingBid, timerSeconds: timer, scoutTokens },
    tournament: { soloRounds, tagRound, persistentConditions: persistent, specialEvents: events },
  };
  const errors = G.validateSetup(setup);

  const setCount = (n: number) => {
    setPlayers((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) {
        const i = next.length;
        const used = new Set(next.map((p) => p.name));
        next.push({ name: NAMES.find((x) => !used.has(x)) ?? `Player ${i + 1}`, color: COLORS[i % COLORS.length], emblem: EMBLEMS[i % EMBLEMS.length], kind: 'human' });
      }
      return next;
    });
  };
  const patch = (i: number, p: Partial<G.PlayerSetup>) => setPlayers((prev) => prev.map((x, j) => {
    if (j !== i) return x;
    const next = { ...x, ...p };
    if (p.kind === 'npc' && x.kind === 'human' && /^Player \d$/.test(x.name)) next.name = NPC_NAMES[i % NPC_NAMES.length];
    if (p.kind === 'human' && x.kind === 'npc' && NPC_NAMES.includes(x.name)) next.name = `Player ${i + 1}`;
    return next;
  }));

  const create = async (s: G.GameSetup, autofill: boolean) => {
    if (!store.createGame(s)) return;
    if (!autofill) return;
    let catalog: PublicCharacter[] = LEGEND_CHARACTERS;
    if (poolSource !== 'builtin') {
      // A different handful of popular characters from every anime each game.
      const found = await randomPopular(60).then((r) => r.map(withAiMoves)).catch(() => [] as PublicCharacter[]);
      const g = store.getState().game;
      const need = g ? G.poolRecommended(g) : 24;
      const shuffle = <T,>(xs: T[]) => xs.slice().sort(() => Math.random() - 0.5);
      if (found.length && aiRate && hasKey) {
        // Rate just the ones that will be auctioned, so it costs only what's needed.
        const rated = await rateAll(shuffle(found).slice(0, poolSource === 'all' ? need : Math.ceil(need / 2)), (d, t) => { if (d === 1 || d === t || d % 5 === 0) store.toast(`AI is rating fighters from their series: ${d} of ${t}…`); });
        catalog = poolSource === 'all' ? rated : [...shuffle(LEGEND_CHARACTERS).slice(0, need - rated.length), ...rated];
      } else if (found.length) catalog = poolSource === 'all' ? found : [...LEGEND_CHARACTERS, ...found];
      if (!found.length) store.toast('Could not reach AniList, so the built-in characters are used.', 'error');
    }
    store.act((g, v) => G.autoFillPool(g, v, catalog));
  };

  const quick = (humans: number, npcs: number) => {
    const ps: G.PlayerSetup[] = [
      ...Array.from({ length: humans }, (_, i) => ({ name: `Player ${i + 1}`, color: COLORS[i], emblem: EMBLEMS[i], kind: 'human' as PlayerKind })),
      ...Array.from({ length: npcs }, (_, i) => ({ name: NPC_NAMES[i], color: COLORS[humans + i], emblem: EMBLEMS[humans + i], kind: 'npc' as PlayerKind })),
    ];
    void create({ ...setup, name: humans === 1 ? 'Solo vs Rival Houses' : 'Quick Match', players: ps, privacyScreens: humans > 1 && privacy }, true);
  };

  return (
    <div className="col" style={{ gap: 20, maxWidth: 1080 }}>
      <div className="section-head">
        <div><div className="eyebrow">Game creation</div><h1>Create New Game</h1></div>
        <div className="row">
          <button className="btn" onClick={() => quick(1, 3)}>Quick: Solo vs 3 NPCs</button>
          <button className="btn gold" onClick={() => quick(4, 0)}>Quick Start (4 players)</button>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="panel col">
          <div className="field"><label htmlFor="gname">Game name</label><input id="gname" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={48} /></div>
          <div className="field">
            <span className="label">Players</span>
            <Seg value={players.length} onChange={setCount} label="Number of players" options={[2, 3, 4, 5, 6].map((n) => ({ v: n, label: String(n) }))} />
          </div>
          <div className="col" style={{ gap: 8 }}>
            {players.map((p, i) => (
              <div key={i} className="row" style={{ gap: 8, paddingBottom: 6, borderBottom: '1px solid var(--line)' }}>
                <button className="btn sm ghost" style={{ padding: 4 }} title="Change emblem" aria-label={`Change emblem for ${p.name}`}
                  onClick={() => patch(i, { emblem: EMBLEMS[(EMBLEMS.indexOf(p.emblem) + 1) % EMBLEMS.length] })}><Emblem p={p} size={30} /></button>
                <input className="input" style={{ flex: '1 1 140px', minWidth: 0 }} value={p.name} onChange={(e) => patch(i, { name: e.target.value })} aria-label={`Player ${i + 1} name`} maxLength={20} />
                <div className="row" style={{ gap: 3, flexWrap: 'nowrap' }}>
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => patch(i, { color: c })} aria-label={`Color ${c}`} aria-pressed={p.color === c}
                      style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: p.color === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
                  ))}
                </div>
                <Seg value={p.kind} onChange={(k) => patch(i, { kind: k })} label="Human or NPC" options={[{ v: 'human', label: 'Human' }, { v: 'npc', label: 'NPC' }]} />
              </div>
            ))}
          </div>
          <p className="faint">NPC bidders compete in the auction and tournament using only public information and the same rules as humans.</p>
        </div>

        <div className="col">
          <div className="panel col">
            <h3>Auction</h3>
            <div className="field">
              <span className="label">Fighters in the auction</span>
              <Seg value={poolSource} onChange={setPoolSource} label="Fighters in the auction" options={[
                { v: 'mix', label: 'Mix', title: 'Built-in favourites plus random characters from all anime' },
                { v: 'all', label: 'All anime', title: 'Random popular characters from every anime on AniList' },
                { v: 'builtin', label: 'Built-in 76', title: 'Only the hand-made characters with their real moves' },
              ]} />
            </div>
            {poolSource !== 'builtin' && (
              <label className="row" style={{ gap: 8, fontSize: 14 }} title={hasKey ? 'Claude rates each new fighter from their feats in the series and writes their real moves' : 'Add your Anthropic API key in Settings to use this'}>
                <input type="checkbox" checked={aiRate && hasKey} disabled={!hasKey} onChange={(e) => setAiRate(e.target.checked)} />
                AI-accurate stats and moves for fighters from all anime {hasKey ? <span className="faint">(your Anthropic key, a few cents each)</span> : <span className="faint">(add your key in Settings)</span>}
              </label>
            )}
            <div className="field"><span className="label">Roster size</span><Seg value={rosterSize} onChange={setRosterSize} label="Roster size" options={[{ v: 3, label: '3 fighters' }, { v: 4, label: '4 fighters' }]} /></div>
            <div className="field">
              <span className="label">Bidding mode</span>
              <Seg value={mode} onChange={setMode} label="Bidding mode" options={[
                { v: 'live', label: 'Live (shared screen)', title: 'Everyone bids from one screen; late bids extend the timer' },
                { v: 'turns', label: 'Turn-based (pass device)', title: 'Players bid or pass in turn' },
              ]} />
            </div>
            <div className="grid grid-3" style={{ gap: 10 }}>
              <div className="field"><label htmlFor="ob">Opening bid</label><select id="ob" className="input" value={openingBid} onChange={(e) => setOpeningBid(Number(e.target.value))}>{[50, 100, 200, 300].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
              <div className="field"><label htmlFor="tm">Timer (s)</label><select id="tm" className="input" value={timer} onChange={(e) => setTimer(Number(e.target.value))}>{[10, 15, 20, 30, 45].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
              <div className="field"><label htmlFor="st">Scout tokens</label><select id="st" className="input" value={scoutTokens} onChange={(e) => setScoutTokens(Number(e.target.value))}>{[0, 2, 3, 5].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
            </div>
          </div>
          <div className="panel col">
            <h3>Tournament</h3>
            <div className="field"><span className="label">Solo duel rounds</span><Seg value={soloRounds} onChange={setSoloRounds} label="Solo rounds" options={[1, 2, 3].map((n) => ({ v: n, label: String(n) }))} /></div>
            <label className="toggle"><input type="checkbox" checked={tagRound} onChange={(e) => setTagRound(e.target.checked)} /> Include a tag-team round</label>
            <label className="toggle"><input type="checkbox" checked={persistent} onChange={(e) => setPersistent(e.target.checked)} /> Persistent fatigue &amp; injuries</label>
            <label className="toggle"><input type="checkbox" checked={events} onChange={(e) => setEvents(e.target.checked)} /> Special arenas &amp; environmental events</label>
            <label className="toggle"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} /> Privacy hand-off screens</label>
            <p style={{ margin: 0 }}><strong>Match order:</strong> {matchOrder(players.length, setup.tournament, rosterSize)}</p>
            <p className="faint">Format: {describeFormat(players.length, setup.tournament)}</p>
          </div>
        </div>
      </div>

      {errors.length > 0 && <div className="panel" role="alert" style={{ borderColor: 'var(--bad)' }}>{errors.map((e) => <div key={e}>• {e}</div>)}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={() => store.go('home')}>Cancel</button>
        <button className="btn" disabled={errors.length > 0} onClick={() => void create(setup, false)}>Create &amp; pick pool manually</button>
        <button className="btn primary lg" disabled={errors.length > 0} onClick={() => void create(setup, true)}>Create game</button>
      </div>
    </div>
  );
}
