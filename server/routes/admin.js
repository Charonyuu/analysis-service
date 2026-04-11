const express = require('express');
const bcrypt = require('bcryptjs');
const DashboardUser = require('../models/DashboardUser');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// All routes require admin role
router.use(requireRole('admin'));

// ─── POST /api/admin/users ── 建立新使用者（通常是 artist）─────────────────────
router.post('/users', async (req, res) => {
  try {
    const { username, password, role, displayName, themePackIds } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ ok: false, error: 'username, password, role are required' });
    }
    if (!['admin', 'artist'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'role must be admin or artist' });
    }

    const existing = await DashboardUser.findOne({ username });
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await DashboardUser.create({
      username,
      passwordHash,
      role,
      displayName: displayName || username,
      themePackIds: themePackIds || [],
    });

    res.json({
      ok: true,
      user: {
        _id: user._id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        themePackIds: user.themePackIds,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/admin/users ── 列出所有使用者 ──────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const users = await DashboardUser.find({}, '-passwordHash').sort({ createdAt: -1 });
    res.json({ ok: true, users });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /api/admin/users/:id ── 刪除使用者 ──────────────────────────────
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await DashboardUser.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    // Prevent deleting the last admin
    if (user.role === 'admin') {
      const adminCount = await DashboardUser.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ ok: false, error: 'Cannot delete the last admin account' });
      }
    }
    await DashboardUser.findByIdAndDelete(req.params.id);
    res.json({ ok: true, deleted: req.params.id });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
