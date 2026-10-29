// Roster analysis for the owning player (uses revealed stats).
import type { Condition, HiddenProfile, PublicCharacter } from './types';
import { ARCHETYPES } from './data/archetypes';
import { SYNERGIES, activeSynergies } from './data/world';
import { progressedStats } from './progression';
import { effectiveStats } from './combat/fighter';

export interface TeamAnalysis {
  offense: number; defense: number; speed: number; stamina: number; flexibility: number;
  roles: Record<string, number>;
  synergies: Array<{ id: string; name: string; description: string; hidden: boolean }>;
  weaknesses: string[];
  strengths: string[];
}

export function analyzeTeam(members: Array<{ pc: PublicCharacter; h: HiddenProfile; c: Condition }>, discovered: string[]): TeamAnalysis {
  const n = Math.max(1, members.length);
  const eff = members.map((m) => effectiveStats({ stats: progressedStats(m.h, m.c), fatigue: m.c.fatigue, injuries: m.c.injuries } as never));
  const avg = (f: (s: (typeof eff)[number]) => number) => Math.round(eff.reduce((a, s) => a + f(s), 0) / n);
  const roles: Record<string, number> = {};
  for (const m of members) { const r = ARCHETYPES[m.pc.archetype].role; roles[r] = (roles[r] ?? 0) + 1; }
  const ids = activeSynergies(members.map((m) => ({ tags: m.pc.tags, archetype: m.pc.archetype })));
  const synergies = ids.map((id) => SYNERGIES.find((s) => s.id === id)!).filter((s) => !s.hidden || discovered.includes(s.id))
    .map((s) => ({ id: s.id, name: s.name, description: s.description, hidden: s.hidden }));
  const hiddenUnknown = ids.filter((id) => SYNERGIES.find((s) => s.id === id)!.hidden && !discovered.includes(id)).length;
  const a: TeamAnalysis = {
    offense: avg((s) => (s.attack + s.technique) / 2), defense: avg((s) => (s.defense + s.stamina) / 2), speed: avg((s) => s.speed), stamina: avg((s) => s.stamina),
    flexibility: avg((s) => (s.adaptability + s.battleIQ) / 2), roles, synergies, weaknesses: [], strengths: [],
  };
  if (!roles.support && !members.some((m) => [...m.pc.knownAbilities, m.h.hiddenAbility].some((x) => ['blessing', 'healing_rain', 'phoenix_rite'].includes(x)))) a.weaknesses.push('No healing — long fights will wear you down.');
  if (!roles.defense) a.weaknesses.push('No tank to hold the frontline in squad battles.');
  if (a.speed < 50) a.weaknesses.push('Slow team: opponents will act first and more often.');
  if (a.defense < 50) a.weaknesses.push('Fragile: low combined defense and stamina.');
  const vulns = members.map((m) => m.h.vulnerability).filter(Boolean);
  const dup = vulns.find((v, i) => vulns.indexOf(v) !== i);
  if (dup) a.weaknesses.push(`Several fighters are vulnerable to ${dup}.`);
  if (members.some((m) => m.c.injuries.length)) a.weaknesses.push('Injured fighters on the roster.');
  if (a.offense >= 68) a.strengths.push('Heavy hitters: high average attack and technique.');
  if (a.flexibility >= 65) a.strengths.push('Adaptable, high-IQ fighters.');
  if (synergies.length) a.strengths.push(`${synergies.length} active ${synergies.length > 1 ? "synergies" : "synergy"}.`);
  if (hiddenUnknown) a.strengths.push('Something about this lineup feels special… (undiscovered synergy)');
  return a;
}
