import { readFileSync } from 'node:fs';
import { PLAYERS, FIXED_NAMES } from '../src/engine/data/players';

const csv = readFileSync('.tasks/squads2026.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(line => line.split(','));
const csvNames = csv.map(([, player]) => player);
const count = (values: string[]) => values.length - new Set(values).size;
const issues: string[] = [];
for (const name of csvNames) if (PLAYERS.filter(p => p.realName === name).length !== 1) issues.push(`CSV name does not appear exactly once: ${name}`);
for (const [label, values] of [['id', PLAYERS.map(p => p.id)], ['name', PLAYERS.map(p => p.name)], ['realName', PLAYERS.map(p => p.realName)]] as const) if (count(values)) issues.push(`${label} duplicates: ${count(values)}`);
for (const p of PLAYERS) {
  if (p.overseas !== (p.country !== 'IND')) issues.push(`${p.realName}: overseas/country mismatch`);
  if ((p.bowl === 'none') !== !p.bowling) issues.push(`${p.realName}: bowl/bowling mismatch`);
  if ((p.role === 'pace' || p.role === 'spin') && !p.bowling) issues.push(`${p.realName}: specialist has no bowling skill`);
  if (p.bowl === 'fast' || p.bowl === 'fastmed' || p.bowl === 'medium') { if (!p.bowling || p.bowling.speed < 110 || p.bowling.speed > 160) issues.push(`${p.realName}: invalid pace speed`); }
  if (p.bowl === 'offspin' || p.bowl === 'legspin' || p.bowl === 'slaorth' || p.bowl === 'slachina') if (p.bowling?.speed !== 0) issues.push(`${p.realName}: spinner speed must be 0`);
}
const roleCounts = Object.fromEntries([...new Set(PLAYERS.map(p => p.role))].map(r => [r, PLAYERS.filter(p => p.role === r).length]));
const tierCounts = Object.fromEntries([1,2,3,4,5].map(t => [t, PLAYERS.filter(p => p.tier === t).length]));
console.log(JSON.stringify({ players: PLAYERS.length, csvPlayers: csvNames.length, roles: roleCounts, tiers: tierCounts, fixedNames: FIXED_NAMES.length, issues }, null, 2));
if (issues.length) process.exitCode = 1;
