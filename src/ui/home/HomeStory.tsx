// The home page as a run of full-screen panels, each one a different character's world
// (six per visit, never the same character twice): the art drifts in parallax inside its
// panel, each panel pins and the next slides over it, and every panel has its own layout.
// Everything moves with transforms only, so scrolling stays smooth.
import { useEffect, useMemo, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { CinematicVfx, deviceQuality, type Quality } from '../vfx/CinematicVfx';
import { profileFor } from '../vfx/profiles';
import type { Effect, World } from './worlds';

const BASE = import.meta.env.BASE_URL;
/** A scene at full size (2560 px wide), or a smaller copy (1920 or 1280 px) for smaller screens. */
export const sceneUrl = (w: World, n: number, size: 1280 | 1920 | 2560 | boolean = 2560) => {
  const px = size === true ? 1280 : size === false ? 2560 : size;
  return `${BASE}hero/${w.key}/${n}${px === 2560 ? '' : `-${px}`}.webp`;
};
export const sceneSrcSet = (w: World, n: number) => `${sceneUrl(w, n, 1280)} 1280w, ${sceneUrl(w, n, 1920)} 1920w, ${sceneUrl(w, n, 2560)} 2560w`;

/** "Sage [Mode.]": the bracketed words take the world's accent. */
export function Accent({ text }: { text: string }) {
  const m = text.match(/^(.*?)\[(.+?)\](.*)$/);
  if (!m) return <>{text}</>;
  return <>{m[1]}<em>{m[2]}</em>{m[3]}</>;
}

/** Ambient particles for the world (leaves, embers, ash...), drawn with CSS transforms. */
export function Particles({ effect, seed, count = 22 }: { effect: Effect; seed: string; count?: number }) {
  const dots = useMemo(() => {
    let h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
    const r = () => ((h = (Math.imul(h, 1103515245) + 12345) | 0) >>> 0) / 4294967296;
    return Array.from({ length: count }, () => ({ x: r() * 100, d: r() * -14, t: 7 + r() * 9, s: 0.5 + r() * 1.2, o: 0.35 + r() * 0.6 }));
  }, [seed, count]);
  return (
    <div className={`story-fx fx-${effect}`} aria-hidden="true">
      {dots.map((d, i) => <i key={i} style={{ left: `${d.x}%`, animationDelay: `${d.d}s`, animationDuration: `${d.t}s`, ['--s' as string]: d.s, ['--o' as string]: d.o } as CSSProperties} />)}
    </div>
  );
}

/** The scene size this screen needs (CSS pixels times pixel ratio). */
export function artSize(): 1280 | 1920 | 2560 {
  const px = (typeof window === 'undefined' ? 1920 : window.innerWidth * (window.devicePixelRatio || 1));
  return px <= 1280 ? 1280 : px <= 1920 ? 1920 : 2560;
}

export type PanelLayout = 'hero' | 'right' | 'left' | 'center' | 'split' | 'finale';

export interface PanelSpec {
  world: World;
  scene: 1 | 2 | 3;
  layout: PanelLayout;
  /** Small label above the title ("01 / BID"). */
  label: string;
  title: string;
  body: ReactNode;
  /** Extra content (buttons, lists) under the body. */
  extra?: ReactNode;
}

/** One full-screen panel: pinned art (moved by usePanelMotion), the world's HUD, and its copy. */
export function Panel({ p, index, total, motionOk, eager }: { p: PanelSpec; index: number; total: number; motionOk: boolean; eager: boolean }) {
  const w = p.world;
  const vars = { '--acc': w.accent, '--tone': w.tone, '--ink2': w.ink } as CSSProperties;
  return (
    <section data-world={w.key} data-art={sceneUrl(w, p.scene, artSize())} className={`hpanel lay-${p.layout} frame-${w.frame} type-${w.type}${index === 0 ? ' is-live' : ''}`} style={vars} aria-label={`${p.label}: ${w.name}`}>
      <div className="hpanel-stage">
        {/* Mirrored on right-hand layouts, so the character faces the copy instead of sitting under it. */}
        <div className="hpanel-artwrap">
          <img className="hpanel-art" srcSet={sceneSrcSet(w, p.scene)} sizes="100vw" src={sceneUrl(w, p.scene)} alt={`${w.name}, ${w.series}`}
            loading="eager" decoding="async" {...{ fetchpriority: eager ? 'high' : 'auto' }} draggable={false} />
        </div>
        <div className="hpanel-scrim" />
        <div className="hpanel-sweep" aria-hidden="true" />
        {motionOk && <Particles effect={w.effect} seed={`${w.key}${index}`} />}
        <div className="story-kana" aria-hidden="true">{w.kana}</div>
        <div className="story-hud" aria-hidden="true">
          <span className="hud-corner tl" /><span className="hud-corner tr" /><span className="hud-corner bl" /><span className="hud-corner br" />
          <div className="hud-top">
            <span className="hud-house"><i />{w.house}</span>
            <span className="hud-mid">{w.series.toUpperCase()} · {w.name.toUpperCase()}</span>
            <span className="hud-count">{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
          </div>
          <div className="hud-bottom">
            <span>ANIME AUCTION // BID · BUILD · BATTLE</span>
            <span className="hud-scroll">{index === total - 1 ? 'YOUR MOVE' : 'SCROLL ↓'}</span>
          </div>
        </div>
        <motion.div className="hpanel-copy" initial={motionOk ? { opacity: 0, y: 28 } : false} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <div className="story-eyebrow">{p.label} — {w.name}</div>
          {index === 0 ? <h1 className="story-title"><Accent text={p.title} /></h1> : <h2 className="story-title"><Accent text={p.title} /></h2>}
          <div className="story-line">{p.body}</div>
          {p.extra}
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Scroll-driven motion for the panels, without layout reads while scrolling: panel
 * positions are measured once (and on resize); each frame only the panels on screen get a
 * transform on their art (parallax drift and a slow settle) and the "live" class that runs
 * their particles and light. Everything else rests.
 */
export function usePanelMotion(root: RefObject<HTMLElement>, motionOk: boolean, key: string) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const panels = [...el.querySelectorAll<HTMLElement>('.hpanel')];
    const arts = panels.map((p) => p.querySelector<HTMLElement>('.hpanel-art'));
    let tops: number[] = [], h = 0, vh = 0, raf = 0;
    const measure = () => {
      vh = window.innerHeight;
      h = panels[0]?.offsetHeight ?? vh;
      // Panels follow each other from the top of their container, so their natural tops are
      // evenly spaced (pinning changes where they are drawn, not where they sit in the page).
      const base = el.getBoundingClientRect().top + window.scrollY;
      tops = panels.map((_, i) => base + i * h);
    };
    // Adaptive quality: while scrolling, watch real frame times; if this device keeps
    // missing frames, drop the extras (particles, light sweep, zoom) and keep the art sharp.
    let lastT = 0, slow = 0, seen = 0;
    const frame = (now: number) => {
      raf = 0;
      if (lastT && now - lastT < 200) { seen++; if (now - lastT > 24) slow++; }
      lastT = now;
      if (seen >= 90) { if (slow / seen > 0.25) el.classList.add('lite'); seen = 0; slow = 0; }
      const y = window.scrollY;
      panels.forEach((p, i) => {
        const prog = (y + vh - tops[i]) / (vh + h);
        const on = prog > 0 && prog < 1.02;
        if (on !== p.classList.contains('is-live')) p.classList.toggle('is-live', on);
        // The panel that has fully arrived (pinned) gets the cinematic layer.
        if (y >= tops[i] - 2 && (i === panels.length - 1 || y < tops[i + 1] - 2)) activate(i);
        const art = arts[i];
        if (!art || !on || !motionOk) return;
        const t = Math.max(0, Math.min(1, prog));
        const drift = (t - 0.5) * 18; // percent of the panel, -9% .. 9%
        const scale = el.classList.contains('lite') ? 1.08 : 1.06 + Math.abs(t - 0.5) * 0.16;
        art.style.transform = `translate3d(0, ${drift.toFixed(2)}%, 0) scale(${scale.toFixed(4)})`;
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame); };

    // The cinematic layer: one WebGL canvas that moves into the panel on screen and brings
    // that character to life with their own effects.
    let vfx: CinematicVfx | null = null, active = -1, monitor = 0;
    const order: Quality[] = ['high', 'medium', 'low'];
    if (motionOk) {
      vfx = new CinematicVfx(deviceQuality());
      // Every 2 s: if frames keep running long, step quality down; at the bottom, fall back to
      // the still art (sharp, no effects) rather than stutter.
      monitor = window.setInterval(() => {
        if (!vfx) return;
        const st = vfx.takeStats();
        if (st.frames < 30 || st.slow / st.frames <= 0.25) return;
        const i = order.indexOf(vfx.quality);
        if (i < order.length - 1) vfx.setQuality(order[i + 1]);
        else { vfx.pause(true); panels.forEach((pn) => pn.classList.remove('gpu')); el.classList.add('lite'); window.clearInterval(monitor); }
      }, 2000);
    }
    const activate = (i: number) => {
      if (!vfx || i === active || i < 0) return;
      active = i;
      const pn = panels[i], stage = pn.querySelector<HTMLElement>('.hpanel-stage');
      if (!stage) return;
      void vfx.mount(stage, stage.querySelector('.hpanel-artwrap'), stage.querySelector('.hpanel-scrim')).then(() => {
        panels.forEach((x) => x.classList.remove('gpu'));
        return vfx!.show(profileFor(pn.dataset.world ?? ''), pn.dataset.art, pn.classList.contains('lay-right') || pn.classList.contains('lay-split'));
      }).then(() => { if (active === i) pn.classList.add('gpu'); });
    };
    // Small, low-memory or few-core devices start in lite mode.
    const nav = navigator as Navigator & { deviceMemory?: number };
    if ((nav.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4) el.classList.add('lite');
    const onResize = () => { measure(); onScroll(); if (vfx && active >= 0) { const st = panels[active].querySelector<HTMLElement>('.hpanel-stage'); if (st) vfx.resize(st.clientWidth, st.clientHeight); } };
    measure(); frame(performance.now()); activate(0);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    const onVisible = () => vfx?.pause(document.hidden);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVisible); if (raf) cancelAnimationFrame(raf); window.clearInterval(monitor); vfx?.canvas?.remove(); vfx?.fxCanvas?.remove(); vfx?.destroy(); panels.forEach((x) => x.classList.remove('gpu')); };
  }, [root, motionOk, key]);
}
