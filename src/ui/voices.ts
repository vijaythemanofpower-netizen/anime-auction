// Natural voices: an original Kokoro voice for every character, chosen from
// their gender and temperament (always the same voice for the same character),
// plus a hype commentator. Lines are generated ahead of playback in a worker.
import type { NarrationLine, Temperament } from '../engine/types';
import { playPcm, stopPcm } from './sound';

export type VoiceStatus = 'off' | 'loading' | 'ready' | 'error';
export interface VoiceInfo { charId: string; gender?: 'male' | 'female' | 'other'; temperament: Temperament }

type Group = 'fiery' | 'proud' | 'cool' | 'fierce' | 'steady';
const GROUP: Record<Temperament, Group> = {
  'hot-blooded': 'fiery', reckless: 'fiery', cheerful: 'fiery', arrogant: 'proud', stoic: 'cool', calculating: 'cool', analytical: 'cool',
  aggressive: 'fierce', patient: 'steady', defensive: 'steady',
};
const VOICES: Record<'male' | 'female', Record<Group, string[]>> = {
  male: { fiery: ['am_puck', 'am_liam', 'am_eric'], proud: ['bm_fable', 'am_fenrir', 'bm_lewis'], cool: ['bm_george', 'am_onyx', 'bm_daniel'], fierce: ['am_fenrir', 'am_adam', 'am_onyx'], steady: ['am_echo', 'am_michael', 'bm_daniel'] },
  female: { fiery: ['af_bella', 'af_nova', 'af_sky'], proud: ['bf_isabella', 'af_kore', 'bf_lily'], cool: ['bf_emma', 'af_river', 'af_alloy'], fierce: ['af_jessica', 'af_nicole', 'af_kore'], steady: ['af_heart', 'bf_alice', 'af_sarah'] },
};
// Unhurried by default: the fight now waits for each line, so nobody has to rush.
const SPEED: Partial<Record<Temperament, number>> = { 'hot-blooded': 1.04, reckless: 1.06, cheerful: 1.03, stoic: 0.86, calculating: 0.9, arrogant: 0.9, patient: 0.9 };
const NARRATOR = { voice: 'am_michael', speed: 0.98 };

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 11);

export function voiceFor(v: VoiceInfo): { voice: string; speed: number } {
  const g = v.gender === 'female' ? 'female' : v.gender === 'male' ? 'male' : hash(v.charId) % 3 === 0 ? 'female' : 'male';
  const list = VOICES[g][GROUP[v.temperament]];
  return { voice: list[hash(v.charId) % list.length], speed: SPEED[v.temperament] ?? 1 };
}

class NaturalVoices {
  status: VoiceStatus = 'off';
  progress = 0;
  error = '';
  device: 'webgpu' | 'wasm' | '' = '';
  private worker: Worker | null = null;
  private listeners = new Set<() => void>();
  private cache = new Map<string, Float32Array | null>();
  private rates = new Map<string, number>();
  private queue: Array<{ key: string; text: string; voice: string; speed: number }> = [];
  private busy = false;
  private nextId = 1;
  private pending = new Map<number, string>();

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { for (const f of this.listeners) f(); }

  load() {
    if (this.worker) return;
    this.status = 'loading';
    this.emit();
    try {
      this.worker = new Worker(new URL('./voice.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      this.status = 'error'; this.error = (e as Error).message; this.emit(); return;
    }
    this.worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'progress') { this.progress = Math.max(this.progress, Math.round(m.progress)); this.emit(); }
      if (m.type === 'ready') { this.status = 'ready'; this.device = m.device; this.progress = 100; this.emit(); this.pump(); }
      if (m.type === 'error') { this.status = 'error'; this.error = m.message; this.emit(); }
      if (m.type === 'audio') {
        const key = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (key) { this.cache.set(key, m.data); this.rates.set(key, m.rate); }
        this.busy = false;
        this.pump();
      }
    };
    this.worker.postMessage({ type: 'load' });
  }

  /** Queues lines to be voiced ahead of playback. */
  prefetch(items: Array<{ key: string; text: string; voice: string; speed: number }>) {
    for (const it of items) if (!this.cache.has(it.key) && !this.queue.some((q) => q.key === it.key)) this.queue.push(it);
    this.pump();
  }

  /** Drops queued lines that belong to an earlier battle. */
  resetQueue() { this.queue = []; }

  private pump() {
    if (this.busy || this.status !== 'ready' || !this.worker) return;
    const next = this.queue.shift();
    if (!next) return;
    this.busy = true;
    const id = this.nextId++;
    this.pending.set(id, next.key);
    this.worker.postMessage({ type: 'speak', id, text: next.text, voice: next.voice, speed: next.speed });
  }

  /** Plays a pre-generated line. Returns false if it is not ready yet. */
  play(key: string, interrupt: boolean): boolean {
    const data = this.cache.get(key);
    if (!data) return false;
    playPcm(data, this.rates.get(key) ?? 24000, interrupt);
    return true;
  }
}

export const naturalVoices = new NaturalVoices();
if (import.meta.env.DEV) (window as unknown as { __voices: NaturalVoices }).__voices = naturalVoices;

/** Every line gets a natural voice: the characters' own and the commentator's. */
export function voicedLines(lines: NarrationLine[], info: (speaker: string) => VoiceInfo | undefined) {
  const out: Array<{ key: string; seq: number; text: string; voice: string; speed: number; big: boolean }> = [];
  lines.forEach((l) => {
    const big = l.tone === 'hype' || l.tone === 'shock';
    const v = l.speaker === 'narrator' ? NARRATOR : info(l.speaker) ? voiceFor(info(l.speaker)!) : NARRATOR;
    let text = l.text.replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
    // Big calls are read with energy: an exclamation mark lifts Kokoro's delivery.
    if (big && /[.]$/.test(text)) text = `${text.slice(0, -1)}!`;
    if (!text || text === '...') return;
    // Keyed by voice and text, so a re-run fight reuses lines it already has.
    out.push({ key: `${v.voice}|${v.speed}|${text}`, seq: l.seq, text, voice: v.voice, speed: v.speed, big: big || l.speaker !== 'narrator' });
  });
  return out;
}

export function stopNaturalVoice() { stopPcm(); }
