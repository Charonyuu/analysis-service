const mongoose = require('mongoose');

const userCoupleProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  lastLocation: {
    lat: { type: Number, default: null },
    lon: { type: Number, default: null },
    updatedAt: { type: Date, default: null }
  },
  mood: { type: String, default: '' },     // emoji
  message: { type: String, default: '' },  // short message (30 chars)
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserCoupleProfile', userCoupleProfileSchema);
