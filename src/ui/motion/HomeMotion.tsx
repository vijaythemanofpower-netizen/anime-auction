// Home page motion pieces: the title that slams in word by word, the hero's
// parallax layers, chapter-style section headings with a brush stroke that
// draws itself, and a band of fighter names that speeds up as you scroll.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useScroll, useSpring, useTransform, useVelocity, type MotionValue } from 'framer-motion';
import { useMotionOk } from './useMotionOk';

const KANJI = ['一', '二', '三', '四', '五'];

/** Words land one after another like impact text, with a hard ink shadow. */
export function KineticTitle({ lines }: { lines: Array<{ text: string; className: string }> }) {
  const ok = useMotionOk();
  let i = 0;
  return (
    <h1 className="logo-title kinetic" aria-label={lines.map((l) => l.text).join(' ')}>
      {lines.map((l) => (
        <span key={l.text} className={l.className} aria-hidden="true">
          {l.text.split(' ').map((w) => {
            const n = i++;
            return (
              <motion.span key={w + n} className="kw"
                initial={ok ? { y: 70, rotate: -8, scale: 1.6, opacity: 0 } : false}
                animate={{ y: 0, rotate: 0, scale: 1, opacity: 1 }}
                transition={{ delay: 0.12 + n * 0.11, type: 'spring', stiffness: 520, damping: 22 }}>
                {w}
              </motion.span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}

/** The hero's layers move at different speeds as the page scrolls away. */
export function useHeroParallax(target: React.RefObject<HTMLElement>) {
  const ok = useMotionOk();
  const { scrollYProgress } = useScroll({ target, offset: ['start start', 'end start'] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 26 });
  const copy = useTransform(p, [0, 1], [0, ok ? -90 : 0]);
  const card = useTransform(p, [0, 1], [0, ok ? 140 : 0]);
  const cardRot = useTransform(p, [0, 1], [1.2, ok ? 7 : 1.2]);
  const kanji = useTransform(p, [0, 1], [0, ok ? 260 : 0]);
  const fade = useTransform(p, [0, 0.85], [1, ok ? 0.15 : 1]);
  return { copy, card, cardRot, kanji, fade };
}

/** A huge brushed kanji behind the hero. */
export function HeroKanji({ y }: { y: MotionValue<number> }) {
  return <motion.div className="hero-kanji" style={{ y }} aria-hidden="true">競</motion.div>;
}

/** A chapter heading: number in kanji and English, the title, and a brush stroke that paints in. */
export function Chapter({ n, kana, children }: { n: number; kana: string; children: ReactNode }) {
  const ok = useMotionOk();
  return (
    <header className="chapter">
      <span className="ch-no">第{KANJI[n - 1] ?? n}章 <i>Chapter {String(n).padStart(2, '0')}</i> <em>{kana}</em></span>
      <h2>{children}</h2>
      <svg className="ch-brush" viewBox="0 0 400 18" preserveAspectRatio="none" aria-hidden="true">
        <motion.path d="M2 11 C 60 4, 140 15, 210 8 S 340 4, 398 9" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
          initial={ok ? { pathLength: 0 } : false} whileInView={{ pathLength: 1 }} viewport={{ once: true, margin: '-10% 0px' }} transition={{ duration: 0.8, ease: [0.7, 0, 0.2, 1] }} />
      </svg>
    </header>
  );
}

/** A tilted band of names that drifts on its own and races when you scroll. */
export function NameBand({ names, reverse = false }: { names: string[]; reverse?: boolean }) {
  const ok = useMotionOk();
  const x = useMotionValue(0);
  const { scrollY } = useScroll();
  const v = useSpring(useVelocity(scrollY), { stiffness: 300, damping: 50 });
  const width = useRef(0);
  const row = useRef<HTMLDivElement>(null);
  useAnimationFrame((_, dt) => {
    if (!ok) return;
    if (!width.current && row.current) width.current = row.current.scrollWidth / 2;
    const boost = 1 + Math.min(6, Math.abs(v.get()) / 400);
    let nx = x.get() + (reverse ? 1 : -1) * 0.045 * dt * boost;
    if (width.current) { if (nx <= -width.current) nx += width.current; if (nx > 0) nx -= width.current; }
    x.set(nx);
  });
  const items = [...names, ...names];
  return (
    <div className={`name-band${reverse ? ' rev' : ''}`} aria-hidden="true">
      <motion.div className="nb-row" ref={row} style={{ x }}>
        {items.map((n, i) => <span key={i}>{n}<b>✦</b></span>)}
      </motion.div>
    </div>
  );
}

const SCENES = ['naruto-sasuke', 'gojo-sukuna', 'goku-vegeta', 'luffy-kaido', 'ichigo-aizen', 'itachi-sasuke', 'deku-bakugo', 'zoro-mihawk', 'levi-titans', 'gon-killua'];

/** Full-bleed painted fight scenes behind the hero: slow camera drift, a crossfade every few seconds, parallax on scroll. */
export function HeroScenes({ y }: { y: MotionValue<number> }) {
  const ok = useMotionOk();
  const [i, setI] = useState(() => Math.floor(Math.random() * SCENES.length));
  useEffect(() => {
    if (!ok) return;
    const t = setInterval(() => setI((n) => (n + 1) % SCENES.length), 6500);
    return () => clearInterval(t);
  }, [ok]);
  // The next scene is fetched ahead so the crossfade never shows a blank frame.
  useEffect(() => { const img = new Image(); img.src = `${import.meta.env.BASE_URL}scenes/${SCENES[(i + 1) % SCENES.length]}.jpg`; }, [i]);
  return (
    <motion.div className="hero-scenes" style={{ y }} aria-hidden="true">
      <AnimatePresence initial={false}>
        <motion.div key={SCENES[i]} className="hs-img" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}scenes/${SCENES[i]}.jpg)` }}
          initial={{ opacity: 0, scale: 1.12, x: i % 2 ? 30 : -30 }} animate={{ opacity: 1, scale: 1.02, x: 0 }} exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 1.4 }, scale: { duration: 8, ease: 'linear' }, x: { duration: 8, ease: 'linear' } }} />
      </AnimatePresence>
      <div className="hs-shade" />
      <div className="hs-lines" />
    </motion.div>
  );
}
