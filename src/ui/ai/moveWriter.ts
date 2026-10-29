// AI move writer: asks Claude for a character's real techniques from their
// series and turns them into balanced engine moves. Uses the player's own
// Anthropic API key (stored only in this browser). Results are cached locally
// and travel with the character into saved games.
import type { Ability, AbilityKind, AbilityTarget, PublicCharacter, StatusApply, Tag, VfxKind } from '../../engine/types';
import { registerCharacterMoves } from '../../engine/data/abilities';

const TAGS = ['FIRE', 'DARK', 'LIGHTNING', 'ICE', 'DRAGON', 'DEMON', 'DIVINE', 'MAGIC', 'WARRIOR', 'ASSASSIN', 'SHADOW', 'HOLY', 'WIND', 'EARTH', 'WATER', 'SPIRIT'] as const;
const VFX = ['slash', 'beam', 'projectile', 'explosion', 'barrage', 'lightning', 'fire', 'genjutsu', 'domain', 'aura', 'summon', 'shield', 'heal', 'wave', 'punch', 'ice'] as const;
const EFFECTS = ['none', 'burn', 'bleed', 'stun', 'freeze', 'weaken', 'focus', 'haste'] as const;
export const MOVE_ENUMS = { TAGS, VFX, EFFECTS };

/** One move as Claude describes it (schema in claudeMoves.ts). */
export interface MoveDescription {
  name: string;
  role: 'strike' | 'area' | 'power_up' | 'disable' | 'heal' | 'defend' | 'summon';
  strength: 'light' | 'medium' | 'heavy';
  element: (typeof TAGS)[number] | 'NONE';
  visual: (typeof VFX)[number];
  color: string;
  effect: (typeof EFFECTS)[number];
  look: string;
}
export interface MoveSetResult {
  known: MoveDescription[];
  hidden: MoveDescription;
  ultimate: MoveDescription;
  evolvedForm: string;
  confidence: 'canon' | 'mostly_canon' | 'invented';
}

const KEY_STORE = 'anime-auction-anthropic-key';
const CACHE_STORE = 'anime-auction-ai-moves';

export function getApiKey(): string {
  try { return localStorage.getItem(KEY_STORE) ?? ''; } catch { return ''; }
}
export function setApiKey(key: string) {
  try { if (key) localStorage.setItem(KEY_STORE, key.trim()); else localStorage.removeItem(KEY_STORE); } catch { /* storage unavailable */ }
}

interface Cached { moves: Ability[]; kit: NonNullable<PublicCharacter['customKit']>; confidence: MoveSetResult['confidence'] }
function readCache(): Record<string, Cached> {
  try { return JSON.parse(localStorage.getItem(CACHE_STORE) ?? '{}') as Record<string, Cached>; } catch { return {}; }
}

/** Adds previously written moves to a character, if any exist. */
export function withAiMoves(pc: PublicCharacter): PublicCharacter {
  if (pc.source === 'legend' || pc.source === 'original') return pc;
  const c = readCache()[pc.id];
  if (!c) return pc;
  const out = { ...pc, customMoves: c.moves, customKit: c.kit, knownAbilities: [c.moves[0].id, c.moves[1].id] };
  registerCharacterMoves(out);
  return out;
}
export function aiConfidence(pc: PublicCharacter): MoveSetResult['confidence'] | null {
  return readCache()[pc.id]?.confidence ?? null;
}

// The engine numbers are ours: Claude describes the moves, we balance them.
function toAbility(owner: string, slot: string, m: MoveDescription, ultimate: boolean): Ability {
  const kind: AbilityKind = ultimate ? 'ultimate'
    : ({ strike: 'attack', area: 'aoe', power_up: 'buff', disable: 'debuff', heal: 'heal', defend: 'shield', summon: 'summon' } as const)[m.role];
  const target: AbilityTarget = kind === 'aoe' || (ultimate && m.role === 'area') ? 'all_enemies'
    : kind === 'buff' || kind === 'heal' || kind === 'shield' ? 'self' : 'enemy';
  const tier = { light: 0, medium: 1, heavy: 2 }[m.strength];
  const power = kind === 'ultimate' ? (target === 'all_enemies' ? 1.7 : 2.7)
    : kind === 'attack' ? [1.45, 1.6, 1.8][tier] : kind === 'summon' ? [1.4, 1.55, 1.75][tier]
      : kind === 'aoe' ? [0.95, 1.05, 1.15][tier] : kind === 'heal' ? 0.22 : kind === 'shield' ? 0.3 : kind === 'debuff' ? 0.4 : 0;
  const cost = kind === 'ultimate' ? 40 : [14, 18, 24][tier] + (kind === 'aoe' ? 6 : 0);
  const cooldown = kind === 'ultimate' ? 6 : [1, 2, 4][tier] + (kind === 'buff' || kind === 'heal' ? 2 : 0);
  const st = (type: StatusApply['type'], chance: number, duration: number, magnitude: number): StatusApply => ({ type, chance, duration, magnitude });
  const status: StatusApply | undefined = kind === 'buff' ? st(m.effect === 'haste' ? 'haste' : 'focus', 1, 3, 0.3)
    : kind === 'debuff' ? st(m.effect === 'stun' ? 'stun' : 'weaken', m.effect === 'stun' ? 0.6 : 0.85, m.effect === 'stun' ? 1 : 3, 0.2)
      : m.effect === 'burn' ? st('burn', 0.45, 2, 0.04) : m.effect === 'bleed' ? st('bleed', 0.45, 2, 0.035)
        : m.effect === 'stun' ? st('stun', 0.25, 1, 0) : m.effect === 'freeze' ? st('freeze', 0.35, 1, 0) : m.effect === 'weaken' ? st('weaken', 0.4, 2, 0.15) : undefined;
  const color = /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#a78bfa';
  return {
    id: `${owner}:${slot}`, owner, name: m.name.slice(0, 48), kind, target, cost, cooldown, power,
    description: m.look.slice(0, 160), look: m.look.slice(0, 160), vfx: m.visual as VfxKind, fx: { color, style: m.visual === 'slash' ? 'slash' : m.visual === 'beam' ? 'beam' : 'burst' },
    shout: `${m.name.toUpperCase()}!`, trigger: ultimate ? 'hp_below_50' : kind === 'heal' ? 'hp_below_50' : 'always',
    element: m.element === 'NONE' ? undefined : (m.element as Tag), status, piercing: m.visual === 'beam' || m.visual === 'lightning',
  };
}

/** Asks Claude for the character's moves, balances them, caches them, and returns the updated character. */
export async function writeMoves(pc: PublicCharacter, signal?: AbortSignal): Promise<{ character: PublicCharacter; confidence: MoveSetResult['confidence'] }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Add your Anthropic API key in Settings first.');
  const { askClaude } = await import('./claudeMoves');
  const { out, refused } = await askClaude(pc, apiKey, signal);
  if (refused) throw new Error('Claude declined to write moves for this character.');
  if (!out || out.known.length < 2) throw new Error('Claude did not return a usable move set. Try again.');
  const { moves, kit } = movesFromResult(pc, out);
  return { character: saveMoves(pc, moves, kit, out.confidence), confidence: out.confidence };
}

/** Turns Claude's description into balanced engine moves (pure; tested). */
export function movesFromResult(pc: PublicCharacter, out: MoveSetResult): { moves: Ability[]; kit: Cached['kit'] } {
  const owner = `ai-${pc.id.replace(/[^a-z0-9]+/gi, '-')}`;
  const moves = [toAbility(owner, 'm1', out.known[0], false), toAbility(owner, 'm2', out.known[1], false), toAbility(owner, 'hidden', out.hidden, false), toAbility(owner, 'ult', out.ultimate, true)];
  const kit = { hidden: moves[2].id, ultimate: moves[3].id, form: out.evolvedForm.slice(0, 48) || `Awakened ${pc.name.split(' ')[0]}` };
  return { moves, kit };
}

/** Stores (or re-stores after editing) a character's written moves. */
export function saveMoves(pc: PublicCharacter, moves: Ability[], kit: Cached['kit'], confidence: Cached['confidence']): PublicCharacter {
  const cache = readCache();
  cache[pc.id] = { moves, kit, confidence };
  try { localStorage.setItem(CACHE_STORE, JSON.stringify(cache)); } catch { /* storage full or unavailable */ }
  const character = { ...pc, customMoves: moves, customKit: kit, knownAbilities: [moves[0].id, moves[1].id] };
  registerCharacterMoves(character);
  return character;
}
