// "Write their real moves": shows a character's moves and lets the player have
// Claude write the ones from their series, then review and edit them.
import { useState } from 'react';
import type { Ability, PublicCharacter } from '../../engine/types';
import { getAbility } from '../../engine/data/abilities';
import { aiConfidence, getApiKey, saveMoves, writeMoves } from '../ai/moveWriter';
import { store } from '../../store/store';

const CONF: Record<string, string> = {
  canon: 'From the series', mostly_canon: 'Mostly from the series', invented: 'Invented to fit (this character doesn\'t really fight)',
};

export function AiMoves({ c, onChange }: { c: PublicCharacter; onChange: (c: PublicCharacter) => void }) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Ability[] | null>(null);
  if (c.source === 'legend' || c.source === 'original') return null;
  const conf = aiConfidence(c);
  const written = c.customMoves && c.customKit;

  const run = async () => {
    setBusy(true);
    try {
      const { character } = await writeMoves(c);
      onChange(character);
      setDraft(character.customMoves!.map((m) => ({ ...m })));
      store.toast(`Moves written for ${c.name}. Check them below.`, 'success');
    } catch (e) {
      store.toast((e as Error).message || 'Could not write moves.', 'error');
    } finally { setBusy(false); }
  };
  const save = () => {
    if (!draft || !c.customKit) return;
    const moves = draft.map((m) => ({ ...m, name: m.name.trim() || m.name, shout: `${(m.name.trim() || m.name).toUpperCase()}!`, description: m.look ?? m.description }));
    onChange(saveMoves(c, moves, c.customKit, conf ?? 'mostly_canon'));
    setDraft(null);
    store.toast('Moves saved.', 'success');
  };

  return (
    <div className="ai-moves">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong>Moves</strong>
        {written ? <span className="tag" title={conf ? CONF[conf] : ''} style={{ color: '#c4b5fd' }}>AI-WRITTEN{conf ? ` · ${CONF[conf]}` : ''}</span> : <span className="faint" style={{ fontSize: 12 }}>General moves matched to their style</span>}
      </div>
      {!draft && (
        <ul className="ai-list">
          {(written ? c.customMoves!.slice(0, 2) : c.knownAbilities.map((id) => getAbility(id))).map((m) => <li key={m.id}><b>{m.name}</b> <span className="faint">{m.look ?? m.description}</span></li>)}
          {written && <li className="faint">+ a hidden technique and an ultimate, revealed when bought.</li>}
        </ul>
      )}
      {draft && (
        <div className="col" style={{ gap: 6 }}>
          {draft.map((m, i) => (
            <div key={m.id} className="col" style={{ gap: 3 }}>
              <span className="label">{['Signature move', 'Signature move', 'Hidden technique', 'Ultimate'][i]}</span>
              <input className="input" value={m.name} aria-label={`Move ${i + 1} name`} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input className="input" value={m.look ?? ''} aria-label={`Move ${i + 1} look`} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, look: e.target.value } : x)))} />
            </div>
          ))}
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn sm" onClick={() => setDraft(null)}>Keep as written</button>
            <button className="btn sm primary" onClick={save}>Save edits</button>
          </div>
        </div>
      )}
      {!draft && (
        <div className="row" style={{ gap: 8 }}>
          {getApiKey() ? (
            <button className="btn sm primary" disabled={busy} onClick={run}>{busy ? 'Writing moves…' : written ? '✨ Rewrite with AI' : '✨ Write their real moves with AI'}</button>
          ) : (
            <button className="btn sm" onClick={() => store.go('settings')}>✨ Add an API key in Settings to write their real moves</button>
          )}
          {written && <button className="btn sm ghost" onClick={() => setDraft(c.customMoves!.map((m) => ({ ...m })))}>Edit moves</button>}
        </div>
      )}
      <p className="faint" style={{ fontSize: 11, margin: 0 }}>Claude names and describes the moves; the game sets their power so every character stays balanced. Usually right for well-known characters, can be off for obscure ones.</p>
    </div>
  );
}
