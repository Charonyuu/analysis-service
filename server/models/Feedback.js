const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  site: { type: String, required: true, index: true },
  email: { type: String, default: '' },
  name: { type: String, default: '' },
  message: { type: String, required: true, maxlength: 5000 },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Feedback', FeedbackSchema);
