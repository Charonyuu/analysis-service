const express = require('express');
const router = express.Router();
const PageAnalyticsDailyStat = require('../models/PageAnalyticsDailyStat');
const PageAnalyticsEvent = require('../models/PageAnalyticsEvent');

// GET /api/stats/sites — return all known sites
router.get('/sites', async (req, res) => {
  try {
    const sites = await PageAnalyticsDailyStat.distinct('site');
    res.json({ sites });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/stats/overview?site=xxx
router.get('/overview', async (req, res) => {
  try {
    const { site } = req.query;
    const match = site ? { site } : {};

    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    // Get all pages for the site(s)
    const allStats = await PageAnalyticsDailyStat.find(match).lean();

    // Group by page
    const pages = {};
    for (const row of allStats) {
      if (!pages[row.page]) {
        pages[row.page] = { totalEnter: 0, totalDurationSec: 0, todayEnter: 0, weekEnter: 0 };
      }
      const p = pages[row.page];
      p.totalEnter += row.enterCount;
      p.totalDurationSec += row.totalDurationMs;
      if (row.dateKey === today) {
        p.todayEnter += row.enterCount;
      }
      if (row.dateKey >= weekAgo) {
        p.weekEnter += row.enterCount;
      }
    }

    // Convert ms to seconds and calc avg
    for (const key of Object.keys(pages)) {
      const p = pages[key];
      p.totalDurationSec = Math.round(p.totalDurationSec / 1000);
      p.avgDurationSec = p.totalEnter > 0 ? Math.round(p.totalDurationSec / p.totalEnter) : 0;
    }

    res.json({ site: site || 'all', pages });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/stats/daily?site=xxx&page=xxx&from=&to=
router.get('/daily', async (req, res) => {
  try {
    const { site, page, from, to } = req.query;
    if (!site) return res.status(400).json({ ok: false, error: 'site is required' });

    const match = { site };
    if (page) match.page = page;
    if (from || to) {
      match.dateKey = {};
      if (from) match.dateKey.$gte = from;
      if (to) match.dateKey.$lte = to;
    }

    const stats = await PageAnalyticsDailyStat.find(match).sort({ dateKey: 1 }).lean();

    // Group by date
    const byDate = {};
    for (const row of stats) {
      if (!byDate[row.dateKey]) byDate[row.dateKey] = { date: row.dateKey, enterCount: 0, totalDurationSec: 0 };
      byDate[row.dateKey].enterCount += row.enterCount;
      byDate[row.dateKey].totalDurationSec += Math.round(row.totalDurationMs / 1000);
    }

    res.json({ site, daily: Object.values(byDate) });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/stats/recent?site=xxx
router.get('/recent', async (req, res) => {
  try {
    const { site } = req.query;
    if (!site) return res.status(400).json({ ok: false, error: 'site is required' });

    const events = await PageAnalyticsEvent.find({ site })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const items = events.map(e => ({
      page: e.page,
      path: e.path,
      action: e.action,
      durationSec: Math.round((e.durationMs || 0) / 1000),
      createdAt: e.createdAt
    }));

    res.json({ site, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

module.exports = router;
