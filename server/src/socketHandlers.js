// MessageHandler: validates every socket event (role checks live HERE, on the server) and broadcasts results.
const EMOJIS = ['👍', '😂', '😮', '❤️', '🔥', '👏'];
const GRACE_MS = 8000; // survive page refreshes without losing your role

class MessageHandler {
  constructor(io, manager) { this.io = io; this.manager = manager; }

  register(socket) {
    const wrap = (fn) => async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try { reply({ ok: true, ...((await fn(payload || {})) || {}) }); }
      catch (e) { reply({ ok: false, error: e.message }); socket.emit('error_message', e.message); }
    };

    const ctx = () => {
      const room = this.manager.rooms.get(socket.data.roomId);
      const me = room?.get(socket.data.userId);
      if (!room || !me || me.socketId !== socket.id) throw new Error('You are not in a room');
      return { room, me };
    };
    const needControl = () => { const c = ctx(); if (!c.me.canControl) throw new Error('Only the host or a moderator can do that'); return c; };
    const needHost = () => { const c = ctx(); if (c.me.role !== 'host') throw new Error('Only the host can do that'); return c; };
    const sync = (room) => room.broadcastState(this.io);
    const sendRequests = (room) => room.broadcastRequests(this.io);

    socket.on('join_room', wrap(async ({ roomId, username, userId }) => {
      const authUser = socket.data.user;
      userId = authUser.id;
      username = authUser.username;
      const room = await this.manager.get(roomId);
      if (!room) throw new Error('Room not found. Check the code and try again');
      if (socket.data.roomId && socket.data.roomId !== room.id) this.leave(socket);
      const { participant, rejoined } = room.add({ userId: String(userId), username, socketId: socket.id });
      Object.assign(socket.data, { roomId: room.id, userId: participant.userId });
      socket.join(room.id);
      if (!rejoined) socket.to(room.id).emit('user_joined', { ...participant.toJSON(), participants: room.list() });
      else room.broadcastParticipants(this.io);
      return { roomId: room.id, you: participant.toJSON(), participants: room.list(), state: room.snapshot(), requests: room.requestList(), chat: room.chat };
    }));

    socket.on('leave_room', wrap(async () => this.leave(socket, true)));

    // ---- playback (Host / Moderator only) ----
    for (const type of ['play', 'pause', 'seek', 'change_video']) {
      socket.on(type, wrap(async (payload) => {
        const { room } = needControl();
        room.apply(type, payload);
        sync(room);
        if (type === 'change_video') this.manager.persist(room);
      }));
    }

    // ---- participants ask, controllers approve ----
    socket.on('request_action', wrap(async ({ type, payload }) => {
      const { room, me } = ctx();
      if (me.canControl) { room.apply(type, payload); return sync(room); } // controllers don't need approval
      room.addRequest(me.userId, type, payload);
      sendRequests(room);
    }));

    socket.on('resolve_request', wrap(async ({ requestId, approve }) => {
      const { room } = needControl();
      const req = room.requests.get(String(requestId));
      if (!req) throw new Error('Request no longer exists');
      room.requests.delete(req.id);
      if (approve) { room.apply(req.type, req.payload); sync(room); }
      this.io.to(room.id).emit('request_resolved', { requestId: req.id, approved: !!approve, username: req.username, type: req.type });
      sendRequests(room);
    }));

    // ---- roles (Host only) ----
    socket.on('assign_role', wrap(async ({ userId, role }) => {
      const { room } = needHost();
      const p = room.assignRole(userId, role);
      room.broadcast(this.io, 'role_assigned', { userId: p.userId, username: p.username, role: p.role, participants: room.list() });
    }));

    socket.on('remove_participant', wrap(async ({ userId }) => {
      const { room, me } = needHost();
      if (userId === me.userId) throw new Error('You cannot remove yourself');
      const target = room.get(userId);
      if (!target) throw new Error('User not in room');
      room.remove(userId);
      const s = this.io.sockets.sockets.get(target.socketId);
      if (s) { s.emit('removed', { reason: 'The host removed you from the room' }); s.leave(room.id); s.data.roomId = null; }
      room.broadcast(this.io, 'participant_removed', { userId, username: target.username, participants: room.list() });
      sendRequests(room);
    }));

    socket.on('transfer_host', wrap(async ({ userId }) => {
      const { room, me } = needHost();
      if (userId === me.userId) throw new Error('You are already the host');
      const { to } = room.transferHost(me.userId, userId);
      this.manager.persist(room);
      room.broadcast(this.io, 'host_transferred', { userId: to.userId, username: to.username, participants: room.list() });
    }));

    // ---- chat + reactions (everyone) ----
    socket.on('chat_message', wrap(async ({ text }) => {
      const { room, me } = ctx();
      text = String(text || '').trim().slice(0, 300);
      if (!text) return;
      room.broadcast(this.io, 'chat_message', room.addChat(me, text));
    }));

    socket.on('reaction', wrap(async ({ emoji }) => {
      const { room, me } = ctx();
      if (!EMOJIS.includes(emoji)) throw new Error('Unsupported reaction');
      room.broadcast(this.io, 'reaction', { emoji, username: me.username, id: Math.random() });
    }));

    socket.on('disconnect', () => {
      const room = this.manager.rooms.get(socket.data.roomId);
      const me = room?.get(socket.data.userId);
      if (!me || me.socketId !== socket.id) return;
      me.timer = setTimeout(() => this.leave(socket), GRACE_MS); // grace period for refreshes
    });
  }

  leave(socket, explicit = false) {
    const room = this.manager.rooms.get(socket.data.roomId);
    const me = room?.get(socket.data.userId);
    if (!room || !me || (!explicit && me.socketId !== socket.id && this.io.sockets.sockets.has(me.socketId))) return;
    const newHost = room.remove(me.userId);
    socket.leave(room.id);
    socket.data.roomId = null;
    if (room.isEmpty) return this.manager.release(room);
    room.broadcast(this.io, 'user_left', { userId: me.userId, username: me.username, participants: room.list() });
    if (newHost) room.broadcast(this.io, 'host_transferred', { userId: newHost.userId, username: newHost.username, participants: room.list(), auto: true });
    room.broadcastRequests(this.io);
  }

  /** Periodic drift correction: re-broadcast authoritative time for rooms that are playing. */
  startHeartbeat() {
    setInterval(() => {
      for (const room of this.manager.rooms.values()) {
        if (room.state.playState === 'playing') room.broadcastState(this.io);
      }
    }, 10000).unref();
  }
}

module.exports = MessageHandler;
