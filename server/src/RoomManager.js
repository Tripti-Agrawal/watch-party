const mongoose = require('mongoose');
const RoomModel = require('./models/RoomModel');
const { Room } = require('./Room');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const dbReady = () => mongoose.connection.readyState === 1;

class RoomManager {
  constructor() { this.rooms = new Map(); }

  code() { return Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join(''); }

  async create(ownerId) {
    let id;
    do { id = this.code(); } while (this.rooms.has(id) || (dbReady() && (await RoomModel.exists({ roomId: id }))));
    const room = new Room({ id, ownerId });
    this.rooms.set(id, room);
    await this.persist(room);
    return room;
  }

  /** Memory first, then MongoDB (persistent rooms survive restarts). */
  async get(id) {
    id = String(id || '').toUpperCase();
    if (this.rooms.has(id)) return this.rooms.get(id);
    if (!dbReady()) return null;
    const doc = await RoomModel.findOne({ roomId: id }).lean();
    if (!doc) return null;
    const room = new Room({ id, ownerId: doc.ownerId, videoId: doc.videoId, currentTime: doc.currentTime });
    this.rooms.set(id, room);
    return room;
  }

  async persist(room) {
    if (!dbReady()) return;
    const s = room.state;
    await RoomModel.updateOne(
      { roomId: room.id },
      { $set: { ownerId: room.ownerId, videoId: s.videoId, currentTime: room.liveTime(), lastActive: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    ).catch((e) => console.error('persist failed', e.message));
  }

  async release(room) { // everyone left: save to DB, free memory
    await this.persist(room);
    this.rooms.delete(room.id);
  }
}

module.exports = RoomManager;
