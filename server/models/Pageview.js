const mongoose = require('mongoose');

const PageviewSchema = new mongoose.Schema({
  site: {
    type: String,
    required: true,
    enum: ['travel', 'icons'],
    index: true
  },
  path: {
    type: String,
    required: true,
    maxlength: 500
  },
  referrer: {
    type: String,
    maxlength: 500,
    default: ''
  },
  userAgent: {
    type: String,
    maxlength: 500
  },
  ipHash: {
    type: String,
    maxlength: 64
  },
  sessionId: {
    type: String,
    maxlength: 64
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

PageviewSchema.index({ site: 1, createdAt: -1 });
PageviewSchema.index({ site: 1, path: 1 });

module.exports = mongoose.model('Pageview', PageviewSchema);
