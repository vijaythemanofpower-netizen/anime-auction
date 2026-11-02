// The home page's scroll story: one character's world filling the screen, its three
// scenes crossfading and pushing in as you scroll, a film-site HUD around it, and the
// game's actions on the last scene. Each world sets its own colours, type and frame.
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'framer-motion';
import type { Effect, World } from './worlds';

const BASE = import.meta.env.BASE_URL;
export const sceneUrl = (w: World, n: number) => `${BASE}hero/${w.key}/${n}.webp`;

/** "Sage [Mode.]": the bracketed words take the world's accent. */
export function Accent({ text }: { text: string }) {
  const m = text.match(/^(.*?)\[(.+?)\](.*)$/);
  if (!m) return <>{text}</>;
  return <>{m[1]}<em>{m[2]}</em>{m[3]}</>;
}

// When each scene is on screen, as a share of the story's scroll (crossfades overlap).
const FADE: Array<[number[], number[]]> = [
  [[0, 0.3, 0.38], [1, 1, 0]],
  [[0.3, 0.38, 0.63, 0.71], [0, 1, 1, 0]],
  [[0.63, 0.71, 1], [0, 1, 1]],
];

function SceneLayer({ world, i, p, motionOk }: { world: World; i: number; p: MotionValue<number>; motionOk: boolean }) {
  const opacity = useTransform(p, FADE[i][0], FADE[i][1]);
  // A slow push-in across the scene, like a camera move.
  const scale = useTransform(p, [Math.max(0, i / 3 - 0.08), (i + 1) / 3 + 0.04], motionOk ? [1.14, 1.02] : [1.02, 1.02]);
  const y = useTransform(p, [i / 3, (i + 1) / 3], motionOk ? ['2%', '-2%'] : ['0%', '0%']);
  return (
    <motion.div className="story-scene" style={{ opacity }}>
      <motion.img src={sceneUrl(world, i + 1)} alt="" style={{ scale, y }} draggable={false} />
    </motion.div>
  );
}

/** Ambient particles for the world (leaves, embers, ash...), drawn with CSS. */
function Particles({ effect, seed }: { effect: Effect; seed: string }) {
  const dots = useMemo(() => {
    let h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
    const r = () => ((h = (Math.imul(h, 1103515245) + 12345) | 0) >>> 0) / 4294967296;
    return Array.from({ length: 28 }, () => ({ x: r() * 100, d: r() * -14, t: 7 + r() * 9, s: 0.5 + r() * 1.2, o: 0.35 + r() * 0.6 }));
  }, [seed]);
  return (
    <div className={`story-fx fx-${effect}`} aria-hidden="true">
      {dots.map((d, i) => <i key={i} style={{ left: `${d.x}%`, animationDelay: `${d.d}s`, animationDuration: `${d.t}s`, ['--s' as string]: d.s, ['--o' as string]: d.o } as CSSProperties} />)}
    </div>
  );
}

export function HomeStory({ world, motionOk, actions, onSwitch }: { world: World; motionOk: boolean; actions: ReactNode; onSwitch: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [scene, setScene] = useState(0);
  useMotionValueEvent(p, 'change', (v) => setScene(v < 0.34 ? 0 : v < 0.67 ? 1 : 2));
  const s = world.scenes[scene];
  const last = scene === 2;
  const alt = scene === 1;
  const move = motionOk ? 18 : 0;

  return (
    <section ref={ref} className={`story frame-${world.frame} type-${world.type}`} aria-label={`${world.name}: ${world.series}`}>
      <div className="story-stage">
        {[0, 1, 2].map((i) => <SceneLayer key={`${world.key}${i}`} world={world} i={i} p={p} motionOk={motionOk} />)}
        <div className={`story-scrim${alt ? ' alt' : ''}${last ? ' last' : ''}`} />
        {motionOk && <Particles effect={world.effect} seed={world.key} />}
        <div className={`story-kana${alt ? ' alt' : ''}`} aria-hidden="true">{world.kana}</div>

        <div className="story-hud" aria-hidden="true">
          <span className="hud-corner tl" /><span className="hud-corner tr" /><span className="hud-corner bl" /><span className="hud-corner br" />
          <div className="hud-top">
            <span className="hud-house"><i />{world.house}</span>
            <span className="hud-mid">{world.series.toUpperCase()} · {world.name.toUpperCase()}</span>
            <span className="hud-count">{String(scene + 1).padStart(2, '0')} / 03</span>
          </div>
          <div className="hud-bottom">
            <span>ANIME AUCTION // BID · BUILD · BATTLE</span>
            <span className="hud-scroll">{last ? 'YOUR MOVE' : 'SCROLL ↓'}</span>
          </div>
        </div>

        <div className="story-rail" aria-hidden="true"><motion.i style={{ scaleY: p }} /></div>

        <AnimatePresence mode="wait">
          <motion.div key={`${world.key}-${scene}`} className={`story-copy${alt ? ' alt' : ''}${last ? ' last' : ''}`}
            initial={{ opacity: 0, y: move }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -move / 2 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
            <div className="story-eyebrow">{String(scene + 1).padStart(2, '0')} — {world.name}</div>
            <h1 className="story-title"><Accent text={s.title} /></h1>
            <p className="story-line">{s.line}</p>
            {scene === 0 && <figure className="story-quote"><blockquote>“{world.quote}”</blockquote><figcaption>{world.name}</figcaption></figure>}
            {last && <div className="story-actions">{actions}</div>}
          </motion.div>
        </AnimatePresence>
        <button className="story-switch" onClick={onSwitch} aria-label="Show another character's world">⟳ Another world</button>
      </div>
    </section>
  );
}
