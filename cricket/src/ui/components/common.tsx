import { useEffect, useReducer, useRef, type ReactNode, useSyncExternalStore } from 'react';

export function Modal({ title, children, onClose }: { title?: string; children: ReactNode; onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button, [href], input')?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="modal col" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Bars({ rows }: { rows: Array<[string, number]> }) {
  return (
    <div className="bars">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <span className="dim">{k}</span>
          <span className={`bar ${v >= 80 ? 'hi' : ''}`}><i style={{ width: `${Math.max(2, Math.min(100, v))}%` }} /></span>
          <span className="v">{Math.round(v)}</span>
        </div>
      ))}
    </div>
  );
}

/** Re-renders every `ms` while mounted (countdowns); returns the current time. */
export function useNow(ms = 250): number {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { const t = setInterval(tick, ms); return () => clearInterval(t); }, [ms]);
  return Date.now();
}


// ---------------------------------------------------------------- confirm dialog
interface Ask { title: string; body?: string; ok: string; danger?: boolean; resolve: (yes: boolean) => void }
let asking: Ask | null = null;
const askListeners = new Set<() => void>();
const setAsk = (a: Ask | null) => { asking = a; askListeners.forEach((l) => l()); };

/** In-app replacement for window.confirm. */
export function askConfirm(o: { title: string; body?: string; ok?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => setAsk({ ok: 'OK', ...o, resolve }));
}

export function DialogHost() {
  const a = useSyncExternalStore((l) => { askListeners.add(l); return () => { askListeners.delete(l); }; }, () => asking);
  useEffect(() => {
    if (!a) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { a.resolve(false); setAsk(null); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [a]);
  if (!a) return null;
  const done = (yes: boolean) => { a.resolve(yes); setAsk(null); };
  return (
    <div className="dialog-back" onClick={(e) => { if (e.target === e.currentTarget) done(false); }}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={a.title}>
        <h3>{a.title}</h3>
        {a.body && <p className="dim" style={{ margin: 0 }}>{a.body}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => done(false)} autoFocus>Cancel</button>
          <button className={`btn ${a.danger ? 'danger' : 'primary'}`} onClick={() => done(true)}>{a.ok}</button>
        </div>
      </div>
    </div>
  );
}
