const express = require('express');
const router = express.Router();
const Pageview = require('../models/Pageview');
const Event = require('../models/Event');

// GET /api/stats/overview
router.get('/overview', async (req, res) => {
  try {
    const { from, to } = req.query;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const result = {};
    for (const site of ['travel', 'icons']) {
      const baseQuery = { site };
      if (from || to) baseQuery.createdAt = dateFilter;

      const totalPageviews = await Pageview.countDocuments(baseQuery);
      const uniqueSessions = await Pageview.distinct('sessionId', baseQuery).then(s => s.filter(Boolean).length);
      const todayPageviews = await Pageview.countDocuments({ site, createdAt: { $gte: todayStart } });
      const weekPageviews = await Pageview.countDocuments({ site, createdAt: { $gte: weekStart } });

      result[site] = { totalPageviews, uniqueSessions, todayPageviews, weekPageviews };
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/stats/daily
router.get('/daily', async (req, res) => {
  try {
    const { site, from, to } = req.query;
    if (!site) return res.status(400).json({ ok: false, error: 'site is required' });

    const match = { site };
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) match.createdAt.$lte = new Date(to);
    }

    const pageviews = await Pageview.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1 } }
    ]);

    const events = await Event.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1 } }
    ]);

    res.json({ site, pageviews, events });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/stats/top-pages
router.get('/top-pages', async (req, res) => {
  try {
    const { site, limit } = req.query;
    if (!site) return res.status(400).json({ ok: false, error: 'site is required' });

    const pages = await Pageview.aggregate([
      { $match: { site } },
      { $group: { _id: '$path', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: parseInt(limit) || 10 },
      { $project: { _id: 0, path: '$_id', count: 1 } }
    ]);

    res.json({ site, pages });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/stats/events
router.get('/events', async (req, res) => {
  try {
    const { site, from, to } = req.query;
    if (!site) return res.status(400).json({ ok: false, error: 'site is required' });

    const match = { site };
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) match.createdAt.$lte = new Date(to);
    }

    const events = await Event.aggregate([
      { $match: match },
      { $group: { _id: '$eventName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, eventName: '$_id', count: 1 } }
    ]);

    res.json({ site, events });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/stats/recent
router.get('/recent', async (req, res) => {
  try {
    const { site } = req.query;
    if (!site) return res.status(400).json({ ok: false, error: 'site is required' });

    const pageviews = await Pageview.find({ site })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const events = await Event.find({ site })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const items = [
      ...pageviews.map(p => ({ type: 'pageview', path: p.path, createdAt: p.createdAt })),
      ...events.map(e => ({ type: 'event', eventName: e.eventName, path: e.path, createdAt: e.createdAt }))
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);

    res.json({ site, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

module.exports = router;
