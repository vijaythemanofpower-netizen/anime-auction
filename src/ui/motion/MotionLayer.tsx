// The site's motion, in one place, so every screen moves the same way:
// - clicks land like hits: an ink impact burst at the pointer (with a comic SFX
//   word on primary actions);
// - panels, cards and sections enter like manga panels being inked as they
//   scroll into view;
// - an ink-brush progress line follows the scroll, and speed lines streak in
//   when you scroll fast;
// - cards lean toward the pointer.
// Everything here only decorates: it never changes what a click does, and it
// switches off completely with reduced motion (setting or system).
import { useEffect, useRef } from 'react';
import { motion, useScroll, useSpring, useVelocity, useTransform } from 'framer-motion';
import { useMotionOk } from './useMotionOk';
import { uiClick } from '../universe/uiSound';

const SFX = ['DON!', 'BAM!', 'SHIN!', 'ZAN!', 'GO!', 'DOGA!', 'KA-CHIN!', 'BA-N!'];

/** Elements that enter with the panel wipe when they scroll into view. */
const REVEAL = [
  '.panel', '.home-section > h2', '.home-steps > li', '.mode-panel', '.char-card', '.lot-card', '.account-card',
  '.section-title', '.stat-card', '.standings', '.bracket', '.hall-card', '.save-row', '.setup-card', '.info-block', 'main h1', 'main h2',
].join(',');

/** Elements that lean toward the pointer. */
const TILT = '.lot-card, .mode-panel, .char-card, .home-steps > li, .hall-card';

function burst(x: number, y: number, big: boolean) {
  const host = document.createElement('div');
  host.className = `ink-hit${big ? ' big' : ''}`;
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;
  // Jagged impact star: alternating long and short spikes, a little irregular each time.
  const n = big ? 14 : 10, pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? 18 + Math.random() * 6 : 42 + Math.random() * 16;
    pts.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`);
  }
  host.innerHTML = `<svg viewBox="0 0 100 100"><polygon points="${pts.join(' ')}"/></svg>${big ? `<b>${SFX[Math.floor(Math.random() * SFX.length)]}</b>` : ''}`;
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('i');
    s.style.setProperty('--a', `${Math.random() * 360}deg`);
    s.style.setProperty('--d', `${30 + Math.random() * 40}px`);
    host.appendChild(s);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 650);
}

export function MotionLayer() {
  const ok = useMotionOk();
  const { scrollYProgress, scrollY } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 24, mass: 0.3 });
  const velocity = useVelocity(scrollY);
  const speed = useTransform(velocity, [-2600, -500, 0, 500, 2600], [0.55, 0, 0, 0, 0.55]);
  const lastBurst = useRef(0);

  // Clicks land like hits.
  useEffect(() => {
    if (!ok) return;
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest('button, a, [role="button"], .lot-card, .mode-panel');
      if (!el || (el as HTMLButtonElement).disabled) return;
      if (el.closest('.arena2, .comic-page, .fx-gpu')) return; // the battle has its own effects
      const now = performance.now();
      if (now - lastBurst.current < 60) return;
      lastBurst.current = now;
      const big = el.classList.contains('primary') || el.classList.contains('lg') || el.classList.contains('gold');
      burst(e.clientX, e.clientY, big);
      uiClick(big);
    };
    window.addEventListener('pointerdown', onDown, { passive: true });
    return () => window.removeEventListener('pointerdown', onDown);
  }, [ok]);

  // Panels ink in as they scroll into view (including ones added later).
  useEffect(() => {
    const root = document.querySelector('main');
    if (!root) return;
    if (!ok) { root.querySelectorAll('.rv').forEach((el) => el.classList.add('rv-in')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('rv-in'); io.unobserve(en.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const mark = (scope: ParentNode) => {
      const fresh = [...scope.querySelectorAll<HTMLElement>(REVEAL)].filter((el) => !el.classList.contains('rv') && !el.closest('.arena2, .comic-page, .modal, .toast'));
      fresh.forEach((el, i) => {
        el.classList.add('rv');
        // Siblings that enter together cascade, like panels read left to right.
        el.style.setProperty('--rv-delay', `${Math.min(i % 6, 5) * 70}ms`);
        io.observe(el);
      });
    };
    mark(root);
    const mo = new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach((n) => { if (n instanceof HTMLElement) mark(n.parentElement ?? n); }); });
    mo.observe(root, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [ok]);

  // Cards lean toward the pointer.
  useEffect(() => {
    if (!ok || !matchMedia('(hover: hover)').matches) return;
    let cur: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(TILT) ?? null;
      if (cur && cur !== el) { cur.style.removeProperty('--tx'); cur.style.removeProperty('--ty'); cur.classList.remove('tilting'); }
      cur = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.classList.add('tilting');
      el.style.setProperty('--tx', (((e.clientY - r.top) / r.height - 0.5) * -6).toFixed(2));
      el.style.setProperty('--ty', (((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(2));
      el.style.setProperty('--gx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [ok]);

  if (!ok) return null;
  return (
    <>
      <motion.div className="ink-progress" style={{ scaleX: progress }} aria-hidden="true" />
      <motion.div className="scroll-speedlines" style={{ opacity: speed }} aria-hidden="true" />
    </>
  );
}
