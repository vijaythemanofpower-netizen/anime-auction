import { useEffect, useReducer, useRef, type ReactNode } from 'react';

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
