/**
 * APNs Send Module
 *
 * 用 @parse/node-apn (passive maintained, 但仍是最穩 Node APNs lib)
 * 用 .p8 token-based auth（不用每年換 cert）
 *
 * 環境變數需要設：
 *   APNS_KEY_ID       — Apple Developer 後台 Keys 拿到的 10 字元 Key ID
 *   APNS_TEAM_ID      — Apple Developer Membership 頁的 Team ID
 *   APNS_KEY_PATH     — .p8 檔絕對路徑（建議 ~/.apns/AuthKey_XXX.p8，不要進 git）
 *   APNS_BUNDLE_ID    — APNs topic, default com.pixelframe.app
 *   APNS_PRODUCTION   — "true" 走正式環境 (api.push.apple.com), 預設 false 走 sandbox
 */
const apn = require('@parse/node-apn');
const path = require('path');
const fs = require('fs');
const DeviceToken = require('../models/DeviceToken');

let provider = null;

function getProvider() {
  if (provider) return provider;

  const keyPath = process.env.APNS_KEY_PATH;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;

  if (!keyPath || !keyId || !teamId) {
    throw new Error('APNS env not set: need APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID');
  }

  const resolvedPath = keyPath.startsWith('/') ? keyPath : path.resolve(keyPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`APNS .p8 file not found at ${resolvedPath}`);
  }

  provider = new apn.Provider({
    token: { key: resolvedPath, keyId, teamId },
    production: process.env.APNS_PRODUCTION === 'true',
  });

  return provider;
}

const BUNDLE_ID = () => process.env.APNS_BUNDLE_ID || 'com.pixelframe.app';

/**
 * 發公告通知（用戶看得到 banner + sound）
 *   { title, body, payload?, deviceTokens?: string[] }
 *   deviceTokens 不傳就發給所有 enabled 且未 invalidated 的 token
 */
async function sendAnnouncement({ title, body, payload = {}, deviceTokens } = {}) {
  if (!title || !body) throw new Error('title and body required');

  const tokens = await resolveTokens(deviceTokens);
  if (tokens.length === 0) return { sent: 0, failed: 0, total: 0 };

  const note = new apn.Notification();
  note.alert = { title, body };
  note.sound = 'default';
  note.topic = BUNDLE_ID();
  note.payload = { type: 'announcement', ...payload };
  note.expiry = Math.floor(Date.now() / 1000) + 3600 * 24;  // 24 hr expiry

  const result = await getProvider().send(note, tokens);
  await markResults(result);
  return summarize(result);
}

/**
 * Silent push — 純背景，trigger widget reload，無 alert
 *   { widgetKind?: string, deviceTokens?: string[] }
 */
async function sendSilentPush({ widgetKind, deviceTokens } = {}) {
  const tokens = await resolveTokens(deviceTokens);
  if (tokens.length === 0) return { sent: 0, failed: 0, total: 0 };

  const note = new apn.Notification();
  note.contentAvailable = 1;  // silent push 必須
  note.priority = 5;          // silent push 必須是 5
  note.topic = BUNDLE_ID();
  note.pushType = 'background';
  note.payload = widgetKind ? { widgetKind } : {};

  const result = await getProvider().send(note, tokens);
  await markResults(result);
  return summarize(result);
}

async function resolveTokens(deviceTokens) {
  if (Array.isArray(deviceTokens) && deviceTokens.length > 0) return deviceTokens;
  const docs = await DeviceToken.find({
    enabled: true,
    invalidatedAt: null,
  }).select('deviceToken').lean();
  return docs.map(d => d.deviceToken);
}

async function markResults(result) {
  // result.sent: [{ device }], result.failed: [{ device, status, response: { reason } }]
  if (result.sent && result.sent.length > 0) {
    await DeviceToken.updateMany(
      { deviceToken: { $in: result.sent.map(s => s.device) } },
      { $set: { lastSentAt: new Date() } }
    );
  }

  if (result.failed && result.failed.length > 0) {
    for (const f of result.failed) {
      const reason = f.response?.reason;
      // BadDeviceToken / Unregistered → 永久失效，標記避免再試
      if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
        await DeviceToken.updateOne(
          { deviceToken: f.device },
          { $set: { invalidatedAt: new Date(), invalidationReason: reason } }
        );
      }
    }
  }
}

function summarize(result) {
  return {
    sent: result.sent?.length || 0,
    failed: result.failed?.length || 0,
    total: (result.sent?.length || 0) + (result.failed?.length || 0),
    failures: (result.failed || []).map(f => ({
      device: f.device?.slice(0, 16) + '...',
      reason: f.response?.reason,
      status: f.status,
    })),
  };
}

function shutdown() {
  if (provider) {
    provider.shutdown();
    provider = null;
  }
}

module.exports = { sendAnnouncement, sendSilentPush, shutdown };
