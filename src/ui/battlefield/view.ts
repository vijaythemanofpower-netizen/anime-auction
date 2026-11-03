export type FightView = 'cards' | '2d';

/**
 * The 2D fight view is switched off until it is good enough (owner, Nov 3 2026): every fight
 * uses the card arena, on every device, online and offline, and the Cards/2D choices and the
 * 2D Arena screen are hidden. The 2D code and saved choices stay; set true to bring it back.
 */
export const TWO_D_READY = false;

/** 2D needs a drawable rig or clip for every fighter in the match. */
export function arenaUses2D(view: FightView | undefined, everyFighterReady: boolean, ready = TWO_D_READY): boolean {
  return ready && view === '2d' && everyFighterReady;
}
