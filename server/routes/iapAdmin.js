const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Coupon = require('../models/Coupon');
const CouponUsage = require('../models/CouponUsage');
const ThemePurchase = require('../models/ThemePurchase');

// GET /api/iap/stats — overview numbers for dashboard
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, totalTransactions, coinsResult, totalCoupons] = await Promise.all([
      User.countDocuments(),
      Transaction.countDocuments(),
      Transaction.aggregate([{ $group: { _id: null, total: { $sum: '$coins' } } }]),
      Coupon.countDocuments(),
    ]);

    res.json({
      totalUsers,
      totalTransactions,
      totalCoinsGranted: coinsResult[0]?.total || 0,
      totalCoupons,
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

// GET /api/iap/coupons — list all coupons
router.get('/coupons', async (req, res) => {
  try {
    const items = await Coupon.find().sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// POST /api/iap/coupons — create a new coupon
router.post('/coupons', async (req, res) => {
  try {
    const { code, coins, limit, expireAt } = req.body;

    if (!code || !coins || !limit || !expireAt) {
      return res.status(400).json({ ok: false, error: 'code, coins, limit, expireAt are required' });
    }

    const coupon = await Coupon.create({
      code: String(code).toUpperCase().trim(),
      coins: parseInt(coins),
      limit: parseInt(limit),
      expireAt: new Date(expireAt),
    });

    res.status(201).json({ ok: true, coupon });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Code already exists' });
    }
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// POST /api/iap/coupons/bulk — generate multiple coupons at once
router.post('/coupons/bulk', async (req, res) => {
  try {
    const { prefix, count, coins, limit, expireAt } = req.body;

    if (!prefix || !count || !coins || !limit || !expireAt) {
      return res.status(400).json({ ok: false, error: 'prefix, count, coins, limit, expireAt are required' });
    }

    const n = Math.min(parseInt(count), 500); // cap at 500
    if (n < 1) return res.status(400).json({ ok: false, error: 'count must be >= 1' });

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
    function randSuffix(len = 6) {
      let s = '';
      for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    }

    const clean = String(prefix).toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    const expiry = new Date(expireAt);
    const coinsNum = parseInt(coins);
    const limitNum = parseInt(limit);

    const docs = [];
    const seen = new Set();
    let attempts = 0;

    while (docs.length < n && attempts < n * 10) {
      attempts++;
      const code = `${clean}-${randSuffix()}`;
      if (seen.has(code)) continue;
      seen.add(code);
      docs.push({ _id: undefined, code, coins: coinsNum, limit: limitNum, expireAt: expiry, usedCount: 0 });
    }

    // insertMany with ordered:false to skip any rare DB duplicates
    const result = await Coupon.insertMany(docs, { ordered: false }).catch(err => {
      if (err.code === 11000 && err.insertedDocs) return { insertedCount: err.insertedDocs.length, docs: err.insertedDocs };
      throw err;
    });

    const codes = docs.map(d => d.code);
    res.status(201).json({ ok: true, count: docs.length, codes });
  } catch (err) {
    console.error('Bulk coupon error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// DELETE /api/iap/coupons/:code — delete a coupon
router.delete('/coupons/:code', async (req, res) => {
  try {
    const code = String(req.params.code).toUpperCase();
    await Coupon.deleteOne({ code });
    await CouponUsage.deleteMany({ code });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

module.exports = router;
