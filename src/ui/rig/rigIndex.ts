import { useEffect, useState } from 'react';

export interface RigIndexEntry { key: string; forms: Record<string, string> }
export type RigIndex = Record<string, RigIndexEntry>;
let cached: RigIndex | null = null;
let pending: Promise<RigIndex> | null = null;
const listeners = new Set<() => void>();
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

function load(): Promise<RigIndex> {
  if (cached) return Promise.resolve(cached);
  pending ??= fetch(`${BASE}rigs/index.json`).then((r) => r.ok ? r.json() : {}).catch(() => ({})).then((v: RigIndex) => {
    cached = v && typeof v === 'object' ? v : {};
    listeners.forEach((fn) => fn());
    return cached;
  });
  return pending;
}

export function useRigIndex(): RigIndex | null {
  const [, update] = useState(0);
  useEffect(() => { const fn = () => update((n) => n + 1); listeners.add(fn); void load(); return () => { listeners.delete(fn); }; }, []);
  return cached;
}

export function rigReady(index: RigIndex | null | undefined, charId: string): boolean {
  return !!index?.[charId]?.forms?.base;
}

export function rigBase(index: RigIndex | null | undefined, charId: string, form: number): string | undefined {
  const entry = index?.[charId];
  if (!entry) return undefined;
  const forms = entry.forms ?? {};
  for (let n = Math.max(0, Math.floor(form)); n >= 1; n--) if (forms[String(n)]) return forms[String(n)];
  return forms.base;
}
