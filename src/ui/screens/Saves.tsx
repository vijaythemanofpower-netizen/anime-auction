import { useEffect, useRef } from 'react';
import { store, useApp } from '../../store/store';

const PHASE_LABEL: Record<string, string> = {
  setup: 'Setup', pool: 'Building pool', auction: 'Auction', reveal: 'Reveal', hub: 'Tournament', prep: 'Preparing match',
  battle: 'In battle', results: 'Match results', champion: 'Finished',
};

export function Saves() {
  const saves = useApp((s) => s.saves);
  const active = useApp((s) => s.game?.id);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { void store.refreshSaves(); }, []);

  const exportSave = async (id: string, name: string) => {
    const json = await store.exportSave(id);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.anime-auction.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="col" style={{ gap: 18, maxWidth: 900 }}>
      <div className="section-head">
        <div><div className="eyebrow">Save, resume, export</div><h1>Saved Games</h1></div>
        <div className="row">
          <input ref={file} type="file" accept=".json,application/json" className="sr-only" aria-label="Import save file"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) await store.importSave(await f.text()); e.target.value = ''; }} />
          <button className="btn" onClick={() => file.current?.click()}>Import save…</button>
          <button className="btn primary" onClick={() => store.go('setup')}>New game</button>
        </div>
      </div>
      {!saves.length && <div className="panel empty">No saved games yet. Games autosave as you play.</div>}
      <div className="col">
        {saves.map((s) => (
          <div key={s.id} className="panel row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h3>{s.name} {s.id === active && <span className="tag">ACTIVE</span>}</h3>
              <div className="faint">{PHASE_LABEL[s.phase] ?? s.phase} · {s.players.join(', ')} · {new Date(s.updatedAt).toLocaleString()}</div>
            </div>
            <div className="row">
              <button className="btn primary sm" onClick={() => store.loadGame(s.id)}>{s.phase === 'champion' ? 'View' : 'Resume'}</button>
              <button className="btn sm" onClick={() => exportSave(s.id, s.name)}>Export</button>
              <button className="btn sm danger" onClick={() => { if (confirm(`Delete "${s.name}"? This cannot be undone.`)) void store.deleteSave(s.id); }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
