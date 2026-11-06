// Leaderboards for everything, and a report on every player: what they're good and bad at, who they
// always pick, their rivalries and their best and worst odds. Numbers come from engine/stats.ts.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BOARDS, masterKeys, masters, rank, reportFor, type Line, type MasterKind, type PlayerRecord, type Ranked, type Row } from '../../engine/stats';
import { getEnvironment } from '../../engine/data/world';
import { ONLINE_AVAILABLE } from '../../online/client';
import { useAuth } from '../../online/auth';
import { fetchRows } from '../../online/leaderboard';
import { toRecord, useCareer } from '../../store/career';
import { store } from '../../store/store';
import { Seg } from '../components/common';

const arenaName = (id: string) => { try { return getEnvironment(id)?.name ?? id; } catch { return id; } };
const GROUPS = [...new Set(BOARDS.map((b) => b.group))];

/** One person's "x won of y, z%" line. */
const odds = (l: Line) => `${l.pct}% · ${l.w}-${l.l}`;

function Fact({ label, l, note }: { label: string; l: Line | null; note?: string }) {
  return (
    <div className="rk-fact">
      <span className="faint">{label}</span>
      {l ? <><b>{l.name}</b><span className="faint">{note ?? odds(l)}</span></> : <span className="faint">Not enough games yet</span>}
    </div>
  );
}

function Skill({ s }: { s: { label: string; detail: string; rate: number } }) {
  return (
    <div className="rk-skill">
      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><span>{s.label}</span><b>{Math.round(s.rate * 100)}%</b></div>
      <div className="rk-bar" aria-hidden="true"><i style={{ transform: `scaleX(${s.rate})` }} /></div>
      <span className="faint">{s.detail}</span>
    </div>
  );
}

/** Everything the game knows about one player. */
export function PlayerReport({ name, record }: { name: string; record: PlayerRecord }) {
  const r = useMemo(() => reportFor(record, arenaName), [record]);
  const lab = record.lab;
  const pctOf = (w: number, n: number) => (n ? `${Math.round((w / n) * 100)}%` : '–');
  const tiles: Array<[ReactNode, string]> = [
    [record.titles, `titles from ${record.tournaments}`],
    [`${record.fightsWon}-${record.fights - record.fightsWon}`, `matches, ${pctOf(record.fightsWon, record.fights)} won`],
    [`${record.raidsWon}/${record.raids}`, 'raids beaten'],
    [`${record.teamWins}/${record.teamBattles}`, 'team battles won'],
    [lab.bestStreak, `best streak, now ${lab.streak}`],
    [record.mvps, 'MVP awards'],
    [lab.spent.toLocaleString(), `coins on ${lab.lots} fighters`],
    [`${lab.betsWon}/${lab.betsWon + lab.betsLost}`, 'fight bets called'],
  ];
  return (
    <div className="col" style={{ gap: 16 }}>
      <h2 style={{ margin: 0 }}>{name}</h2>
      <div className="rk-tiles">{tiles.map(([n, label]) => <div key={label} className="rk-tile"><b>{n}</b><span className="faint">{label}</span></div>)}</div>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <div className="panel col" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Good at</h3>
          {r.good.length ? r.good.map((x) => <Skill key={x.label} s={x} />) : <span className="faint">Needs at least 3 games of something.</span>}
        </div>
        <div className="panel col" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Needs work</h3>
          {r.bad.length ? r.bad.map((x) => <Skill key={x.label} s={x} />) : <span className="faint">Nothing below 50% yet.</span>}
        </div>
      </div>
      <div className="panel col" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>Rivals</h3>
        <div className="rk-facts">
          <Fact label="Biggest rivalry" l={r.bestRivalry} />
          <Fact label="Best win chance against" l={r.bestWinChance} />
          <Fact label="Toughest opponent" l={r.worstWinChance} />
        </div>
      </div>
      <div className="panel col" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>Fighters</h3>
        <div className="rk-facts">
          <Fact label="Always picks" l={r.alwaysPick} note={r.alwaysPick ? `${r.alwaysPick.w + r.alwaysPick.l} fights, bought ${r.alwaysPick.bought}×` : undefined} />
          <Fact label="Best fighter" l={r.bestFighter} />
          <Fact label="Weakest fighter" l={r.worstFighter} />
          <Fact label="Nemesis fighter" l={r.nemesisFighter} note={r.nemesisFighter ? `Wins ${r.nemesisFighter.pct}% against them` : undefined} />
          <Fact label="Favourite prey" l={r.easiestFighter} note={r.easiestFighter ? `Wins ${r.easiestFighter.pct}% against them` : undefined} />
          <Fact label="Biggest buy" l={lab.biggestBuy ? { name: lab.biggestBuy.name, w: 0, l: 0, pct: 0 } : null} note={lab.biggestBuy ? `${lab.biggestBuy.price.toLocaleString()} coins` : undefined} />
        </div>
      </div>
      <div className="panel col" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>Style</h3>
        <div className="rk-facts">
          <Fact label="Best arena" l={r.bestArena} />
          <Fact label="Worst arena" l={r.worstArena} />
          <Fact label="Best series" l={r.bestSeries} />
          <Fact label="Best strategy" l={r.bestStrategy} />
        </div>
      </div>
    </div>
  );
}

function Table({ list, me, open, empty }: { list: Ranked[]; me: string | null; open: (id: string) => void; empty: string }) {
  if (!list.length) return <div className="empty">{empty}</div>;
  return (
    <ol className="rk-table">
      {list.map((x, i) => (
        <li key={x.id} className={x.id === me ? 'mine' : ''}>
          <span className={`rk-place p${i + 1}`}>{i + 1}</span>
          <button className="rk-name" onClick={() => open(x.id)}>{x.name}{x.id === me ? ' (you)' : ''}</button>
          <span className="rk-sub faint">{x.sub}</span>
          <b>{x.shown}</b>
        </li>
      ))}
    </ol>
  );
}

export function Leaderboards() {
  const a = useAuth();
  const career = useCareer();
  const mine = useMemo(() => toRecord(career), [career]);
  const [tab, setTab] = useState<'ranks' | 'masters' | 'me'>('ranks');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [boardId, setBoardId] = useState(BOARDS[0].id);
  const [kind, setKind] = useState<MasterKind>('picks');
  const [key, setKey] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!ONLINE_AVAILABLE) { setRows([]); return; }
    let alive = true;
    setFailed(false);
    fetchRows().then((r) => { if (alive) setRows(r); }).catch(() => { if (alive) { setRows([]); setFailed(true); } });
    return () => { alive = false; };
  }, [a.userId]);

  const list = rows ?? [];
  const board = BOARDS.find((b) => b.id === boardId)!;
  const ranked = useMemo(() => rank(list, board), [list, board]);
  const keys = useMemo(() => masterKeys(list, kind), [list, kind]);
  const chosen = keys.includes(key) ? key : keys[0] ?? '';
  const top = useMemo(() => (chosen ? masters(list, kind, chosen) : []), [list, kind, chosen]);
  const opened = list.find((r) => r.id === openId);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="section-head">
        <div><div className="eyebrow">Every player, every record</div><h1>Leaderboards</h1></div>
        <button className="btn ghost" onClick={() => store.go('hall')}>Hall of Legends</button>
      </div>
      <Seg value={tab} onChange={(v) => { setTab(v); setOpenId(null); }} label="Leaderboard view" options={[{ v: 'ranks', label: 'Rankings' }, { v: 'masters', label: 'Masters' }, { v: 'me', label: 'My report' }]} />
      {tab === 'me' ? <PlayerReport name={a.profile?.display_name ?? 'You'} record={mine} /> : opened ? (
        <>
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setOpenId(null)}>Back to the rankings</button>
          <PlayerReport name={opened.name} record={opened.record} />
        </>
      ) : rows === null ? <div className="empty"><div className="spinner" /></div> : !a.userId && !list.length ? (
        <div className="panel empty">Sign in to see the leaderboards. Your own report is under My report.<div style={{ marginTop: 12 }}><button className="btn primary" onClick={() => store.go('online')}>Sign in</button></div></div>
      ) : failed ? (
        <div className="panel empty">Couldn&apos;t reach the leaderboards. Check your connection and try again.</div>
      ) : tab === 'ranks' ? (
        <>
          <select className="input rk-pick" value={boardId} onChange={(e) => setBoardId(e.target.value)} aria-label="Choose a leaderboard">
            {GROUPS.map((g) => <optgroup key={g} label={g}>{BOARDS.filter((b) => b.group === g).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</optgroup>)}
          </select>
          {GROUPS.map((g) => (
            <div key={g} className="rk-group">
              <span className="eyebrow">{g}</span>
              <div className="rk-chips">{BOARDS.filter((b) => b.group === g).map((b) => <button key={b.id} className={`btn sm ${b.id === boardId ? 'active' : ''}`} aria-pressed={b.id === boardId} onClick={() => setBoardId(b.id)}>{b.title}</button>)}</div>
            </div>
          ))}
          <div className="panel col" style={{ gap: 8 }}>
            <div><h3 style={{ margin: 0 }}>{board.title}</h3><span className="faint">{board.hint}</span></div>
            <Table list={ranked} me={a.userId} open={setOpenId} empty="Nobody is on this board yet. Play a game and take first place." />
          </div>
        </>
      ) : (
        <div className="panel col" style={{ gap: 12 }}>
          <Seg value={kind} onChange={setKind} label="Masters of" options={[{ v: 'picks', label: 'Fighters' }, { v: 'series', label: 'Series' }, { v: 'arenas', label: 'Arenas' }]} />
          {keys.length ? (
            <>
              <select className="input" value={chosen} onChange={(e) => setKey(e.target.value)} aria-label="Choose who to rank">
                {keys.map((k) => <option key={k} value={k}>{kind === 'arenas' ? arenaName(k) : k}</option>)}
              </select>
              <Table list={top} me={a.userId} open={setOpenId} empty="Nobody yet." />
            </>
          ) : <div className="empty">No games recorded here yet.</div>}
        </div>
      )}
    </div>
  );
}
