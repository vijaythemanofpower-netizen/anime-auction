// The opening sequence, shown once to first-time visitors (and from Settings on
// request): a kanji is struck in ink, a blade-light slash splits the screen, the
// title cuts in from both sides and the ink parts to reveal the site. About three
// seconds; any key, click or the Skip button ends it at once. Never shown with
// reduced motion.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMotionOk } from '../motion/useMotionOk';

const KEY = 'aa-opening-seen-v1';

export function replayOpening() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  window.dispatchEvent(new Event('aa-opening'));
}

export function Opening() {
  const ok = useMotionOk();
  const [show, setShow] = useState(() => { try { return !localStorage.getItem(KEY); } catch { return false; } });
  useEffect(() => { const f = () => setShow(true); window.addEventListener('aa-opening', f); return () => window.removeEventListener('aa-opening', f); }, []);
  const done = () => { setShow(false); try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } };
  useEffect(() => {
    if (!show) return;
    if (!ok) { done(); return; }
    const t = setTimeout(done, 3600);
    const k = () => done();
    window.addEventListener('keydown', k);
    return () => { clearTimeout(t); window.removeEventListener('keydown', k); };
  }, [show, ok]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {show && ok && (
        <motion.div className="opening" onClick={done} role="dialog" aria-label="Opening" exit={{ opacity: 1 }}>
          <motion.div className="op-half top" exit={{ y: '-100%' }} transition={{ duration: 0.55, ease: [0.7, 0, 0.2, 1] }} />
          <motion.div className="op-half bottom" exit={{ y: '100%' }} transition={{ duration: 0.55, ease: [0.7, 0, 0.2, 1] }} />
          <motion.div className="op-stage" exit={{ opacity: 0, scale: 1.15 }} transition={{ duration: 0.35 }}>
            <motion.div className="op-kanji" initial={{ opacity: 0, scale: 2.4, filter: 'blur(14px)' }} animate={{ opacity: [0, 1, 1, 0.12], scale: [2.4, 1, 1, 1.05], filter: ['blur(14px)', 'blur(0px)', 'blur(0px)', 'blur(2px)'] }} transition={{ duration: 2.2, times: [0, 0.22, 0.55, 1] }}>競</motion.div>
            <motion.div className="op-slash" initial={{ scaleX: 0 }} animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }} transition={{ delay: 0.75, duration: 0.7, times: [0, 0.4, 1] }} />
            <div className="op-title">
              <motion.span initial={{ x: '-60vw', skewX: -20 }} animate={{ x: 0, skewX: 0 }} transition={{ delay: 1.05, type: 'spring', stiffness: 260, damping: 24 }}>Anime</motion.span>
              <motion.span className="red" initial={{ x: '60vw', skewX: 20 }} animate={{ x: 0, skewX: 0 }} transition={{ delay: 1.2, type: 'spring', stiffness: 260, damping: 24 }}>Auction</motion.span>
            </div>
            <motion.div className="op-tag" initial={{ opacity: 0, y: 12, letterSpacing: '1.2em' }} animate={{ opacity: 1, y: 0, letterSpacing: '0.5em' }} transition={{ delay: 1.7, duration: 0.8 }}>入札 · 構築 · 決戦</motion.div>
          </motion.div>
          <button className="op-skip" onClick={(e) => { e.stopPropagation(); done(); }}>Skip ▸</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
