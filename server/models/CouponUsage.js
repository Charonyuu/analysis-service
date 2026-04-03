const mongoose = require('mongoose');

const CouponUsageSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  code: { type: String, required: true },
  usedAt: { type: Date, default: Date.now },
});

// Compound unique index: one user can only use each code once
CouponUsageSchema.index({ userId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('CouponUsage', CouponUsageSchema);
