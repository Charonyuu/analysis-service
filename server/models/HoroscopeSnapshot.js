const mongoose = require('mongoose');

const SectionSchema = new mongoose.Schema({
  rating: { type: Number, default: 0 },
  text: { type: String, default: '' },
}, { _id: false });

const SignDataSchema = new mongoose.Schema({
  signId: { type: String, required: true },
  name: { type: String, required: true },
  nameEN: { type: String, default: '' },
  emoji: { type: String, default: '' },
  dateRange: { type: String, default: '' },
  summary: { type: String, default: '' },
  luckyNumber: { type: String, default: '' },
  luckyColor: { type: String, default: '' },
  luckyDirection: { type: String, default: '' },
  luckyTime: { type: String, default: '' },
  luckySign: { type: String, default: '' },
  overall: SectionSchema,
  love: SectionSchema,
  career: SectionSchema,
  money: SectionSchema,
}, { _id: false });

const HoroscopeSnapshotSchema = new mongoose.Schema({
  fetchedAt: { type: Date, default: Date.now, index: true },
  date: { type: String, required: true, index: true }, // "2026-04-17"
  signs: [SignDataSchema],
});

module.exports = mongoose.model('HoroscopeSnapshot', HoroscopeSnapshotSchema);
