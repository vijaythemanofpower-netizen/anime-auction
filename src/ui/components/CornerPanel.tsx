// The corner: the fight pauses at key moments so the player can read their
// fighter's injuries and make a call. Calls are recorded in the battle input,
// so the result stays reproducible.
import type { BattleEvent, BattleRecord, CallKind, CoachCall, Player, PublicCharacter } from '../../engine/types';
import { ABILITIES } from '../../engine/data/abilities';
import { conditionOf, type LiveFighter } from './Arena';
import { InjuryReport, BodyChart, guardWord } from './InjuryReport';
import { CharArt } from './Portrait';

const REASON: Record<string, (n: string, foe: string) => string> = {
  knocked_down: (n) => `${n} was knocked down and just got back up.`,
  opponent_down: (_n, foe) => `${foe} just hit the floor. Press the advantage?`,
  guard_broken: (n) => `${n}'s guard just broke. They're wide open.`,
  serious_injury: (n) => `${n} just took a serious injury.`,
  barely_standing: (n) => `${n} is barely standing.`,
  check: () => 'Mid-fight check-in. How do you want to play it?',
};

export function CornerPanel({ e, record, fighters, players, characters, onCall }: {
  e: BattleEvent; record: BattleRecord; fighters: Map<string, LiveFighter>; players: Player[]; characters: Record<string, PublicCharacter>;
  onCall: (c: CoachCall) => void;
}) {
  const { input } = record;
  const side = Number(e.context?.side) as 0 | 1;
  const corner = Number(e.context?.corner);
  const options = String(e.context?.options ?? '').split(',') as CallKind[];
  const player = players.find((p) => p.id === input.sides[side].playerId);
  const focus = fighters.get(e.actor!)!;
  const mine = input.sides[side].fighters.map((f) => fighters.get(f.charId)!).filter((f) => !f.down);
  const foes = input.sides[1 - side].fighters.map((f) => fighters.get(f.charId)!).filter((f) => !f.down);
  const foeName = foes.find((f) => f.floored || f.knockdowns)?.snap.name ?? foes[0]?.snap.name ?? 'The opponent';
  const back = mine.find((f) => f.snap.charId !== focus.snap.charId && f.position === 'back');
  const best = focus.snap.abilities.map((id) => ABILITIES[id]).filter((m) => m && ['attack', 'ultimate', 'summon', 'aoe'].includes(m.kind))
    .sort((a, b) => Number(b.kind === 'ultimate') - Number(a.kind === 'ultimate') || b.power - a.power)[0];
  const call = (kind: CallKind, reserveId?: string) => onCall({ side, corner, kind, reserveId });

  // A bench fighter asking to jump in on their own.
  if (e.context?.reason === 'jump_in') {
    const rid = String(e.context.reserve);
    const r = (input.sides[side].reserves ?? []).find((x) => x.charId === rid);
    return (
      <div className="corner-overlay" role="dialog" aria-modal="true" aria-label={`${r?.name} wants to jump in`}>
        <div className="corner-card jump" style={{ ['--pc' as string]: player?.color ?? '#7c5cff' }}>
          <div className="eyebrow">⏸ Fight paused · {player?.name}&apos;s bench</div>
          <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'nowrap', margin: '10px 0' }}>
            <div className="jump-img">{characters[rid] ? <CharArt c={characters[rid]} /> : null}</div>
            <div>
              <h2 style={{ margin: 0 }}>{r?.name} wants to jump in to help {focus.snap.name}!</h2>
              <div className="speech-quote">“{String(e.context.line)}”</div>
              <div className="faint" style={{ marginTop: 6 }}>{focus.snap.name} is {conditionOf(focus).label.toLowerCase()}{focus.injuries.length ? ` with ${focus.injuries.map((i) => i.label.toLowerCase()).join(', ')}` : ''}. Letting them in costs no call, but they can only come in once.</div>
            </div>
          </div>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => call('none')}>Stay on the bench</button>
            <button className="btn primary" onClick={() => call('reinforce', rid)}>Let them in!</button>
          </div>
        </div>
      </div>
    );
  }

  const CALLS: Array<{ kind: CallKind; icon: string; title: string; text: string }> = [
    { kind: 'all_out', icon: '🔥', title: 'Go all out', text: 'Hit harder for the next 4 actions (+12% power, more attacks). Guard drops.' },
    { kind: 'defend', icon: '🛡️', title: 'Guard up', text: 'Rebuild the guard right now and block far more for 4 actions.' },
    { kind: 'ultimate', icon: '⚡', title: 'Use it NOW', text: best ? `${best.name} on the next turn, no waiting.` : 'Their strongest technique on the next turn.' },
    { kind: 'callback', icon: '↩️', title: back ? 'Call back' : 'Fall back', text: back ? `Pull ${focus.snap.name} back to recover; ${back.snap.name} takes the front.` : `${focus.snap.name} backs off: guard reset, breath back, a little recovery. The other side gains momentum.` },
  ];

  return (
    <div className="corner-overlay" role="dialog" aria-modal="true" aria-label={`${player?.name}'s corner`}>
      <div className="corner-card" style={{ ['--pc' as string]: player?.color ?? '#7c5cff' }}>
        <div className="corner-head">
          <div>
            <div className="eyebrow">⏸ Fight paused · {player?.name}&apos;s corner</div>
            <h2>{(REASON[String(e.context?.reason)] ?? REASON.check)(focus.snap.name, foeName)}</h2>
          </div>
          <div className="calls-left">{String(e.context?.callsLeft)} call{e.context?.callsLeft === 1 ? '' : 's'} left</div>
        </div>
        <div className="corner-grid">
          <div className="panel tight">
            <div className="label" style={{ marginBottom: 6 }}>Your fighter</div>
            <InjuryReport name={focus.snap.name} condition={conditionOf(focus).label} injuries={focus.injuries} guard={focus.guard} staminaPct={focus.st / focus.maxSt} knockdowns={focus.knockdowns} />
          </div>
          <div className="panel tight">
            <div className="label" style={{ marginBottom: 6 }}>The opposition</div>
            <div className="col" style={{ gap: 8 }}>
              {foes.map((f) => (
                <div key={f.snap.charId} className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'center' }}>
                  <BodyChart injuries={f.injuries} size={56} down={f.floored} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{f.snap.name}</div>
                    <div className="faint" style={{ fontSize: 12 }}>{conditionOf(f).label} · guard {guardWord(f.guard).label.toLowerCase()}{f.knockdowns ? ` · down ×${f.knockdowns}` : ''}</div>
                    <div className="faint" style={{ fontSize: 12 }}>{f.injuries.length ? f.injuries.map((i) => i.label).join(', ') : 'Unhurt'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="call-grid">
          {CALLS.filter((c) => options.includes(c.kind)).map((c) => (
            <button key={c.kind} className="call-btn" onClick={() => call(c.kind)}>
              <span className="ci">{c.icon}</span><span><b>{c.title}</b><small>{c.text}</small></span>
            </button>
          ))}
        </div>
        {options.includes('reinforce') && (input.sides[side].reserves ?? []).length > 0 && (
          <div>
            <div className="label" style={{ margin: '10px 0 6px' }}>📣 Send backup from the bench (once per fight: one strike with their best move)</div>
            <div className="row" style={{ gap: 8 }}>
              {(input.sides[side].reserves ?? []).map((r) => {
                const move = r.abilities.map((id) => ABILITIES[id]).filter((m) => m && ['attack', 'summon', 'ultimate', 'aoe'].includes(m.kind)).sort((a, b) => b.power - a.power)[0];
                return (
                  <button key={r.charId} className="reserve-btn" onClick={() => call('reinforce', r.charId)}>
                    <div className="rb-img">{characters[r.charId] ? <CharArt c={characters[r.charId]} /> : null}</div>
                    <span><b>{r.name}</b><small>{move ? move.name : 'Strike'}</small></span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn" onClick={() => call('none')}>Let them fight →</button>
        </div>
      </div>
    </div>
  );
}
