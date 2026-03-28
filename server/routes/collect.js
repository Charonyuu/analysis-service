const express = require('express');
const router = express.Router();
const PageAnalyticsEvent = require('../models/PageAnalyticsEvent');
const PageAnalyticsDailyStat = require('../models/PageAnalyticsDailyStat');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// POST /api/analytics
router.post('/analytics', async (req, res) => {
  try {
    const { site, page, path, action, durationMs, visitorId, sessionId } = req.body;

    if (!site) return res.status(400).json({ ok: false, error: 'site is required' });
    if (!page) return res.status(400).json({ ok: false, error: 'page is required' });
    const validActions = ['enter', 'leave', 'heartbeat', 'click'];
    if (!action || !validActions.includes(action)) {
      return res.status(400).json({ ok: false, error: 'invalid action' });
    }

    const { eventName } = req.body;

    // Save raw event (skip heartbeat to keep DB lean)
    if (action !== 'heartbeat') {
      await PageAnalyticsEvent.create({
        site,
        page: String(page).slice(0, 100),
        path: path ? String(path).slice(0, 500) : '',
        action,
        eventName: action === 'click' ? String(eventName || '').slice(0, 100) : undefined,
        durationMs: action === 'leave' ? (parseInt(durationMs) || 0) : 0,
        visitorId: visitorId ? String(visitorId).slice(0, 64) : '',
        sessionId: sessionId ? String(sessionId).slice(0, 64) : '',
        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : ''
      });
    }

    // Update daily stat (only for enter/leave/heartbeat)
    if (action !== 'click') {
      const dateKey = todayKey();
      const update = {};
      if (action === 'enter') {
        update.$inc = { enterCount: 1 };
      } else {
        update.$inc = { totalDurationMs: parseInt(durationMs) || 0 };
      }

      await PageAnalyticsDailyStat.findOneAndUpdate(
        { site, page, dateKey },
        update,
        { upsert: true }
      );
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Analytics collect error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

module.exports = router;
