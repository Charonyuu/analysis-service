const mongoose = require('mongoose');

const coupleRelationSchema = new mongoose.Schema({
  userA: { type: String, required: true, index: true },
  userB: { type: String, required: true, index: true },
  userA_nickname: { type: String, default: '' },
  userB_nickname: { type: String, default: '' },
  userA_character: { type: String, default: 'charon' },
  userB_character: { type: String, default: 'mina' },
  anniversaryDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

// Ensure one active relation per user
coupleRelationSchema.index({ userA: 1, isActive: 1 });
coupleRelationSchema.index({ userB: 1, isActive: 1 });

module.exports = mongoose.model('CoupleRelation', coupleRelationSchema);
