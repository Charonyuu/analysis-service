const mongoose = require('mongoose');

const PageAnalyticsEventSchema = new mongoose.Schema({
  site: { type: String, required: true, index: true },
  page: { type: String, required: true },
  path: { type: String, default: '' },
  action: { type: String, required: true, enum: ['enter', 'leave', 'click'] },
  eventName: { type: String, default: '' },
  durationMs: { type: Number, default: 0 },
  visitorId: { type: String, default: '' },
  sessionId: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
});

PageAnalyticsEventSchema.index({ site: 1, page: 1, createdAt: -1 });

module.exports = mongoose.model('PageAnalyticsEvent', PageAnalyticsEventSchema);
