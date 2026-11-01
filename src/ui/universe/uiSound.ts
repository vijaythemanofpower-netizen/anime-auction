// Optional interface sounds (off by default; Settings > Interface sounds): a short
// synthesized "shing" on buttons and a heavier hit on main actions. No audio files,
// nothing plays until the player turns it on and clicks.
const KEY = 'aa-ui-sound';
let ctx: AudioContext | null = null;
export const uiSoundOn = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setUiSound = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ } };
export function uiClick(big: boolean) {
  if (!uiSoundOn()) return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = big ? 'square' : 'triangle';
    o.frequency.setValueAtTime(big ? 220 : 1400, t);
    o.frequency.exponentialRampToValueAtTime(big ? 70 : 2600, t + (big ? 0.18 : 0.07));
    g.gain.setValueAtTime(big ? 0.09 : 0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.22 : 0.09));
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.25);
  } catch { /* audio unavailable */ }
}
