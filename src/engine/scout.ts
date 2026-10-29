// Scout Advisor: TAKE / MIGHT TAKE / LEAVE. Takes only public information
// (PublicCharacter) plus the player's own legitimately purchased scouting
// observations. It never receives hidden profiles.
import type { PublicCharacter, ScoutObservation } from './types';
import { ARCHETYPES } from './data/archetypes';
import { ABILITIES } from './data/abilities';
import { SYNERGIES, activeSynergies } from './data/world';

export type ScoutLabel = 'TAKE' | 'MIGHT TAKE' | 'LEAVE';

export interface ScoutInput {
  char: PublicCharacter;
  roster: PublicCharacter[];
  coins: number;
  maxBid: number;
  rosterSize: number;
  nextBid: number;
  openingBid: number;
  /** Public characters still to be auctioned after this one. */
  upcoming: PublicCharacter[];
  /** Total open slots across all players, including this player. */
  competitionSlots: number;
  /** Combined spending power of all other players with open slots. */
  rivalPurse: number;
  observations: ScoutObservation[];
}

export interface ScoutAdvice {
  label: ScoutLabel;
  confidence: 'Low' | 'Medium' | 'High';
  reasons: string[];
  fairPrice: number;
  score: number;
}

/** Public appeal: what the visible profile suggests, roughly 35–75. */
export function publicAppeal(c: PublicCharacter): number {
  let v = 50;
  for (const id of c.knownAbilities) {
    const a = ABILITIES[id];
    if (!a) continue;
    v += a.kind === 'ultimate' ? 6 : a.kind === 'aoe' ? 5 : a.kind === 'heal' || a.kind === 'shield' ? 4 : 3;
    if (a.power >= 2) v += 3;
    if (a.status) v += 2;
  }
  const role = ARCHETYPES[c.archetype].role;
  if (role === 'offense') v += 3;
  return Math.min(78, v);
}

export function scoutAdvice(inp: ScoutInput): ScoutAdvice {
  const { char, roster } = inp;
  const reasons: string[] = [];
  const slotsLeft = inp.rosterSize - roster.length;
  const appeal = publicAppeal(char);

  if (slotsLeft <= 0) return { label: 'LEAVE', confidence: 'High', reasons: ['Your roster is already full.'], fairPrice: 0, score: -100 };

  // Fair price from this player's budget per open slot, scaled by appeal and
  // by how much rivals can spend.
  const personalPerSlot = inp.coins / slotsLeft;
  const rivalSlots = Math.max(1, inp.competitionSlots - slotsLeft);
  const marketPerSlot = inp.rivalPurse / rivalSlots;
  const perSlot = (personalPerSlot * 0.6 + marketPerSlot * 0.4);
  const fairPrice = Math.max(inp.openingBid, Math.round((perSlot * (appeal / 56)) / 50) * 50);

  if (inp.maxBid < inp.nextBid) {
    return { label: 'LEAVE', confidence: 'High', reasons: [`You can bid at most ${inp.maxBid} while keeping enough for your remaining slots.`], fairPrice, score: -100 };
  }

  let score = (appeal - 55) * 0.8;

  // Role fit
  const roles = roster.map((r) => ARCHETYPES[r.archetype].role);
  const myRole = ARCHETYPES[char.archetype].role;
  const sameArch = roster.filter((r) => r.archetype === char.archetype).length;
  const sameRole = roles.filter((r) => r === myRole).length;
  if (roster.length > 0 && sameRole === 0) { score += 10; reasons.push(`Fills a ${myRole} gap in your team.`); }
  if (sameArch >= 1) { score -= 12 * sameArch; reasons.push(`Overlaps with your other ${char.archetype}${sameArch > 1 ? 's' : ''}.`); }
  else if (sameRole >= 2) { score -= 6; reasons.push(`You already have ${sameRole} ${myRole} fighters.`); }
  if (slotsLeft === inp.rosterSize && myRole === 'offense') { score += 4; reasons.push('A damage dealer is a solid first pick.'); }
  if (!roles.includes('defense') && !roles.includes('support') && (myRole === 'defense' || myRole === 'support') && roster.length >= 1) {
    score += 6; reasons.push('Your team has no one to absorb or heal damage yet.');
  }

  // Known (non-hidden) synergies
  const before = new Set(activeSynergies(roster));
  const after = activeSynergies([...roster, char]).filter((id) => !before.has(id));
  const visible = after.map((id) => SYNERGIES.find((s) => s.id === id)!).filter((s) => !s.hidden);
  if (visible.length) { score += 8 * visible.length; reasons.push(`Unlocks ${visible.map((s) => s.name).join(', ')}.`); }
  const sharedTags = char.tags.filter((t) => roster.some((r) => r.tags.includes(t)));
  if (!visible.length && sharedTags.length) { score += 2; reasons.push(`Shares ${sharedTags.join('/')} with your team; there may be more to discover.`); }

  // Price
  const ratio = inp.nextBid / fairPrice;
  score += (1 - ratio) * 30;
  if (ratio <= 0.7) reasons.push(`Bargain at ${inp.nextBid} (estimated value ~${fairPrice}).`);
  else if (ratio > 1.3) reasons.push(`Expensive: ${inp.nextBid} vs. estimated value ~${fairPrice}.`);

  // Scarcity: if few lots remain, waiting is risky.
  const lotsAfter = inp.upcoming.length;
  if (lotsAfter < inp.competitionSlots * 1.2) { score += 6; reasons.push('Few lots remain; passing is risky.'); }
  else {
    const better = inp.upcoming.filter((u) => publicAppeal(u) > appeal + 4 && ARCHETYPES[u.archetype].role === myRole).length;
    if (better >= 2) { score -= 5; reasons.push(`${better} similar fighters with stronger public profiles are still coming.`); }
  }
  // Budget pressure
  if (inp.nextBid > inp.coins * 0.55 && slotsLeft > 1) { score -= 8; reasons.push('Would consume most of your remaining budget.'); }

  // Player's own scouting evidence
  const obs = inp.observations.filter((o) => o.charId === char.id);
  for (const o of obs) score += o.signal * 10;
  if (obs.length) reasons.push(`Your scouting: ${obs.map((o) => o.text).join(' ')}`);

  const label: ScoutLabel = score >= 10 && ratio <= 1.15 && sameArch < 2 ? 'TAKE' : score < -4 || ratio > 1.6 ? 'LEAVE' : 'MIGHT TAKE';
  const confidence: ScoutAdvice['confidence'] = obs.length >= 2 ? 'High' : obs.length === 1 || Math.abs(score) > 18 ? 'Medium' : 'Low';
  if (!reasons.length) reasons.push('A reasonable option with no strong signals either way.');
  return { label, confidence, reasons: reasons.slice(0, 4), fairPrice, score: Math.round(score) };
}
