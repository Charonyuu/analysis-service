const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  site: {
    type: String,
    required: true,
    enum: ['travel', 'icons'],
    index: true
  },
  eventName: {
    type: String,
    required: true,
    maxlength: 100
  },
  elementId: {
    type: String,
    maxlength: 100,
    default: ''
  },
  path: {
    type: String,
    maxlength: 500,
    default: ''
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  sessionId: {
    type: String,
    maxlength: 64
  },
  ipHash: {
    type: String,
    maxlength: 64
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

EventSchema.index({ site: 1, createdAt: -1 });
EventSchema.index({ site: 1, eventName: 1 });

module.exports = mongoose.model('Event', EventSchema);
