// The comic battle screen: the fight plays out as manga panels that slam onto
// the page as the engine's events are reached. Panels are drawn by the local
// anime model when it is running; until a drawing arrives (or without the
// model) the panel uses the character's portrait in comic style.
import { store } from '../../store/store';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { BattleEvent, BattleRecord, PublicCharacter } from '../../engine/types';
import { factsFor } from '../../engine/data/characterFacts';
import type { ComicPanel, ComicScript, PanelSize } from '../../engine/comic';
import { hashString } from '../../engine/rng';
import { CharArt } from '../components/Portrait';
import { drawer } from './drawing';

const COLS = 6, ROWS = 3;
const SHAPE: Record<PanelSize, [number, number]> = { small: [2, 1], wide: [4, 1], tall: [2, 2], splash: [6, 1] };
// A panel that doesn't fit on the page tries a smaller frame before starting a new page.
const SHRINK: Record<PanelSize, PanelSize[]> = { splash: ['wide', 'small'], wide: ['small'], tall: ['small'], small: [] };

export interface Placed { panel: ComicPanel; col: number; row: number; w: number; h: number }

/** Packs panels onto pages of a 6x3 grid, in reading order. */
export function paginate(panels: ComicPanel[]): Placed[][] {
  const pages: Placed[][] = [];
  let page: Placed[] = [];
  let grid: boolean[][] = empty();
  function empty() { return Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false)); }
  const spot = (w: number, h: number): [number, number] | null => {
    // Never place before the last panel, so the page still reads left to right, top to bottom.
    const last = page[page.length - 1];
    const start = last ? last.row * COLS + last.col : 0;
    for (let i = start; i < ROWS * COLS; i++) {
      const r = Math.floor(i / COLS), c = i % COLS;
      if (r + h > ROWS || c + w > COLS) continue;
      let ok = true;
      for (let y = r; y < r + h && ok; y++) for (let x = c; x < c + w; x++) if (grid[y][x]) { ok = false; break; }
      if (ok) return [r, c];
    }
    return null;
  };
  for (const p of panels) {
    let placed = false;
    for (const size of [p.size, ...SHRINK[p.size]]) {
      const [w, h] = SHAPE[size];
      const at = spot(w, h);
      if (!at) continue;
      for (let y = at[0]; y < at[0] + h; y++) for (let x = at[1]; x < at[1] + w; x++) grid[y][x] = true;
      page.push({ panel: p, row: at[0], col: at[1], w, h });
      placed = true;
      break;
    }
    if (!placed) {
      pages.push(page);
      page = []; grid = empty();
      const [w, h] = SHAPE[p.size];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid[y][x] = true;
      page.push({ panel: p, row: 0, col: 0, w, h });
    }
  }
  if (page.length) pages.push(page);
  return pages;
}

export function useDrawer() {
  return useSyncExternalStore((f) => drawer.subscribe(f), () => drawer.status + drawer.model);
}

/** The next event waits for its panel's drawing (up to a limit) so the comic keeps up with the fight. */
export function useComicHold(script: ComicScript, nextSeq: number | null, enabled: boolean): boolean {
  const [, bump] = useState(0);
  useEffect(() => drawer.subscribe(() => bump((n) => n + 1)), []);
  const since = useRef<{ seq: number; t: number } | null>(null);
  const [expired, setExpired] = useState<number | null>(null);
  const keys = nextSeq === null ? [] : script.panels.filter((p) => p.seq === nextSeq).flatMap((p) => p.drawings.map((d) => d.key));
  const waiting = enabled && keys.some((k) => drawer.state(k) === 'pending') && expired !== nextSeq;
  useEffect(() => {
    if (!waiting || nextSeq === null) { since.current = null; return; }
    if (since.current?.seq !== nextSeq) since.current = { seq: nextSeq, t: Date.now() };
    const left = 40_000 - (Date.now() - since.current.t);
    const t = setTimeout(() => setExpired(nextSeq), Math.max(0, left));
    return () => clearTimeout(t);
  }, [waiting, nextSeq]);
  return waiting;
}

/** Before the bell: is the artist still drawing this fight, and how far along? */
export function useComicPrep(script: ComicScript, enabled: boolean): { active: boolean; done: number; total: number } {
  const [, bump] = useState(0);
  useEffect(() => drawer.subscribe(() => bump((n) => n + 1)), []);
  const keys = script.panels.flatMap((p) => p.drawings.map((d) => d.key));
  const done = keys.filter((k) => { const st = drawer.state(k); return st === 'done' || st === 'failed'; }).length;
  const live = drawer.status === 'ready' || drawer.status === 'checking' || drawer.status === 'off';
  return { active: enabled && live && done < keys.length, done, total: keys.length };
}

export function ComicStage({ record, script, cur, done, characters, waiting, reduced, aiDrawings, manga, prep, onStartNow, remoteArt }: {
  record: BattleRecord; script: ComicScript; cur: BattleEvent | null; done: boolean;
  characters: Record<string, PublicCharacter>; waiting: boolean; reduced: boolean; aiDrawings: boolean; manga?: boolean;
  /** Online guest: the host draws the panels and shares them, so nothing is drawn here. */
  remoteArt?: boolean;
  /** Set while the whole fight is being drawn before it plays. */
  prep?: { done: number; total: number }; onStartNow?: () => void;
}) {
  useDrawer();
  const facts = useMemo(() => fightFacts(record, characters), [record, characters]);
  const [, bump] = useState(0);
  useEffect(() => drawer.subscribe(() => bump((n) => n + 1)), []);
  const [readAll, setReadAll] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  // Ask for every drawing up front (in story order). A corner call rewrites the
  // rest of the fight, so drawings for panels that no longer happen are dropped.
  const asked = useRef<string[]>([]);
  useEffect(() => {
    const keys = script.panels.flatMap((p) => p.drawings.map((d) => d.key));
    const stale = asked.current.filter((k) => !keys.includes(k));
    asked.current = keys;
    if (stale.length) void drawer.cancel(stale);
    let live = true;
    void drawer.restore(keys).then(async () => {
      if (live && aiDrawings && !remoteArt && (await drawer.check()) === 'ready' && live) { drawer.quality = store.getState().settings.drawQuality ?? 'fast'; drawer.request(script.panels.flatMap((p) => p.drawings)); }
    });
    return () => { live = false; };
  }, [script, aiDrawings, remoteArt]);
  useEffect(() => () => { void drawer.cancel(asked.current); }, []);

  const pages = useMemo(() => paginate(script.panels), [script]);
  const seq = cur?.seq ?? -1;
  const shown = done ? script.panels.length : script.panels.filter((p) => p.seq <= seq).length;
  const current = shown > 0 ? script.panels[shown - 1] : null;
  let pageIdx = 0;
  for (let i = 0, n = 0; i < pages.length; i++) { n += pages[i].length; if (shown <= n) { pageIdx = i; break; } pageIdx = i; }
  const at = (pl: Placed) => ({ gridColumn: `${pl.col + 1} / span ${pl.w}`, gridRow: `${pl.row + 1} / span ${pl.h}` });
  const page = pages[pageIdx] ?? [];

  // Shake the page on hits that land.
  const shake = cur && !done && (cur.type === 'knockdown' || cur.type === 'clash' || ((cur.type === 'attack' || cur.type === 'counter') && (cur.crit || cur.context?.impact === 'devastating' || cur.context?.impact === 'heavy'))) ? (cur.type === 'attack' || cur.type === 'counter' ? 'shake' : 'shake-big') : '';
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el || reduced) return;
    el.classList.remove('shake', 'shake-big');
    if (shake) { void el.offsetWidth; el.classList.add(shake); }
  }, [cur?.seq, shake, reduced]);

  return (
    <div className={`comic-wrap${manga ? ' manga' : ''}`}>
      <div className="comic-top">
        <span className="comic-title">{record.input.mode === 'solo' ? 'SOLO DUEL' : record.input.mode === 'tag' ? 'TAG TEAM' : 'SQUAD BATTLE'} · PAGE {pageIdx + 1}/{pages.length}</span>
        <ArtistStatus remote={remoteArt} />
      </div>
      <div ref={pageRef} className={`comic-page${reduced ? ' still' : ''}`}>
        {page.map((pl) => {
          const p = pl.panel;
          const i = script.panels.indexOf(p);
          // While drawing, every panel stays blank: nothing is revealed until the comic is ready.
          if (prep || i >= shown) return <div key={p.id} className="cpanel blank" style={at(pl)} />;
          return <Panel key={p.id} p={p} place={at(pl)} characters={characters} live={p === current && !done ? cur : null} current={p === current && !done} />;
        })}
        {prep && <PrepScreen script={script} prep={prep} onStartNow={onStartNow} remote={remoteArt} facts={facts} />}
        {waiting && <div className="comic-waiting"><span className="pen" />The artist is drawing the next panel…</div>}
      </div>
      {done && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
          <button className="btn sm" onClick={() => setReadAll((v) => !v)}>{readAll ? 'Hide the full comic' : `📖 Read the whole comic (${pages.length} page${pages.length > 1 ? 's' : ''})`}</button>
        </div>
      )}
      {done && readAll && (
        <div className="col" style={{ gap: 14, marginTop: 12 }}>
          {pages.map((pg, i) => (
            <div key={i} className="comic-page still">
              {pg.map((pl) => <Panel key={pl.panel.id} p={pl.panel} place={at(pl)} characters={characters} live={null} current={false} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const secondsPerDrawing = () => (drawer.quality === 'best' ? 27 : 9);

/** Facts about the fighters in this fight: hand-written for built-in characters, otherwise from their profile. */
export function fightFacts(record: BattleRecord, characters: Record<string, PublicCharacter>): Array<{ who: string; text: string; image?: string }> {
  const ids = [...new Set(record.input.sides.flatMap((s) => [...s.fighters, ...(s.reserves ?? [])]).map((f) => f.charId))];
  const out: Array<{ who: string; text: string; image?: string }> = [];
  for (const id of ids) {
    const c = characters[id];
    if (!c) continue;
    const lines = factsFor(c);
    for (const text of lines) out.push({ who: c.name, text, image: c.imageUrl });
  }
  // Interleave the fighters so facts alternate between them.
  return out.sort((a, b) => out.filter((x) => x.who === a.who).indexOf(a) - out.filter((x) => x.who === b.who).indexOf(b));
}

function FactCard({ facts }: { facts: ReturnType<typeof fightFacts> }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (facts.length < 2) return; const t = setInterval(() => setI((n) => (n + 1) % facts.length), 7000); return () => clearInterval(t); }, [facts.length]);
  const f = facts[i % Math.max(1, facts.length)];
  if (!f) return null;
  return (
    <div className="fact-card" key={i}>
      {f.image && <img src={f.image} alt="" referrerPolicy="no-referrer" />}
      <div><div className="fact-who">Did you know? · {f.who}</div><p>{f.text}</p></div>
    </div>
  );
}

/** "Drawing your fight": the finished panels appear one by one until the comic is ready. */
function PrepScreen({ script, prep, onStartNow, remote, facts }: { script: ComicScript; prep: { done: number; total: number }; onStartNow?: () => void; remote?: boolean; facts: ReturnType<typeof fightFacts> }) {
  const urls = script.panels.flatMap((p) => p.drawings.map((d) => drawer.url(d.key))).filter((u): u is string => !!u);
  const left = Math.max(0, prep.total - prep.done) * secondsPerDrawing();
  const pct = prep.total ? Math.round((prep.done / prep.total) * 100) : 0;
  return (
    <div className="comic-prep" role="status" aria-live="polite">
      {/* Finished panels stay face down: the fight is a surprise until it plays. */}
      <div className="prep-thumbs sealed">
        {urls.map((u, i) => <div key={u} className="sealed-card" style={{ ['--r' as string]: `${((i * 37) % 13) - 6}deg` } as CSSProperties}><span>{i + 1}</span></div>)}
      </div>
      <div className="prep-card">
        <div className="prep-title">{remote ? 'THE HOST IS DRAWING YOUR FIGHT…' : drawer.status === 'ready' ? 'DRAWING YOUR FIGHT…' : 'FINDING THE ARTIST…'}</div>
        <div className="prep-sub">{prep.done} of {prep.total} drawings · about {left >= 60 ? `${Math.ceil(left / 60)} min` : `${left} s`} left</div>
        <div className="prep-bar"><span style={{ width: `${pct}%` }} /></div>
        {onStartNow && <button className="btn sm" onClick={onStartNow}>Start now (finish drawing during the fight)</button>}
      </div>
      <FactCard facts={facts} />
    </div>
  );
}

function ArtistStatus({ remote }: { remote?: boolean }) {
  if (remote) return <span className="artist ready" title="The host's computer draws this comic and shares it with the room">✒ Drawn live by the host</span>;
  const s = drawer.status;
  const label = s === 'ready' ? `✒ Drawing with ${drawer.model.replace(/\.safetensors$/, '')}` : s === 'checking' ? 'Looking for the drawing app…'
    : s === 'no-model' ? 'Drawing app found, but no anime model'
      // Browsers stop a public website from reaching programs on this PC, so drawings need the local version.
      : location.hostname.endsWith('github.io') ? 'Comic style: for real drawings, open the game with Start Game.bat on the PC that has the drawing app'
        : 'Comic style (start the drawing app for real drawings)';
  return <span className={`artist ${s}`} title={s === 'ready' ? 'Panels are drawn on this computer for free' : 'Double-click Start Game.bat, or Start Drawing AI.bat, to turn on real drawings'}>{label}</span>;
}

function Panel({ p, place, characters, live, current }: { p: ComicPanel; place: CSSProperties; characters: Record<string, PublicCharacter>; live: BattleEvent | null; current: boolean }) {
  const h = hashString(p.id + p.seq);
  const tilt = ((h % 7) - 3) * 0.6;
  const style = { ...place, ['--tilt' as string]: `${tilt}deg`, ['--kx' as string]: `${(h % 5) - 2}%`, ['--ky' as string]: `${((h >> 3) % 5) - 2}%` } as CSSProperties;
  const two = p.drawings.length === 2;
  return (
    <div className={`cpanel ${p.size} shot-${p.shot}${current ? ' current' : ''}${two ? ' two' : ''}`} style={style}>
      {p.drawings.map((d, j) => {
        const url = drawer.url(d.key);
        const who = j === 0 ? p.focus : p.other!;
        const c = characters[who];
        return (
          <div key={d.key} className={`cart${two ? (j === 0 ? ' half-a' : ' half-b') : ''}${url ? ' drawn' : ' sketch'}`}>
            {url ? <img src={url} alt="" draggable={false} /> : c ? <div className="frame" style={sketchFrame(p, j, h)}><CharArt c={c} /></div> : null}
            {!url && <div className="halftone" />}
            {!url && drawer.state(d.key) === 'pending' && <span className="drawing-tag">drawing…</span>}
          </div>
        );
      })}
      {two && <div className="vs-slash" />}
      {(p.shot === 'strike' || p.shot === 'finisher' || p.shot === 'charge' || p.shot === 'awaken' || p.shot === 'clash') && <div className="speedlines" />}
      {p.caption && <div className="caption">{p.caption}</div>}
      {p.sfx && <div className="sfx" key={p.id}>{p.sfx}</div>}
      {p.balloon && !live && <div className={`balloon${p.shot === 'taunt' ? ' spiky' : ''}`}>{p.balloon}</div>}
      {live && <LiveOverlay e={live} />}
    </div>
  );
}

// Without the drawing app every panel falls back to the same portrait, so each one
// is framed like a different shot: a close-up crops the face, a strike leans in,
// a knockdown tips over, and every panel picks its own crop and facing.
const FRAMING: Partial<Record<ComicPanel['shot'], { zoom: [number, number]; y: [number, number]; rot?: number }>> = {
  versus: { zoom: [1.9, 2.3], y: [12, 22] }, taunt: { zoom: [1.7, 2.1], y: [14, 24] }, injury: { zoom: [1.6, 2], y: [18, 30] },
  strike: { zoom: [1.25, 1.6], y: [20, 40], rot: 6 }, impact: { zoom: [1.4, 1.8], y: [18, 34], rot: -9 }, clash: { zoom: [1.3, 1.6], y: [20, 32] },
  charge: { zoom: [1.05, 1.25], y: [25, 45] }, awaken: { zoom: [1.1, 1.35], y: [20, 40] }, finisher: { zoom: [1.35, 1.7], y: [18, 32], rot: 4 },
  knockdown: { zoom: [1.15, 1.4], y: [30, 50], rot: -78 }, block: { zoom: [1.2, 1.5], y: [22, 38], rot: -3 }, dodge: { zoom: [1.1, 1.35], y: [25, 45], rot: 12 },
  establish: { zoom: [1, 1.1], y: [30, 45] }, victory: { zoom: [1, 1.15], y: [25, 40] },
};
function sketchFrame(p: ComicPanel, j: number, h: number): CSSProperties {
  const f = FRAMING[p.shot] ?? { zoom: [1.1, 1.4], y: [20, 40] };
  const r = (k: number) => ((h >> k) % 1000) / 1000;
  const zoom = f.zoom[0] + (f.zoom[1] - f.zoom[0]) * r(2);
  const x = 30 + r(5) * 40, y = f.y[0] + (f.y[1] - f.y[0]) * r(9);
  const flip = (h >> (j + 12)) & 1 ? -1 : 1;
  return { ['--fz' as string]: zoom.toFixed(2), ['--fx' as string]: `${x.toFixed(0)}%`, ['--fy' as string]: `${y.toFixed(0)}%`, ['--ff' as string]: String(j === 1 ? -1 : flip), ['--fr' as string]: `${(f.rot ?? 0) + (r(14) - 0.5) * 6}deg` } as CSSProperties;
}

const LIVE_WORD: Partial<Record<BattleEvent['type'], string>> = { miss: 'WHOOSH', block: 'KLANG!', parry: 'PARRY!', guard_break: 'CRACK!', knockdown: 'DOWN!', get_up: 'GETS UP!', defeat: 'K.O.!', awakening: 'AWAKENING!', iron_will: 'IRON WILL!', verdict: 'VICTORY!' };

/** What is happening right now, drawn over the newest panel. */
function LiveOverlay({ e }: { e: BattleEvent }) {
  let word = LIVE_WORD[e.type];
  if ((e.type === 'attack' || e.type === 'counter') && !e.context?.environmental) {
    const impact = String(e.context?.impact ?? '');
    word = e.crit ? 'CRITICAL!' : impact === 'devastating' ? 'DOOM!' : impact === 'heavy' ? 'WHAM!' : impact === 'glancing' ? 'tsk' : e.type === 'counter' ? 'COUNTER!' : 'POW!';
  }
  if (e.type === 'defeat' && e.context?.how === 'stoppage') word = 'STOPPED!';
  const plot = e.type === 'twist' && String(e.context?.twist).startsWith('plot-');
  if (plot) word = 'PLOT TWIST!';
  const line = e.type === 'banter' ? String(e.context?.line ?? '') : e.type === 'call' ? String(e.context?.shout ?? '') : e.type === 'twist' ? String(e.context?.title ?? '') : '';
  return (
    <div className="live" key={e.seq}>
      {word && (e.type === 'defeat' || e.type === 'verdict' || plot) && <div className={`live-word big${plot ? ' plot' : ''}`}>{word}</div>}
      {line && <div className={`balloon${e.context?.kind === 'mock' ? ' spiky' : ''}`}>{line}</div>}
    </div>
  );
}
