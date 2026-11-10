// Builds Hall of Legends entries from real game records.
import type { BattleRecord, GameState, HallEntry } from './types';

export function buildHallEntries(g: GameState, battles: BattleRecord[]): HallEntry[] {
  const out: HallEntry[] = [];
  const t = g.tournament;
  if (!t?.championId) return out;
  const pname = (id: string) => g.players.find((p) => p.id === id)?.name ?? id;
  const cname = (id: string) => g.characters[id]?.name ?? id;
  const at = Date.now();
  let n = 0;
  const add = (category: HallEntry['category'], title: string, detail: string, value: number) =>
    out.push({ id: `${g.id}-${category}-${n++}`, gameId: g.id, gameName: g.config.name, at, category, title, detail, value });

  const champ = g.players.find((p) => p.id === t.championId)!;
  add('champion', `${champ.name} — Champion`, `Won "${g.config.name}" with ${champ.roster.map(cname).join(', ')}.`, t.standings[champ.id].wins);
  const runner = t.finalistIds.find((id) => id !== champ.id);
  if (runner) add('finalist', `${pname(runner)} — Finalist`, `Reached the Grand Final of "${g.config.name}".`, t.standings[runner].wins);

  const tourney = battles.filter((b) => b.kind === 'tournament');
  // Biggest upset: winner side's top price far below the loser's.
  let bestUpset: { b: BattleRecord; ratio: number } | null = null;
  let bestComeback: { b: BattleRecord; downs: number; pct: number } | null = null;
  for (const b of tourney) {
    const w = b.result.winnerSide;
    const wp = Math.max(1, ...b.input.sides[w].fighters.map((f) => f.price));
    const lp = Math.max(1, ...b.input.sides[1 - w].fighters.map((f) => f.price));
    if (lp / wp > (bestUpset?.ratio ?? 1.5)) bestUpset = { b, ratio: lp / wp };
    // Comebacks: survivors who were knocked down or left barely standing and still won.
    const survivors = b.result.fighters.filter((f) => f.side === w && !f.defeated);
    const downs = survivors.reduce((n, f) => n + (f.knockdowns ?? 0), 0);
    const minPct = Math.min(...survivors.map((f) => f.minHpPct));
    const score = downs + (minPct < 0.2 ? 1 - minPct : 0);
    const best = bestComeback ? bestComeback.downs + (bestComeback.pct < 0.2 ? 1 - bestComeback.pct : 0) : 0.8;
    if (score > best) bestComeback = { b, downs, pct: minPct };
  }
  if (bestUpset) {
    const b = bestUpset.b; const w = b.result.winnerSide;
    add('upset', 'Biggest Upset', `${b.input.sides[w].fighters.map((f) => f.name).join(' & ')} (${Math.max(...b.input.sides[w].fighters.map((f) => f.price))} coins) beat ${b.input.sides[1 - w].fighters.map((f) => f.name).join(' & ')} (${Math.max(...b.input.sides[1 - w].fighters.map((f) => f.price))} coins).`, Math.round(bestUpset.ratio * 10) / 10);
  }
  if (bestComeback) {
    const b = bestComeback.b; const w = b.result.winnerSide;
    const d = bestComeback.downs;
    add('comeback', 'Best Comeback', `${pname(b.input.sides[w].playerId)} won ${d > 0 ? `after being knocked down ${d === 1 ? 'once' : `${d} times`}` : 'while barely standing'}.`, d);
  }

  // MVP: most clean hits landed across tournament battles
  const hits = new Map<string, number>();
  for (const b of tourney) for (const f of b.result.fighters) hits.set(f.charId, (hits.get(f.charId) ?? 0) + (f.cleanHits ?? 0));
  const mvp = [...hits.entries()].sort((a, b) => b[1] - a[1])[0];
  if (mvp && mvp[1] > 0) add('mvp', `MVP: ${cname(mvp[0])}`, `${mvp[1]} clean hits landed for ${pname(g.owners[mvp[0]])}.`, mvp[1]);

  const priced = Object.entries(g.prices).sort((a, b) => b[1] - a[1]);
  if (priced[0]) add('expensive', `Most Expensive: ${cname(priced[0][0])}`, `Bought by ${pname(g.owners[priced[0][0]])} for ${priced[0][1]} coins.`, priced[0][1]);
  const value = Object.entries(g.prices)
    .map(([id, price]) => ({ id, price, wins: g.conditions[id]?.wins ?? 0 }))
    .filter((x) => x.wins > 0)
    .sort((a, b) => b.wins / Math.max(100, b.price) - a.wins / Math.max(100, a.price))[0];
  if (value) add('value', `Best Value: ${cname(value.id)}`, `${value.wins} win${value.wins > 1 ? 's' : ''} for only ${value.price} coins.`, value.price);

  const rivalry = Object.values(g.rivalries).sort((a, b) => b.encounters - a.encounters || b.intensity - a.intensity)[0];
  if (rivalry && rivalry.encounters >= 2) add('rivalry', `Rivalry: ${pname(rivalry.a)} vs ${pname(rivalry.b)}`, `${rivalry.encounters} encounters, ${rivalry.winsA}–${rivalry.winsB}.`, rivalry.encounters);

  // Winning streaks by player in match order
  const streak = new Map<string, { cur: number; best: number }>();
  for (const st of t.stages) for (const m of st.matches) {
    if (!m.winner) continue;
    for (const pid of m.players) {
      const s = streak.get(pid) ?? { cur: 0, best: 0 };
      s.cur = m.winner === pid ? s.cur + 1 : 0;
      s.best = Math.max(s.best, s.cur);
      streak.set(pid, s);
    }
  }
  const bestStreak = [...streak.entries()].sort((a, b) => b[1].best - a[1].best)[0];
  if (bestStreak && bestStreak[1].best >= 2) add('streak', `Win Streak: ${pname(bestStreak[0])}`, `${bestStreak[1].best} consecutive match wins.`, bestStreak[1].best);

  const epic = tourney.slice().sort((a, b) => b.result.momentumSwings - a.result.momentumSwings || b.result.turns - a.result.turns)[0];
  if (epic) {
    const w = epic.result.winnerSide;
    add('battle', 'Historic Battle', `${epic.input.sides.map((s) => s.fighters.map((f) => f.name).join(' & ')).join(' vs ')} — ${epic.result.turns} actions, ${epic.result.momentumSwings} momentum swings, won by ${pname(epic.input.sides[w].playerId)}.`, epic.result.turns);
  }
  return out;
}
