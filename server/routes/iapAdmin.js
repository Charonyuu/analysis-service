const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const ThemePurchase = require('../models/ThemePurchase');

// GET /api/iap/stats — overview numbers for dashboard
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, totalTransactions, coinsResult] = await Promise.all([
      User.countDocuments(),
      Transaction.countDocuments(),
      Transaction.aggregate([{ $group: { _id: null, total: { $sum: '$coins' } } }]),
    ]);

    res.json({
      totalUsers,
      totalTransactions,
      totalCoinsGranted: coinsResult[0]?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/iap/users — list users sorted by coins desc
router.get('/users', async (req, res) => {
  try {
    const { page, limit } = req.query;
    const p = parseInt(page) || 0;
    const lim = Math.min(parseInt(limit) || 20, 100);

    const [items, total] = await Promise.all([
      User.find().sort({ coins: -1 }).skip(p * lim).limit(lim).lean(),
      User.countDocuments(),
    ]);

    res.json({ items, total, page: p, pageSize: lim });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/iap/transactions — list all transactions
router.get('/transactions', async (req, res) => {
  try {
    const { userId, page, limit } = req.query;
    const p = parseInt(page) || 0;
    const lim = Math.min(parseInt(limit) || 20, 100);
    const match = userId ? { userId } : {};

    const [items, total] = await Promise.all([
      Transaction.find(match).sort({ createdAt: -1 }).skip(p * lim).limit(lim).lean(),
      Transaction.countDocuments(match),
    ]);

    res.json({ items, total, page: p, pageSize: lim });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/iap/theme-stats — theme purchase stats grouped by themeId
router.get('/theme-stats', async (req, res) => {
  try {
    const items = await ThemePurchase.aggregate([
      {
        $group: {
          _id: '$themeId',
          totalPurchases: { $sum: 1 },
          totalCoinsSpent: { $sum: '$coinPrice' },
          uniqueUsers: { $addToSet: '$userId' },
        },
      },
      {
        $project: {
          _id: 0,
          themeId: '$_id',
          totalPurchases: 1,
          totalCoinsSpent: 1,
          uniqueUsers: { $size: '$uniqueUsers' },
        },
      },
      { $sort: { totalPurchases: -1 } },
    ]);

    res.json({ items });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

module.exports = router;
