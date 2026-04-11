const mongoose = require('mongoose');

const TrendingItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  titleEn: { type: String, default: '' },
  source: { type: String, required: true },
  url: { type: String, default: '' },
  score: { type: Number, default: 0 }
}, { _id: false });

const TrendingCategorySchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  labelEn: { type: String, required: true },
  items: [TrendingItemSchema]
}, { _id: false });

const TrendingSnapshotSchema = new mongoose.Schema({
  fetchedAt: { type: Date, default: Date.now, index: true },
  categories: [TrendingCategorySchema]
});

module.exports = mongoose.model('TrendingSnapshot', TrendingSnapshotSchema);
