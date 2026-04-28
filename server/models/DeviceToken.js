const mongoose = require('mongoose');

const DeviceTokenSchema = new mongoose.Schema({
  // APNs hex token (64 chars)
  deviceToken: { type: String, required: true, unique: true, index: true },

  // Lumee user UUID（跟 User._id 對應，非必填以容錯）
  userId: { type: String, index: true },

  platform: { type: String, enum: ['ios'], default: 'ios' },
  bundleId: { type: String, default: 'com.pixelframe.app' },
  appVersion: { type: String },

  // 推送類型開關（未來擴充用，目前都當 true）
  enabled: { type: Boolean, default: true },

  // 上次成功推送時間，方便清理長期失效的 token
  lastSentAt: { type: Date },

  // APNs 回 Unregistered 時標記，下次發送跳過
  invalidatedAt: { type: Date, default: null },
  invalidationReason: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('DeviceToken', DeviceTokenSchema);
