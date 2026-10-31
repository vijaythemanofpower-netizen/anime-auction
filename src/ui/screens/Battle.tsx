import { RaidCard } from '../components/Raid';
import { Predictions } from '../components/Predictions';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { BattleEvent, BattleInput, BattleRecord, GameState } from '../../engine/types';
import * as G from '../../engine/game';
import { getSynergy } from '../../engine/data/world';
import { getAbility } from '../../engine/data/abilities';
import { store, useApp } from '../../store/store';
import { ArenaStage, conditionOf, type LiveFighter } from '../components/Arena';
import { Emblem, Seg } from '../components/common';
import { STRATEGIES, MENTALS } from './Prep';
import { explainOutcome, reSimulate, type OutcomeReport } from '../../engine/outcome';
import { CornerPanel } from '../components/CornerPanel';
import { CoachReview } from '../components/CoachReview';
import { playEvent, speakLines, stopVoice, voiceRemainingMs } from '../sound';
import { naturalVoices, stopNaturalVoice, voicedLines } from '../voices';
import { hasSignature } from '../fx/recipes';
import { buildComic, COMIC_LENGTHS } from '../../engine/comic';
import { ComicStage, useComicHold, useComicPrep } from '../comic/ComicStage';
import { chooseMusic, music } from '../music';
import { clipKeys, onClipsChanged } from '../../store/media';
import { useRoom } from '../../online/room';


function delayFor(e: BattleEvent, hasLine: boolean): number {
  const big = e.crit || e.context?.impact === 'devastating';
  if (e.type === 'attack' || e.type === 'counter' || e.type === 'block' || e.type === 'miss') return (e.ability ? (hasSignature(e.ability) ? 1700 : 1300) : 950) + (big ? 350 : 0);
  if ((e.type === 'ability' || e.type === 'desperation') && hasSignature(e.ability)) return 2900;
  if (e.type === 'defeat') return 2700;
  if (e.type === 'heal' || (e.type === 'status' && e.status?.type === 'shield')) return 1100;
  if (e.type === 'clash') return 1900;
  if (e.type === 'rival') return 4200;
  if (e.type === 'twist') return 2600;
  if (e.type === 'banter') return 1900;
  if (e.type === 'reinforcement') return 2200;
  if (e.type === 'call') return 1500;
  if (e.type === 'corner') return 300;
  if (e.type === 'combo' && e.context?.duo) return 2600;
  if (e.type === 'knockdown') return 1700;
  if (e.type === 'parry' || e.type === 'guard_break' || e.type === 'injury' || e.type === 'get_up') return 1000;
  if (!hasLine) return e.type === 'momentum' || e.type === 'guard' ? 260 : 420;
  switch (e.type) {
    case 'intro': return 2600;
    case 'prebattle': case 'synergy': return 1500;
    case 'ability': case 'desperation': return e.ability && getAbility(e.ability).look ? 2600 : 1400;
    case 'awakening': case 'final_exchange': case 'iron_will': return 1900;
    case 'verdict': case 'conclusion': return 1500;
    default: return e.crit ? 1100 : 780;
  }
}

/** A team battle side is named after its players, e.g. "Ana & Ben". */
function teamSideName(g: GameState, input: BattleInput, id: string): string {
  const side = input.sides.find((s) => s.playerId === id);
  const owners = [...new Set(side?.fighters.map((f) => f.playerId) ?? [])];
  return owners.map((o) => g.players.find((p) => p.id === o)?.name ?? o).join(' & ') || id;
}

export function BattleView({ record, exhibition }: { record: BattleRecord; exhibition?: boolean }) {
  const g = useApp((s) => s.game)!;
  const baseSpeed = useApp((s) => s.settings.narrationSpeed);
  const sound = useApp((s) => s.settings.sound);
  const voice = useApp((s) => s.settings.voice);
  const quality = useApp((s) => s.settings.voiceQuality);
  const view = useApp((s) => s.settings.battleView);
  const aiDrawings = useApp((s) => s.settings.aiDrawings);
  const musicOn = useApp((s) => s.settings.music);
  const room = useRoom();
  // Online guests see the comic the host draws, so they use the host's comic settings.
  const remoteArt = !!(room?.role === 'guest' && room.artist?.active);
  const comicLength = useApp((s) => (remoteArt ? room!.artist!.length : s.settings.comicLength));
  const comicStyle = useApp((s) => (remoteArt ? room!.artist!.style : s.settings.comicStyle));
  const motionSetting = useApp((s) => s.settings.reducedMotion);
  const reduced = motionSetting === 'on' || (motionSetting === 'system' && typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const nv = useSyncExternalStore((f) => naturalVoices.subscribe(f), () => `${naturalVoices.status}:${naturalVoices.progress}`);
  const natural = voice && quality === 'natural' && nv.startsWith('ready');
  const skipped = useRef(false);
  const { input, result, narration } = record;
  const events = result.events;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(baseSpeed);
  const [showLog, setShowLog] = useState(false);
  const completed = useRef(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const done = idx >= events.length;
  const comic = view === 'comic';
  const script = useMemo(() => buildComic(record, g.characters, { max: COMIC_LENGTHS[comicLength], style: comicStyle }), [record, g.characters, comicLength, comicStyle]);
  // In comic view the whole fight is drawn before the bell, unless the player starts early.
  const prep = useComicPrep(script, comic && (aiDrawings || remoteArt));
  const [startEarly, setStartEarly] = useState(false);
  useEffect(() => setStartEarly(false), [record.battleId]);
  const prepping = prep.active && !startEarly && idx === 0;
  // After that, a moment still waits briefly for its drawing (a corner call can change the rest of the fight).
  const waitingArt = useComicHold(script, !done ? events[idx]?.seq ?? null : null, comic && (aiDrawings || remoteArt) && playing && !skipped.current);
  const linesBySeq = useMemo(() => {
    const m = new Map<number, typeof narration>();
    for (const l of narration) m.set(l.seq, [...(m.get(l.seq) ?? []), l]);
    return m;
  }, [narration]);

  useEffect(() => { setIdx(0); setPlaying(true); completed.current = false; skipped.current = false; }, [record.battleId]);

  // A corner moment for a person's side pauses the fight until they make a call.
  const cornerEvent = idx > 0 && !done ? events[idx - 1] : undefined;
  const online = useApp((s) => s.online);
  const cornerOpen = cornerEvent?.type === 'corner' && record.kind !== 'replay' && !skipped.current
    && input.sides[Number(cornerEvent.context?.side)]?.coach === 'human'
    // Online exhibitions are watched locally, so their corners play out by themselves.
    && !(online && record.kind !== 'tournament')
    && !(input.calls ?? []).some((c) => c.side === cornerEvent.context?.side && c.corner === cornerEvent.context?.corner);
  const cornerPlayer = cornerOpen ? g.players.find((p) => p.id === input.sides[Number(cornerEvent!.context?.side)].playerId) : undefined;
  // Your corner: you choose. Someone else's (online): wait for their call to arrive.
  const pendingCorner = cornerOpen && cornerPlayer && store.isLocalPlayer(cornerPlayer) ? cornerEvent! : null;
  const remoteCorner = cornerOpen && cornerPlayer && !store.isLocalPlayer(cornerPlayer) ? cornerEvent! : null;
  const [remoteWaitSince, setRemoteWaitSince] = useState<number | null>(null);
  useEffect(() => { setRemoteWaitSince(remoteCorner ? Date.now() : null); }, [remoteCorner?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, forceTick] = useState(0);
  useEffect(() => { if (!remoteCorner) return; const t = setInterval(() => forceTick((n) => n + 1), 1000); return () => clearInterval(t); }, [remoteCorner]);

  // Natural voices: generate this battle's lines ahead of playback.
  const voiced = useMemo(() => {
    const snaps = input.sides.flatMap((s) => [...s.fighters, ...(s.reserves ?? [])]);
    return voicedLines(narration, (name) => {
      const f = snaps.find((x) => x.name === name);
      return f ? { charId: f.charId, gender: g.characters[f.charId]?.gender, temperament: f.temperament } : undefined;
    });
  }, [narration, input, g.characters]);
  useEffect(() => {
    if (!voice || quality !== 'natural') return;
    naturalVoices.load();
    naturalVoices.resetQueue();
    // Characters' own lines first, then the commentator's big calls.
    const upcoming = voiced.filter((v) => v.seq >= (events[idx - 1]?.seq ?? 0));
    naturalVoices.prefetch([...upcoming.filter((v) => !v.narrator), ...upcoming.filter((v) => v.narrator)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiced, voice, quality, nv.startsWith('ready')]);

  // Sound and voice for each event as it plays.
  useEffect(() => {
    if (idx === 0 || skipped.current || idx > events.length) return;
    const e = events[idx - 1];
    if (sound) playEvent(e);
    if (!voice) return;
    if (natural) {
      // Lines not generated yet (early in a fight) use the basic voice instead of staying silent.
      const missed = voiced.filter((x) => x.seq === e.seq).filter((v) => !naturalVoices.play(v.key, false));
      if (missed.length) speakLines((linesBySeq.get(e.seq) ?? []).filter((l) => missed.some((m) => l.text.replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim() === m.text)), speed);
    } else speakLines(linesBySeq.get(e.seq) ?? [], speed);
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { stopVoice(); stopNaturalVoice(); music.stop(); }, []);

  // Battle music: the fighters' own music if the player added some, else a fitting built-in track.
  const [ownMusic, setOwnMusic] = useState<Set<string>>(new Set());
  useEffect(() => {
    const load = () => { void clipKeys().then((k) => setOwnMusic(new Set([...k].filter((x) => x.startsWith('bgm'))))); };
    load();
    return onClipsChanged(load);
  }, []);
  const musicChoice = useMemo(() => chooseMusic(record, g.characters, ownMusic), [record, g.characters, ownMusic]);
  // Starts at the bell (after the comic is drawn), pauses with the fight, fades out at the result.
  useEffect(() => {
    if (!musicOn) { music.stop(400); return; }
    if (done) { music.stop(2500); return; }
    if (prepping || !playing) { music.pause(); return; }
    void music.play(musicChoice);
  }, [musicOn, done, prepping, playing, musicChoice]);

  useEffect(() => {
    if (!playing || done || pendingCorner || remoteCorner || waitingArt || prepping) return;
    const e = events[idx];
    // The next moment waits until the current line has been spoken, plus a short breath,
    // so the narration is never rushed (at most 9 s, and not at all at 4x speed).
    let t: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const next = () => {
      const left = voice && speed < 4 ? voiceRemainingMs() : 0;
      if (left > 0 && Date.now() - started < 9000) t = setTimeout(next, Math.min(left, 400) + 120);
      else setIdx((i) => i + 1);
    };
    t = setTimeout(next, delayFor(e, linesBySeq.has(e.seq)) / speed);
    return () => clearTimeout(t);
  }, [idx, playing, done, speed, events, linesBySeq, pendingCorner, remoteCorner, waitingArt, prepping, voice]);

  // Music dips under speech and comes back up between lines.
  useEffect(() => {
    if (!musicOn || !voice) return;
    let ducked = false;
    const iv = setInterval(() => { const on = voiceRemainingMs() > 0; if (on !== ducked) { ducked = on; music.duck(on); } }, 150);
    return () => { clearInterval(iv); music.duck(false); };
  }, [musicOn, voice]);

  // Apply consequences once the result is shown (tournament battles only).
  useEffect(() => {
    if (done && !exhibition && record.kind === 'tournament' && g.phase === 'battle' && !completed.current) {
      completed.current = true;
      store.completeBattle(record.battleId);
    }
  }, [done, exhibition, record, g.phase]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }); }, [idx]);

  const state = useMemo(() => {
    const fs = new Map<string, LiveFighter>();
    for (const side of input.sides) for (const f of side.fighters) {
      const r = result.fighters.find((x) => x.charId === f.charId)!;
      fs.set(f.charId, { snap: f, hp: r.maxHp, maxHp: r.maxHp, st: r.maxStamina, maxSt: r.maxStamina, down: false, awakened: false, position: f.position, form: r.form ?? 1, guard: 100, injuries: [], knockdowns: 0, floored: false, staggered: false });
    }
    let momentum = 0;
    for (let i = 0; i < Math.min(idx, events.length); i++) {
      const e = events[i];
      if (e.momentum) momentum = e.momentum[0];
      if (e.actor && e.staminaDelta) { const a = fs.get(e.actor); if (a) a.st = Math.max(0, Math.min(a.maxSt, a.st + e.staminaDelta)); }
      if (e.target && e.hpAfter !== undefined) { const t = fs.get(e.target); if (t) t.hp = e.hpAfter; }
      const act = e.actor ? fs.get(e.actor) : undefined, tgt = e.target ? fs.get(e.target) : undefined;
      if (act && e.actorGuard !== undefined) { act.guard = e.actorGuard; act.staggered = false; act.floored = false; }
      if (tgt && e.guardAfter !== undefined) tgt.guard = e.guardAfter;
      if (e.type === 'awakening' && act) { act.awakened = true; if (e.hpAfter !== undefined) act.hp = e.hpAfter; }
      if (e.type === 'guard_break' && tgt) tgt.staggered = true;
      if (e.type === 'injury' && tgt && e.injury) tgt.injuries = [...tgt.injuries.filter((x) => x.part !== e.injury!.part), e.injury];
      if (e.type === 'knockdown' && tgt) { tgt.knockdowns++; tgt.floored = true; tgt.staggered = true; }
      if (e.type === 'get_up' && act) act.floored = false;
      if (e.type === 'defeat' && tgt) { tgt.down = true; tgt.floored = false; tgt.howDown = String(e.context?.how ?? ''); }
      if (e.type === 'heal' && e.context?.revive && tgt) { tgt.down = false; tgt.floored = false; tgt.howDown = undefined; }
      if (e.type === 'call' && e.context?.call === 'callback' && act && e.hpAfter !== undefined) act.hp = e.hpAfter;
      if (e.type === 'replacement' && e.actor) { fs.get(e.actor)!.position = 'front'; if (e.action === 'tag' && e.target) fs.get(e.target)!.position = 'back'; }
    }
    if (idx >= events.length) for (const r of result.fighters) { const f = fs.get(r.charId)!; f.hp = r.hp; f.st = r.stamina; f.down = r.defeated; f.floored = false; f.howDown = r.howDown; }
    return { fs, momentum };
  }, [idx, events, input, result]);

  const cur = events[Math.max(0, Math.min(idx, events.length) - 1)];
  const sideNames = useMemo(() => input.sides.map((s) => g.players.find((p) => p.id === s.playerId)?.name ?? (s.playerId === 'raid-team' ? 'Your party' : s.playerId.startsWith('team-') ? teamSideName(g, input, s.playerId) : s.fighters[0]?.name ?? 'Side')) as [string, string], [input, g.players]);
  const shownLines = narration.filter((l) => l.seq <= (cur?.seq ?? 0) && idx > 0);
  const pname = (id: string) => g.players.find((p) => p.id === id);

  return (
    <div className="col" style={{ gap: 16 }}>
      {exhibition && (
        <div className="panel row" style={{ justifyContent: 'space-between', borderColor: 'var(--cyan)' }}>
          <span><strong>{record.kind === 'raid' ? `⚔ Raid: ${input.sides[1].fighters[0].name}` : record.kind === 'team' ? '🤝 Team battle' : record.kind === 'replay' ? 'Exact replay' : 'Fresh rematch (exhibition)'}</strong> <span className="faint">· seed {input.seed} · engine {input.engineVersion} · does not affect the tournament</span></span>
          <button className="btn sm" onClick={() => store.closeExhibition()}>Close</button>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
        {[0, 1].map((side) => {
          const p = pname(input.sides[side].playerId);
          return (
            <div key={side} className="row" style={{ gap: 6, flexDirection: side === 1 ? 'row-reverse' : 'row', textAlign: side === 1 ? 'right' : 'left' }}>
              {p && <Emblem p={p} size={26} />}
              <div>
                <strong>{p?.name ?? sideNames[side]}</strong>
                <div className="faint">{idx > 2 ? `${STRATEGIES.find((s) => s.v === input.sides[side].strategy)?.label} · ${MENTALS.find((s) => s.v === input.sides[side].mental)?.label}` : 'Strategy hidden until the bell'}
                  {input.sides[side].synergies.length > 0 && idx > 3 ? ` · ✦ ${input.sides[side].synergies.map((x) => getSynergy(x)?.name).join(', ')}` : ''}</div>
              </div>
            </div>
          );
        })}
      </div>
      {comic
        ? <ComicStage record={record} script={script} cur={idx > 0 ? cur : null} done={done} characters={g.characters} waiting={waitingArt && !prepping} reduced={reduced} aiDrawings={aiDrawings} remoteArt={remoteArt} manga={comicStyle === 'manga'} prep={prepping ? prep : undefined} onStartNow={() => setStartEarly(true)} />
        : <ArenaStage record={record} cur={idx > 0 ? cur : null} done={done} fighters={state.fs} momentum={state.momentum} players={g.players} characters={g.characters} />}
      {remoteCorner && cornerPlayer && (
        <div className="panel row" style={{ justifyContent: 'space-between', borderColor: 'var(--warn)' }}>
          <span><span className="spinner" style={{ display: 'inline-block', width: 14, height: 14, verticalAlign: 'middle', marginRight: 8 }} />Waiting for <strong>{cornerPlayer.name}</strong>&apos;s corner call…</span>
          {!store.isGuest() && remoteWaitSince && Date.now() - remoteWaitSince > 20_000 && (
            <button className="btn sm" onClick={() => store.makeCall(record, { side: Number(remoteCorner.context?.side) as 0 | 1, corner: Number(remoteCorner.context?.corner), kind: 'none' })}>Let them fight on</button>
          )}
        </div>
      )}
      {pendingCorner && <CornerPanel e={pendingCorner} record={record} fighters={state.fs} players={g.players} characters={g.characters} onCall={(c) => store.makeCall(record, c)} />}

      <Predictions record={record} idx={idx} done={done} gameId={g.id} active={!prepping && !skipped.current && record.kind !== 'replay'}
        sideNames={sideNames} />
      <div className="row battle-controls" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <button className="btn primary" onClick={() => setPlaying((p) => !p)} disabled={done} aria-label={playing ? 'Pause' : 'Resume'}>{playing ? '❚❚ Pause' : '▶ Resume'}</button>
          <button className="btn" onClick={() => { setIdx(0); setPlaying(true); }}>↺ Replay</button>
          <button className="btn" onClick={() => { skipped.current = true; stopVoice(); setIdx(events.length); }} disabled={done}>Skip to results</button>
          <button className={`btn ${sound ? 'active' : ''}`} onClick={() => store.updateSettings({ sound: !sound })} aria-pressed={sound} title="Sound effects">{sound ? '🔊' : '🔈'} Sound</button>
          <button className={`btn ${musicOn ? 'active' : ''}`} onClick={() => store.updateSettings({ music: !musicOn })} aria-pressed={musicOn}
            title={musicChoice.kind === 'own' ? `Playing ${musicChoice.label}` : `Playing "${musicChoice.track.name}". Add a character's own music from their card (Your sounds).`}>🎵 Music{musicOn ? '' : ' off'}</button>
          <button className={`btn ${voice ? 'active' : ''}`} onClick={() => { if (voice) { stopVoice(); stopNaturalVoice(); } void store.updateSettings({ voice: !voice }); }} aria-pressed={voice} title="Commentator and character voices">🎙 Voice{voice ? '' : ' off'}</button>
          {voice && (
            <button className={`btn ${quality === 'natural' ? 'active' : ''}`} aria-pressed={quality === 'natural'}
              title={quality === 'natural' ? 'Natural voices on. Click to use the basic system voice.' : 'Download natural voices (about 90 MB, once) so every character has their own voice'}
              onClick={() => { stopVoice(); stopNaturalVoice(); void store.updateSettings({ voiceQuality: quality === 'natural' ? 'system' : 'natural' }); }}>
              ✨ {quality !== 'natural' ? 'Natural voices' : nv.startsWith('loading') ? `Downloading voices ${nv.split(':')[1]}%` : nv.startsWith('error') ? 'Voices failed (using basic)' : nv.startsWith('ready') ? 'Natural voices' : 'Natural voices…'}
            </button>
          )}
          <button className="btn" onClick={() => store.updateSettings({ battleView: comic ? 'arena' : 'comic' })} title="Switch between the comic and the classic arena">{comic ? '🎬 Arena view' : '📖 Comic view'}</button>
          <button className={`btn ${showLog ? 'active' : ''}`} onClick={() => setShowLog((s) => !s)}>Event history</button>
        </div>
        <Seg value={speed} onChange={setSpeed} label="Narration speed" options={[{ v: 0.5, label: '0.5×' }, { v: 1, label: '1×' }, { v: 2, label: '2×' }, { v: 4, label: '4×' }]} />
      </div>

      <div className={showLog ? 'grid grid-2' : ''}>
        <div className="panel">
          <h3>Commentary</h3>
          <div className="narration" ref={feedRef} aria-live="polite">
            {shownLines.map((l, i) => (
              <div key={i} className={`line ${l.tone}`}>{l.speaker !== 'narrator' && <span className="who">{l.speaker}:</span>}{l.speaker !== 'narrator' ? `“${l.text}”` : l.text}</div>
            ))}
            {!shownLines.length && <div className="faint">The crowd settles in…</div>}
          </div>
        </div>
        {showLog && (
          <div className="panel">
            <h3>Verified event log</h3>
            <div className="event-log">
              {events.slice(0, Math.max(1, idx)).map((e) => (
                <div key={e.id}>#{e.seq} t{e.turn} [{e.type}] {e.explanation}{e.response ? ` (${e.response}${e.context?.impact ? `, ${e.context.impact}` : ''})` : ''}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {done && record.kind === 'raid' && g.raids?.find((r) => r.battleId === record.battleId) && <RaidCard r={g.raids.find((r) => r.battleId === record.battleId)!} g={g} />}
      {done && record.kind === 'team' && (() => {
        const t = g.teamBattles?.find((x) => x.battleId === record.battleId);
        if (!t) return null;
        const win = t.winner === 'A' ? t.teamA : t.teamB, lose = t.winner === 'A' ? t.teamB : t.teamA;
        const nm = (ids: string[]) => ids.map((id) => g.players.find((p) => p.id === id)?.name ?? id).join(' & ');
        return <RaidCard g={g} r={{ ...t, bossId: '', bossName: nm(lose), won: true, title: `Team ${t.winner} wins: ${nm(win)}` }} />;
      })()}
      {done && <Verdict record={record} exhibition={exhibition} />}
    </div>
  );
}

function Verdict({ record, exhibition }: { record: BattleRecord; exhibition?: boolean }) {
  const g = useApp((s) => s.game)!;
  const { input, result } = record;
  const w = result.winnerSide;
  const l = (1 - w) as 0 | 1;
  const pn = (id: string) => g.players.find((p) => p.id === id)?.name ?? (id === 'raid-team' ? 'Your party' : id === 'raid-boss' ? input.sides[1].fighters[0]?.name ?? 'The boss' : id.startsWith('team-') ? teamSideName(g, input, id) : id);
  const fname = (id: string) => input.sides.flatMap((s) => s.fighters).find((f) => f.charId === id)?.name ?? id;
  const winners = result.fighters.filter((f) => f.side === w);
  const losers = result.fighters.filter((f) => f.side === l);
  const avgPct = winners.reduce((s, f) => s + f.hp / f.maxHp, 0) / winners.length;
  const winDowns = winners.reduce((s, f) => s + (f.knockdowns ?? 0), 0);
  const loseDowns = losers.reduce((s, f) => s + (f.knockdowns ?? 0), 0);
  const winInj = winners.reduce((s, f) => s + (f.injuries?.length ?? 0), 0);
  const difficulty = winDowns > 0 || avgPct < 0.3 ? 'Razor-thin' : avgPct > 0.6 && winInj === 0 ? 'Dominant' : 'Hard-fought';
  const crits = result.fighters.reduce((s, f) => s + f.crits, 0);
  const abilities = result.fighters.reduce((s, f) => s + f.abilitiesUsed, 0);
  const awak = result.fighters.filter((f) => f.awakened).map((f) => fname(f.charId));
  const hitsW = winners.reduce((s, f) => s + (f.cleanHits ?? 0), 0), hitsL = losers.reduce((s, f) => s + (f.cleanHits ?? 0), 0);
  const howList = losers.map((f) => f.howDown).filter(Boolean);
  const finish = howList.includes('finisher') ? 'put away with a finishing move' : result.decision === 'stoppage' ? 'stopped, too hurt to continue' : 'knocked out';
  const explanation = result.decision === 'judges'
    ? `Nobody was finished within ${result.turns} actions; the judges scored clean hits (${hitsW} to ${hitsL}), knockdowns and injuries.`
    : `${pn(input.sides[w].playerId)}'s side landed ${hitsW} clean hits to ${hitsL}${loseDowns ? `, scored ${loseDowns} knockdown${loseDowns > 1 ? 's' : ''}` : ''} and the last opponent was ${finish}${winDowns ? `, despite being knocked down ${winDowns === 1 ? 'once' : `${winDowns} times`}` : ''}.`;
  const showResults = g.phase === 'results' && !exhibition && !store.isGuest();
  return (
    <div className="panel reveal-anim col" style={{ gap: 14, borderColor: 'var(--gold)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow">Final verdict</div>
          <h2 style={{ color: 'var(--gold)' }}>{pn(input.sides[w].playerId)} wins!</h2>
          <div className="muted">{explanation}</div>
        </div>
        {showResults && <button className="btn gold lg" onClick={() => store.act((d) => G.continueAfterResults(d))}>Continue →</button>}
        {exhibition && <button className="btn" onClick={() => store.closeExhibition()}>Back</button>}
      </div>
      <div className="grid grid-3" style={{ gap: 10 }}>
        <Stat label="Winner" value={`${pn(input.sides[w].playerId)} (${winners.map((f) => fname(f.charId)).join(', ')})`} />
        <Stat label="Loser" value={`${pn(input.sides[l].playerId)} (${losers.map((f) => fname(f.charId)).join(', ')})`} />
        <Stat label="Decision" value={result.decision === 'ko' ? (howList.includes('finisher') ? 'Knockout (finishing move)' : 'Knockout') : result.decision === 'stoppage' ? 'Stoppage' : "Judges' decision"} />
        <Stat label="Battle type" value={input.mode === 'solo' ? 'Solo Duel 1v1' : input.mode === 'tag' ? 'Tag Team 2v2' : `Squad ${input.sides[0].fighters.length}v${input.sides[1].fighters.length}`} />
        <Stat label="Duration" value={`${result.turns} actions`} />
        <Stat label="Difficulty" value={difficulty} />
        <Stat label="Critical hits" value={String(crits)} />
        <Stat label="Abilities used" value={String(abilities)} />
        <Stat label="Momentum swings" value={String(result.momentumSwings)} />
        <Stat label="Turning point" value={result.turningPoint ?? 'Led from start to finish'} />
        <Stat label="Standout performance" value={result.standout ? `${fname(result.standout)} — ${result.fighters.find((f) => f.charId === result.standout)!.cleanHits ?? 0} clean hits` : '—'} />
        <Stat label="Awakenings" value={awak.length ? awak.join(', ') : 'None'} />
      </div>
      <WhatDecided record={record} names={[pn(input.sides[0].playerId), pn(input.sides[1].playerId)]} />
      {record.kind !== 'replay' && <CoachReview record={record} g={g} />}
      <div className="table-wrap">
        <table className="standings">
          <thead><tr><th>Fighter</th><th>Finished</th><th>Clean hits</th><th>Knocked down</th><th>Injuries</th><th>Crits</th>{!exhibition && <th>Aftermath</th>}</tr></thead>
          <tbody>
            {result.fighters.map((f) => {
              const fx = record.postEffects.find((p) => p.charId === f.charId);
              return (
                <tr key={f.charId} style={{ color: f.side === w ? 'var(--text)' : 'var(--text-dim)' }}>
                  <td>{fname(f.charId)}{f.defeated ? ' ✕' : ''}</td>
                  <td>{f.defeated ? HOW[f.howDown ?? 'knockout'] : conditionOf(f).label}</td><td>{f.cleanHits ?? 0}</td><td>{f.knockdowns ?? 0}</td><td>{f.injuries?.length ? f.injuries.map((i) => i.label).join(', ') : '—'}</td><td>{f.crits}</td>
                  {!exhibition && <td className="faint">{fx ? [fx.fatigueDelta ? `+${fx.fatigueDelta} fatigue` : '', fx.injury ? `injury: ${fx.injury.name}` : '', `+${fx.xpGain} XP`, fx.evolved ? `EVOLVED → ${getAbility(fx.unlocked!).name} unlocked` : ''].filter(Boolean).join(' · ') : ''}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!exhibition && <div className="row"><button className="btn sm" onClick={() => store.replay(record.battleId)}>Exact replay</button><button className="btn sm" onClick={() => store.rematch(record.battleId)}>Fresh rematch (exhibition)</button></div>}
      <div className="faint">Seed {input.seed} · engine {input.engineVersion} · event hash {result.hash}. Every statistic above comes from the engine&apos;s event log.</div>
    </div>
  );
}

const HOW: Record<string, string> = { knockout: 'Knocked out', finisher: 'Finished by an ultimate', stoppage: 'Stopped (too hurt)', collapse: 'Collapsed' };

function Stat({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}><div className="label">{label}</div><div style={{ fontWeight: 600, fontSize: 14 }}>{value}</div></div>;
}

const RESIMS = 60;

/** Re-runs the identical matchup with different luck and lists what decided it. */
function WhatDecided({ record, names }: { record: BattleRecord; names: [string, string] }) {
  const [report, setReport] = useState<OutcomeReport | null>(null);
  useEffect(() => {
    setReport(null);
    const t = setTimeout(() => {
      const wins = reSimulate(record, RESIMS);
      setReport(explainOutcome(record, wins, RESIMS, names));
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.battleId]);
  const w = record.result.winnerSide;
  if (!report) return <div className="panel tight faint">Re-running this matchup {RESIMS} times to see what decided it…</div>;
  const pct = Math.round((report.winnerWins / report.sims) * 100);
  const label = report.verdict === 'expected' ? 'Expected result' : report.verdict === 'toss-up' ? 'Coin-flip matchup' : 'UPSET!';
  return (
    <div className="panel tight col" style={{ gap: 8, borderColor: report.verdict === 'upset' ? 'var(--magenta)' : 'var(--line)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>What decided it</h3>
        <span className="tag" style={{ color: report.verdict === 'upset' ? 'var(--magenta)' : report.verdict === 'toss-up' ? 'var(--warn)' : 'var(--good)' }}>{label}</span>
      </div>
      <div>
        <div className="faint" style={{ marginBottom: 4 }}>Same fighters, same preparation, {report.sims} re-runs with different luck: <strong style={{ color: 'var(--text)' }}>{names[w]} wins {pct}%</strong>, {names[1 - w]} wins {100 - pct}%.</div>
        <div className="hp" style={{ height: 10 }}><span style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--gold), #f97316)' }} /></div>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 14 }}>
        {report.factors.map((f, i) => (
          <li key={i} style={{ color: f.side === null ? 'var(--text-dim)' : f.side === w ? 'var(--text)' : 'var(--text-dim)' }}>
            <span style={{ color: f.side === null ? 'var(--text-faint)' : f.side === w ? 'var(--good)' : 'var(--warn)' }}>{f.side === null ? '•' : f.side === w ? '▲' : '▼'}</span> {f.text}
          </li>
        ))}
      </ul>
      <div className="faint">▲ helped the winner · ▼ helped the loser. Stats, form, type matchups, arena, preparation, condition and luck all play a part; no fighter wins every time.</div>
    </div>
  );
}
