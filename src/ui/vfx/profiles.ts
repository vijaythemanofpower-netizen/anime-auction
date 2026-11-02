// Per-character visual effects profiles for the cinematic VFX engine (CinematicVfx.ts).
// Each character gets their own colours, aura, smoke, particles and special effects, so
// Gojo never looks like Sukuna. Keys match the home worlds (src/ui/home/worlds.ts) and the
// built-in character ids (legend:<key>); anyone else gets a profile built from their accent.

export type AuraStyle = 'ki' | 'flame' | 'electric' | 'void' | 'water' | 'cloud' | 'shadow' | 'blade' | 'none';
export type Mote = 'ember' | 'spark' | 'droplet' | 'ash' | 'leaf' | 'mote' | 'petal' | 'dust';

export interface VfxProfile {
  primary: string;
  secondary: string;
  aura: AuraStyle;
  /** Smoke: colour, how much (0-1), and whether it glows (additive) or shades (normal). */
  smoke: { color: string; density: number; glow: boolean };
  /** Floating particles. */
  motes: { kind: Mote; rate: number; color: string };
  /** Branching lightning arcs per second (0 = none). */
  lightning?: { color: string; rate: number };
  /** Rising flames along the bottom and around the character. */
  fire?: boolean;
  /** Flowing water ribbons and droplets. */
  water?: boolean;
  /** Directional sword-cut streaks per second. */
  cuts?: { color: string; rate: number };
  /** Expanding energy rings per second. */
  rings?: number;
  /** Wind strength (pushes smoke and particles sideways, -1..1). */
  wind: number;
  /** Where the character's chest/face sits in the art (0-1), for the aura and light. */
  focus: { x: number; y: number };
  /** How much the art sways (hair, cloth) and breathes, 0-1. */
  life: number;
}

const P = (p: Partial<VfxProfile> & Pick<VfxProfile, 'primary' | 'secondary' | 'aura'>): VfxProfile => ({
  smoke: { color: '#1a1a22', density: 0.5, glow: false },
  motes: { kind: 'mote', rate: 8, color: p.primary },
  wind: 0.15,
  focus: { x: 0.6, y: 0.42 },
  life: 0.7,
  ...p,
});

export const PROFILES: Record<string, VfxProfile> = {
  gojo: P({ primary: '#5ab0ff', secondary: '#b47cff', aura: 'void', smoke: { color: '#2a3f8a', density: 0.45, glow: true }, motes: { kind: 'mote', rate: 22, color: '#bfe3ff' }, rings: 0.35, wind: 0.05, life: 0.5 }),
  sukuna: P({ primary: '#ff2a3d', secondary: '#3a0008', aura: 'shadow', smoke: { color: '#2a0006', density: 0.85, glow: false }, motes: { kind: 'ember', rate: 14, color: '#ff4a3a' }, cuts: { color: '#ff3346', rate: 0.6 }, wind: -0.2 }),
  goku: P({ primary: '#ffcf33', secondary: '#4fb4ff', aura: 'ki', smoke: { color: '#3a3020', density: 0.6, glow: false }, motes: { kind: 'dust', rate: 12, color: '#ffe9a0' }, lightning: { color: '#cfe8ff', rate: 0.35 }, rings: 0.4, wind: 0.2 }),
  vegeta: P({ primary: '#3d8bff', secondary: '#ffd400', aura: 'ki', smoke: { color: '#14203a', density: 0.55, glow: false }, motes: { kind: 'spark', rate: 14, color: '#bcd6ff' }, lightning: { color: '#9cc7ff', rate: 0.5 }, rings: 0.3 }),
  naruto: P({ primary: '#ff8a1f', secondary: '#ffd25a', aura: 'flame', smoke: { color: '#3a1a08', density: 0.5, glow: false }, motes: { kind: 'leaf', rate: 10, color: '#7fa64a' }, rings: 0.25, wind: 0.45 }),
  sasuke: P({ primary: '#9b5cff', secondary: '#7fd8ff', aura: 'electric', smoke: { color: '#160a26', density: 0.6, glow: false }, motes: { kind: 'spark', rate: 12, color: '#d6c2ff' }, lightning: { color: '#b9a4ff', rate: 1.2 }, wind: -0.1 }),
  luffy: P({ primary: '#ffffff', secondary: '#ff3b3b', aura: 'cloud', smoke: { color: '#f4f1ea', density: 0.55, glow: true }, motes: { kind: 'mote', rate: 10, color: '#fff7d6' }, rings: 0.3, wind: 0.3, life: 0.9 }),
  zoro: P({ primary: '#3ddc84', secondary: '#e5e7eb', aura: 'blade', smoke: { color: '#0b1a12', density: 0.5, glow: false }, motes: { kind: 'dust', rate: 10, color: '#c8f5d9' }, cuts: { color: '#5cffa0', rate: 0.9 }, wind: 0.5 }),
  ichigo: P({ primary: '#5ab4ff', secondary: '#ff4d2e', aura: 'shadow', smoke: { color: '#0a0a12', density: 0.75, glow: false }, motes: { kind: 'ash', rate: 14, color: '#cfd6e6' }, cuts: { color: '#9fd0ff', rate: 0.5 }, wind: 0.35 }),
  tanjiro: P({ primary: '#2fd1c2', secondary: '#ff7a2f', aura: 'water', smoke: { color: '#0c2a30', density: 0.4, glow: true }, motes: { kind: 'droplet', rate: 16, color: '#bff6ff' }, water: true, wind: 0.25 }),
  rengoku: P({ primary: '#ff7a1a', secondary: '#ffd23f', aura: 'flame', smoke: { color: '#2a1206', density: 0.6, glow: false }, motes: { kind: 'ember', rate: 26, color: '#ffb347' }, fire: true, wind: 0.15 }),
  levi: P({ primary: '#c9d4dc', secondary: '#3fa66b', aura: 'blade', smoke: { color: '#e8edf0', density: 0.55, glow: true }, motes: { kind: 'dust', rate: 8, color: '#dfe6ea' }, cuts: { color: '#e6f2ff', rate: 0.7 }, wind: 0.6 }),
  eren: P({ primary: '#e0a24a', secondary: '#7fbf8e', aura: 'ki', smoke: { color: '#d8d0c4', density: 0.7, glow: true }, motes: { kind: 'ash', rate: 12, color: '#e8dcc8' }, lightning: { color: '#ffe6a8', rate: 0.25 }, wind: 0.2 }),
  killua: P({ primary: '#7fd8ff', secondary: '#c9b6ff', aura: 'electric', smoke: { color: '#08141c', density: 0.4, glow: false }, motes: { kind: 'spark', rate: 20, color: '#c9f1ff' }, lightning: { color: '#a8ecff', rate: 1.6 }, wind: 0.1 }),
  saitama: P({ primary: '#ffd400', secondary: '#ff3b3b', aura: 'none', smoke: { color: '#c9bfae', density: 0.6, glow: false }, motes: { kind: 'dust', rate: 12, color: '#f0e6cc' }, rings: 0.2, wind: 0.4, life: 0.4 }),
  jinwoo: P({ primary: '#8f6bff', secondary: '#4fd2ff', aura: 'shadow', smoke: { color: '#0a0618', density: 0.9, glow: false }, motes: { kind: 'mote', rate: 16, color: '#b7a2ff' }, rings: 0.2, wind: -0.15 }),
  // More of the roster, for the arena and banners.
  frieza: P({ primary: '#c084fc', secondary: '#facc15', aura: 'void', smoke: { color: '#1a0a26', density: 0.5, glow: false }, motes: { kind: 'mote', rate: 14, color: '#f0d0ff' }, rings: 0.3 }),
  itachi: P({ primary: '#dc2626', secondary: '#111827', aura: 'shadow', smoke: { color: '#14060a', density: 0.7, glow: false }, motes: { kind: 'petal', rate: 10, color: '#2a0a10' } }),
  madara: P({ primary: '#3b82f6', secondary: '#dc2626', aura: 'shadow', smoke: { color: '#0a0f1e', density: 0.7, glow: false }, motes: { kind: 'ember', rate: 14, color: '#ff6a3a' }, fire: true }),
  aizen: P({ primary: '#a78bfa', secondary: '#fde68a', aura: 'void', smoke: { color: '#120c22', density: 0.55, glow: true }, motes: { kind: 'mote', rate: 14, color: '#e9ddff' } }),
  kenpachi: P({ primary: '#eab308', secondary: '#dc2626', aura: 'flame', smoke: { color: '#1e1606', density: 0.65, glow: false }, motes: { kind: 'dust', rate: 10, color: '#f5d77a' }, cuts: { color: '#ffd84a', rate: 0.5 } }),
  zenitsu: P({ primary: '#fde047', secondary: '#f59e0b', aura: 'electric', smoke: { color: '#1a1606', density: 0.35, glow: false }, motes: { kind: 'spark', rate: 18, color: '#fff3a0' }, lightning: { color: '#ffe66b', rate: 1.8 } }),
  gon: P({ primary: '#22c55e', secondary: '#f97316', aura: 'ki', smoke: { color: '#0c1a0e', density: 0.5, glow: false }, motes: { kind: 'leaf', rate: 10, color: '#5aa84a' }, rings: 0.3 }),
  hisoka: P({ primary: '#ec4899', secondary: '#a855f7', aura: 'void', smoke: { color: '#22081a', density: 0.45, glow: true }, motes: { kind: 'petal', rate: 10, color: '#ff8ad0' } }),
  rimuru: P({ primary: '#38bdf8', secondary: '#6366f1', aura: 'water', smoke: { color: '#0b1a3a', density: 0.5, glow: true }, motes: { kind: 'droplet', rate: 14, color: '#bae6fd' }, lightning: { color: '#818cf8', rate: 0.4 }, water: true, rings: 0.25 }),
};

/** The profile for a world key or character id; others get one built from their accent colour. */
export function profileFor(keyOrId: string, accent = '#a78bfa', tone = '#ffffff'): VfxProfile {
  const key = keyOrId.startsWith('legend:') ? keyOrId.slice(7) : keyOrId;
  return PROFILES[key] ?? P({ primary: accent, secondary: tone, aura: 'ki', smoke: { color: '#14121c', density: 0.5, glow: false }, motes: { kind: 'mote', rate: 10, color: accent }, rings: 0.2 });
}
