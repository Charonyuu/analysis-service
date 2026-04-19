const mongoose = require('mongoose');

const notionAuthSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  encryptedToken: { type: String, required: true },   // AES-256-GCM 加密
  workspaceId: { type: String, required: false },      // Notion workspace ID
  workspaceName: { type: String, required: false },    // Notion workspace 名稱
  databaseId: { type: String, required: false },       // 用戶選擇的主要 database
  status: { type: String, enum: ['active', 'expired', 'revoked'], default: 'active' },
  lastUsedAt: { type: Date, required: false },
}, { timestamps: true });

// Index for fast lookup by userId + status
notionAuthSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('NotionAuth', notionAuthSchema);
