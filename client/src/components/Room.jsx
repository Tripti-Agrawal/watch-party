import React, { useCallback, useEffect, useRef, useState } from 'react';
import { socket, emit, connectSocket ,getUser } from '../socket.js';
import Player from './Player.jsx';
import { Participants, Requests, Chat } from './Panels.jsx';

const LABEL = { play: 'play', pause: 'pause', seek: 'seek', change_video: 'video change' };

export default function Room({ roomId, onExit ,onAuthExpired }) {
  const [me, setMe] = useState(null);
  const [people, setPeople] = useState([]);
  const [state, setState] = useState(null);
  const [requests, setRequests] = useState([]);
  const [chat, setChat] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const userId = useRef(getUser()?.id).current;

  const toast = useCallback((text) => {
    const id = Math.random();
    setToasts((t) => [...t.slice(-3), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  useEffect(() => {
    const join = async () => {
      try {
        const r = await emit('join_room', { roomId });
        setMe(r.you); setPeople(r.participants); setRequests(r.requests); setChat(r.chat);
        setState({ ...r.state, receivedAt: Date.now() });
      } catch (e) { setError(e.message); }
    };
    const withRole = (list) => { setPeople(list); setMe((m) => (m ? { ...m, ...(list.find((p) => p.userId === userId) || {}) } : m)); };

    const on = {
      connect: join, // also re-joins automatically after a dropped connection
      sync_state: (s) => setState({ ...s, receivedAt: Date.now() }),
      user_joined: (d) => { withRole(d.participants); toast(`${d.username} joined`); },
      user_left: (d) => { withRole(d.participants); toast(`${d.username} left`); },
      participants_updated: (d) => withRole(d.participants),
      role_assigned: (d) => { withRole(d.participants); toast(`${d.username} is now ${d.role}`); },
      participant_removed: (d) => { withRole(d.participants); toast(`${d.username} was removed`); },
      host_transferred: (d) => { withRole(d.participants); toast(`${d.username} is now the host${d.auto ? ' (host left)' : ''}`); },
      requests_updated: (d) => setRequests(d.requests),
      request_resolved: (d) => toast(`${d.username}'s ${LABEL[d.type]} request was ${d.approved ? 'approved' : 'declined'}`),
      chat_message: (m) => setChat((c) => [...c.slice(-99), m]),
      reaction: (r) => { setReactions((x) => [...x, r]); setTimeout(() => setReactions((x) => x.filter((y) => y.id !== r.id)), 2500); },
      error_message: (m) => toast(m),
      removed: (d) => { setError(d.reason); socket.disconnect(); },
      connect_error: (e) => { if (/auth|expired|invalid/i.test(e.message)) onAuthExpired?.(); else setError(e.message); },
    };
    Object.entries(on).forEach(([e, h]) => socket.on(e, h));
    connectSocket();
    return () => { Object.entries(on).forEach(([e, h]) => socket.off(e, h)); emit('leave_room').catch(() => {}); socket.disconnect(); };
  }, [roomId, onAuthExpired]);

  const act = (type, payload) => {
    const event = me.role === 'host' || me.role === 'moderator' ? type : 'request_action';
    const body = event === type ? payload : { type, payload };
    emit(event, body).then(() => event !== type && toast('Request sent for approval')).catch((e) => toast(e.message));
  };
  const call = (event, payload) => emit(event, payload).catch((e) => toast(e.message));
  const link = `${location.origin}/room/${roomId}`;
  const copy = async () => { await navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  if (error) return <main className="home"><h1>Can't open this room</h1><p className="error">{error}</p><button className="primary" onClick={onExit}>Back to start</button></main>;
  if (!me || !state) return <main className="home"><p className="sub">Joining room {roomId}…</p></main>;

  const canControl = me.role === 'host' || me.role === 'moderator';
  return (
    <div className="room">
      <header>
        <div><strong>Room {roomId}</strong> <span className={`badge ${me.role}`}>{me.role}</span></div>
        <div className="row">
          <button onClick={copy}>{copied ? 'Link copied' : 'Copy invite link'}</button>
          <button onClick={onExit}>Leave</button>
        </div>
      </header>
      <div className="layout">
        <div>
          <Player state={state} canControl={canControl} onAction={act} />
          <div className="reactbar">
            {['👍', '😂', '😮', '❤️', '🔥', '👏'].map((e) => <button key={e} aria-label={`React ${e}`} onClick={() => call('reaction', { emoji: e })}>{e}</button>)}
          </div>
        </div>
        <aside>
          {canControl && requests.length > 0 && <Requests requests={requests} onResolve={(requestId, approve) => call('resolve_request', { requestId, approve })} />}
          {!canControl && requests.some((r) => r.userId === userId) && <p className="hint">Waiting for approval: {requests.filter((r) => r.userId === userId).map((r) => LABEL[r.type]).join(', ')}</p>}
          <Participants people={people} me={me} onRole={(u, role) => call('assign_role', { userId: u, role })} onRemove={(u) => call('remove_participant', { userId: u })} onTransfer={(u) => call('transfer_host', { userId: u })} />
          <Chat messages={chat} onSend={(text) => call('chat_message', { text })} />
        </aside>
      </div>
      <div className="floaters" aria-hidden="true">{reactions.map((r) => <span key={r.id} style={{ left: `${10 + ((r.id * 1000) % 70)}%` }}>{r.emoji}<small>{r.username}</small></span>)}</div>
      <div className="toasts" role="status">{toasts.map((t) => <div key={t.id}>{t.text}</div>)}</div>
    </div>
  );
}
