// Game orchestration: phase transitions and the glue between auction,
// roster, preparation, combat, narration and tournament systems. Functions
// mutate a draft GameState; the store clones before calling and persists after.
import type {
  AuctionConfig, BattleInput, BattleRecord, CoachCall, FighterSnapshot, GameState, MentalApproach, PlayerKind,
  PrepChoice, PublicCharacter, StatKey, Strategy, TournamentConfig,
} from './types';
import { ENGINE_VERSION, SCHEMA_VERSION, STARTING_COINS } from './types';
import { Rng, deriveSeed, freshSeed, uid } from './rng';
import { Vault, scoutHint, truePower } from './hidden';
import * as A from './auction';
import { scoutAdvice, type ScoutAdvice } from './scout';
import { npcDecide } from './npc';
import { simulateBattle } from './combat/engine';
import { narrate } from './narration';
import { createTournament, findMatch, modeSize, nextPendingMatch, recordResult } from './tournament';
import { activeSynergies } from './data/world';
import { ENVIRONMENTS } from './data/world';
import { registerCharacterMoves } from './data/abilities';
import { ARCHETYPES } from './data/archetypes';
import { applyEffects, computeEffects, emptyCondition, progressedStats, rivalryKey, MAX_TRAINING_PER_STAT, TRAIN_AMOUNT } from './progression';

export type R = A.Result;
const fail = (error: string): R => ({ ok: false, error });
const OK: R = { ok: true };

export const PREP_POINTS_PER_MATCH = 2;

export interface PlayerSetup { name: string; color: string; emblem: string; kind: PlayerKind }

export interface GameSetup {
  name: string;
  players: PlayerSetup[];
  rosterSize: 3 | 4;
  auction: AuctionConfig;
  tournament: TournamentConfig;
  privacyScreens: boolean;
}

export const DEFAULT_AUCTION: AuctionConfig = { mode: 'live', openingBid: 100, timerSeconds: 15, antiSnipeSeconds: 6, scoutTokens: 3 };
export const DEFAULT_TOURNAMENT: TournamentConfig = { soloRounds: 1, tagRound: true, persistentConditions: true, specialEvents: true };

export function validateSetup(s: GameSetup): string[] {
  const errs: string[] = [];
  if (!s.name.trim()) errs.push('Give your game a name.');
  if (s.players.length < 2 || s.players.length > 6) errs.push('Choose 2–6 players.');
  if (!s.players.some((p) => p.kind === 'human')) errs.push('At least one player must be human.');
  const names = s.players.map((p) => p.name.trim().toLowerCase());
  if (names.some((n) => !n)) errs.push('Every player needs a name.');
  if (new Set(names).size !== names.length) errs.push('Player names must be unique.');
  if (s.rosterSize !== 3 && s.rosterSize !== 4) errs.push('Roster size must be 3 or 4.');
  if (s.auction.openingBid < 50 || s.auction.openingBid * s.rosterSize > STARTING_COINS) errs.push('Opening bid is out of range.');
  if (s.auction.timerSeconds < 5 || s.auction.timerSeconds > 120) errs.push('Timer must be 5–120 seconds.');
  if (s.tournament.soloRounds < 1 || s.tournament.soloRounds > 3) errs.push('Solo rounds must be 1–3.');
  return errs;
}

export function newGame(s: GameSetup, secret = freshSeed()): GameState {
  const errs = validateSetup(s);
  if (errs.length) throw new Error(errs.join(' '));
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('game'),
    createdAt: now,
    updatedAt: now,
    phase: 'pool',
    config: { name: s.name.trim(), rosterSize: s.rosterSize, auction: s.auction, tournament: s.tournament, privacyScreens: s.privacyScreens },
    players: s.players.map((p, i) => ({
      id: `p${i + 1}`, name: p.name.trim(), color: p.color, emblem: p.emblem, kind: p.kind,
      coins: STARTING_COINS, roster: [], scoutTokens: s.auction.scoutTokens, prepPoints: 0,
    })),
    pool: [],
    characters: {},
    auction: null,
    conditions: {},
    prices: {},
    owners: {},
    intel: {},
    revealSeen: [],
    tournament: null,
    currentMatchId: null,
    prep: {},
    battleIds: [],
    lastBattleId: null,
    rivalries: {},
    secret,
    rngState: deriveSeed('game', secret),
    archived: false,
  };
}

// ------------------------------------------------------------------ Pool

export const poolRequirement = (g: GameState) => g.players.length * g.config.rosterSize;
export const poolRecommended = (g: GameState) => poolRequirement(g) + Math.max(2, g.players.length);

export function addToPool(g: GameState, vault: Vault, pc: PublicCharacter): R {
  if (g.phase !== 'pool') return fail('The auction pool is locked once the auction starts.');
  if (g.pool.includes(pc.id)) return fail(`${pc.name} is already in the pool.`);
  if (g.pool.length >= 60) return fail('The pool is full (60 characters).');
  registerCharacterMoves(pc);
  g.characters[pc.id] = pc;
  g.pool.push(pc.id);
  vault.ensure(pc);
  return OK;
}

export function removeFromPool(g: GameState, charId: string): R {
  if (g.phase !== 'pool') return fail('The auction pool is locked once the auction starts.');
  if (!g.pool.includes(charId)) return fail('Not in pool.');
  g.pool = g.pool.filter((id) => id !== charId);
  delete g.characters[charId];
  return OK;
}

export function autoFillPool(g: GameState, vault: Vault, catalog: PublicCharacter[], target = poolRecommended(g)): R {
  const rng = new Rng(g.rngState);
  for (const pc of rng.shuffle(catalog)) {
    if (g.pool.length >= target) break;
    if (!g.pool.includes(pc.id)) addToPool(g, vault, pc);
  }
  g.rngState = rng.state;
  return OK;
}

// --------------------------------------------------------------- Auction

export function startAuction(g: GameState, now: number): R {
  if (g.phase !== 'pool') return fail('Not in pool setup.');
  if (g.pool.length < poolRequirement(g)) return fail(`The pool needs at least ${poolRequirement(g)} characters (${g.players.length} players × ${g.config.rosterSize}).`);
  g.phase = 'auction';
  g.auction = A.createAuction(g.config.auction, g.pool, deriveSeed('auction', g.secret));
  return A.openNextLot(g, now);
}

export function advanceLot(g: GameState, now: number): R {
  if (g.phase !== 'auction' || !g.auction) return fail('No auction.');
  if (g.auction.lot?.status === 'open') return fail('Lot still open.');
  if (!g.auction.complete) {
    const r = A.openNextLot(g, now);
    if (!r.ok) return r;
  }
  if (g.auction.complete) finishAuction(g);
  return OK;
}

function finishAuction(g: GameState) {
  g.phase = 'reveal';
  for (const p of g.players) for (const id of p.roster) g.conditions[id] ??= emptyCondition(id);
}

export function useScoutToken(g: GameState, vault: Vault, playerId: string): R {
  const lot = g.auction?.lot;
  if (g.phase !== 'auction' || !lot || lot.status !== 'open') return fail('No lot to scout.');
  const p = g.players.find((x) => x.id === playerId);
  if (!p) return fail('Unknown player.');
  if (p.scoutTokens <= 0) return fail('No scout tokens left.');
  const already = g.auction!.observations.filter((o) => o.playerId === playerId && o.charId === lot.charId).length;
  if (already >= 2) return fail('Your scouts have nothing more to report on this fighter.');
  p.scoutTokens -= 1;
  const hint = scoutHint(vault.get(lot.charId), deriveSeed('scout', g.secret, playerId, lot.charId, already));
  g.auction!.observations.push({ playerId, charId: lot.charId, ...hint });
  return OK;
}

export function scoutFor(g: GameState, playerId: string): ScoutAdvice | null {
  const a = g.auction;
  const lot = a?.lot;
  if (!a || !lot) return null;
  const p = g.players.find((x) => x.id === playerId)!;
  const cfg = a.config;
  const others = g.players.filter((x) => x.id !== playerId);
  return scoutAdvice({
    char: g.characters[lot.charId],
    roster: p.roster.map((id) => g.characters[id]),
    coins: p.coins,
    maxBid: A.maxBidFor(p, g.config.rosterSize, cfg.openingBid),
    rosterSize: g.config.rosterSize,
    nextBid: A.minNextBid(lot, cfg),
    openingBid: cfg.openingBid,
    upcoming: a.queue.map((id) => g.characters[id]).filter(Boolean),
    competitionSlots: A.totalSlotsRemaining(g),
    rivalPurse: others.filter((o) => A.slotsRemaining(o, g.config.rosterSize) > 0).reduce((s, o) => s + A.maxBidFor(o, g.config.rosterSize, cfg.openingBid), 0),
    observations: a.observations.filter((o) => o.playerId === playerId),
  });
}

/** Lets one NPC act on the current lot. Returns true if it did something. */
export function npcAct(g: GameState, playerId: string, now: number): boolean {
  const a = g.auction;
  const lot = a?.lot;
  if (!a || !lot || lot.status !== 'open') return false;
  const p = g.players.find((x) => x.id === playerId);
  if (!p || p.kind !== 'npc' || lot.passed.includes(playerId)) return false;
  if (a.config.mode === 'turns' && lot.activePlayerId !== playerId) return false;
  const advice = scoutFor(g, playerId)!;
  const rng = new Rng(deriveSeed('npc', g.secret, lot.lotNumber, a.bidSeq, playerId));
  const mustBuy = a.queue.length + 1 <= A.totalSlotsRemaining(g) + 1;
  const d = npcDecide(playerId, advice, A.minNextBid(lot, a.config), A.maxBidFor(p, g.config.rosterSize, a.config.openingBid), A.leader(lot)?.playerId === playerId, mustBuy, rng);
  if (d.kind === 'bid') return A.placeBid(g, playerId, d.amount, now).ok;
  if (d.kind === 'pass') return A.passLot(g, playerId, now).ok;
  return false;
}

// ---------------------------------------------------------------- Reveal

export function markRevealed(g: GameState, playerId: string): R {
  if (g.phase !== 'reveal') return fail('Not in reveal phase.');
  if (!g.revealSeen.includes(playerId)) g.revealSeen.push(playerId);
  return OK;
}

export function startTournament(g: GameState): R {
  if (g.phase !== 'reveal') return fail('Not in reveal phase.');
  for (const p of g.players) if (p.roster.length !== g.config.rosterSize) return fail(`${p.name}'s roster is incomplete.`);
  g.tournament = createTournament(g.players.map((p) => p.id), g.config.tournament, deriveSeed('tournament', g.secret));
  g.phase = 'hub';
  return OK;
}

// ------------------------------------------------------------- Prep

function defaultPrep(g: GameState, vault: Vault, playerId: string, size: number): PrepChoice {
  const p = g.players.find((x) => x.id === playerId)!;
  const score = (id: string) => {
    const c = g.conditions[id];
    return truePower(progressedStats(vault.get(id), c)) - c.fatigue * 0.2 - c.injuries.length * 6;
  };
  const fighters = p.roster.slice().sort((a, b) => score(b) - score(a)).slice(0, size);
  return { playerId, fighters, front: defaultFront(g, fighters), strategy: 'balanced', mental: 'composure', locked: false };
}

function defaultFront(g: GameState, fighters: string[]): string[] {
  if (fighters.length === 1) return fighters.slice();
  const prefer = fighters.filter((id) => ARCHETYPES[g.characters[id].archetype].preferFront);
  const front = prefer.length ? prefer : [fighters[0]];
  const maxFront = fighters.length === 2 ? 1 : Math.ceil(fighters.length / 2);
  return front.slice(0, maxFront);
}

export function startMatch(g: GameState, vault: Vault): R {
  if (g.phase !== 'hub' || !g.tournament) return fail('Not in tournament hub.');
  const m = nextPendingMatch(g.tournament);
  if (!m) return fail('No pending match.');
  g.currentMatchId = m.id;
  const size = modeSize(m.mode, g.config.rosterSize);
  g.prep = {};
  for (const pid of m.players) {
    g.prep[pid] = defaultPrep(g, vault, pid, size);
    g.players.find((p) => p.id === pid)!.prepPoints = PREP_POINTS_PER_MATCH;
  }
  g.phase = 'prep';
  for (const pid of m.players) if (g.players.find((p) => p.id === pid)!.kind === 'npc') npcPrep(g, vault, pid);
  return OK;
}

export function currentMatch(g: GameState) {
  return g.tournament && g.currentMatchId ? findMatch(g.tournament, g.currentMatchId) ?? null : null;
}

export function setPrep(g: GameState, playerId: string, patch: Partial<Pick<PrepChoice, 'fighters' | 'front' | 'strategy' | 'mental' | 'jumpIn'>>): R {
  const m = currentMatch(g);
  const prep = g.prep[playerId];
  if (g.phase !== 'prep' || !m || !prep) return fail('Not preparing for a match.');
  if (prep.locked) return fail('Preparation is locked in.');
  const p = g.players.find((x) => x.id === playerId)!;
  const size = modeSize(m.mode, g.config.rosterSize);
  if (patch.fighters) {
    // Fewer is fine while choosing (a fighter can be deselected); locking in needs exactly `size`.
    if (patch.fighters.length > size) return fail(`Choose ${size} fighter${size > 1 ? 's' : ''}.`);
    if (patch.fighters.some((id) => !p.roster.includes(id))) return fail('You can only field your own characters.');
    if (new Set(patch.fighters).size !== patch.fighters.length) return fail('Each fighter can only be chosen once.');
    prep.fighters = patch.fighters.slice();
    prep.front = prep.front.filter((id) => prep.fighters.includes(id));
    if (!prep.front.length) prep.front = defaultFront(g, prep.fighters);
  }
  if (patch.front) {
    if (patch.front.some((id) => !prep.fighters.includes(id))) return fail('Frontline must be chosen from your fighters.');
    if (prep.fighters.length > 1 && (patch.front.length === 0 || patch.front.length === prep.fighters.length)) return fail('Place at least one fighter in each line.');
    prep.front = patch.front.slice();
  }
  if (patch.strategy) prep.strategy = patch.strategy;
  if (patch.mental) prep.mental = patch.mental;
  if (patch.jumpIn) prep.jumpIn = { ...(prep.jumpIn ?? {}), ...patch.jumpIn };
  if (prep.fighters.length === 1) prep.front = prep.fighters.slice();
  return OK;
}

export type PrepAction =
  | { kind: 'train'; charId: string; stat: StatKey }
  | { kind: 'recover'; charId: string }
  | { kind: 'treat'; charId: string }
  | { kind: 'scout'; charId: string };

export function prepAction(g: GameState, playerId: string, act: PrepAction): R {
  const m = currentMatch(g);
  const prep = g.prep[playerId];
  if (g.phase !== 'prep' || !m || !prep) return fail('Not preparing for a match.');
  if (prep.locked) return fail('Preparation is locked in.');
  const p = g.players.find((x) => x.id === playerId)!;
  if (p.prepPoints <= 0) return fail('No preparation points left for this match.');
  if (act.kind === 'scout') {
    const opp = m.players.find((x) => x !== playerId)!;
    const oppP = g.players.find((x) => x.id === opp)!;
    if (!oppP.roster.includes(act.charId)) return fail('You can only scout your opponent\'s characters.');
    const list = (g.intel[playerId] ??= []);
    if (list.includes(act.charId)) return fail('Already scouted.');
    list.push(act.charId);
    p.prepPoints--;
    return OK;
  }
  if (!p.roster.includes(act.charId)) return fail('Not your character.');
  const c = g.conditions[act.charId];
  if (act.kind === 'train') {
    const cur = c.training[act.stat] ?? 0;
    if (cur >= MAX_TRAINING_PER_STAT) return fail('That stat is already fully trained.');
    c.training[act.stat] = cur + TRAIN_AMOUNT;
    c.fatigue = Math.min(100, c.fatigue + 5);
  } else if (act.kind === 'recover') {
    if (c.fatigue <= 0) return fail('Already fully rested.');
    c.fatigue = Math.max(0, c.fatigue - 35);
  } else if (act.kind === 'treat') {
    if (!c.injuries.length) return fail('No injuries to treat.');
    c.injuries.shift();
  }
  p.prepPoints--;
  return OK;
}

export function lockPrep(g: GameState, playerId: string): R {
  const prep = g.prep[playerId];
  if (g.phase !== 'prep' || !prep) return fail('Not preparing.');
  const m = currentMatch(g)!;
  if (prep.fighters.length !== modeSize(m.mode, g.config.rosterSize)) return fail('Select your fighters first.');
  prep.locked = true;
  return OK;
}

export const allLocked = (g: GameState) => {
  const m = currentMatch(g);
  return !!m && m.players.every((pid) => g.prep[pid]?.locked);
};

function npcPrep(g: GameState, vault: Vault, playerId: string) {
  const p = g.players.find((x) => x.id === playerId)!;
  const rng = new Rng(deriveSeed('npcprep', g.secret, g.currentMatchId ?? ''));
  for (const id of p.roster) {
    const c = g.conditions[id];
    if (p.prepPoints > 0 && c.injuries.length) prepAction(g, playerId, { kind: 'treat', charId: id });
    if (p.prepPoints > 0 && c.fatigue > 30) prepAction(g, playerId, { kind: 'recover', charId: id });
  }
  const size = g.prep[playerId].fighters.length;
  g.prep[playerId] = { ...defaultPrep(g, vault, playerId, size), locked: false };
  if (p.prepPoints > 0) prepAction(g, playerId, { kind: 'train', charId: g.prep[playerId].fighters[0], stat: rng.pick<StatKey>(['attack', 'speed', 'defense']) });
  const strategies: Strategy[] = ['aggressive', 'balanced', 'defensive', 'counter', 'control', 'highrisk'];
  const mentals: MentalApproach[] = ['intimidate', 'silent', 'taunt', 'analyze', 'provoke', 'composure'];
  setPrep(g, playerId, { strategy: rng.pick(strategies), mental: rng.pick(mentals) });
  lockPrep(g, playerId);
}

// ---------------------------------------------------------------- Battle

export function buildSnapshot(g: GameState, vault: Vault, charId: string, side: 0 | 1, position: 'front' | 'back'): FighterSnapshot {
  const pc = g.characters[charId];
  const h = vault.get(charId);
  const c = g.conditions[charId] ?? emptyCondition(charId);
  return {
    charId, name: c.evolved ? h.evolution.formName : pc.name, playerId: g.owners[charId], side,
    archetype: pc.archetype, temperament: pc.temperament, reach: pc.reach, tags: pc.tags,
    stats: progressedStats(h, c), traits: h.traits,
    abilities: [...pc.knownAbilities, h.hiddenAbility, ...c.unlockedAbilities],
    position, fatigue: c.fatigue, injuries: structuredClone(c.injuries), price: g.prices[charId] ?? 0,
    vulnerability: h.vulnerability,
  };
}

export function buildBattleInput(g: GameState, vault: Vault, seed: number): BattleInput {
  const m = currentMatch(g)!;
  const rng = new Rng(seed ^ 0x9e3779b9);
  const env = g.config.tournament.specialEvents ? rng.pick(ENVIRONMENTS).id : 'colosseum';
  const sides = m.players.map((pid, i) => {
    const prep = g.prep[pid];
    const fighters = prep.fighters.map((id) => buildSnapshot(g, vault, id, i as 0 | 1, prep.front.includes(id) ? 'front' : 'back'));
    // Benched roster members can be called in once as reinforcements.
    const reserves = Object.keys(g.owners).filter((id) => g.owners[id] === pid && !prep.fighters.includes(id))
      .map((id) => buildSnapshot(g, vault, id, i as 0 | 1, 'back'));
    const kind = g.players.find((p) => p.id === pid)?.kind;
    return {
      playerId: pid, strategy: prep.strategy, mental: prep.mental, fighters,
      synergies: activeSynergies(fighters.map((f) => ({ tags: f.tags, archetype: f.archetype }))),
      coach: kind === 'npc' ? 'auto' : 'human', reserves, jumpIn: prep.jumpIn ?? {},
    };
  }) as BattleInput['sides'];
  const rv = g.rivalries[rivalryKey(m.players[0], m.players[1])];
  return {
    battleId: uid('battle'),
    engineVersion: ENGINE_VERSION,
    seed,
    mode: m.mode,
    environmentId: env,
    sides,
    rivalry: rv ? { intensity: rv.intensity, encounters: rv.encounters, winsA: rv.a === m.players[0] ? rv.winsA : rv.winsB, winsB: rv.a === m.players[0] ? rv.winsB : rv.winsA } : null,
  };
}

export function narrationContext(g: GameState, input: BattleInput) {
  const playerNames = Object.fromEntries(g.players.map((p) => [p.id, p.name]));
  const previousLoss: Record<string, boolean> = {};
  for (const s of input.sides) for (const f of s.fighters) {
    const c = g.conditions[f.charId];
    previousLoss[f.charId] = !!c && c.losses > 0 && c.losses >= c.wins;
  }
  const m = currentMatch(g);
  const stageName = m && g.tournament ? `${g.tournament.stages[m.stageIndex].name}` : 'an exhibition match';
  return { prices: g.prices, playerNames, previousLoss, stageName };
}

/** Runs the tournament battle for the current match. Engine decides; narration follows. */
export function runMatchBattle(g: GameState, vault: Vault, seed = freshSeed()): BattleRecord {
  if (g.phase !== 'prep' || !allLocked(g)) throw new Error('Both players must lock in preparation first.');
  const input = buildBattleInput(g, vault, seed);
  const result = simulateBattle(input);
  const narration = narrate(input, result, narrationContext(g, input));
  const postEffects = computeEffects(g, input, result, (id) => vault.get(id));
  const record: BattleRecord = { battleId: input.battleId, input, result, matchId: g.currentMatchId, kind: 'tournament', narration, createdAt: Date.now(), postEffects };
  g.phase = 'battle';
  g.lastBattleId = record.battleId;
  g.battleIds.push(record.battleId);
  return record;
}

/**
 * Records a corner call and re-runs the battle. Everything up to the corner is
 * identical (same seed, same inputs); the call only shapes what comes after.
 */
export function withCall(g: GameState, vault: Vault, record: BattleRecord, call: CoachCall): BattleRecord {
  const calls = [...(record.input.calls ?? []).filter((c) => !(c.side === call.side && c.corner === call.corner)), call];
  const input: BattleInput = { ...record.input, calls };
  const result = simulateBattle(input);
  const ctx = record.kind === 'tournament' ? narrationContext(g, input) : { ...narrationContext(g, input), stageName: 'an exhibition rematch' };
  const postEffects = record.kind === 'tournament' ? computeEffects(g, input, result, (id) => vault.get(id)) : record.postEffects;
  return { ...record, input, result, narration: narrate(input, result, ctx), postEffects };
}

/** Applies a finished tournament battle's consequences exactly once. */
export function completeBattle(g: GameState, record: BattleRecord): R {
  if (g.phase !== 'battle' || record.kind !== 'tournament' || record.matchId !== g.currentMatchId) return fail('This battle is not the active match.');
  const m = currentMatch(g)!;
  if (m.winner) return fail('Match already recorded.');
  const { input, result } = record;
  applyEffects(g, input, result, record.postEffects);
  const winnerId = input.sides[result.winnerSide].playerId;
  const winHp = result.fighters.filter((f) => f.side === result.winnerSide).reduce((s, f) => s + f.hp / f.maxHp, 0) / input.sides[result.winnerSide].fighters.length;
  recordResult(g.tournament!, m.id, winnerId, record.battleId, winHp, g.players.map((p) => p.id));
  for (const pid of m.players) g.prep[pid].locked = true;
  g.phase = 'results';
  return OK;
}

export function continueAfterResults(g: GameState): R {
  if (g.phase !== 'results') return fail('Not viewing results.');
  g.currentMatchId = null;
  g.prep = {};
  g.phase = g.tournament?.championId ? 'champion' : 'hub';
  return OK;
}

/** Exact replay: re-simulates a stored input and verifies the event hash matches. */
export function exactReplay(record: BattleRecord): { record: BattleRecord; identical: boolean } {
  const result = simulateBattle(record.input);
  const identical = result.hash === record.result.hash && result.winnerSide === record.result.winnerSide;
  return { record: { ...record, result, kind: 'replay' }, identical };
}

/** Fresh rematch: same fighters and preparation, new seed. Exhibition only. */
export function freshRematch(g: GameState, record: BattleRecord, seed = freshSeed()): BattleRecord {
  // A fresh fight always runs on the current engine, even if the original was recorded on an older one.
  const input: BattleInput = { ...structuredClone(record.input), battleId: uid('rematch'), seed, calls: [], engineVersion: ENGINE_VERSION };
  const result = simulateBattle(input);
  const ctx = { ...narrationContext(g, input), stageName: 'an exhibition rematch' };
  return { battleId: input.battleId, input, result, matchId: null, kind: 'rematch', narration: narrate(input, result, ctx), createdAt: Date.now(), postEffects: [] };
}

// --------------------------------------------------------------- Visibility

/** Whether a viewer may see a character's hidden profile. */
export function canSeeHidden(g: GameState, viewerId: string | null, charId: string): boolean {
  if (!viewerId) return false;
  if (g.owners[charId] === viewerId) return true;
  return (g.intel[viewerId] ?? []).includes(charId);
}
