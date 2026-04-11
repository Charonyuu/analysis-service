const bcrypt = require('bcryptjs');
const DashboardUser = require('../models/DashboardUser');

async function seedAdmin() {
  try {
    const existing = await DashboardUser.findOne({ username: 'admin', role: 'admin' });
    if (existing) {
      console.log('[seedAdmin] Admin account already exists, skipping.');
      return;
    }
    const password = process.env.INITIAL_ADMIN_PASSWORD || 'charonyu1219';
    const passwordHash = await bcrypt.hash(password, 10);
    await DashboardUser.create({
      username: 'admin',
      passwordHash,
      role: 'admin',
      displayName: 'Admin',
    });
    console.log('[seedAdmin] Admin account created successfully.');
  } catch (err) {
    console.error('[seedAdmin] Error seeding admin:', err.message);
  }
}

module.exports = seedAdmin;
