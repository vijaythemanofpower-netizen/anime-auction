// Cricket sounds made with the Web Audio API (no audio files): bat crack, crowd roar, stumps, groan.
type Kind = 'tap' | 'crack' | 'four' | 'six' | 'wicket' | 'dot' | 'cheer';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

/** Filtered noise with an attack/decay envelope (crowd, impacts). */
function burst(c: AudioContext, at: number, dur: number, freq: number, q: number, peak: number, attack = 0.005) {
  const src = c.createBufferSource(); src.buffer = noise;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(at, Math.random()); src.stop(at + dur + 0.05);
}

function tone(c: AudioContext, at: number, dur: number, f0: number, f1: number, peak: number, type: OscillatorType = 'triangle') {
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(peak, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at); o.stop(at + dur + 0.02);
}

export function sfx(kind: Kind) {
  const c = ac();
  if (!c || !noise) return;
  const t = c.currentTime + 0.01;
  switch (kind) {
    case 'tap': tone(c, t, 0.05, 900, 700, 0.06, 'square'); break;
    case 'dot': burst(c, t, 0.08, 1800, 2, 0.15); break;
    case 'crack': burst(c, t, 0.09, 2400, 1.2, 0.6, 0.002); tone(c, t, 0.06, 420, 180, 0.25); break;
    case 'four': sfx('crack'); burst(c, t + 0.15, 1.6, 700, 0.6, 0.35, 0.25); break;
    case 'six': sfx('crack'); burst(c, t + 0.1, 2.6, 650, 0.5, 0.5, 0.35); burst(c, t + 0.3, 2.2, 1400, 0.8, 0.2, 0.4); break;
    case 'wicket':
      // Stumps clatter, then the crowd.
      for (let i = 0; i < 3; i++) tone(c, t + i * 0.045, 0.12, 1300 - i * 250, 500, 0.18, 'square');
      burst(c, t + 0.2, 1.8, 600, 0.5, 0.4, 0.2);
      break;
    case 'cheer': burst(c, t, 2.4, 750, 0.5, 0.45, 0.3); break;
  }
}
