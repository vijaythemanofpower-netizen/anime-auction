import { useEffect, useMemo, useRef, useState } from 'react';
import { PLAYER_MAP, canAct, currentMatch, displayName, store, useApp } from '../../store/store';
import { controllerOf, type GameState } from '../../engine/game';
import type { BallEvent, Decision, MatchRecord } from '../../engine/match';
import { DELIVERY_LABEL, SHOT_LABEL, oversText } from '../../engine/match';
import { Seg, useNow } from '../components/common';
import { Portrait } from '../components/Player';
import { sfx } from '../sfx';
import { PlayGround } from './PlayGround';

const CALL_SECONDS = 10;
const pname = (id: string) => displayName(PLAYER_MAP[id]);

/** How long a ball stays on screen before the next (ms at 1x). */
function beat(e: BallEvent | undefined): number {
  if (!e) return 600;
  if (!e.bowler) return 1700;
  if (e.banners.includes('wicket') || e.banners.includes('six')) return 2300;
  if (e.banners.includes('four')) return 1700;
  return 1150;
}

interface Bat { id: string; runs: number; balls: number; fours: number; sixes: number }

/** Live figures for the innings shown, derived from the events played so far. */
function liveState(events: BallEvent[], inn: number) {
  const ev = events.filter((e) => e.inn === inn);
  const bats = new Map<string, Bat>();
  const bowl = new Map<string, { id: string; balls: number; runs: number; wkts: number }>();
  let legal = 0; let pRuns = 0; let pBalls = 0;
  for (const e of ev) {
    if (!e.bowler) continue;
    const b = bats.get(e.batter) ?? { id: e.batter, runs: 0, balls: 0, fours: 0, sixes: 0 };
    if (e.extra !== 'wide') { b.balls++; b.runs += e.runs; if (e.runs === 4) b.fours++; if (e.runs === 6) b.sixes++; }
    bats.set(e.batter, b);
    const w = bowl.get(e.bowler) ?? { id: e.bowler, balls: 0, runs: 0, wkts: 0 };
    if (!e.extra) { w.balls++; legal++; }
    w.runs += e.runs + e.extraRuns;
    if (e.wicket && e.wicket.kind !== 'runout') w.wkts++;
    bowl.set(e.bowler, w);
    pRuns += e.runs + e.extraRuns; pBalls += e.extra === 'wide' ? 0 : 1;
    if (e.wicket) { pRuns = 0; pBalls = 0; }
  }
  return { ev, bats, bowl, legal, partnership: { runs: pRuns, balls: pBalls } };
}

function Banner({ e }: { e: BallEvent }) {
  const b = e.banners;
  const sub = e.wicket ? `${pname(e.wicket.out)} · ${({ bowled: 'bowled', caught: 'caught', caughtBehind: 'caught behind', lbw: 'LBW', runout: 'run out', stumped: 'stumped' } as const)[e.wicket.kind]}` : e.batter ? pname(e.batter) : '';
  let cls = ''; let text = '';
  if (b.includes('hattrick')) { cls = 'gold'; text = 'Hat-trick!'; }
  else if (b.includes('hundred')) { cls = 'gold'; text = 'Hundred!'; }
  else if (b.includes('wicket')) { cls = 'wicket'; text = 'Wicket!'; }
  else if (b.includes('six')) { cls = 'six'; text = 'Six!'; }
  else if (b.includes('fifty')) { cls = 'gold'; text = 'Fifty!'; }
  else if (b.includes('four')) { cls = 'four'; text = 'Four!'; }
  else if (b.includes('superover')) { cls = 'gold'; text = 'Super Over'; }
  else if (b.includes('lastover')) { cls = 'gold'; text = 'Last over'; }
  else return null;
  return <div className={`banner ${cls}`} key={`${e.inn}-${e.over}-${e.ball}-${text}`} aria-hidden="true">{text}<small>{sub}</small></div>;
}

function Wagon({ events }: { events: BallEvent[] }) {
  const shots = events.filter((e) => e.angle !== undefined && e.runs > 0);
  return (
    <svg className="wagon" viewBox="-100 -100 200 200" role="img" aria-label={`Wagon wheel: ${shots.length} scoring shots`}>
      <circle r="96" fill="#123522" stroke="rgba(255,255,255,0.15)" />
      <circle r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 4" />
      <rect x="-5" y="-18" width="10" height="36" fill="#c9b98a" opacity="0.8" />
      {shots.map((e, i) => {
        const a = ((e.angle ?? 0) - 90) * (Math.PI / 180);
        const d = (e.dist ?? 0.5) * 92;
        const col = e.runs === 6 ? 'var(--six)' : e.runs === 4 ? 'var(--four)' : 'rgba(241,240,230,0.55)';
        return <line key={i} x1="0" y1="10" x2={Math.cos(a) * d} y2={Math.sin(a) * d} stroke={col} strokeWidth={e.runs >= 4 ? 1.8 : 1} strokeLinecap="round" />;
      })}
    </svg>
  );
}

function Call({ g, d, onAnswer, passFirst }: { g: GameState; d: Decision; onAnswer: (opt: string) => void; passFirst: boolean }) {
  const [shown, setShown] = useState(!passFirst);
  const [start] = useState(() => Date.now());
  const [openedAt, setOpenedAt] = useState(() => (passFirst ? 0 : Date.now()));
  const now = useNow(200);
  const fid = d.team === 0 ? g.match!.home : g.match!.away;
  const f = g.franchises.find((x) => x.id === fid)!;
  const left = openedAt ? Math.max(0, CALL_SECONDS - (now - openedAt) / 1000) : CALL_SECONDS;
  const answered = useRef(false);
  useEffect(() => {
    if (shown && left <= 0 && !answered.current) { answered.current = true; onAnswer(d.def); }
  }, [left, shown, d.def, onAnswer]);
  void start;
  const kindLabel = d.kind === 'mindBowl' || d.kind === 'mindBat' ? 'Mind game · secret pick' : d.kind === 'review' ? 'DRS' : d.kind === 'toss' ? 'The toss' : d.kind === 'impact' ? 'Impact Player' : d.kind === 'sledge' ? 'Sledge?' : d.kind === 'taunt' ? 'Taunt?' : "Captain's Call";
  return (
    <div className="modal-back">
      <div className="modal col call" role="dialog" aria-modal="true" aria-label={kindLabel} style={{ ['--team' as string]: f.color }}>
        <div className="row between"><span className="label" style={{ color: 'var(--accent)' }}>{kindLabel}</span><span className="label" style={{ color: f.color }}>{f.name}</span></div>
        {!shown ? (
          <>
            <h2>Pass the device</h2>
            <p className="dim">This pick is secret. Hand over to {f.owners.map((o) => g.config.humans.find((h) => h.id === o)?.name).join(' or ')} ({f.name}).</p>
            <button className="btn primary lg" onClick={() => { setShown(true); setOpenedAt(Date.now()); }}>I'm {f.name}: show my pick</button>
          </>
        ) : (
          <>
            <h3 style={{ fontSize: 20 }}>{d.prompt}</h3>
            <div className="options">
              {d.options.map((o) => (
                <button key={o.id} className="option" onClick={() => { if (!answered.current) { answered.current = true; onAnswer(o.id); } }}>
                  {o.label}{o.id === d.def ? <small>Default if time runs out</small> : null}{o.hint && <small>{o.hint}</small>}
                </button>
              ))}
            </div>
            <div className="call-timer" aria-hidden="true"><i style={{ width: `${(left / CALL_SECONDS) * 100}%` }} /></div>
            <span className="faint" style={{ fontSize: 12 }}>{Math.ceil(left)} s</span>
          </>
        )}
      </div>
    </div>
  );
}

const TIM_WORD = ['missed it', 'early', 'well timed', 'PERFECT'];
const ACC_WORD = ['sprayed', 'loose', 'on the spot', 'PERFECT'];

/** The human who plays this ball: whoever controls the cricketer batting or bowling it. */
function ownerOf(g: GameState, d: Decision): string {
  const fid = d.team === 0 ? g.match!.home : g.match!.away;
  const pid = d.kind === 'batBall' ? d.meta?.batter : d.meta?.bowler;
  return pid ? controllerOf(g, fid, pid) : g.franchises.find((x) => x.id === fid)!.owners[0];
}

function Scorecard({ rec, g }: { rec: MatchRecord; g: GameState }) {
  const team = (t: 0 | 1) => g.franchises.find((f) => f.id === (t === 0 ? g.match!.home : g.match!.away))!;
  const outs = new Map<string, BallEvent>();
  for (const e of rec.events) if (e.wicket) outs.set(`${e.inn}:${e.wicket.out}`, e);
  const how = (inn: number, id: string) => {
    const e = outs.get(`${inn}:${id}`);
    if (!e?.wicket) return 'not out';
    const b = pname(e.bowler); const f = e.wicket.fielder ? pname(e.wicket.fielder) : '';
    return ({ bowled: `b ${b}`, caught: `c ${f} b ${b}`, caughtBehind: `c †${f} b ${b}`, lbw: `lbw b ${b}`, runout: `run out (${f})`, stumped: `st †${f} b ${b}` } as const)[e.wicket.kind];
  };
  return (
    <div className="col">
      {rec.innings.map((s, i) => s && (
        <section key={i} className="panel tight">
          <div className="panel-head"><h3 style={{ color: team(s.team).color }}>{team(s.team).name}{i >= 2 ? ` · Super Over ${Math.floor(i / 2)}` : ''}</h3><span className="num" style={{ fontSize: 20, fontWeight: 700 }}>{s.runs}/{s.wkts} <span className="faint" style={{ fontSize: 15 }}>({oversText(s.balls)} ov)</span></span></div>
          <div className="table-wrap"><table className="scorecard">
            <thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
            <tbody>{s.bat.map((b) => <tr key={b.id}><td>{pname(b.id)}<span className="how">{how(i, b.id)}</span></td><td><b>{b.runs}</b></td><td>{b.balls}</td><td>{b.fours}</td><td>{b.sixes}</td><td>{b.balls ? ((b.runs / b.balls) * 100).toFixed(0) : '-'}</td></tr>)}</tbody>
          </table></div>
          <p className="faint" style={{ fontSize: 13, margin: '6px 0 10px' }}>Extras {s.extras} · Best stand {s.bestPartnership.runs} ({pname(s.bestPartnership.a)} & {pname(s.bestPartnership.b)})</p>
          <div className="table-wrap"><table className="scorecard">
            <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
            <tbody>{s.bowl.map((b) => <tr key={b.id}><td>{pname(b.id)}</td><td>{oversText(b.balls)}</td><td>{b.maidens}</td><td>{b.runs}</td><td><b>{b.wkts}</b></td><td>{b.balls ? ((b.runs / b.balls) * 6).toFixed(1) : '-'}</td></tr>)}</tbody>
          </table></div>
        </section>
      ))}
    </div>
  );
}

export function Match({ g }: { g: GameState }) {
  const speed = useApp((s) => s.settings.speed);
  const sound = useApp((s) => s.settings.sound);
  const rec = currentMatch(g)!;
  const storageKey = `ca-idx:${g.id}:${g.match!.seed}`;
  const [idx, setIdx] = useState(() => Number(sessionStorage.getItem(storageKey) ?? 0));
  const [tab, setTab] = useState<'live' | 'card'>('live');
  const [bannerE, setBannerE] = useState<BallEvent | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const total = rec.events.length;
  const atEnd = idx >= total;
  const pending = atEnd ? rec.pending ?? [] : [];
  const finished = atEnd && !rec.pending?.length && !!rec.outcome;
  const home = g.franchises.find((f) => f.id === g.match!.home)!;
  const away = g.franchises.find((f) => f.id === g.match!.away)!;
  const teams = [home, away];

  useEffect(() => { sessionStorage.setItem(storageKey, String(idx)); }, [idx, storageKey]);

  // Play mode (you bat and bowl): the live ground shows each ball and moves the match on itself.
  const playMode = (g.config.play ?? true) && (!home.npc || !away.npc);
  const showNext = () => {
    const e = rec.events[idx];
    if (!e) return;
    setIdx(idx + 1);
    if (store.get().settings.sound && e.bowler) sfx(e.wicket ? 'wicket' : e.runs === 6 ? 'six' : e.runs === 4 ? 'four' : e.runs > 0 ? 'crack' : 'dot');
    if (store.get().settings.sound && !e.bowler && e.banners.some((b) => b === 'superover' || b === 'lastover')) sfx('cheer');
    if (!playMode && e.banners.some((b) => ['wicket', 'six', 'four', 'fifty', 'hundred', 'hattrick', 'superover', 'lastover'].includes(b))) setBannerE(e);
  };
  // Otherwise play the next ball after a beat.
  useEffect(() => {
    if (idx >= total || playMode) return;
    const t = setTimeout(showNext, beat(rec.events[idx - 1]) / speed);
    return () => clearTimeout(t);
  }, [idx, total, rec, speed, playMode]);
  useEffect(() => { if (!bannerE) return; const t = setTimeout(() => setBannerE(null), 1300); return () => clearTimeout(t); }, [bannerE]);

  // Answer pending decisions one at a time; send them together (mind games are revealed at once).
  // Online, each device answers only its own team's decisions (and in partnerships, only its own role's balls).
  const online = useApp((s) => s.online);
  const mine = (d: Decision) => {
    const fid = d.team === 0 ? g.match!.home : g.match!.away;
    if (!canAct(fid)) return false;
    if (online.role === 'off' || (d.kind !== 'batBall' && d.kind !== 'bowlBall')) return true;
    return ownerOf(g, d) === online.me;
  };
  const nextCall = pending.find((d) => !(d.id in answers) && mine(d));
  const onAnswer = (opt: string) => {
    if (!nextCall) return;
    // Online: send at once; the engine itself waits for both secret picks before revealing.
    if (online.role !== 'off') { store.answer({ [nextCall.id]: opt }); setAnswers({ ...answers, [nextCall.id]: opt }); return; }
    const all = { ...answers, [nextCall.id]: opt };
    if (pending.every((d) => d.id in all)) { setAnswers({}); store.answer(Object.fromEntries(pending.map((d) => [d.id, all[d.id]]))); }
    else setAnswers(all);
  };
  const humanTeams = new Set(pending.map((d) => d.team));
  const secretPair = online.role === 'off' && pending.length > 1 && pending.every((d) => d.secret) && humanTeams.size > 1;
  const waitingFor = atEnd && pending.length > 0 && !nextCall;
  const pendingKey = pending.map((d) => d.id).join('|');
  useEffect(() => { setAnswers({}); }, [pendingKey]);
  useEffect(() => {
    if (online.role !== 'host' || !waitingFor) return;
    // shortcut: a guest who is gone or whose move was lost gets skill-based "auto" after the call timer plus a grace period.
    const t = setTimeout(() => store.answer(Object.fromEntries(pending.filter((d) => !mine(d)).map((d) => [d.id, d.meta ? 'auto' : d.def]))), (CALL_SECONDS + 8) * 1000);
    return () => clearTimeout(t);
  }, [pendingKey, waitingFor, online.role]);

  // Auto-play: let skill decide the rest of this over (6 balls) or this innings.
  const [auto, setAuto] = useState<{ balls: number; inn?: string; team: 0 | 1 } | null>(null);
  const isPlay = (x: Decision) => x.kind === 'batBall' || x.kind === 'bowlBall';
  const innOf = (x: Decision) => x.id.split('-')[0];
  useEffect(() => {
    if (!auto || !nextCall || !isPlay(nextCall) || nextCall.team !== auto.team) return;
    if (auto.inn ? innOf(nextCall) !== auto.inn : auto.balls <= 0) { setAuto(null); return; }
    const t = setTimeout(() => { onAnswer('auto'); if (!auto.inn) setAuto({ ...auto, balls: auto.balls - 1 }); }, 30);
    return () => clearTimeout(t);
  });
  const startAuto = (mode: 'over' | 'innings') => { if (nextCall) setAuto(mode === 'over' ? { balls: 5, team: nextCall.team } : { balls: 0, inn: innOf(nextCall), team: nextCall.team }); };
  const autoNow = !!auto && !!nextCall && isPlay(nextCall) && nextCall.team === auto.team;

  const shown = rec.events.slice(0, idx);
  const last = shown[shown.length - 1];
  const inn = last?.inn ?? 0;
  const live = useMemo(() => liveState(shown, inn), [shown, inn]);
  const battingTeam = last?.team ?? 0;
  const score = (t: 0 | 1) => {
    // Latest main-innings score shown for team t.
    const evs = shown.filter((e) => e.team === t && e.inn < 2);
    const e = evs[evs.length - 1];
    if (!e) return null;
    const legal = evs.filter((x) => x.bowler && !x.extra).length;
    return { runs: e.score, wkts: e.wkts, balls: legal, overs: e.overs, inn: e.inn };
  };
  const target = last?.target;
  const ballsLeft = last ? last.overs * 6 - live.legal : 120;
  const need = target !== undefined && last ? target - last.score : undefined;
  const crr = live.legal ? (last!.score / live.legal) * 6 : 0;
  const rrr = need !== undefined && ballsLeft > 0 ? (need / ballsLeft) * 6 : undefined;
  const thisOver = shown.filter((e) => e.inn === inn && e.over === last?.over && e.bowler);
  const feed = shown.slice(-60).reverse();
  const striker = last?.crease[0]; const non = last?.crease[1];
  const bowlerNow = last?.bowler ? live.bowl.get(last.bowler) : undefined;
  const momentum = last?.momentum ?? 0;
  const outcome = rec.outcome;
  const winner = outcome && outcome.winner !== null ? teams[outcome.winner] : null;

  const skip = () => setIdx(total);
  // The ground's name cards: the players about to face and bowl the next ball.
  const playCall = pending.find((d) => isPlay(d));
  const batNow = playCall?.meta?.batter ?? striker;
  const bowlNow = playCall?.meta?.bowler ?? (last?.bowler || undefined);
  const bowlStat = bowlNow ? live.bowl.get(bowlNow) : undefined;
  const bowlFig = bowlStat ? `${oversText(bowlStat.balls)}-${bowlStat.runs}-${bowlStat.wkts}` : '0-0-0';
  const waitName = playCall && g.config.humans.find((h) => h.id === ownerOf(g, playCall))?.name;

  return (
    <div className="col">
      {bannerE && <Banner e={bannerE} />}
      {nextCall && !isPlay(nextCall) && <Call key={nextCall.id} g={g} d={nextCall} onAnswer={onAnswer} passFirst={secretPair} />}
      {waitingFor && !auto && !playMode && <div className="auto-pill" role="status">Waiting for the other side's move…</div>}
      {auto && <div className="auto-pill" role="status">Auto-playing {auto.inn ? 'this innings' : 'this over'} <button className="btn sm" onClick={() => setAuto(null)}>Take over</button></div>}

      <div className="row between">
        <div>
          <span className="label">{rec.overs}-over match · {rec.pitch} pitch · {rec.weather}{rec.dew ? ' · dew expected' : ''}</span>
          <h2>{home.name} <span className="faint">v</span> {away.name}</h2>
        </div>
        <div className="row">
          <button className="btn sm ghost" aria-pressed={sound} onClick={() => store.settings({ sound: !sound })}>{sound ? '🔊 Sound on' : '🔇 Sound off'}</button>
          <Seg label="Speed" value={speed} onChange={(v) => store.settings({ speed: v })} options={[{ value: 1, label: '1x' }, { value: 2, label: '2x' }, { value: 4, label: '4x' }]} />
          {!atEnd && <button className="btn sm ghost" onClick={skip}>Skip to next call</button>}
        </div>
      </div>

      {playMode && !finished && (
        <PlayGround g={g} events={rec.events} idx={idx} advance={showNext} speed={speed}
          call={nextCall && isPlay(nextCall) && !autoNow ? nextCall : null} onAnswer={onAnswer} onAuto={startAuto}
          mineTeam={(t) => canAct(t === 0 ? g.match!.home : g.match!.away)}
          who={playCall ? g.config.humans.find((h) => h.id === ownerOf(g, playCall))?.name ?? '' : ''}
          status={waitingFor ? `Waiting for ${waitName ?? 'the other side'} to play…` : auto ? 'Auto-playing: your players are using their own skill.' : ''}
          hud={<>
            <div className="hud-row">
              <div className="hud-score" style={{ ['--team' as string]: teams[battingTeam].color }}><b>{teams[battingTeam].short}</b> {last ? `${last.score}/${last.wkts}` : '0/0'} <i>({oversText(live.legal)}/{last?.overs ?? rec.overs})</i></div>
              <div className="hud-score">{need !== undefined && need > 0 ? <>Need <b>{need}</b> off <b>{ballsLeft}</b></> : <>Run rate <b>{crr.toFixed(1)}</b></>}</div>
            </div>
            <div className="hud-row">
              {batNow ? <div className="hud-card"><Portrait c={PLAYER_MAP[batNow]} size="sm" /><div><b>{pname(batNow)}</b><span>{live.bats.get(batNow)?.runs ?? 0} <i>({live.bats.get(batNow)?.balls ?? 0})</i></span></div></div> : <span />}
              <div className="this-over" aria-label="This over">
                {thisOver.map((e, i) => <span key={i} className={`ballchip ${e.wicket ? 'w' : e.runs === 6 ? 'r6' : e.runs === 4 ? 'r4' : e.extra ? 'x' : ''}`}>{e.wicket ? 'W' : e.extra === 'wide' ? 'wd' : e.extra === 'noball' ? 'nb' : e.runs}</span>)}
              </div>
              {bowlNow ? <div className="hud-card right"><div><b>{pname(bowlNow)}</b><span>{bowlFig}</span></div><Portrait c={PLAYER_MAP[bowlNow]} size="sm" /></div> : <span />}
            </div>
          </>} />
      )}

      <div className="scoreboard" role="status" aria-live="off">
        {[0, 1].map((t) => {
          const s = score(t as 0 | 1);
          const f = teams[t];
          return (
            <div key={t} className={`sb-team ${t === 1 ? 'right' : ''} ${battingTeam === t ? '' : 'idle'}`} style={{ ['--team' as string]: f.color, order: t === 0 ? 0 : 2 }}>
              <span className="sb-name">{f.short} · {f.name}</span>
              <span className="sb-score">{s ? `${s.runs}/${s.wkts}` : '—'}</span>
              <span className="sb-overs">{s ? `${oversText(s.balls)} / ${s.overs} ov` : 'Yet to bat'}</span>
            </div>
          );
        })}
        <div className="sb-mid" style={{ order: 1 }}>
          {inn >= 2 ? <><b>Super Over</b>{need !== undefined && need > 0 ? `${need} needed from ${ballsLeft}` : ''}</>
            : need !== undefined && need > 0 ? <><b>{need} off {ballsLeft}</b>Need {rrr?.toFixed(2)} an over · CRR {crr.toFixed(2)}</>
              : last ? <><b>CRR {crr.toFixed(2)}</b>{rec.toss.winner === 0 ? home.short : away.short} won the toss, chose to {rec.toss.choice}</> : <><b>Toss</b>Coming up</>}
        </div>
      </div>

      {finished && outcome && (
        <section className="panel result-hero" style={{ ['--team' as string]: winner?.color }}>
          <span className="label">Result</span>
          <h1>{winner ? `${winner.name} win` : 'Shared'}</h1>
          <p className="dim" style={{ fontSize: 18 }}>{winner ? `${winner.name} ${outcome.margin}` : outcome.margin}{outcome.bonus ? ' · bonus point' : ''}</p>
          {outcome.potm && <div className="row" style={{ justifyContent: 'center' }}><Portrait c={PLAYER_MAP[outcome.potm]} size="sm" /><span>Player of the Match: <b>{pname(outcome.potm)}</b></span></div>}
          <div className="col" style={{ textAlign: 'left', width: '100%', maxWidth: 620, gap: 8 }}>
            <span className="label">Top moments</span>
            {rec.highlights.map((i) => { const e = rec.events[i]; return <div key={i} className="comm"><span className="ov">{e.bowler ? `${e.over}.${e.ball}` : ''}</span><div>{e.text}{e.notes.map((n, k) => <div key={k} className="extra">{n}</div>)}</div></div>; })}
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => { sessionStorage.removeItem(storageKey); store.endMatch(); }}>{g.season ? 'Back to the season' : 'Done'}</button>
          </div>
        </section>
      )}

      <div className="seg" role="tablist" aria-label="View"><button role="tab" aria-pressed={tab === 'live'} onClick={() => setTab('live')}>Live</button><button role="tab" aria-pressed={tab === 'card'} onClick={() => setTab('card')}>Scorecard</button></div>

      {tab === 'card' ? <Scorecard rec={rec} g={g} /> : (
        <div className="match-grid">
          <section className="panel tight">
            <div className="panel-head"><h3>Commentary</h3><span className="faint">{last ? `Over ${last.over + 1}` : ''}</span></div>
            <div className="commentary">
              {feed.map((e, i) => {
                const k = rec.events.indexOf(e);
                if (!e.bowler) return <div key={k} className="comm note">{e.text}</div>;
                const cls = e.wicket ? 'w' : e.runs === 6 ? 'r6' : e.runs === 4 ? 'r4' : '';
                return (
                  <div key={k} className={`comm ${cls}`} style={i === 0 ? undefined : { animation: 'none' }}>
                    <span className="ov">{e.over}.{e.ball}</span>
                    <div>
                      <div><span className="faint">{pname(e.bowler)} to {pname(e.batter)}: </span>{e.text}</div>
                      {e.mind && <div className="mind">{e.mind.tim !== undefined
                        ? `${DELIVERY_LABEL[e.mind.bowl]?.pace ?? e.mind.bowl} (${ACC_WORD[e.mind.acc ?? 2].toLowerCase()}) v ${SHOT_LABEL[e.mind.bat]?.label ?? e.mind.bat} (${TIM_WORD[e.mind.tim].toLowerCase()})`
                        : `Mind game: ${e.mind.bowl} v ${e.mind.bat}`}</div>}
                      {e.notes.map((n, j) => <div key={j} className="extra">{n}</div>)}
                    </div>
                  </div>
                );
              })}
              {!feed.length && <p className="faint">The players walk out under the lights…</p>}
            </div>
          </section>
          <aside className="col">
            <section className="panel tight col" style={{ gap: 10 }}>
              <span className="label">At the crease</span>
              {[striker, non].filter(Boolean).map((id, i) => {
                const b = live.bats.get(id!) ?? { runs: 0, balls: 0, fours: 0, sixes: 0 };
                return <div key={id} className="row between"><span>{pname(id!)}{i === 0 ? ' *' : ''}</span><span className="num" style={{ fontSize: 18 }}><b>{b.runs}</b> <span className="faint">({b.balls})</span></span></div>;
              })}
              <div className="faint" style={{ fontSize: 13 }}>Partnership {live.partnership.runs} ({live.partnership.balls})</div>
              {bowlerNow && <div className="row between"><span className="dim">{pname(bowlerNow.id)}</span><span className="num">{oversText(bowlerNow.balls)}-{bowlerNow.runs}-{bowlerNow.wkts}</span></div>}
              <div className="this-over" aria-label="This over">
                {thisOver.map((e, i) => <span key={i} className={`ballchip ${e.wicket ? 'w' : e.runs === 6 ? 'r6' : e.runs === 4 ? 'r4' : e.extra ? 'x' : ''}`}>{e.wicket ? 'W' : e.extra === 'wide' ? 'wd' : e.extra === 'noball' ? 'nb' : e.runs}</span>)}
              </div>
            </section>
            <section className="panel tight col" style={{ gap: 8 }}>
              <div className="row between"><span className="label">Momentum</span><span className="faint" style={{ fontSize: 12 }}>{teams[battingTeam].short} batting</span></div>
              <div className="momentum" aria-label={`Momentum ${momentum}`}><i style={{ left: momentum >= 0 ? '50%' : `${50 + momentum / 2}%`, width: `${Math.abs(momentum) / 2}%`, background: momentum >= 0 ? teams[battingTeam].color : teams[1 - battingTeam].color }} /></div>
            </section>
            <section className="panel tight">
              <span className="label">Wagon wheel · {teams[battingTeam].short}</span>
              <Wagon events={live.ev} />
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
