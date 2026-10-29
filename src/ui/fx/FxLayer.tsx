// Mounts the GPU effects canvas over the arena and plays the current event.
import { useEffect, useRef } from 'react';
import type { FxDirector } from './engine';
import { playFx, type PlayCtx } from './recipes';

export function FxLayer({ ctx, seq, onReady }: { ctx: Omit<PlayCtx, 'stage'> & { stage: PlayCtx['stage'] } | null; seq: number; onReady: (ok: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const fx = useRef<FxDirector | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let alive = true;
    let d: FxDirector | null = null;
    const ro = new ResizeObserver(() => d?.resize(el.clientWidth, el.clientHeight));
    ro.observe(el);
    // The effects library is loaded only when a battle is shown.
    void import('./engine').then(async ({ FxDirector }) => {
      if (!alive) return;
      d = new FxDirector();
      d.resize(el.clientWidth, el.clientHeight);
      const ok = await d.mount(el);
      if (!alive) { d.destroy(); return; }
      fx.current = ok ? d : null;
      onReady(ok);
    }).catch(() => onReady(false));
    return () => { alive = false; ro.disconnect(); d?.destroy(); fx.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fx.current || !ctx) return;
    playFx(fx.current, ctx);
    // Only the event sequence number decides when to play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  return <div ref={host} className="fx-gpu" aria-hidden="true" />;
}
