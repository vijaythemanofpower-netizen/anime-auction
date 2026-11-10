import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync('src/engine/data/players.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('exports', 'require', js)(mod.exports, require);
const { PLAYERS } = mod.exports;
const csv = readFileSync('.tasks/squads2026.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(line => line.split(','));
const teams = ['Chennai Super Kings','Delhi Capitals','Gujarat Titans','Kolkata Knight Riders','Lucknow Super Giants','Mumbai Indians','Punjab Kings','Rajasthan Royals','Royal Challengers Bengaluru','Sunrisers Hyderabad'];
const duplicateCount = values => values.length - new Set(values).size;
const issues = [];
for (const [, name] of csv) if (PLAYERS.filter(p => p.realName === name).length !== 1) issues.push(`CSV name count: ${name}`);
for (const [k, xs] of [['id', PLAYERS.map(p=>p.id)], ['name',PLAYERS.map(p=>p.name)], ['realName',PLAYERS.map(p=>p.realName)]]) if(duplicateCount(xs)) issues.push(`${k} duplicate count ${duplicateCount(xs)}`);
for (const p of PLAYERS) {
  if (p.overseas !== (p.country !== 'IND')) issues.push(`${p.realName}: overseas`);
  if ((p.bowl === 'none') !== !p.bowling) issues.push(`${p.realName}: bowl data`);
  if ((p.role === 'pace' || p.role === 'spin') && !p.bowling) issues.push(`${p.realName}: specialist bowl`);
  if (['fast','fastmed','medium'].includes(p.bowl) && (!p.bowling || p.bowling.speed < 110 || p.bowling.speed > 160)) issues.push(`${p.realName}: pace speed`);
  if (['offspin','legspin','slaorth','slachina'].includes(p.bowl) && p.bowling?.speed !== 0) issues.push(`${p.realName}: spin speed`);
  const row=csv.find(r=>r[1]===p.realName); const expected=row ? teams.indexOf(row[0]) : -1;
  if (expected >= 0 && p.prev !== expected) issues.push(`${p.realName}: prev ${p.prev}, expected ${expected}`);
  if (expected < 0 && row && p.prev !== undefined) issues.push(`${p.realName}: replacement should not have prev`);
}
console.log(JSON.stringify({ players: PLAYERS.length, csv:csv.length, unsoldAdded: PLAYERS.length - csv.length, roles:Object.fromEntries([...new Set(PLAYERS.map(p=>p.role))].map(r=>[r,PLAYERS.filter(p=>p.role===r).length])), tiers:Object.fromEntries([1,2,3,4,5].map(t=>[t,PLAYERS.filter(p=>p.tier===t).length])), issues }, null, 2));
if(issues.length) process.exitCode=1;
