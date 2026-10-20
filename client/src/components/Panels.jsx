import React, { useEffect, useRef, useState } from 'react';

const LABEL = { play: 'play', pause: 'pause', seek: 'seek', change_video: 'change the video' };

export function Participants({ people, me, onRole, onRemove, onTransfer }) {
  const isHost = me.role === 'host';
  return (
    <section className="card">
      <h2>In this room ({people.length})</h2>
      <ul className="people">
        {people.map((p) => (
          <li key={p.userId}>
            <span className="who">{p.username}{p.userId === me.userId && ' (you)'}</span>
            <span className={`badge ${p.role}`}>{p.role}</span>
            {isHost && p.role !== 'host' && (
              <span className="row tools">
                <select value={p.role} aria-label={`Role for ${p.username}`} onChange={(e) => onRole(p.userId, e.target.value)}>
                  <option value="participant">Participant</option>
                  <option value="moderator">Moderator</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button title="Make host" onClick={() => confirm(`Make ${p.username} the host?`) && onTransfer(p.userId)}>Make host</button>
                <button className="danger" onClick={() => confirm(`Remove ${p.username}?`) && onRemove(p.userId)}>Remove</button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Requests({ requests, onResolve }) {
  return (
    <section className="card attention">
      <h2>Waiting for approval</h2>
      <ul className="people">
        {requests.map((r) => (
          <li key={r.id}>
            <span className="who">{r.username} wants to {LABEL[r.type]}{r.type === 'seek' ? ` to ${Math.floor(r.payload.time / 60)}:${String(Math.floor(r.payload.time % 60)).padStart(2, '0')}` : ''}{r.type === 'change_video' ? ` (${r.payload.videoId.slice(0, 40)})` : ''}</span>
            <span className="row"><button className="primary" onClick={() => onResolve(r.id, true)}>Approve</button><button onClick={() => onResolve(r.id, false)}>Decline</button></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Chat({ messages, onSend }) {
  const [text, setText] = useState('');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages]);
  return (
    <section className="card chat">
      <h2>Chat</h2>
      <div className="msgs">
        {messages.length === 0 && <p className="hint">No messages yet. Say hi.</p>}
        {messages.map((m) => <p key={m.id}><b className={m.role}>{m.username}</b> {m.text}</p>)}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onSend(text); setText(''); } }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Message" aria-label="Chat message" />
        <button type="submit">Send</button>
      </form>
    </section>
  );
}
