// Measures balance by simulation (no browser, nothing saved):
//   npx vite-node tools/tune-balance.ts
// 1. Healers: pairs of equal strength, one pair with a healer. A fair healer wins about half.
// 2. Raids: party win rate per level of the climb, per number of players.
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import { VILLAINS } from '../src/engine/data/villains';
import { healerKind } from '../src/engine/data/roles';
import { generateHidden, truePower } from '../src/engine/hidden';
import { simulateBattle } from '../src/engine/combat/engine';
import { ENVIRONMENTS } from '../src/engine/data/world';
import { ENGINE_VERSION, type BattleInput, type FighterSnapshot, type PublicCharacter } from '../src/engine/types';
import { RAID_LEVELS, bossCount, legendVillains, levelBosses, raidSlots, runRaid } from '../src/engine/raid';
import { Rng } from '../src/engine/rng';
import * as G from '../src/engine/game';
import { makeGame, runAuction } from '../tests/helpers';

const SECRET = 777;
const stats = (c: PublicCharacter) => generateHidden(c, SECRET);
const power = (c: PublicCharacter) => truePower(stats(c).stats);
const snap = (c: PublicCharacter, side: 0 | 1, front: boolean): FighterSnapshot => {
  const h = stats(c);
  return {
    charId: c.id, name: c.name, playerId: `p${side}`, side, archetype: c.archetype, temperament: c.temperament, reach: c.reach, tags: c.tags, stats: h.stats, traits: h.traits,
    abilities: [...c.knownAbilities, h.hiddenAbility, h.evolution.unlockAbility], position: front ? 'front' : 'back', fatigue: 0, injuries: [], price: 500, vulnerability: h.vulnerability,
  } as FighterSnapshot;
};
function fight(a: PublicCharacter[], b: PublicCharacter[], seed: number) {
  const input = {
    battleId: `t${seed}`, engineVersion: ENGINE_VERSION, seed, mode: a.length === 2 ? 'tag' : 'squad', environmentId: ENVIRONMENTS[seed % ENVIRONMENTS.length].id, rivalry: null, calls: [],
    sides: [0, 1].map((i) => ({ playerId: `p${i}`, strategy: 'balanced', mental: 'silent', synergies: [], coach: 'auto', reserves: [], fighters: (i ? b : a).map((c, k) => snap(c, i as 0 | 1, k === 0)) })),
  } as unknown as BattleInput;
  return simulateBattle(input);
}

function healers(n: number) {
  const rng = new Rng(4242);
  const plain = LEGEND_CHARACTERS.filter((c) => !healerKind({ charId: c.id, name: c.name, archetype: c.archetype, knownAbilities: c.knownAbilities }));
  const heal = LEGEND_CHARACTERS.filter((c) => healerKind({ charId: c.id, name: c.name, archetype: c.archetype, knownAbilities: c.knownAbilities }));
  const near = (p: number, not: PublicCharacter[]) => plain.filter((c) => !not.includes(c)).sort((x, y) => Math.abs(power(x) - p) - Math.abs(power(y) - p)).slice(0, 4);
  let wins = 0, turns = 0, healed = 0, ctrl = 0;
  for (let i = 0; i < n; i++) {
    const h = rng.pick(heal);
    const twin = rng.pick(near(power(h), []));
    const front = rng.pick(plain);
    const mate = rng.pick(near(power(front), [front, twin]));
    const r = fight([front, h], [mate, twin], i + 1);
    if (r.winnerSide === 0) wins++;
    turns += r.events.length;
    healed += r.events.filter((e) => e.type === 'heal').reduce((s, e) => s + (e.heal ?? 0), 0);
    if (fight([front, twin], [mate, rng.pick(near(power(twin), [front, mate, twin]))], i + 5000).winnerSide === 0) ctrl++;
  }
  console.log(`healers listed: ${heal.length} of ${LEGEND_CHARACTERS.length}`);
  console.log(`2v2, healer side wins ${Math.round((wins / n) * 100)}% (control without healer ${Math.round((ctrl / n) * 100)}%), avg ${Math.round(turns / n)} events, ${Math.round(healed / n)} hp healed per fight`);
}

function raids(runs: number) {
  const pool = [...legendVillains(), ...VILLAINS];
  for (const players of [2, 3, 4]) {
    const row: string[] = [];
    for (let level = 1; level <= RAID_LEVELS; level++) {
      let won = 0;
      for (let i = 0; i < runs; i++) {
        const { g, vault } = makeGame(players, 3, 'live', 1000 + i * 7);
        G.shufflePool(g, vault, LEGEND_CHARACTERS, { balanced: true, replace: [...g.pool] }); // real rosters, like a real game
        runAuction(g);
        const party = Math.min(8, raidSlots(g) * g.players.length);
        won += runRaid(g, vault, levelBosses(pool, g.secret, level, i * 13 + level, [], party), i + 1, level).result.won ? 1 : 0;
      }
      row.push(`L${level} (${bossCount(level, Math.min(8, players * (players >= 4 ? 2 : 3)))}b) ${Math.round((won / runs) * 100)}%`);
    }
    console.log(`${players} players: ${row.join('  ')}`);
  }
}

const n = Number(process.argv[2] ?? 400);
healers(n);
raids(Number(process.argv[3] ?? 30));
