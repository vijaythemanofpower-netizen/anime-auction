// Reads everyone's career record for the leaderboards. Records live on public.profiles, which any
// signed-in player can already read, so this needs no new tables or server code.
import { toRecord, type Career } from '../store/career';
import type { Row } from '../engine/stats';
import { supabase } from './client';

const LIMIT = 1000;
// Only the fields the boards use: each career also holds a long list of counted results.
const FIELDS = ['tournaments', 'titles', 'fights', 'fightsWon', 'raids', 'raidsWon', 'teamBattles', 'teamWins', 'mvps', 'badges', 'rivals', 'lab'];
const SLIM = `id, display_name, ${FIELDS.map((f) => `${f}:career->${f}`).join(', ')}`;

type Raw = Partial<Career> & { id: string; display_name: string; career?: Partial<Career> };

export async function fetchRows(): Promise<Row[]> {
  const sb = await supabase();
  let res = await sb.from('profiles').select(SLIM).limit(LIMIT);
  if (res.error) res = await sb.from('profiles').select('id, display_name, career').limit(LIMIT) as unknown as typeof res;
  if (res.error) throw new Error(res.error.message);
  return (res.data as unknown as Raw[]).map((p) => {
    const { id, display_name: name, career, ...slim } = p;
    return { id, name, record: toRecord({ ...(career ?? slim) }) };
  }).filter((r) => r.record.fights + r.record.tournaments + r.record.raids + r.record.teamBattles > 0);
}
