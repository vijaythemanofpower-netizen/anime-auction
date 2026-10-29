// Battle music. A fighter's own music (added by the player) wins, then music
// added for their series, then a free built-in track (public/bgm, CC0) chosen
// to suit who is fighting: hot-heads get metal, villains get dark themes, and
// so on. The pick is seeded, so a replay plays the same track.
import type { BattleRecord, PublicCharacter, Temperament } from '../engine/types';
import { Rng, hashString } from '../engine/rng';
import { getClip, musicKey, seriesMusicKey } from '../store/media';

export interface Track { file: string; name: string; moods: Mood[] }
type Mood = 'metal' | 'epic' | 'dark' | 'hype' | 'heroic';

export const TRACKS: Track[] = [
  { file: 'metal_rush.mp3', name: 'Metal Rush', moods: ['metal'] },
  { file: 'symphonic_metal.mp3', name: 'Symphonic Metal', moods: ['metal', 'epic'] },
  { file: 'rock_battle.mp3', name: 'Rock Battle', moods: ['metal', 'hype'] },
  { file: 'epic_boss.mp3', name: 'Epic Boss', moods: ['epic', 'dark'] },
  { file: 'heroic_pursuit.mp3', name: 'Heroic Pursuit', moods: ['heroic', 'epic'] },
  { file: 'battle_a.mp3', name: 'Battle Theme A', moods: ['heroic'] },
  { file: 'dark_battle.mp3', name: 'Dark Battle', moods: ['dark'] },
  { file: 'tension.mp3', name: 'Tension', moods: ['dark', 'heroic'] },
  { file: 'hyper_drive.mp3', name: 'Hyper Drive', moods: ['hype'] },
  { file: 'fast_fight.mp3', name: 'Fast Fight', moods: ['hype', 'metal'] },
];

const TEMPER_MOOD: Record<Temperament, Mood> = {
  'hot-blooded': 'metal', aggressive: 'metal', reckless: 'metal', arrogant: 'dark', calculating: 'dark',
  cheerful: 'hype', stoic: 'heroic', patient: 'heroic', analytical: 'heroic', defensive: 'heroic',
};

export type MusicChoice = { kind: 'own'; key: string; label: string } | { kind: 'builtin'; track: Track };

/** Picks the fight's music. `have` holds the keys of music the player added. */
export function chooseMusic(record: BattleRecord, characters: Record<string, PublicCharacter>, have: Set<string>): MusicChoice {
  const { input } = record;
  // The fighters who open the fight, the higher-priced (the bigger star) first.
  const leads = input.sides.map((s) => s.fighters.find((f) => f.position === 'front') ?? s.fighters[0]).sort((a, b) => b.price - a.price);
  const rng = new Rng(hashString(`${input.battleId}:${input.seed}:music`));
  for (const f of leads) if (have.has(musicKey(f.charId))) return { kind: 'own', key: musicKey(f.charId), label: `${f.name}'s music` };
  for (const f of leads) {
    const series = characters[f.charId]?.series;
    if (series && have.has(seriesMusicKey(series))) return { kind: 'own', key: seriesMusicKey(series), label: `${series} music` };
  }
  const tags = leads.flatMap((f) => f.tags);
  const mood: Mood = input.rivalry || input.mode === 'squad' ? 'epic'
    : tags.some((t) => t === 'DEMON' || t === 'DARK') && rng.next() < 0.6 ? 'dark'
      : TEMPER_MOOD[leads[rng.int(0, leads.length - 1)].temperament];
  const fits = TRACKS.filter((t) => t.moods.includes(mood));
  return { kind: 'builtin', track: fits[rng.int(0, fits.length - 1)] };
}

const VOLUME = 0.32;

/** One looping music player shared by the battle screen. */
class MusicPlayer {
  private el: HTMLAudioElement | null = null;
  private url: string | null = null;
  private current = '';
  private fade: ReturnType<typeof setInterval> | null = null;
  label = '';

  async play(choice: MusicChoice): Promise<void> {
    const id = choice.kind === 'own' ? choice.key : choice.track.file;
    if (this.current === id && this.el) { void this.el.play().catch(() => {}); return; }
    this.stop(0);
    this.current = id;
    let src = `${import.meta.env.BASE_URL}bgm/${choice.kind === 'builtin' ? choice.track.file : ''}`;
    if (choice.kind === 'own') {
      const blob = await getClip(choice.key);
      if (!blob || this.current !== id) return;
      this.url = URL.createObjectURL(blob);
      src = this.url;
    }
    this.label = choice.kind === 'own' ? choice.label : choice.track.name;
    const el = new Audio(src);
    el.loop = true;
    el.volume = 0;
    this.el = el;
    void el.play().then(() => this.ramp(VOLUME, 1200)).catch(() => { /* autoplay blocked until the player interacts */ });
  }

  pause() { this.el?.pause(); }
  resume() { if (this.el) void this.el.play().catch(() => {}); }
  /** Quieter while a character or the commentator is speaking. */
  duck(on: boolean) { if (this.el && !this.fade) this.el.volume = on ? VOLUME * 0.45 : VOLUME; }

  stop(ms = 1500) {
    const el = this.el, url = this.url;
    this.el = null; this.url = null; this.current = ''; this.label = '';
    if (!el) return;
    const end = () => { el.pause(); if (url) URL.revokeObjectURL(url); };
    if (!ms) { end(); return; }
    const start = el.volume, t0 = Date.now();
    const iv = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      el.volume = start * (1 - k);
      if (k >= 1) { clearInterval(iv); end(); }
    }, 50);
  }

  private ramp(to: number, ms: number) {
    const el = this.el;
    if (!el) return;
    if (this.fade) clearInterval(this.fade);
    const from = el.volume, t0 = Date.now();
    this.fade = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      el.volume = from + (to - from) * k;
      if (k >= 1 && this.fade) { clearInterval(this.fade); this.fade = null; }
    }, 50);
  }
}

export const music = new MusicPlayer();
