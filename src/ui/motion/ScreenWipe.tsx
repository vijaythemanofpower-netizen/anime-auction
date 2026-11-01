// Moving between screens (and between phases of a game) plays a quick anime
// "scene change": an ink slash sweeps across with speed lines and the place
// you are going to in katakana, then the new screen settles in underneath.
// It never blocks clicks and is skipped with reduced motion.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../../store/store';
import { useMotionOk } from './useMotionOk';

const PLACES: Record<string, [kana: string, label: string]> = {
  home: ['ホーム', 'Home'], explorer: ['キャラクター', 'Characters'], setup: ['新しい対戦', 'New game'], hall: ['殿堂', 'Hall of Legends'],
  howto: ['遊び方', 'How to play'], settings: ['設定', 'Settings'], saves: ['セーブ', 'Saved games'], online: ['オンライン', 'Online'],
  pool: ['選手名簿', 'The pool'], auction: ['オークション', 'Auction'], reveal: ['開示', 'The reveal'], tournament: ['トーナメント', 'Tournament'],
  prep: ['作戦', 'Preparation'], battle: ['決戦', 'Battle'], results: ['結果', 'Results'], champion: ['優勝', 'Champion'],
};

export function ScreenWipe() {
  const ok = useMotionOk();
  const screen = useApp((s) => s.screen);
  const phase = useApp((s) => s.game?.phase);
  const key = screen === 'game' && phase ? phase : screen;
  const prev = useRef(key);
  const [wipe, setWipe] = useState<{ id: number; kana: string; label: string } | null>(null);

  useEffect(() => {
    if (prev.current === key) return;
    prev.current = key;
    if (!ok) return;
    const [kana, label] = PLACES[key] ?? ['次へ', key];
    const id = Date.now();
    setWipe({ id, kana, label });
    const t = setTimeout(() => setWipe((w) => (w?.id === id ? null : w)), 900);
    return () => clearTimeout(t);
  }, [key, ok]);

  return (
    <AnimatePresence>
      {wipe && (
        <motion.div key={wipe.id} className="screen-wipe" aria-hidden="true"
          initial={{ clipPath: 'polygon(0% 0%, 0% 0%, -20% 100%, -20% 100%)' }}
          animate={{ clipPath: ['polygon(0% 0%, 0% 0%, -20% 100%, -20% 100%)', 'polygon(0% 0%, 120% 0%, 100% 100%, -20% 100%)', 'polygon(120% 0%, 120% 0%, 100% 100%, 100% 100%)'] }}
          transition={{ duration: 0.85, times: [0, 0.42, 1], ease: [0.7, 0, 0.2, 1] }}>
          <div className="sw-lines" />
          <motion.div className="sw-title" initial={{ x: 80, opacity: 0, skewX: -12 }} animate={{ x: [80, 0, -40], opacity: [0, 1, 0], skewX: [-12, -6, -12] }} transition={{ duration: 0.85, times: [0, 0.45, 1] }}>
            <span className="sw-kana">{wipe.kana}</span>
            <span className="sw-label">{wipe.label}</span>
          </motion.div>
          <div className="sw-stripe" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
