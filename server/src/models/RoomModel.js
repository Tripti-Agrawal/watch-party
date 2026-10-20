const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomId: { type: String, unique: true, index: true },
  ownerId: String,
  videoId: { type: String, default: 'U8NWcutbaSA' },
  currentTime: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Room', roomSchema);
