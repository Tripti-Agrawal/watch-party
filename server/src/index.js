require('dotenv').config();
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const RoomManager = require('./RoomManager');
const MessageHandler = require('./socketHandlers');
const UserModel = require('./models/UserModel');
const UserSessionModel = require('./models/UserSessionModel');

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const SESSION_DAYS = 7;
const app = express();
const server = http.createServer(app);
const origin = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map((x) => x.trim()) : true;
const io = new Server(server, { cors: { origin, credentials: true } });
const manager = new RoomManager();
const handler = new MessageHandler(io, manager);

app.use(cors({ origin, credentials: true }));
app.use(express.json());

const signToken = (user) => {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  const token = jwt.sign({ sub: String(user._id), username: user.username, jti }, JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
  return { token, jti, expiresAt };
};

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const session = await UserSessionModel.findOne({ jti: payload.jti, userId: payload.sub }).lean();
    if (!session) return res.status(401).json({ error: 'Session expired or revoked' });
    const user = await UserModel.findById(payload.sub).lean();
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = { id: String(user._id), username: user.username, email: user.email };
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

app.get('/health', (_req, res) => res.json({ ok: true, rooms: manager.rooms.size, db: mongoose.connection.readyState === 1 }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().slice(0, 24);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (username.length < 2) return res.status(400).json({ error: 'Username must be at least 2 characters' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (await UserModel.exists({ $or: [{ username }, { email }] })) return res.status(409).json({ error: 'Username or email is already registered' });
    const user = await UserModel.create({ username, email, passwordHash: await bcrypt.hash(password, 12) });
    const session = signToken(user);
    await UserSessionModel.create({ jti: session.jti, userId: String(user._id), expiresAt: session.expiresAt });
    res.status(201).json({ token: session.token, user: { id: String(user._id), username, email } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const identifier = String(req.body?.identifier || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = await UserModel.findOne({ $or: [{ email: identifier }, { username: identifier }] });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Invalid username/email or password' });
    const session = signToken(user);
    await UserSessionModel.create({ jti: session.jti, userId: String(user._id), expiresAt: session.expiresAt });
    res.json({ token: session.token, user: { id: String(user._id), username: user.username, email: user.email } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const header = req.headers.authorization || '';
  const payload = jwt.decode(header.slice(7));
  if (payload?.jti) await UserSessionModel.deleteOne({ jti: payload.jti });
  res.json({ ok: true });
});

app.post('/api/rooms', requireAuth, async (req, res) => {
  const room = await manager.create(req.user.id);
  res.json({ roomId: room.id });
});

app.get('/api/rooms/:id', requireAuth, async (req, res) => {
  const room = await manager.get(req.params.id);
  room ? res.json({ roomId: room.id, participants: room.participants.size }) : res.status(404).json({ error: 'Room not found' });
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    const payload = jwt.verify(token, JWT_SECRET);
    const session = await UserSessionModel.findOne({ jti: payload.jti, userId: payload.sub }).lean();
    if (!session) return next(new Error('Session expired or revoked'));
    const user = await UserModel.findById(payload.sub).lean();
    if (!user) return next(new Error('User not found'));
    socket.data.user = { id: String(user._id), username: user.username, email: user.email };
    next();
  } catch { next(new Error('Invalid or expired token')); }
});

io.on('connection', (socket) => handler.register(socket));
handler.startHeartbeat();

const dist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

(async () => {
  if (process.env.MONGODB_URI) {
    try { await mongoose.connect(process.env.MONGODB_URI); console.log('MongoDB connected'); }
    catch (e) { console.error('MongoDB connection failed:', e.message); }
  } else console.warn('MONGODB_URI not set: authentication and persistence require MongoDB');
  server.listen(PORT, () => console.log(`Server listening on :${PORT}`));
})();
