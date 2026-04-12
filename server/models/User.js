const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  _id: { type: String }, // UUID from iOS app
  coins: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
