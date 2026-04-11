const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const TrendingSnapshot = require('../models/TrendingSnapshot');

const trendingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  message: { ok: false, error: 'rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false
});

router.use(trendingLimiter);

// GET /api/trending
// GET /api/trending?category=tw_trends
router.get('/', async (req, res) => {
  try {
    const snapshot = await TrendingSnapshot.findOne()
      .sort({ fetchedAt: -1 })
      .lean();

    if (!snapshot) {
      return res.json({ categories: [], updatedAt: null });
    }

    let { categories } = snapshot;
    const { category } = req.query;

    if (category) {
      categories = categories.filter((c) => c.id === category);
    }

    res.json({
      categories,
      updatedAt: snapshot.fetchedAt
    });
  } catch (err) {
    console.error('[trending] API error:', err.message);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

module.exports = router;
