import { useEffect, useState } from 'react';
import { useApp } from '../../store/store';

/** True when animation is welcome: the app setting allows it and, on "system", the OS does too. */
export function useMotionOk(): boolean {
  const setting = useApp((s) => s.settings.reducedMotion);
  const [systemReduce, setSystemReduce] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const q = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSystemReduce(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return setting === 'off' || (setting === 'system' && !systemReduce);
}
