const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  trialDays: { type: Number, required: true },
  limit: { type: Number, required: true },
  usedCount: { type: Number, default: 0 },
  expireAt: { type: Date, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Coupon', CouponSchema);
