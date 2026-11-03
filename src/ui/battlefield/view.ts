export type FightView = 'cards' | '2d';

/** 2D needs a drawable rig or clip for every fighter in the match. */
export function arenaUses2D(view: FightView | undefined, everyFighterReady: boolean): boolean {
  return view === '2d' && everyFighterReady;
}
