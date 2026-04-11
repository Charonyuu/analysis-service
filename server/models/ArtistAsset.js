const mongoose = require('mongoose');

const ArtistAssetSchema = new mongoose.Schema({
  artistUsername: { type: String, required: true },
  originalName: { type: String },
  filename: { type: String, required: true },
  type: { type: String, enum: ['sticker', 'background', 'diy'], required: true },
  r2Key: { type: String, required: true },
  r2Url: { type: String, required: true },
  status: { type: String, enum: ['staging', 'approved', 'rejected'], default: 'staging' },
  reviewedAt: { type: Date },
  reviewedBy: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('ArtistAsset', ArtistAssetSchema);
