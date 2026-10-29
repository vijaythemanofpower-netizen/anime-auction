// Battle audio, made entirely in the browser: synthesized sound effects (Web
// Audio) and the commentary read aloud (Speech Synthesis). No audio files.
import type { BattleEvent, NarrationLine } from '../engine/types';
import { ABILITIES } from '../engine/data/abilities';
import { clipKeys, cryKey, getClip, moveKey, onClipsChanged } from '../store/media';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function noise(dur: number, freq: number, gain: number, opts: { type?: BiquadFilterType; delay?: number; sweepTo?: number } = {}) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + (opts.delay ?? 0);
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'lowpass';
  f.frequency.setValueAtTime(freq, t);
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

function tone(from: number, to: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  hit: (heavy: boolean) => { noise(heavy ? 0.28 : 0.14, heavy ? 900 : 1600, heavy ? 0.9 : 0.6); tone(heavy ? 120 : 180, 45, heavy ? 0.3 : 0.16, heavy ? 0.9 : 0.5); },
  crit: () => { noise(0.35, 2400, 0.9, { sweepTo: 300 }); tone(160, 40, 0.4, 1); tone(1200, 400, 0.18, 0.25, 'square'); },
  slash: () => { noise(0.18, 3000, 0.5, { type: 'highpass', sweepTo: 7000 }); },
  block: () => { tone(900, 700, 0.12, 0.35, 'triangle'); tone(1400, 1100, 0.1, 0.18, 'square'); noise(0.08, 2500, 0.25); },
  dodge: () => { noise(0.22, 600, 0.35, { type: 'bandpass', sweepTo: 3000 }); },
  parry: () => { tone(1800, 1500, 0.25, 0.3, 'triangle'); tone(2600, 2400, 0.2, 0.15, 'sine', 0.02); },
  clash: () => { noise(0.6, 1800, 1, { sweepTo: 120 }); tone(90, 30, 0.7, 1); tone(600, 200, 0.5, 0.3, 'sawtooth', 0.05); },
  guardBreak: () => { noise(0.3, 4000, 0.7, { type: 'highpass' }); tone(500, 120, 0.3, 0.4, 'square'); },
  knockdown: () => { tone(70, 30, 0.5, 1); noise(0.5, 300, 0.8); crowd(1.2, 0.35); },
  ko: () => { bell(); crowd(1.8, 0.5); },
  charge: () => { tone(200, 900, 0.6, 0.25, 'sawtooth'); noise(0.6, 500, 0.2, { type: 'bandpass', sweepTo: 4000 }); },
  aura: () => { tone(110, 220, 0.9, 0.35, 'sawtooth'); noise(0.9, 300, 0.3, { sweepTo: 2500 }); },
  injury: () => { tone(300, 90, 0.25, 0.3, 'square'); },
  call: () => { tone(880, 880, 0.08, 0.3, 'square'); tone(1320, 1320, 0.1, 0.25, 'square', 0.09); },
  intro: () => { bell(); },
};

function bell() { for (const d of [0, 0.35, 0.7]) { tone(1100, 1050, 0.6, 0.35, 'triangle', d); tone(2200, 2150, 0.4, 0.12, 'sine', d); } }
function crowd(dur: number, gain: number) { noise(dur, 1200, gain, { type: 'bandpass', sweepTo: 700 }); }

// ------------------------------------------------------- recorded samples

// Public-domain (CC0) recordings in public/sfx; see public/sfx/CREDITS.txt.
const range = (p: string, n: number, pad = false) => Array.from({ length: n }, (_, i) => `${p}${pad ? String(i + 1).padStart(2, '0') : i + 1}`);
const BANK: Record<string, string[]> = {
  punch: range('punch_', 8), slam: range('slam_', 7, true), slash: [...range('slash_', 6), ...range('blade_', 3, true)],
  clash: range('clash_', 6), boom: ['boom_1', 'boom_2', 'boom_3', ...range('cannon_', 5, true)], bang: range('bang_', 4, true),
  shoot: ['shoot_1', 'shoot_2'], rocket: ['rocket_1'], teleport: ['teleport_1', 'teleport_2'], fire: range('fire_', 7, true),
  spell: ['spell_1', 'spell_2'], magic: range('magic_', 3), weird: range('weird_', 3, true), thunder: ['thunder_1'],
  whoosh: range('whoosh_', 3, true), roar: range('roar_', 3, true), chain: range('chain_', 3, true), gong: ['gong_1', 'gong_2'],
  bell: ['bell_1'], metal: range('metalhit_', 2, true), rubble: range('rubble_', 3, true), splash: ['splash_1', 'splash_2'], ice: ['ice_1', 'ice_2'],
};
const buffers = new Map<string, AudioBuffer>();
let loading: Promise<void> | null = null;

/** Loads the recorded sounds once (in the background). */
export function preloadSamples(): Promise<void> {
  if (loading) return loading;
  const c = ac();
  if (!c) return Promise.resolve();
  const names = [...new Set(Object.values(BANK).flat())];
  loading = Promise.all(names.map(async (n) => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sfx/${n}.ogg`);
      if (!res.ok) return;
      buffers.set(n, await c.decodeAudioData(await res.arrayBuffer()));
    } catch { /* missing or undecodable: the synth fallback covers it */ }
  })).then(() => undefined);
  return loading;
}

/** Plays a random recording from a group. Returns false if none is loaded. */
function sample(group: string, o: { gain?: number; delay?: number; rate?: number } = {}): boolean {
  const c = ac();
  const names = (BANK[group] ?? []).filter((n) => buffers.has(n));
  if (!c || !master || !names.length) return false;
  const src = c.createBufferSource();
  src.buffer = buffers.get(names[Math.floor(Math.random() * names.length)])!;
  src.playbackRate.value = (o.rate ?? 1) * (0.92 + Math.random() * 0.16);
  const g = c.createGain();
  g.gain.value = o.gain ?? 0.9;
  src.connect(g).connect(master);
  src.start(c.currentTime + (o.delay ?? 0));
  return true;
}

/** Sounds for a move landing, by what the move looks like. */
function strikeSound(e: BattleEvent): boolean {
  const a = e.ability ? ABILITIES[e.ability] : undefined;
  const heavy = e.crit || e.context?.impact === 'heavy' || e.context?.impact === 'devastating';
  const kind = a?.vfx ?? (e.action === 'combo' ? 'barrage' : a?.fx.style === 'slash' ? 'slash' : 'punch');
  const hit = (d: number) => { sample(heavy ? 'slam' : 'punch', { delay: d }); if (e.crit) sample('bang', { delay: d, gain: 0.7 }); };
  if (!buffers.size) return false;
  if (a && /chain/i.test(a.name)) { sample('chain'); hit(0.15); return true; }
  switch (kind) {
    case 'slash': sample('slash'); if (heavy) sample('slam', { delay: 0.08, gain: 0.6 }); return true;
    case 'beam': sample('rocket', { rate: 0.8 }); sample('boom', { delay: 0.35 }); return true;
    case 'projectile': sample('whoosh'); hit(0.3); return true;
    case 'explosion': sample('rocket'); sample('boom', { delay: 0.45 }); return true;
    case 'barrage': for (let i = 0; i < 6; i++) sample('punch', { delay: i * 0.07, gain: 0.7 }); if (heavy) sample('slam', { delay: 0.45 }); return true;
    case 'lightning': sample('thunder', { gain: 0.8 }); sample('spell', { gain: 0.5 }); return true;
    case 'fire': sample('fire'); if (heavy) sample('boom', { delay: 0.35, gain: 0.6 }); return true;
    case 'ice': sample('whoosh'); sample('ice', { delay: 0.3 }); return true;
    case 'wave': sample('whoosh'); sample('slash', { delay: 0.3 }); return true;
    case 'genjutsu': sample('weird'); return true;
    case 'domain': sample('gong'); sample('boom', { delay: 0.6 }); return true;
    case 'summon': sample('roar'); hit(0.45); return true;
    default: hit(0); return true;
  }
}

// ------------------------------------------------- the player's own clips

let customKeys = new Set<string>();
const customBuffers = new Map<string, AudioBuffer | null>();
const refreshCustom = () => { void clipKeys().then((k) => { customKeys = new Set(k); customBuffers.clear(); }); };
if (typeof window !== 'undefined') { refreshCustom(); onClipsChanged(refreshCustom); }

/** Plays a clip the player added, if there is one for this key. */
function custom(key: string, delay = 0): boolean {
  if (!customKeys.has(key)) return false;
  const c = ac();
  if (!c || !master) return false;
  const play = (buf: AudioBuffer | null) => {
    if (!buf || !master) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.start(c.currentTime + delay);
  };
  if (customBuffers.has(key)) { play(customBuffers.get(key)!); return true; }
  void getClip(key).then(async (blob) => {
    let buf: AudioBuffer | null = null;
    try { if (blob) buf = await c.decodeAudioData(await blob.arrayBuffer()); } catch { buf = null; }
    customBuffers.set(key, buf);
    play(buf);
  });
  return true;
}

/** Plays the sound for one battle event, if it has one. Your clips first, then recordings, then synth. */
export function playEvent(e: BattleEvent) {
  void preloadSamples();
  const a = e.ability ? ABILITIES[e.ability] : undefined;
  switch (e.type) {
    case 'ability': case 'desperation': {
      const cry = a?.kind === 'ultimate' && !!e.actor && custom(cryKey(e.actor));
      if (e.ability && custom(moveKey(e.ability), cry ? 0.6 : 0)) return;
      if (cry) return;
      break;
    }
    case 'rival': if (e.actor && e.target) { const x = custom(cryKey(e.actor)); const y = custom(cryKey(e.target), 1.6); if (x || y) return; } break;
    case 'awakening': case 'reinforcement': if (e.actor && custom(cryKey(e.actor))) return; break;
  }
  const both = (a: boolean, b: () => unknown) => { if (a) b(); return a; };
  const recorded = (() => {
    switch (e.type) {
      case 'attack': case 'counter': return e.context?.environmental ? sample('boom') : strikeSound(e);
      case 'block': return sample(e.ability && ABILITIES[e.ability]?.vfx === 'slash' ? 'clash' : 'metal');
      case 'miss': return sample('whoosh');
      case 'parry': return sample('clash');
      case 'clash': return both(sample('clash'), () => sample('boom', { delay: 0.7 }));
      case 'guard_break': return both(sample('metal'), () => sample('rubble', { delay: 0.1 }));
      case 'knockdown': return both(sample('slam'), () => { sample('rubble', { delay: 0.15 }); crowd(1.2, 0.3); });
      case 'defeat': return both(sample('gong'), () => crowd(1.8, 0.45));
      case 'ability': case 'desperation': {
        const a = e.ability ? ABILITIES[e.ability] : undefined;
        if (a && (a.kind === 'buff' || a.vfx === 'aura')) return sample('magic');
        if (a?.vfx === 'fire') return sample('fire', { gain: 0.6 });
        if (a?.vfx === 'lightning') return sample('thunder', { gain: 0.5 });
        if (a?.vfx === 'summon') return sample('roar');
        return sample('spell');
      }
      case 'awakening': return both(sample('magic'), () => sample('roar', { delay: 0.3, gain: 0.6 }));
      case 'reinforcement': return sample('teleport');
      case 'rival': return sample('gong');
      case 'twist': return both(sample('boom'), () => sample('rubble', { delay: 0.2 }));
      case 'combo': return both(sample('rocket'), () => sample('boom', { delay: 0.5 }));
      case 'intro': return sample('bell');
    }
    return false;
  })();
  if (recorded) return;
  const impact = e.context?.impact;
  switch (e.type) {
    case 'intro': return sfx.intro();
    case 'attack': case 'counter': return e.crit ? sfx.crit() : sfx.hit(impact === 'heavy' || impact === 'devastating');
    case 'block': return sfx.block();
    case 'miss': return sfx.dodge();
    case 'parry': return sfx.parry();
    case 'clash': return sfx.clash();
    case 'guard_break': return sfx.guardBreak();
    case 'knockdown': return sfx.knockdown();
    case 'defeat': return sfx.ko();
    case 'injury': return sfx.injury();
    case 'ability': case 'desperation': return sfx.charge();
    case 'awakening': return sfx.aura();
    case 'call': case 'corner': return sfx.call();
    case 'reinforcement': case 'combo': case 'rival': return sfx.charge();
    case 'twist': return sfx.knockdown();
  }
}

// ------------------------------------------------------------ natural voice

let voiceSrc: AudioBufferSourceNode | null = null;
let voiceEndsAt = 0;

/** Plays generated speech. Interrupting stops the current line; otherwise it waits its turn. */
export function playPcm(data: Float32Array, rate: number, interrupt: boolean) {
  const c = ac();
  if (!c || !master) return;
  const buf = c.createBuffer(1, data.length, rate);
  buf.getChannelData(0).set(data);
  if (interrupt) stopPcm();
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = 1.6;
  src.connect(g).connect(master);
  const start = Math.max(c.currentTime, interrupt ? 0 : voiceEndsAt);
  src.start(start);
  voiceEndsAt = start + buf.duration;
  voiceSrc = src;
}

export function stopPcm() {
  try { voiceSrc?.stop(); } catch { /* already stopped */ }
  voiceSrc = null;
  voiceEndsAt = 0;
}

// ------------------------------------------------------------------ voice

let voices: SpeechSynthesisVoice[] = [];
function loadVoices() {
  try { voices = window.speechSynthesis?.getVoices().filter((v) => v.lang.startsWith('en')) ?? []; } catch { voices = []; }
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

const hashName = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/**
 * Reads commentary aloud. Calm lines are skipped while something is still being
 * said, and big moments interrupt, so the voice keeps up with the action.
 */
export function speakLines(lines: NarrationLine[], speed: number) {
  if (!('speechSynthesis' in window) || !lines.length) return;
  const synth = window.speechSynthesis;
  const big = lines.some((l) => l.tone === 'hype' || l.tone === 'shock' || l.tone === 'dialogue');
  if (synth.speaking && !big) return;
  if (synth.speaking) synth.cancel();
  for (const l of lines.slice(0, 2)) {
    const u = new SpeechSynthesisUtterance(l.text.replace(/[“”"]/g, ''));
    const narrator = l.speaker === 'narrator';
    if (voices.length) u.voice = voices[narrator ? 0 : hashName(l.speaker) % voices.length];
    u.rate = Math.min(2, (narrator ? 1.15 : 1.05) * Math.sqrt(speed));
    u.pitch = narrator ? (l.tone === 'shock' || l.tone === 'hype' ? 1.25 : 1.05) : 0.7 + (hashName(l.speaker) % 70) / 100;
    u.volume = 1;
    synth.speak(u);
  }
}

export function stopVoice() {
  try { window.speechSynthesis?.cancel(); } catch { /* not available */ }
}
