// Raid Boss: every player's strongest fighters team up against one real anime
// villain, scaled to be hard for the size of the team. The fight runs on the same
// engine; afterwards each fighter's contribution is scored and an MVP is crowned.
// A raid never changes the tournament (no injuries, fatigue or money).
import type { BattleInput, BattleRecord, FighterSnapshot, GameState, PublicCharacter, RaidContribution, RaidResult, Stats } from './types';
import { ENGINE_VERSION, STAT_KEYS } from './types';
import { simulateBattle } from './combat/engine';
import { narrate } from './narration';
import { Rng, uid } from './rng';
import { buildSnapshot } from './game';
import { generateHidden, truePower, type Vault } from './hidden';
import { progressedStats } from './progression';
import { canonFor } from './data/canonByName';
import { ENVIRONMENTS } from './data/world';
import { LEGEND_CHARACTERS } from './data/legends';
import { registerCharacterMoves } from './data/abilities';

/** Built-in villains that can be raid bosses. */
export const RAID_VILLAINS = ['frieza', 'aizen', 'madara', 'pain', 'sukuna', 'akaza', 'shigaraki', 'meruem', 'dio', 'itachi', 'hisoka'].map((k) => `legend:${k}`);
/** More villains looked up on AniList when online (they have canon stat sheets). */
export const ANILIST_VILLAINS: Array<[name: string, series: string]> = [
  // One Piece
  ['Kaidou', 'one piece'], ['Charlotte Linlin', 'one piece'], ['Marshall Teach', 'one piece'], ['Sakazuki', 'one piece'], ['Doflamingo', 'one piece'], ['Crocodile', 'one piece'],
  // Dragon Ball
  ['Cell', 'dragon ball'], ['Majin', 'dragon ball'], ['Beerus', 'dragon ball'], ['Jiren', 'dragon ball'], ['Zamasu', 'dragon ball'],
  // Naruto
  ['Kaguya Ootsutsuki', 'naruto'], ['Obito Uchiha', 'naruto'], ['Orochimaru', 'naruto'],
  // Bleach
  ['Yhwach', 'bleach'], ['Ulquiorra', 'bleach'],
  // Demon Slayer
  ['Muzan Kibutsuji', 'kimetsu'], ['Kokushibou', 'kimetsu'], ['Douma', 'kimetsu'],
  // Jujutsu Kaisen
  ['Mahito', 'jujutsu'], ['Kenjaku', 'jujutsu'],
  // My Hero Academia
  ['All For One', 'hero academia'], ['Kai Chisaki', 'hero academia'],
  // Hunter x Hunter
  ['Chrollo', 'hunter'], ['Neferpitou', 'hunter'],
  // Fullmetal Alchemist
  ['Father', 'fullmetal'], ['King Bradley', 'fullmetal'],
  // Fairy Tail, Black Clover
  ['Zeref', 'fairy tail'], ['Acnologia', 'fairy tail'], ['Lucius Zogratis', 'black clover'],
  // JoJo
  ['Kars', 'jojo'], ['Yoshikage Kira', 'jojo'],
  // Others
  ['Makima', 'chainsaw'], ['Griffith', 'berserk'], ['Boros', 'punch'], ['Garou', 'punch'], ['Kishou Arima', 'tokyo ghoul'], ['Zeke', 'titan'], ['Ainz Ooal Gown', 'overlord'], ['Alucard', 'hellsing'],
];

export const RAID_TEAM_PER_PLAYER = 2;
export const RAID_MAX_TEAM = 8;

/** How hard a boss is for a team of this size (tuned so raids are often lost). */
export function bossScaling(teamSize: number) {
  // Smaller parties have fewer ways to recover, so the boss scales more gently for them.
  return teamSize <= 4 ? { hpScale: 0.95 * teamSize, power: 0.8 + 0.05 * teamSize } : { hpScale: 0.95 * teamSize + 0.4, power: 0.98 + 0.105 * teamSize };
}

/** Several bosses share the work: each gets a share of the health and of the damage, with a
 *  little extra in total, so more bosses is harder but still winnable. */
export function multiBoss(s: { hpScale: number; power: number }, n: number) {
  if (n <= 1) return s;
  // Damage grows with power^0.65 (engine attack curve), so split the damage, not the power.
  const share = Math.pow(s.power, 0.65) / n;
  return { hpScale: Math.max(0.5, (s.hpScale / n) * (1 + 0.04 * (n - 1))), power: Math.max(0.2, Math.pow(share, 1 / 0.65)) };
}

export const RAID_MAX_BOSSES = 4;

export function legendVillains(): PublicCharacter[] {
  return RAID_VILLAINS.map((id) => LEGEND_CHARACTERS.find((c) => c.id === id)).filter((c): c is PublicCharacter => !!c);
}

/** How many fighters each player may send: shares six places, at least two each. */
export function raidSlots(g: GameState): number {
  return Math.min(3, Math.max(1, Math.floor(RAID_MAX_TEAM / Math.max(1, g.players.length))));
}

/** A player chooses who they send into the raid (from their own roster). */
export function setRaidPick(g: GameState, playerId: string, ids: string[]) {
  const p = g.players.find((x) => x.id === playerId);
  if (!p) return { ok: false as const, error: 'Unknown player.' };
  const mine = [...new Set(ids)].filter((id) => p.roster.includes(id));
  if (mine.length > raidSlots(g)) return { ok: false as const, error: `Send at most ${raidSlots(g)} fighters.` };
  g.raidPicks = { ...(g.raidPicks ?? {}), [playerId]: mine };
  return { ok: true as const };
}

/** The raid party: each player's picks, or their strongest fighters if they didn't choose. */
export function raidTeam(g: GameState, vault: Vault): string[] {
  const slots = raidSlots(g);
  const team: string[] = [];
  for (const p of g.players) {
    const chosen = (g.raidPicks?.[p.id] ?? []).filter((id) => p.roster.includes(id));
    const ranked = p.roster.slice().sort((a, b) => power(g, vault, b) - power(g, vault, a));
    team.push(...(chosen.length ? chosen : ranked).slice(0, slots));
  }
  return team.slice(0, RAID_MAX_TEAM);
}

function power(g: GameState, vault: Vault, id: string) {
  const c = g.conditions[id];
  return c ? truePower(progressedStats(vault.get(id), c)) : truePower(vault.get(id).stats);
}

/** The boss as a fighter: canon stats (or its profile) pushed up, health and damage scaled. */
function bossSnapshot(boss: PublicCharacter, secret: number, teamSize: number, bossCount = 1): FighterSnapshot {
  registerCharacterMoves(boss);
  const h = generateHidden(boss, secret);
  const canon = canonFor(boss);
  const base: Stats = canon ?? h.stats;
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, Math.min(99, Math.round(base[k] + (teamSize <= 4 ? 0 : 6)))])) as Stats;
  return {
    charId: boss.id, name: boss.name, playerId: 'raid-boss', side: 1, archetype: boss.archetype, temperament: boss.temperament, reach: boss.reach,
    tags: boss.tags, stats, traits: h.traits, abilities: [...boss.knownAbilities, h.hiddenAbility], position: 'front', fatigue: 0, injuries: [],
    price: 0, vulnerability: null, boss: multiBoss(bossScaling(teamSize), bossCount),
  };
}

export function buildRaidInput(g: GameState, vault: Vault, boss: PublicCharacter | PublicCharacter[], seed: number): BattleInput {
  const bosses = (Array.isArray(boss) ? boss : [boss]).slice(0, RAID_MAX_BOSSES);
  const team = raidTeam(g, vault);
  const fighters = team.map((id, i) => ({ ...buildSnapshot(g, vault, id, 0, i < 3 ? 'front' : 'back'), injuries: [], fatigue: 0 }));
  const env = new Rng(seed ^ 0x51ed).pick(ENVIRONMENTS).id;
  return {
    battleId: uid('raid'), engineVersion: ENGINE_VERSION, seed, mode: 'squad', environmentId: env, rivalry: null,
    sides: [
      { playerId: 'raid-team', strategy: 'balanced', mental: 'composure', fighters, synergies: [], coach: 'auto' },
      { playerId: 'raid-boss', strategy: 'aggressive', mental: 'intimidate', fighters: bosses.map((b) => bossSnapshot(b, g.secret, fighters.length, bosses.length)), synergies: [], coach: 'auto' },
    ],
  };
}

/** Who helped most: damage dealt, hits absorbed, healing, and the final blow. */
export function raidContributions(record: BattleRecord): RaidContribution[] {
  const team = record.input.sides[0].fighters;
  const ev = record.result.events;
  const bossIds = record.input.sides[1].fighters.map((f) => f.charId);
  // The final blow: on the last boss to go down.
  const defeat = [...ev].reverse().find((e) => e.type === 'defeat' && !!e.target && bossIds.includes(e.target));
  const bossId = defeat?.target ?? bossIds[0];
  let finisher: string | undefined;
  if (defeat) for (let k = ev.indexOf(defeat) - 1; k >= 0; k--) if (ev[k].target === bossId && ev[k].actor && (ev[k].damage ?? 0) > 0) { finisher = ev[k].actor; break; }
  const boss = record.result.fighters.find((f) => f.charId === bossId);
  const out = team.map((f) => {
    const r = record.result.fighters.find((x) => x.charId === f.charId);
    const healed = ev.filter((e) => e.type === 'heal' && e.actor === f.charId).reduce((s, e) => s + (e.heal ?? 0), 0);
    const dealt = r?.damageDealt ?? 0, tanked = r?.damageTaken ?? 0, finalBlow = finisher === f.charId;
    const score = Math.round(dealt + tanked * 0.5 + healed + (finalBlow ? (boss?.maxHp ?? 0) * 0.1 : 0));
    return { charId: f.charId, name: f.name, playerId: f.playerId, dealt, tanked, healed, finalBlow, score, role: '' };
  }).sort((a, b) => b.score - a.score);
  const best = (k: 'dealt' | 'tanked' | 'healed') => out.slice().sort((a, b) => b[k] - a[k])[0];
  const roles: Array<[RaidContribution | undefined, string]> = [[out.find((c) => c.finalBlow), 'Final blow'], [best('dealt'), 'Top damage'], [best('tanked'), 'The wall'], [best('healed')?.healed ? best('healed') : undefined, 'Medic']];
  for (const [c, role] of roles) if (c && !c.role) c.role = role;
  return out;
}

/** Runs a raid and records it on the game. Never touches the tournament. */
export function runRaid(g: GameState, vault: Vault, bossOrBosses: PublicCharacter | PublicCharacter[], seed: number): { record: BattleRecord; result: RaidResult } {
  const bosses = (Array.isArray(bossOrBosses) ? bossOrBosses : [bossOrBosses]).slice(0, RAID_MAX_BOSSES);
  for (const b of bosses) if (!g.characters[b.id]) g.characters[b.id] = b;
  const boss = { ...bosses[0], name: bosses.map((b) => b.name).join(' & ') };
  const input = buildRaidInput(g, vault, bosses, seed);
  const result = simulateBattle(input);
  const playerNames = { ...Object.fromEntries(g.players.map((p) => [p.id, p.name])), 'raid-team': 'The raid party', 'raid-boss': boss.name };
  const narration = narrate(input, result, { prices: g.prices, playerNames, previousLoss: {}, stageName: `the raid on ${boss.name}` });
  const record: BattleRecord = { battleId: input.battleId, input, result, matchId: null, kind: 'raid', narration, createdAt: Date.now(), postEffects: [] };
  const contributions = raidContributions(record);
  const raid: RaidResult = {
    id: input.battleId, battleId: input.battleId, bossId: boss.id, bossName: boss.name, bossIds: bosses.map((b) => b.id), won: result.winnerSide === 0,
    mvp: contributions[0]?.charId ?? null, contributions, at: Date.now(),
  };
  g.raids = [...(g.raids ?? []), raid];
  return { record, result: raid };
}
