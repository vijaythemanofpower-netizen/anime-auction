import type { JointName } from './skeleton';

export type AnimName = 'idle'|'walk'|'run'|'dash'|'jab'|'cross'|'uppercut'|'kick'|'lowKick'|'flyingKick'|'combo'|'slash'|'slashUp'|'palmStrike'|'chargeUp'|'castForward'|'throw'|'block'|'dodge'|'jump'|'hit'|'hitHeavy'|'knockdown'|'getUp'|'transform'|'teleport'|'appear'|'taunt'|'victory'|'defeated';
export type Approach = 'walk' | 'run' | 'dash' | 'teleport' | 'jump' | 'stay';
export type Range = 'melee' | 'mid' | 'far';
export interface MoveEffect { kind: 'none'|'impact'|'slashArc'|'palmOrb'|'chargeHand'|'beam'|'projectile'|'area'|'aura'|'clones'|'summon'; color: string; from: JointName; size: number }
export interface MovePlan { approach: Approach; range: Range; windup?: AnimName; anim: AnimName; followUp?: AnimName; effect: MoveEffect; shake: number; label?: string }

type Signature = Omit<Partial<MovePlan>, 'effect'> & { effect?: Partial<MoveEffect> };
const S = (approach: Approach, range: Range, anim: AnimName, kind: MoveEffect['kind'], from: JointName = 'wristF', extra: Signature = {}): Signature => ({
  approach, range, anim, ...extra,
  effect: { kind, from, ...extra.effect },
});

// Keys are substrings of actual ability names in legendMoves.ts and kits.ts.
// Multiple names can share a choreography while keeping the table explicit and reviewable.
const SIGNATURES: Array<[string, Signature]> = [
  ['shadow clone', S('stay','mid','castForward','clones')], ['rasengan', S('run','melee','palmStrike','palmOrb','wristF',{effect:{color:'#60a5fa',size:1.5},shake:.48,label:'Rasengan'})],
  ['tailed beast bomb', S('stay','far','castForward','projectile','wristF',{windup:'chargeUp',effect:{size:2.7},shake:.9})], ['chidori', S('dash','melee','palmStrike','chargeHand','wristF',{windup:'chargeUp',effect:{color:'#7dd3fc',size:1.3},shake:.65})],
  ['fireball jutsu',S('stay','mid','castForward','projectile')], ['amaterasu',S('stay','far','castForward','area','eyeF',{effect:{color:'#111827',size:2},shake:.7})], ["indra's arrow",S('stay','far','castForward','beam','wristF',{windup:'chargeUp',effect:{size:2.5},shake:.9})],
  ['phoenix flower',S('stay','mid','throw','projectile')], ['crow genjutsu',S('stay','mid','castForward','clones','eyeF')], ['tsukuyomi',S('stay','far','castForward','area','eyeF')], ['totsuka blade',S('dash','melee','slash','summon','wristF',{effect:{size:1.8},shake:.8})],
  ['raikiri',S('dash','melee','palmStrike','chargeHand','wristF',{windup:'chargeUp',effect:{color:'#bae6fd'},shake:.7})], ['ninja hounds',S('stay','mid','castForward','summon')], ['kamui',S('stay','far','castForward','area','wristF',{windup:'chargeUp',shake:.8})],
  ['gum-gum pistol',S('stay','far','cross','impact','wristF',{effect:{size:1.7},shake:.55})], ['gum-gum gatling',S('stay','mid','combo','impact','wristF',{shake:.7})], ['king kong gun',S('run','melee','palmStrike','impact','wristF',{windup:'chargeUp',effect:{size:2.8},shake:1})],
  ['oni giri',S('dash','melee','slashUp','slashArc','wristF',{shake:.7})], ['36 pound phoenix',S('stay','far','slash','projectile','wristF',{effect:{size:1.7},shake:.5})], ['nine swords',S('dash','melee','combo','slashArc','wristF',{effect:{size:2},shake:.9})], ['king of hell',S('dash','melee','slash','slashArc','wristF',{windup:'chargeUp',effect:{size:2.4},shake:1})],
  ['diable jambe',S('dash','melee','flyingKick','impact','ankleF',{effect:{color:'#f97316',size:1.5},shake:.7})], ['concasse',S('jump','melee','flyingKick','impact','ankleF',{shake:.7})], ['ifrit jambe',S('dash','melee','flyingKick','area','ankleF',{windup:'chargeUp',effect:{color:'#2563eb',size:1.8},shake:.9})],
  ['fire fist',S('stay','far','palmStrike','projectile','wristF',{effect:{size:2},shake:.8})], ['flame emperor',S('stay','far','castForward','area','wristF',{windup:'chargeUp',effect:{size:2.7},shake:.9})],
  ['kamehameha',S('stay','far','castForward','beam','wristF',{windup:'chargeUp',effect:{color:'#38bdf8',size:2.5},shake:.9,label:'Kamehameha'})], ['instant transmission',S('teleport','melee','cross','impact','wristF',{effect:{size:1.4},shake:.6})], ['spirit bomb',S('stay','far','castForward','projectile','wristF',{windup:'chargeUp',effect:{size:2.8},shake:1})],
  ['galick gun',S('stay','far','castForward','beam','wristF',{windup:'chargeUp',effect:{size:2.2},shake:.8})], ['big bang attack',S('stay','far','castForward','projectile','wristF',{effect:{size:1.8},shake:.7})], ['final flash',S('stay','far','castForward','beam','wristF',{windup:'chargeUp',effect:{size:2.8},shake:1})], ['death beam',S('stay','far','castForward','beam','wristF',{effect:{size:.7},shake:.35})], ['death ball',S('stay','far','castForward','area','wristF',{windup:'chargeUp',effect:{size:2.5},shake:.9})],
  ['getsuga tensho',S('stay','far','slash','projectile','wristF',{effect:{size:2},shake:.8})], ['flash step',S('teleport','melee','slash','slashArc','wristF',{shake:.6})], ['mugetsu',S('dash','far','slash','area','wristF',{windup:'chargeUp',effect:{size:2.5},shake:1})], ['senbonzakura',S('stay','far','slashUp','area','wristF',{effect:{size:2},shake:.8})],
  ['dragon-hilt slash',S('dash','melee','slash','slashArc')], ['full counter',S('stay','mid','block','aura')], ['dragonslayer',S('run','melee','slashUp','slashArc','wristF',{effect:{size:2},shake:.9})],
  ['ora ora',S('run','melee','combo','impact','wristF',{shake:.8})], ['muda muda',S('run','melee','combo','impact','wristF',{shake:.8})], ['star finger',S('stay','far','palmStrike','impact','wristF')], ['the world',S('teleport','melee','combo','aura','wristF',{effect:{size:2},shake:1})],
  ['arise',S('stay','mid','castForward','summon','wristF',{effect:{size:2}})], ['ruler\'s authority',S('stay','far','castForward','area','wristF',{effect:{size:2.5},shake:.9})], ['gate of babylon',S('stay','far','throw','projectile','wristF',{effect:{size:2},shake:.8})], ['enuma elish',S('stay','far','castForward','beam','wristF',{windup:'chargeUp',effect:{size:2.8},shake:1})],
  ['excalibur',S('stay','far','slashUp','beam','wristF',{windup:'chargeUp',effect:{size:2.6},shake:1})], ['vorpal strike',S('dash','melee','slash','slashArc','wristF',{shake:.65})], ['starburst stream',S('dash','melee','combo','slashArc','wristF',{effect:{size:2},shake:.9})], ['zoltraak',S('stay','far','castForward','beam')], ['cruel sun',S('stay','mid','castForward','projectile')], ['predator',S('run','melee','palmStrike','area')], ['beelzebuth',S('stay','far','castForward','area','wristF',{windup:'chargeUp',effect:{size:2.6},shake:1})],
  ['raikiri',S('dash','melee','palmStrike','chargeHand','wristF',{windup:'chargeUp'})], ['fire fist',S('stay','far','palmStrike','projectile')], ['spirit bomb',S('stay','far','castForward','projectile','wristF',{windup:'chargeUp'})],
  ['bankai',S('stay','mid','transform','aura')], ['susanoo',S('stay','far','castForward','summon','wristF',{windup:'chargeUp',effect:{size:2}})], ['rasenshuriken',S('run','melee','throw','projectile','wristF',{effect:{size:1.8}})],
  ['water breathing',S('dash','melee','slash','slashArc')], ['thunderclap',S('dash','melee','slashUp','chargeHand','wristF',{effect:{color:'#fde047'}})], ['flame breathing',S('dash','melee','slashUp','slashArc','wristF',{effect:{color:'#f97316'}})],
  ['detroit smash',S('run','melee','palmStrike','impact','wristF',{effect:{size:2},shake:1})], ['one for all',S('dash','melee','palmStrike','chargeHand','wristF',{windup:'chargeUp',shake:.9})], ['explosion',S('stay','mid','castForward','area','wristF',{effect:{color:'#f97316',size:1.8},shake:.8})],
  ['howitzer impact',S('jump','melee','flyingKick','area','ankleF',{effect:{color:'#f97316',size:2},shake:.9})], ['flashfreeze heatwave',S('stay','far','castForward','area','wristF',{windup:'chargeUp',effect:{size:2},shake:.9})],
  ['domain expansion',S('stay','far','castForward','area','wristF',{windup:'chargeUp',effect:{size:2.5},shake:1})], ['infinity',S('stay','mid','block','aura','wristF',{effect:{size:1.5}})], ['malevolent shrine',S('stay','far','slashUp','area','wristF',{effect:{size:2.5},shake:1})],
  ['demon slayer sword',S('dash','melee','slash','slashArc')], ['crescent moon',S('stay','far','slashUp','projectile')], ['godspeed',S('dash','melee','combo','chargeHand','wristF',{effect:{color:'#facc15'},shake:.8})],
  ['psychic blast',S('stay','far','castForward','area')], ['telekinesis',S('stay','far','castForward','area')], ['shadow extraction',S('stay','mid','castForward','summon')], ['black divider',S('dash','melee','slashUp','slashArc','wristF',{effect:{size:2},shake:.9})],
];

const sigFor = (name: string): Signature | undefined => { const n=name.toLowerCase(); return SIGNATURES.find(([key])=>n.includes(key))?.[1]; };
const colorFor = (color?: string) => color && /^#[\da-f]{3,8}$/i.test(color) ? color : '#93c5fd';

export function planMove(_charId: string, abilityName: string, abilityKind: string, fxColor?: string): MovePlan {
  const n=abilityName.toLowerCase();
  let s=sigFor(n);
  if (!s) {
    if (/beam|kamehameha|gun|ray|laser/.test(n)) s=S('stay','far','castForward','beam','wristF',{windup:'chargeUp'});
    else if (/blast|bomb|ball|projectile|shot|arrow/.test(n)) s=S('stay','far','castForward','projectile');
    else if (/punch|fist|jab|pistol|barrage/.test(n)) s=S('run','melee',/barrage|combo/.test(n)?'combo':'cross','impact','wristF',{followUp:/barrage/.test(n)?'uppercut':undefined});
    else if (/kick|heel/.test(n)) s=S('dash','melee','flyingKick','impact','ankleF');
    else if (/slash|sword|blade|cut|saber|katana/.test(n)) s=S('dash','melee','slash','slashArc');
    else if (/fire|lightning|ice|flame|magic|wave|storm|domain/.test(n)) s=S('stay','far','castForward','area','wristF',{windup:'chargeUp'});
    else if (/heal|restore|regen/.test(n)) s=S('stay','mid','castForward','aura');
    else if (/shield|guard|barrier|counter/.test(n)) s=S('stay','melee','block','aura');
    else if (/clone|summon|arise|hound/.test(n)) s=S('stay','mid','castForward',/clone/.test(n)?'clones':'summon');
    else if (abilityKind==='summon') s=S('stay','mid','castForward','summon');
    else if (abilityKind==='heal'||abilityKind==='buff'||abilityKind==='shield') s=S('stay','mid','castForward','aura');
    else if (abilityKind==='aoe'||abilityKind==='ultimate') s=S('stay','far','castForward','area','wristF',{windup:'chargeUp'});
    else if (abilityKind==='debuff') s=S('stay','mid','castForward','area');
    else s=S('run','melee','palmStrike','impact');
  }
  const e=s.effect ?? {};
  return { approach:s.approach??'stay', range:s.range??'mid', ...(s.windup?{windup:s.windup}:{}), anim:s.anim??'castForward', ...(s.followUp?{followUp:s.followUp}:{}), effect:{kind:e.kind??'impact',color:e.color??colorFor(fxColor),from:e.from??'wristF',size:Math.max(.5,Math.min(3,e.size??1))}, shake:Math.max(0,Math.min(1,s.shake??.35)), ...(s.label?{label:s.label}:{}) };
}

export function reactionFor(damage: number, maxHp: number, knockedOut: boolean): AnimName {
  if (knockedOut) return 'defeated';
  const ratio = maxHp > 0 ? damage/maxHp : 0;
  return ratio >= .35 ? 'knockdown' : ratio >= .15 ? 'hitHeavy' : 'hit';
}
