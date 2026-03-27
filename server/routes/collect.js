const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Pageview = require('../models/Pageview');
const Event = require('../models/Event');

const VALID_SITES = ['travel', 'icons'];

function hashIP(ip) {
  if (!ip) return '';
  return crypto.createHash('sha256').update(ip).digest('hex');
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
}

// POST /api/pageview
router.post('/pageview', async (req, res) => {
  try {
    const { site, path, referrer, sessionId } = req.body;

    if (!site) return res.status(400).json({ ok: false, error: 'site is required' });
    if (!VALID_SITES.includes(site)) return res.status(400).json({ ok: false, error: 'invalid site value' });
    if (!path) return res.status(400).json({ ok: false, error: 'path is required' });

    await Pageview.create({
      site,
      path: String(path).slice(0, 500),
      referrer: referrer ? String(referrer).slice(0, 500) : '',
      userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : '',
      ipHash: hashIP(getClientIP(req)),
      sessionId: sessionId ? String(sessionId).slice(0, 64) : ''
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// POST /api/event
router.post('/event', async (req, res) => {
  try {
    const { site, eventName, elementId, path, metadata, sessionId } = req.body;

    if (!site) return res.status(400).json({ ok: false, error: 'site is required' });
    if (!VALID_SITES.includes(site)) return res.status(400).json({ ok: false, error: 'invalid site value' });
    if (!eventName) return res.status(400).json({ ok: false, error: 'eventName is required' });

    // Limit metadata size
    let safeMeta = {};
    if (metadata && typeof metadata === 'object') {
      const metaStr = JSON.stringify(metadata);
      if (metaStr.length <= 2048) {
        safeMeta = metadata;
      }
    }

    await Event.create({
      site,
      eventName: String(eventName).slice(0, 100),
      elementId: elementId ? String(elementId).slice(0, 100) : '',
      path: path ? String(path).slice(0, 500) : '',
      metadata: safeMeta,
      sessionId: sessionId ? String(sessionId).slice(0, 64) : '',
      ipHash: hashIP(getClientIP(req))
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

module.exports = router;
