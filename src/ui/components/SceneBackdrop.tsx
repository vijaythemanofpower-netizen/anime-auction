// The site's living background: one of several anime "scenes", each with its own
// colours and effects (petals, lightning, embers, snow, dark wisps). A random scene
// is picked on each visit and it crossfades to another every so often. The scene's
// colours become the site's accent colours (see [data-scene] in scenes.css).
import { useEffect, useState } from 'react';
import { useApp } from '../../store/store';

export const SCENES = ['sakura', 'thunder', 'inferno', 'frost', 'shadow'] as const;
export type Scene = (typeof SCENES)[number];
const CHANGE_EVERY = 45_000;

const PARTICLE: Record<Scene, string> = { sakura: 'petal', thunder: 'spark', inferno: 'ember', frost: 'snow', shadow: 'wisp' };
const COUNT = 18;
const SPOTS = Array.from({ length: COUNT }, (_, i) => ({ left: (i * 61 + 7) % 100, delay: (i * 1.3) % 10, dur: 9 + ((i * 7) % 9), size: 6 + ((i * 5) % 10) }));

export function SceneBackdrop() {
  const [scene, setScene] = useState<Scene>(() => SCENES[Math.floor(Math.random() * SCENES.length)]);
  useEffect(() => {
    const t = setInterval(() => setScene((s) => { const others = SCENES.filter((x) => x !== s); return others[Math.floor(Math.random() * others.length)]; }), CHANGE_EVERY);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { document.documentElement.dataset.scene = scene; }, [scene]);
  const kind = PARTICLE[scene];
  const still = useApp((st) => st.settings.reducedMotion) === 'on';
  return (
    <div className={`scene scene-${scene}${still ? ' still' : ''}`} aria-hidden="true" key={scene}>
      <div className="scene-glow" />
      {scene === 'frost' && <div className="scene-moon" />}
      {scene === 'thunder' && <><div className="scene-flash" /><svg className="scene-bolt" viewBox="0 0 60 300"><path d="M38 0 L14 120 L32 122 L8 300 L52 104 L32 102 L50 0 Z" /></svg></>}
      {SPOTS.map((p, i) => (
        <span key={i} className={`fx ${kind}`} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, width: p.size, height: p.size }} />
      ))}
    </div>
  );
}
