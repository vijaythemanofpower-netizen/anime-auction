// "Your sounds": attach your own audio clips to a character's moves and battle
// cry. Clips stay in this browser and are never uploaded.
import { useEffect, useRef, useState } from 'react';
import type { PublicCharacter } from '../../engine/types';
import { getAbility } from '../../engine/data/abilities';
import { clipKeys, cryKey, deleteClip, getClip, moveKey, musicKey, onClipsChanged, putClip, seriesMusicKey } from '../../store/media';
import { store } from '../../store/store';

function Slot({ label, k, have, what = 'clip' }: { label: string; k: string; have: boolean; what?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const preview = async () => {
    const b = await getClip(k);
    if (!b) return;
    const url = URL.createObjectURL(b);
    const a = new Audio(url);
    a.onended = () => URL.revokeObjectURL(url);
    void a.play();
  };
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{label}</div>
      {have ? (
        <>
          <button className="btn sm" onClick={preview} aria-label={`Play your clip for ${label}`}>▶</button>
          <button className="btn sm ghost" onClick={() => void deleteClip(k)} aria-label={`Remove your clip for ${label}`}>Remove</button>
        </>
      ) : (
        <button className="btn sm" onClick={() => input.current?.click()}>Add {what}</button>
      )}
      <input ref={input} type="file" accept="audio/*" hidden onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) putClip(k, f).then(() => store.toast(`Clip added for ${label}.`, 'success')).catch((err) => store.toast((err as Error).message, 'error'));
      }} />
    </div>
  );
}

export function MySounds({ c }: { c: PublicCharacter }) {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    const load = () => { void clipKeys().then((k) => setKeys(new Set(k))); };
    load();
    return onClipsChanged(load);
  }, []);
  return (
    <details className="my-sounds">
      <summary>🔊 Your sounds for {c.name}</summary>
      <div className="col" style={{ gap: 6, marginTop: 8 }}>
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>Add audio you have the right to use, such as songs you own. Music plays during this character&apos;s fights instead of the built-in battle music; clips replace the built-in sounds. Everything stays on this device only.</p>
        <Slot label="Battle music (plays in their fights)" k={musicKey(c.id)} have={keys.has(musicKey(c.id))} what="music" />
        {c.series && c.series !== 'MyAnimeList' && <Slot label={`Battle music for anyone from ${c.series}`} k={seriesMusicKey(c.series)} have={keys.has(seriesMusicKey(c.series))} what="music" />}
        <Slot label="Battle cry (rivalries, ultimates, entrances)" k={cryKey(c.id)} have={keys.has(cryKey(c.id))} />
        {c.knownAbilities.map((id) => <Slot key={id} label={getAbility(id).name} k={moveKey(id)} have={keys.has(moveKey(id))} />)}
      </div>
    </details>
  );
}
