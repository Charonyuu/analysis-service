const mongoose = require('mongoose');

const DashboardUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'artist'], required: true },
  displayName: { type: String, default: '' },
  themePackIds: [{ type: String }],  // artist 關聯的主題包 ID
}, { timestamps: true });

module.exports = mongoose.model('DashboardUser', DashboardUserSchema);
