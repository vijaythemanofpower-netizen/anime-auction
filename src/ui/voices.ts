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
const NARRATOR = { voice: 'am_michael', speed: 0.98, pitch: 1 };

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 11);

// Hand-cast voices for the built-in characters: the game's own Kokoro voices,
// picked and tuned for each character's age, attitude and pace (no voice copying).
// "key voice speed pitch"; pitch above 1 sounds younger/lighter, below 1 bigger/deeper.
const CAST: Record<string, { voice: string; speed: number; pitch: number }> = Object.fromEntries(
  'naruto am_puck 1.08 1.08|sasuke bm_daniel 0.92 0.94|itachi bm_lewis 0.85 0.92|kakashi am_michael 0.9 0.96|luffy am_puck 1.1 1.12|zoro am_onyx 0.9 0.92|sanji bm_fable 1 1|ace am_liam 1.02 1|goku am_eric 1.05 1.06|vegeta am_fenrir 1 0.98|frieza bm_fable 0.9 1.12|ichigo am_liam 1 0.98|byakuya bm_george 0.85 0.95|aizen bm_lewis 0.85 0.9|gojo am_echo 1 1|yuji am_eric 1.06 1.05|sukuna am_onyx 0.9 0.85|megumi bm_daniel 0.95 0.98|tanjiro am_liam 1 1.06|zenitsu am_puck 1.15 1.15|rengoku am_fenrir 1.08 1|deku am_echo 1.05 1.1|bakugo am_fenrir 1.1 1.02|todoroki bm_daniel 0.9 0.98|allmight am_adam 1 0.88|levi bm_daniel 0.88 0.95|eren am_liam 1.05 0.98|mikasa bf_emma 0.92 1|gon am_puck 1.08 1.15|killua am_echo 1.02 1.12|hisoka bm_fable 0.9 1.02|edward am_eric 1.1 1.1|roy bm_george 0.95 0.98|saitama am_michael 0.88 1|natsu am_liam 1.1 1.04|denji am_eric 1.05 1|minato am_michael 0.95 1.02|madara am_onyx 0.88 0.9|pain bm_george 0.82 0.88|gaara bm_daniel 0.85 0.94|lee am_puck 1.12 1.05|law bm_lewis 0.92 0.96|whitebeard am_onyx 0.85 0.82|shanks am_michael 0.92 0.95|gohan am_echo 1.02 1.06|piccolo am_adam 0.9 0.88|broly am_fenrir 0.95 0.82|kenpachi am_onyx 0.95 0.86|toshiro bm_daniel 0.95 1.06|rukia bf_emma 1 1.04|yuta am_echo 0.95 1.04|todo am_adam 1.05 0.88|nanami bm_george 0.88 0.94|nobara af_jessica 1.05 1|giyu bm_daniel 0.85 0.94|inosuke am_fenrir 1.15 1.06|akaza am_fenrir 1 0.96|shinobu af_nicole 0.95 1.04|shigaraki bm_lewis 0.85 0.9|endeavor am_adam 1 0.86|kurapika bm_daniel 0.95 1.04|meruem bm_george 0.85 0.88|jinwoo am_michael 0.9 0.94|jotaro am_onyx 0.88 0.9|dio bm_fable 1 0.98|mob am_echo 0.88 1.1|kaneki am_echo 0.92 1|asta am_puck 1.15 1.08|yuno bm_daniel 0.92 1.02|power af_bella 1.12 1.06|yor af_sarah 0.92 1|gilgamesh bm_fable 0.92 0.95|saber bf_isabella 0.95 1|kirito am_liam 1 1.04|frieren bf_alice 0.85 1.02|escanor bm_george 0.9 0.9'.split('|').map((row) => { const [k, voice, speed, pitch] = row.split(' '); return [k, { voice, speed: Number(speed), pitch: Number(pitch) }]; }),
);

export function voiceFor(v: VoiceInfo): { voice: string; speed: number; pitch: number } {
  const cast = v.charId.startsWith('legend:') ? CAST[v.charId.slice(7)] : undefined;
  if (cast) return cast;
  return { ...autoVoice(v), pitch: 1 };
}

function autoVoice(v: VoiceInfo): { voice: string; speed: number } {
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
  private queue: Array<{ key: string; text: string; voice: string; speed: number; pitch?: number }> = [];
  private pitchOf = new Map<string, number>();
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
        // Played back faster/slower to shift the pitch; generated at a matching speed so the pace holds.
        if (key) { this.cache.set(key, m.data); this.rates.set(key, m.rate * (this.pitchOf.get(key) ?? 1)); }
        this.busy = false;
        this.pump();
      }
    };
    this.worker.postMessage({ type: 'load' });
  }

  /** Starts the download again after an error (or a stuck download). */
  retry() {
    this.worker?.terminate();
    this.worker = null;
    this.status = 'off'; this.progress = 0; this.error = ''; this.busy = false; this.pending.clear();
    this.load();
  }

  /** Queues lines to be voiced ahead of playback. */
  prefetch(items: Array<{ key: string; text: string; voice: string; speed: number; pitch?: number }>) {
    for (const it of items) if (it.pitch) this.pitchOf.set(it.key, it.pitch);
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
    this.worker.postMessage({ type: 'speak', id, text: next.text, voice: next.voice, speed: Math.min(2, Math.max(0.5, next.speed / (next.pitch ?? 1))) });
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
  const out: Array<{ key: string; seq: number; text: string; voice: string; speed: number; pitch: number; big: boolean; narrator: boolean }> = [];
  lines.forEach((l) => {
    const big = l.tone === 'hype' || l.tone === 'shock';
    const v = l.speaker === 'narrator' ? NARRATOR : info(l.speaker) ? voiceFor(info(l.speaker)!) : NARRATOR;
    let text = l.text.replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
    // Big calls are read with energy: an exclamation mark lifts Kokoro's delivery.
    if (big && /[.]$/.test(text)) text = `${text.slice(0, -1)}!`;
    if (!text || text === '...') return;
    // Keyed by voice and text, so a re-run fight reuses lines it already has.
    // Delivery follows the line: shouted lines come quicker, trailing or hurt lines slower.
    const mood = /\.\.\.|…/.test(text) ? 0.88 : /!$/.test(text) ? 1.06 : /\?$/.test(text) ? 0.97 : 1;
    const speed = Math.round(v.speed * mood * 100) / 100;
    out.push({ key: `${v.voice}|${speed}|${v.pitch}|${text}`, seq: l.seq, text, voice: v.voice, speed, pitch: v.pitch, big: big || l.speaker !== 'narrator', narrator: l.speaker === 'narrator' });
  });
  return out;
}

export function stopNaturalVoice() { stopPcm(); }
