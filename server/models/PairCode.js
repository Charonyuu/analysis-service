const mongoose = require('mongoose');

const pairCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true },
  nickname: { type: String, default: '' },
  character: { type: String, default: 'charon' },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Auto-delete expired codes after 10 minutes
pairCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 });

module.exports = mongoose.model('PairCode', pairCodeSchema);
