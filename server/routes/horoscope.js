const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const HoroscopeSnapshot = require('../models/HoroscopeSnapshot');

const horoscopeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { ok: false, error: 'rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(horoscopeLimiter);

// GET /api/horoscope
// GET /api/horoscope?sign=aries
router.get('/', async (req, res) => {
  try {
    const snapshot = await HoroscopeSnapshot.findOne()
      .sort({ fetchedAt: -1 })
      .lean();

    if (!snapshot) {
      return res.json({ signs: [], date: null, updatedAt: null });
    }

    let { signs } = snapshot;
    const { sign } = req.query;

    if (sign) {
      signs = signs.filter((s) => s.signId === sign);
    }

    res.json({
      signs,
      date: snapshot.date,
      updatedAt: snapshot.fetchedAt,
    });
  } catch (err) {
    console.error('[horoscope] API error:', err.message);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/horoscope/refresh — 手動觸發一次 fetch
router.get('/refresh', async (req, res) => {
  try {
    const { fetchAllHoroscopes } = require('../services/horoscopeSources');
    const signs = await fetchAllHoroscopes();

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

    const snapshot = await HoroscopeSnapshot.create({
      fetchedAt: new Date(),
      date: today,
      signs,
    });

    res.json({
      ok: true,
      date: today,
      signCount: signs.length,
      signs: signs.map((s) => ({
        signId: s.signId,
        name: s.name,
        overallRating: s.overall?.rating,
        summary: s.summary,
      })),
      savedAt: snapshot.fetchedAt,
    });
  } catch (err) {
    console.error('[horoscope] refresh error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
