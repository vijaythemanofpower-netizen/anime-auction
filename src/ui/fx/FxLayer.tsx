// Mounts the GPU effects canvas over the arena and plays the current event:
// the battlefield's part (weather, auras, hazards, splashes, debris) and then
// the move's own effect.
import { useEffect, useRef } from 'react';
import type { FxDirector } from './engine';
import { playFx, type PlayCtx } from './recipes';
import type { BridgeCtx } from '../battlefield/fxBridge';

export function FxLayer({ ctx, field, seq, onReady }: { ctx: Omit<PlayCtx, 'stage'> & { stage: PlayCtx['stage'] } | null; field?: BridgeCtx | null; seq: number; onReady: (ok: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const fx = useRef<FxDirector | null>(null);
  const bridge = useRef<typeof import('../battlefield/fxBridge') | null>(null);
  const latest = useRef(field);
  latest.current = field;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let alive = true;
    let d: FxDirector | null = null;
    const ro = new ResizeObserver(() => d?.resize(el.clientWidth, el.clientHeight));
    ro.observe(el);
    // The effects library is loaded only when a battle is shown.
    void Promise.all([import('./engine'), import('../battlefield/fxBridge')]).then(async ([{ FxDirector }, b]) => {
      if (!alive) return;
      d = new FxDirector();
      d.resize(el.clientWidth, el.clientHeight);
      const ok = await d.mount(el);
      if (!alive) { d.destroy(); return; }
      fx.current = ok ? d : null;
      bridge.current = b;
      // Start with the weather already falling.
      if (ok && latest.current) b.playFrame(d, { ...latest.current, frame: { ...latest.current.frame, hazard: undefined, propHits: [], splash: undefined, motion: {} } });
      onReady(ok);
    }).catch(() => onReady(false));
    return () => { alive = false; ro.disconnect(); d?.destroy(); fx.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fx.current) return;
    if (!ctx) {
      // Before the bell, after the result or after a skip: drop moves still in flight, keep the weather.
      fx.current.clear();
      if (field) { fx.current.weather.set({ kind: field.reduced ? 'clear' : field.frame.weather.kind, intensity: field.reduced ? 0 : field.frame.weather.intensity, wind: field.frame.weather.wind, wet: field.frame.weather.wet }); fx.current.setAuras(field.reduced ? [] : field.auras); }
      return;
    }
    if (field && bridge.current) {
      if (field.frame.camera.slowmo && !field.reduced && ctx.e.type !== 'defeat') fx.current.slowMo(650, 0.45);
      bridge.current.playFrame(fx.current, field);
    }
    playFx(fx.current, ctx);
    // Only the event sequence number decides when to play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  // Auras follow fighters as they change form, even between moves.
  useEffect(() => {
    if (fx.current && field) fx.current.setAuras(field.reduced ? [] : field.auras);
  }, [field?.auras.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="fx-gpu" aria-hidden="true" />;
}
