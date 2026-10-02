// OOP core: Participant + Room encapsulate state, permissions and broadcast data.
const CONTROL_ROLES = ['host', 'moderator'];
const ASSIGNABLE = ['moderator', 'participant', 'viewer'];
const ACTIONS = ['play', 'pause', 'seek', 'change_video'];

function extractVideoId(input = '') {
  const s = String(input).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

class Participant {
  constructor({ userId, username, socketId, role }) {
    Object.assign(this, { userId, username, socketId, role, joinedAt: Date.now(), timer: null });
  }
  get canControl() { return CONTROL_ROLES.includes(this.role); }
  toJSON() { return { userId: this.userId, username: this.username, role: this.role }; }
}

class Room {
  constructor({ id, ownerId, videoId = 'dQw4w9WgXcQ', currentTime = 0 }) {
    this.id = id;
    this.ownerId = ownerId;
    this.participants = new Map(); // userId -> Participant
    this.requests = new Map();     // requestId -> { id, userId, username, type, payload }
    this.chat = [];
    this.state = { videoId, playState: 'paused', currentTime, updatedAt: Date.now() };
    this.reqCounter = 0;
  }

  // ---- room broadcasts (OOP) ----
  // Room owns the knowledge of which Socket.IO room to broadcast to.
  broadcast(io, event, payload) {
    io.to(this.id).emit(event, payload);
  }

  broadcastState(io) {
    this.broadcast(io, 'sync_state', this.snapshot());
  }

  broadcastParticipants(io, event = 'participants_updated') {
    this.broadcast(io, event, { participants: this.list() });
  }

  broadcastRequests(io) {
    this.broadcast(io, 'requests_updated', { requests: this.requestList() });
  }

  // ---- participants ----
  get host() { return [...this.participants.values()].find((p) => p.role === 'host'); }
  get(userId) { return this.participants.get(userId); }
  list() { return [...this.participants.values()].map((p) => p.toJSON()); }
  get isEmpty() { return this.participants.size === 0; }

  add({ userId, username, socketId }) {
    const existing = this.participants.get(userId);
    if (existing) { // reconnect / refresh: keep role
      clearTimeout(existing.timer);
      existing.socketId = socketId;
      existing.username = username;
      return { participant: existing, rejoined: true };
    }
    // Host = room creator (or first person in if the host is gone); everyone else = participant
    const role = !this.host && (userId === this.ownerId || this.isEmpty) ? 'host' : 'participant';
    if (role === 'host') this.ownerId = userId;
    const participant = new Participant({ userId, username, socketId, role });
    this.participants.set(userId, participant);
    return { participant, rejoined: false };
  }

  /** Removes a participant; returns the new host if the host role had to be reassigned. */
  remove(userId) {
    const p = this.participants.get(userId);
    if (!p) return null;
    clearTimeout(p.timer);
    this.participants.delete(userId);
    for (const [id, r] of this.requests) if (r.userId === userId) this.requests.delete(id);
    if (p.role !== 'host' || this.isEmpty) return null;
    const next = [...this.participants.values()].sort(
      (a, b) => (b.role === 'moderator') - (a.role === 'moderator') || a.joinedAt - b.joinedAt
    )[0];
    next.role = 'host';
    this.ownerId = next.userId;
    return next;
  }

  assignRole(userId, role) {
    if (!ASSIGNABLE.includes(role)) throw new Error('Invalid role');
    const p = this.participants.get(userId);
    if (!p) throw new Error('User not in room');
    if (p.role === 'host') throw new Error('Cannot change the host role; use transfer host');
    p.role = role;
    return p;
  }

  transferHost(fromId, toId) {
    const from = this.participants.get(fromId), to = this.participants.get(toId);
    if (!to) throw new Error('User not in room');
    from.role = 'moderator';
    to.role = 'host';
    this.ownerId = toId;
    return { from, to };
  }

  // ---- playback state ----
  liveTime() {
    const s = this.state;
    return s.playState === 'playing' ? s.currentTime + (Date.now() - s.updatedAt) / 1000 : s.currentTime;
  }

  snapshot() { return { ...this.state, serverNow: Date.now() }; }

  apply(type, payload = {}) {
    if (!ACTIONS.includes(type)) throw new Error('Unknown action');
    const now = Date.now();
    const s = this.state;
    if (type === 'play') Object.assign(s, { currentTime: this.liveTime(), playState: 'playing', updatedAt: now });
    else if (type === 'pause') Object.assign(s, { currentTime: this.liveTime(), playState: 'paused', updatedAt: now });
    else if (type === 'seek') {
      const t = Number(payload.time);
      if (!Number.isFinite(t) || t < 0) throw new Error('Invalid seek time');
      Object.assign(s, { currentTime: t, updatedAt: now });
    } else if (type === 'change_video') {
      const id = extractVideoId(payload.videoId);
      if (!id) throw new Error('Invalid YouTube URL or ID');
      Object.assign(s, { videoId: id, currentTime: 0, playState: 'playing', updatedAt: now });
    }
    return this.snapshot();
  }

  // ---- approval requests (participants ask, host/mods decide) ----
  addRequest(userId, type, payload) {
    if (!ACTIONS.includes(type)) throw new Error('Unknown action');
    if (type === 'change_video' && !extractVideoId(payload?.videoId)) throw new Error('Invalid YouTube URL or ID');
    if (type === 'seek' && !Number.isFinite(Number(payload?.time))) throw new Error('Invalid seek time');
    const p = this.participants.get(userId);
    for (const [id, r] of this.requests) if (r.userId === userId && r.type === type) this.requests.delete(id); // one per type
    const id = String(++this.reqCounter);
    const req = { id, userId, username: p.username, type, payload: payload || {} };
    this.requests.set(id, req);
    return req;
  }
  requestList() { return [...this.requests.values()]; }

  addChat(p, text) {
    const msg = { id: Date.now() + Math.random(), userId: p.userId, username: p.username, role: p.role, text, at: Date.now() };
    this.chat.push(msg);
    if (this.chat.length > 100) this.chat.shift();
    return msg;
  }
}

module.exports = { Room, Participant, extractVideoId, ASSIGNABLE };
