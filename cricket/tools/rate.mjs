/**
 * Research CSV calibration (all skills are clamped to 10..95 unless noted).
 * Batting: linear anchors avg 10/25/35/45 => consistency 25/60/80/92;
 * SR 100/130/150/170 => tempo 40/68/85/95; sixes/innings .2/1/1.8 =>
 * power 30/70/92. Reliability is innings/(innings+20), shrinking toward
 * consistency 32, tempo 48, power 35. Matchups start at the mean of
 * consistency and tempo, then add 6 for strong or subtract 8 for weak.
 * Bowling control interpolates economy 6.5/7.5/8.5/10 => 90/78/62/40;
 * attack interpolates SR 14/18/22/28 => 92/78/62/45. Phase skill words
 * (elite/good/average/poor = 90/78/64/48) blend 65% word and 35% control.
 * Bowling evidence needs >20 overs; limited samples shrink toward 45.
 * Overall value averages discipline skills (all-rounders blend both).
 * Game-roster tiers are assigned by rank; missing-data players stay tier 1.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const files = ['batch-1.csv','batch-2.csv','batch-3.csv','batch-4.csv','batch-5.csv','batch-fa.csv','batch-fb.csv','batch-verified.csv'];
function parseCsv(text) {
  return text.trim().split(/\r?\n/).map(line => {
    const cells = []; let cell = '', quoted = false;
    for (let i=0;i<line.length;i++) { const c=line[i]; if(c==='"') { if(quoted&&line[i+1]==='"'){cell+='"';i++;} else quoted=!quoted; } else if(c===','&&!quoted){cells.push(cell);cell='';} else cell+=c; }
    cells.push(cell); return cells;
  });
}
const rows = new Map();
for (const file of files.filter((f) => existsSync(`.tasks/stats/${f}`))) {
  const [header, ...data] = parseCsv(readFileSync(`.tasks/stats/${file}`,'utf8'));
  for(const cells of data){ const row=Object.fromEntries(header.map((k,i)=>[k,cells[i]??''])); if(row.name) rows.set(row.name,row); }
}
const num = (r,k) => Number(r[k]) || 0;
const clamp = (n,lo=10,hi=95) => Math.round(Math.max(lo,Math.min(hi,n)));
const interp = (x, points) => { if(x<=points[0][0]) return points[0][1]; for(let i=1;i<points.length;i++) if(x<=points[i][0]) { const [x0,y0]=points[i-1], [x1,y1]=points[i]; return y0+(x-x0)*(y1-y0)/(x1-x0); } return points.at(-1)[1]; };
const word = s => ({elite:90,good:78,average:64,poor:48}[String(s).toLowerCase()] ?? 64);
const ratings = {};
const overallByName = {};
const noDataNames = new Set();
for(const [name,r] of [...rows].sort(([a],[b])=>a.localeCompare(b))) {
  const inns=num(r,'t20_inns'), reliability=inns/(inns+60), noData=String(r.source).trim().toLowerCase()==='no data';
  let consistency=32+(interp(num(r,'bat_avg'),[[10,25],[25,60],[35,80],[45,92]])-32)*reliability;
  let tempo=48+(interp(num(r,'bat_sr'),[[70,15],[100,40],[130,68],[150,85],[170,95]])-48)*reliability;
  let power=35+(interp(num(r,'sixes_per_inn'),[[0,22],[.2,30],[1,70],[1.8,92]])-35)*reliability;
  if(noData) { consistency=24;tempo=38;power=24; }
  else if(!inns&&!num(r,'bat_avg')&&!num(r,'bat_sr')&&r.bowl!=='none') { consistency=22;tempo=22;power=20; }
  const base=(consistency+tempo)/2, bat={vsPace:clamp(base+(r.vs_pace==='strong'?6:r.vs_pace==='weak'?-8:0)),vsSpin:clamp(base+(r.vs_spin==='strong'?6:r.vs_spin==='weak'?-8:0)),tempo:clamp(tempo),power:clamp(power),consistency:clamp(consistency)};
  const role=r.role || 'middle', bowl=r.bowl || 'none'; let bowling;
  const overs=num(r,'t20_overs_bowled');
  if(bowl!=='none') {
    if(overs>20) { const rel=overs/(overs+80), control=45+(interp(num(r,'econ'),[[6.5,90],[7.5,78],[8.5,62],[10,40]])-45)*rel, attack=45+(interp(num(r,'bowl_sr'),[[14,92],[18,78],[22,62],[28,45]])-45)*rel;
      const phase=k=>clamp((45+(word(r[k])-45)*rel)*.65+control*.35);
      bowling={attack:clamp(attack),control:clamp(control),powerplay:phase('pp_skill'),death:phase('death_skill'),speed:/^(offspin|legspin|slaorth|slachina)$/.test(bowl)?0:clamp(num(r,'speed_kmh'),110,160)};
    } else bowling={attack:45,control:45,powerplay:45,death:45,speed:/^(offspin|legspin|slaorth|slachina)$/.test(bowl)?0:clamp(num(r,'speed_kmh')||125,110,160)};
  }
  if(['pace','spin'].includes(role)&&!bowling) bowling={attack:42,control:45,powerplay:44,death:44,speed:role==='spin'?0:125};
  const keeping=r.keeper==='yes'||role==='keeper' ? clamp(68+(bat.consistency-60)*.35,60,92) : undefined;
  const battingValue=(bat.vsPace+bat.vsSpin+2*bat.tempo+bat.power+2*bat.consistency)/7;
  const bowlingValue=bowling?(bowling.attack+bowling.control+bowling.powerplay+bowling.death)/4:0;
  const overall=role==='allrounder'&&bowling?Math.round(battingValue*.55+bowlingValue*.45)
    :['pace','spin'].includes(role)?Math.round(bowlingValue)
    :Math.round(battingValue+(keeping?2:0));
  overallByName[name]=overall;
  if(noData) noDataNames.add(name);
  ratings[name]={role,bowl,bats:r.bats==='L'?'L':'R',bat,...(bowling?{bowling}:{}),...(keeping?{keeping}:{}),tier:1};
}
// The app also includes a supplemental unsold pool without research CSV rows.
// Generate explicit modest no-data entries from its seed metadata so every
// player receives a deterministic rating override in players.ts.
const playersSource=readFileSync('src/engine/data/players.ts','utf8');
const seeds=playersSource.match(/const UNSOLD_SEEDS[\s\S]*?= \[([\s\S]*?)\n\];/)?.[1]??'';
const seedPattern=/\['([^']+)','[^']+','([^']+)','([RL])','([^']+)'/g;
for(const match of seeds.matchAll(seedPattern)) {
  const [,name,role,bats,bowl]=match;
  if(ratings[name]) continue;
  const specialist=role==='pace'||role==='spin', bat={vsPace:specialist?20:30,vsSpin:specialist?18:28,tempo:specialist?22:34,power:specialist?20:30,consistency:specialist?22:32};
  const bowling=bowl==='none'?undefined:{attack:42,control:45,powerplay:44,death:44,speed:/^(offspin|legspin|slaorth|slachina)$/.test(bowl)?0:125};
  const keeping=role==='keeper'?72:undefined;
  ratings[name]={role,bowl,bats,bat,...(bowling?{bowling}:{}),...(keeping?{keeping}:{}),tier:1};
}
const rosterRows=parseCsv(readFileSync('.tasks/squads2026.csv','utf8'));
const rosterNames=new Set(rosterRows.slice(1).map(row=>row[1]).filter(Boolean));
for(const match of seeds.matchAll(seedPattern)) rosterNames.add(match[1]);
const ranked= [...rosterNames].filter(name=>ratings[name]&&overallByName[name]!==undefined&&!noDataNames.has(name))
  .sort((a,b)=>overallByName[b]-overallByName[a]||a.localeCompare(b));
for(let i=0;i<ranked.length;i++) {
  const tier=i<15?5:i<55?4:i<145?3:i<235?2:1;
  ratings[ranked[i]].tier=tier;
}
const type=`// generated by tools/rate.mjs, do not edit\nimport type { Role, BowlType, BatSkill, BowlSkill } from '../types';\n\nexport type PlayerRating = { role: Role; bowl: BowlType; bats: 'R'|'L'; bat: BatSkill; bowling?: BowlSkill; keeping?: number; tier: 1|2|3|4|5 };\n\nexport const RATINGS: Record<string, PlayerRating> = ${JSON.stringify(ratings,null,2)};\n`;
writeFileSync('src/engine/data/ratings.ts',type);
console.log(`Generated ${Object.keys(ratings).length} ratings.`);
