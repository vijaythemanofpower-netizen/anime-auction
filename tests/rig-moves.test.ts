import { describe, expect, it } from 'vitest';
import { LEGEND_CHARACTERS } from '../src/engine/data/legends';
import { LEGEND_MOVESETS } from '../src/engine/data/legendMoves';
import { KITS } from '../src/engine/data/kits';
import { planMove, reactionFor, type AnimName, type MovePlan } from '../src/ui/rig/moves';
import type { JointName } from '../src/ui/rig/skeleton';

const anims: AnimName[] = ['idle','walk','run','dash','jab','cross','uppercut','kick','lowKick','flyingKick','combo','slash','slashUp','palmStrike','chargeUp','castForward','throw','block','dodge','jump','hit','hitHeavy','knockdown','getUp','transform','teleport','appear','taunt','victory','defeated'];
const joints: JointName[] = ['nose','neck','eyeF','eyeB','earF','earB','shoulderF','elbowF','wristF','shoulderB','elbowB','wristB','hipF','kneeF','ankleF','hipB','kneeB','ankleB'];
function valid(p: MovePlan) {
  expect(anims).toContain(p.anim);
  if (p.windup) expect(anims).toContain(p.windup);
  if (p.followUp) expect(anims).toContain(p.followUp);
  expect(joints).toContain(p.effect.from);
}

describe('rig move plans', () => {
  it('plans every built-in ability and every kit move', () => {
    for (const c of LEGEND_CHARACTERS) {
      const key = c.id.replace(/^legend:/, '');
      for (const ability of LEGEND_MOVESETS[key] ?? []) valid(planMove(key, ability.name, ability.kind, ability.fx.color));
      const kit = KITS[key];
      if (kit) for (const ability of [...kit.moves, kit.secret]) valid(planMove(key, ability.name, ability.kind, ability.fx.color));
    }
  });

  it('recognizes famous signature moves', () => {
    expect(planMove('naruto','Rasengan','attack').anim).toBe('palmStrike');
    expect(planMove('sasuke','Chidori','attack').windup).toBe('chargeUp');
    expect(planMove('goku','Kamehameha','attack').effect.kind).toBe('beam');
    expect(planMove('goku','Instant Transmission Strike','attack').approach).toBe('teleport');
    expect(planMove('ichigo','Getsuga Tensho','attack').anim).toBe('slash');
  });

  it('selects reactions by damage severity and knockout state', () => {
    expect(reactionFor(5,100,false)).toBe('hit');
    expect(reactionFor(20,100,false)).toBe('hitHeavy');
    expect(reactionFor(40,100,false)).toBe('knockdown');
    expect(reactionFor(0,100,true)).toBe('defeated');
  });
});
