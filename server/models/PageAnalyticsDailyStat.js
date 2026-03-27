const mongoose = require('mongoose');

const PageAnalyticsDailyStatSchema = new mongoose.Schema({
  site: { type: String, required: true },
  page: { type: String, required: true },
  dateKey: { type: String, required: true }, // YYYY-MM-DD
  enterCount: { type: Number, default: 0 },
  totalDurationMs: { type: Number, default: 0 }
});

PageAnalyticsDailyStatSchema.index({ site: 1, page: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model('PageAnalyticsDailyStat', PageAnalyticsDailyStatSchema);
