// Mid-fight banter by temperament: mocking an opponent, pumping themselves up,
// and how a fighter reacts to being mocked. {foe} is replaced with a name.
import type { Temperament } from '../types';

export interface BanterSet {
  mock: string[];
  pump: string[];
  /** Mocked fighter gets fired up. */
  fired: string[];
  /** Mocked fighter shrugs it off. */
  ignore: string[];
  /** Mocked fighter is rattled. */
  rattled: string[];
  /** Asking to jump in for a teammate. */
  jump: string[];
}

export const BANTER: Record<Temperament, BanterSet> = {
  aggressive: {
    mock: ['Get up, {foe}. I\'m not done with you.', 'That\'s it? I expected more.', 'Stay down if you know what\'s good for you!'],
    pump: ['Come on, keep swinging!', 'I\'m just getting warmed up!'],
    fired: ['Say that again, I DARE you!', 'Now you\'ve done it!'], ignore: ['Talk all you want.'], rattled: ['Shut up... shut UP!'],
    jump: ['Move over, I\'m going in!'],
  },
  patient: {
    mock: ['You rushed. That was your mistake, {foe}.', 'Breathe. It will be over soon.'],
    pump: ['Steady. Wait for the opening.', 'One step at a time.'],
    fired: ['...Fine. No more waiting.'], ignore: ['Words cost nothing.', 'I\'ve heard worse.'], rattled: ['Focus... focus...'],
    jump: ['I\'ve seen enough. Let me help.'],
  },
  analytical: {
    mock: ['Your stance has three openings, {foe}. I counted.', 'Predictable. Every single time.'],
    pump: ['Recalculating. I\'ve got this.', 'The data says I can still win.'],
    fired: ['Interesting. Let\'s test that theory.'], ignore: ['Emotional noise. Irrelevant.'], rattled: ['That... wasn\'t in my calculations.'],
    jump: ['The numbers say they need me. Now.'],
  },
  reckless: {
    mock: ['HA! Did you see your face, {foe}?!', 'Again! Do it again!'],
    pump: ['Pain? What pain?! Let\'s GO!', 'Even better, now it\'s fun!'],
    fired: ['Oh, NOW it\'s a party!'], ignore: ['Whatever! Hit me!'], rattled: ['Wait, that actually hurt...'],
    jump: ['Nobody hits my friend but ME! I\'m in!'],
  },
  defensive: {
    mock: ['You can\'t break me, {foe}. Give up.', 'Is that the best you\'ve got?'],
    pump: ['Hold the line. Just hold it.', 'I won\'t fall here.'],
    fired: ['You want me to attack? Fine!'], ignore: ['I\'ve taken worse than words.'], rattled: ['Maybe... maybe I can\'t hold...'],
    jump: ['I won\'t let them fall. I\'m coming!'],
  },
  'hot-blooded': {
    mock: ['Is that all, {foe}?! My grandma hits harder!', 'Come ON! Show me your real power!'],
    pump: ['I\'m not done yet! Not even close!', 'My blood\'s boiling now! Believe it!'],
    fired: ['THAT\'S IT! NOW I\'M MAD!', 'You just made me stronger!'], ignore: ['Ha! Talk is cheap!'], rattled: ['Why can\'t I...?!'],
    jump: ['I can\'t just sit here and watch! LET ME IN!'],
  },
  calculating: {
    mock: ['Everything you did was part of my plan, {foe}.', 'You never stood a chance.'],
    pump: ['A setback. Nothing more.', 'This changes nothing.'],
    fired: ['Very well. Plan B.'], ignore: ['How quaint.', 'Is that supposed to bother me?'], rattled: ['This... was not foreseen.'],
    jump: ['Allow me to correct this situation.'],
  },
  stoic: {
    mock: ['...Stay down.', 'It\'s over.'],
    pump: ['...', 'Not yet.'],
    fired: ['...'], ignore: ['...', 'Hm.'], rattled: ['...!'],
    jump: ['...I\'m going.'],
  },
  arrogant: {
    mock: ['Kneel, {foe}. It suits you.', 'Pathetic. Was that really your best?', 'You\'re not even worth my full power.'],
    pump: ['I have not even begun to try.', 'You think a scratch will stop ME?'],
    fired: ['How DARE you speak to me like that?!', 'You will regret those words!'], ignore: ['The opinions of insects don\'t concern me.'], rattled: ['I... I am superior...!'],
    jump: ['Step aside, weakling. Watch how it\'s done.'],
  },
  cheerful: {
    mock: ['Hehe, you okay down there, {foe}?', 'Sorry! Did that hurt a lot?'],
    pump: ['Okay okay, I can still do this!', 'Smile! We\'re not done yet!'],
    fired: ['Oh, now I\'m REALLY excited!'], ignore: ['Aww, you\'re funny!'], rattled: ['Hey, that wasn\'t very nice...'],
    jump: ['Hang on, I\'m coming to help!!'],
  },
};

/** How likely each temperament is to jump in to help a teammate. */
export const EAGERNESS: Record<Temperament, number> = {
  'hot-blooded': 0.55, reckless: 0.5, cheerful: 0.45, defensive: 0.4, aggressive: 0.35, patient: 0.2,
  analytical: 0.15, calculating: 0.12, stoic: 0.15, arrogant: 0.08,
};

/** How a temperament takes being mocked. */
export function reactionTo(t: Temperament): 'fired' | 'ignore' | 'rattled' {
  if (t === 'hot-blooded' || t === 'reckless' || t === 'arrogant' || t === 'aggressive') return 'fired';
  if (t === 'stoic' || t === 'calculating' || t === 'patient' || t === 'analytical') return 'ignore';
  return 'rattled';
}
