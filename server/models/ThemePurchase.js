const mongoose = require('mongoose');

const ThemePurchaseSchema = new mongoose.Schema({
  userId:    { type: String, required: true, index: true },
  themeId:   { type: String, required: true, index: true },
  coinPrice: { type: Number, required: true },
}, { timestamps: true });

// 每個 user 每個 theme 只能買一次
ThemePurchaseSchema.index({ userId: 1, themeId: 1 }, { unique: true });

module.exports = mongoose.model('ThemePurchase', ThemePurchaseSchema);
