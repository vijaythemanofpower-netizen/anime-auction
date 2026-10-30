// Chat for everyone in an online room: a floating button that opens a small
// panel, on every screen while you're in a room. Messages go straight to the
// room channel (src/online/room.ts), so they work in the lobby and mid-fight.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { chat, MAX_CHAT, REACTIONS, reactionFeed, sendChat, sendReaction, useRoom } from '../../online/room';

const QUICK = ['GG!', 'No way!', 'That was brutal', 'My fighter is cooking', 'Bid war!', 'Unlucky'];

export function RoomChat() {
  const room = useRoom();
  const { lines, unread } = useSyncExternalStore(chat.subscribe, chat.get);
  const floating = useSyncExternalStore(reactionFeed.subscribe, reactionFeed.get);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) chat.markRead(); }, [open, lines]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [open, lines]);
  if (!room) return null;

  const submit = (t: string) => { if (sendChat(t)) setText(''); };
  const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <>
    <div className="reaction-float" aria-hidden="true">
      {floating.map((r) => <span key={r.id} style={{ right: `${r.x}%` }}><b>{r.emoji}</b><small>{r.name}</small></span>)}
    </div>
    <div className={`room-chat${open ? ' open' : ''}`}>
      <div className="reaction-bar" role="group" aria-label="Send a reaction">
        {REACTIONS.map((e) => <button key={e} onClick={() => sendReaction(e)} aria-label={`React ${e}`}>{e}</button>)}
      </div>
      {open && (
        <section className="chat-panel" aria-label="Room chat">
          <header>
            <strong>Room {room.code}</strong>
            <span className="dim">{room.members.filter((m) => m.online).length} online</span>
            <button className="btn sm ghost" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
          </header>
          <div className="chat-lines" ref={listRef} aria-live="polite">
            {!lines.length && <p className="dim chat-empty">Say hi to the room. Everyone here sees it.</p>}
            {lines.map((l) => (
              <div key={l.id} className={`chat-line${l.mine ? ' mine' : ''}`}>
                <span className="who">{l.mine ? 'You' : l.name}</span>
                <span className="txt">{l.text}</span>
                <time>{time(l.at)}</time>
              </div>
            ))}
          </div>
          <div className="chat-quick">
            {QUICK.map((q) => <button key={q} className="chip" onClick={() => submit(q)}>{q}</button>)}
          </div>
          <form className="chat-form" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_CHAT} placeholder="Message the room" aria-label="Chat message" />
            <button className="btn primary sm" disabled={!text.trim()}>Send</button>
          </form>
        </section>
      )}
      <button className="chat-fab" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Hide chat' : `Open chat${unread ? `, ${unread} new` : ''}`}>
        💬{unread > 0 && !open && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
    </div>
    </>
  );
}
