/**
 * Push API
 *
 * Public (X-IAP-Secret 認證):
 *   POST /api/push/register-device  — iOS app 上傳 device token
 *
 * Admin (Bearer token via authBearer):
 *   POST /api/push/send-announcement  — 發公告通知
 *   POST /api/push/send-silent        — 發 silent push (widget reload)
 *   GET  /api/push/devices            — 列裝置數量
 */
const express = require('express');
const router = express.Router();

const DeviceToken = require('../models/DeviceToken');
const { sendAnnouncement, sendSilentPush } = require('../services/apns');
const { authBearer } = require('../middleware/auth');

function requireIapSecret(req, res, next) {
  const secret = req.headers['x-iap-secret'];
  if (!secret || secret !== process.env.IAP_SECRET) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  next();
}

// POST /api/push/register-device  (called by iOS)
router.post('/register-device', requireIapSecret, async (req, res) => {
  const { deviceToken, userId, platform = 'ios', bundleId, appVersion } = req.body || {};
  if (!deviceToken || typeof deviceToken !== 'string' || !/^[a-f0-9]{32,}$/i.test(deviceToken)) {
    return res.status(400).json({ error: 'invalid deviceToken' });
  }

  try {
    const doc = await DeviceToken.findOneAndUpdate(
      { deviceToken },
      {
        $set: {
          userId: userId || null,
          platform,
          bundleId: bundleId || 'com.pixelframe.app',
          appVersion: appVersion || null,
          enabled: true,
          invalidatedAt: null,
          invalidationReason: null,
        },
      },
      { upsert: true, new: true }
    );
    res.json({ ok: true, id: doc._id });
  } catch (err) {
    console.error('[Push] register-device error:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// === Admin endpoints (Bearer token via authBearer at mount) ===

// POST /api/push/send-announcement
//   body: { title, body, payload?, deviceTokens? }
router.post('/send-announcement', authBearer, async (req, res) => {
  const { title, body, payload, deviceTokens } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });

  try {
    const result = await sendAnnouncement({ title, body, payload, deviceTokens });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Push] send-announcement error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/push/send-silent
//   body: { widgetKind?, deviceTokens? }
router.post('/send-silent', authBearer, async (req, res) => {
  const { widgetKind, deviceTokens } = req.body || {};
  try {
    const result = await sendSilentPush({ widgetKind, deviceTokens });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Push] send-silent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/push/devices  (admin) — 統計
router.get('/devices', authBearer, async (req, res) => {
  const total = await DeviceToken.countDocuments({ invalidatedAt: null, enabled: true });
  const invalidated = await DeviceToken.countDocuments({ invalidatedAt: { $ne: null } });
  res.json({ total, invalidated });
});

module.exports = router;
