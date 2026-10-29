import type { Archetype, Stats, Temperament } from '../types';

export interface ArchetypeDef {
  id: Archetype;
  role: 'offense' | 'defense' | 'support' | 'control';
  description: string;
  base: Stats;
  /** Behaviour weights used by the combat AI. */
  behavior: { attack: number; ability: number; guard: number; protect: number; assist: number; dive: number };
  reach: 'melee' | 'ranged';
  preferFront: boolean;
}

const s = (attack: number, defense: number, speed: number, technique: number, battleIQ: number, stamina: number, adaptability: number, luck: number, potential: number): Stats =>
  ({ attack, defense, speed, technique, battleIQ, stamina, adaptability, luck, potential });

export const ARCHETYPES: Record<Archetype, ArchetypeDef> = {
  Assassin: { id: 'Assassin', role: 'offense', description: 'Strikes fast, ignores the frontline, folds under sustained pressure.', base: s(70, 40, 80, 72, 60, 48, 55, 58, 55), behavior: { attack: 1.2, ability: 1, guard: 0.4, protect: 0.1, assist: 0.5, dive: 1 }, reach: 'melee', preferFront: false },
  Tank: { id: 'Tank', role: 'defense', description: 'Absorbs punishment and shields allies.', base: s(55, 82, 38, 50, 52, 75, 50, 45, 50), behavior: { attack: 0.9, ability: 0.9, guard: 1.2, protect: 1.4, assist: 0.6, dive: 0 }, reach: 'melee', preferFront: true },
  Mage: { id: 'Mage', role: 'offense', description: 'Devastating elemental power at the cost of fragility.', base: s(76, 42, 52, 66, 68, 50, 55, 50, 60), behavior: { attack: 0.7, ability: 1.5, guard: 0.6, protect: 0.2, assist: 0.6, dive: 0 }, reach: 'ranged', preferFront: false },
  Ranger: { id: 'Ranger', role: 'offense', description: 'Consistent ranged damage from the backline.', base: s(66, 48, 66, 70, 60, 55, 58, 55, 52), behavior: { attack: 1.2, ability: 1, guard: 0.6, protect: 0.2, assist: 0.7, dive: 0 }, reach: 'ranged', preferFront: false },
  Berserker: { id: 'Berserker', role: 'offense', description: 'Grows more dangerous as the fight gets bloody.', base: s(82, 55, 55, 45, 38, 66, 45, 48, 58), behavior: { attack: 1.6, ability: 0.9, guard: 0.2, protect: 0.2, assist: 0.3, dive: 0.3 }, reach: 'melee', preferFront: true },
  Strategist: { id: 'Strategist', role: 'control', description: 'Reads the battle and spends resources at the decisive moment.', base: s(55, 52, 55, 66, 85, 55, 66, 50, 58), behavior: { attack: 0.8, ability: 1.2, guard: 0.8, protect: 0.6, assist: 1.2, dive: 0 }, reach: 'ranged', preferFront: false },
  Support: { id: 'Support', role: 'support', description: 'Heals and empowers allies; weak alone.', base: s(45, 55, 56, 62, 68, 62, 60, 55, 55), behavior: { attack: 0.6, ability: 1.5, guard: 0.8, protect: 0.8, assist: 1.5, dive: 0 }, reach: 'ranged', preferFront: false },
  Duelist: { id: 'Duelist', role: 'offense', description: 'Precise one-on-one fighter with deadly counters.', base: s(68, 58, 66, 78, 64, 56, 56, 52, 55), behavior: { attack: 1.2, ability: 1, guard: 0.9, protect: 0.3, assist: 0.5, dive: 0.4 }, reach: 'melee', preferFront: true },
  Summoner: { id: 'Summoner', role: 'control', description: 'Calls spirits that wear foes down over time.', base: s(62, 46, 48, 64, 66, 58, 60, 56, 62), behavior: { attack: 0.6, ability: 1.5, guard: 0.7, protect: 0.4, assist: 0.8, dive: 0 }, reach: 'ranged', preferFront: false },
  Controller: { id: 'Controller', role: 'control', description: 'Locks enemies down with stuns, freezes and debuffs.', base: s(58, 52, 60, 70, 72, 54, 62, 52, 56), behavior: { attack: 0.7, ability: 1.4, guard: 0.7, protect: 0.4, assist: 0.9, dive: 0 }, reach: 'ranged', preferFront: false },
};

export interface TemperamentDef {
  id: Temperament;
  label: string;
  description: string;
  aggression: number;
  caution: number;
  adapts: boolean;
  /** Gains attack when provoked (taunts backfire). */
  provokeBonus: number;
  resistsMind: boolean;
}

export const TEMPERAMENTS: Record<Temperament, TemperamentDef> = {
  aggressive: { id: 'aggressive', label: 'Aggressive', description: 'Attacks relentlessly.', aggression: 1.35, caution: 0.7, adapts: false, provokeBonus: 0, resistsMind: false },
  patient: { id: 'patient', label: 'Patient', description: 'Waits for openings; counters more often.', aggression: 0.85, caution: 1.2, adapts: false, provokeBonus: 0, resistsMind: true },
  analytical: { id: 'analytical', label: 'Analytical', description: 'Adapts to repeated enemy moves.', aggression: 0.95, caution: 1, adapts: true, provokeBonus: 0, resistsMind: false },
  reckless: { id: 'reckless', label: 'Reckless', description: 'Takes big risks for big damage.', aggression: 1.4, caution: 0.5, adapts: false, provokeBonus: 0.05, resistsMind: false },
  defensive: { id: 'defensive', label: 'Defensive', description: 'Prioritises survival.', aggression: 0.75, caution: 1.45, adapts: false, provokeBonus: 0, resistsMind: false },
  'hot-blooded': { id: 'hot-blooded', label: 'Hot-blooded', description: 'Feeds on provocation and rage.', aggression: 1.25, caution: 0.7, adapts: false, provokeBonus: 0.18, resistsMind: false },
  calculating: { id: 'calculating', label: 'Calculating', description: 'Saves power for decisive moments.', aggression: 0.9, caution: 1.05, adapts: true, provokeBonus: 0, resistsMind: true },
  stoic: { id: 'stoic', label: 'Stoic', description: 'Unshakeable; ignores mind games.', aggression: 1, caution: 1.1, adapts: false, provokeBonus: 0, resistsMind: true },
  arrogant: { id: 'arrogant', label: 'Arrogant', description: 'Underestimates foes early, furious when hurt.', aggression: 1.15, caution: 0.8, adapts: false, provokeBonus: 0.1, resistsMind: false },
  cheerful: { id: 'cheerful', label: 'Cheerful', description: 'Boosts allies; hard to rattle.', aggression: 1, caution: 1, adapts: false, provokeBonus: 0, resistsMind: true },
};
