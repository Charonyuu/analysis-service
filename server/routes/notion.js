/**
 * Notion Integration Routes
 *
 * API 端點：
 *   POST   /api/notion/auth          — 驗證 Notion Token + 加密存儲
 *          Body: { userId, token, databaseId }
 *          Response: { ok, message, auth: { userId, databaseId, createdAt } }
 *
 *   GET    /api/notion/pages          — 拉取 Notion database 頁面
 *          Query: userId (required)
 *          Response: { pages, databaseId, updatedAt }
 *
 *   DELETE /api/notion/auth           — 撤銷 Notion 連結
 *          Query: userId (required)
 *          Response: { ok, message }
 *
 * 錯誤碼：
 *   400 — Missing params / Invalid database ID
 *   401 — Invalid or expired Notion token
 *   404 — Notion account not linked
 *   429 — Rate limited
 *   500 — Internal error
 *
 * 使用範例：
 *   curl -X POST http://localhost:3000/api/notion/auth \
 *     -H "Content-Type: application/json" \
 *     -d '{"userId":"device-123","token":"ntn_xxx","databaseId":"abc123"}'
 *
 *   curl http://localhost:3000/api/notion/pages?userId=device-123
 *
 *   curl -X DELETE http://localhost:3000/api/notion/auth?userId=device-123
 */

const express = require('express');
const router = express.Router();
const { Client } = require('@notionhq/client');
const NotionAuth = require('../models/NotionAuth');
const { encryptToken, decryptToken } = require('../utils/encryption');
const { fetchNotionPages, clearCache } = require('../services/notionSources');

// ---------------------------------------------------------------------------
// POST /auth — 驗證 + 加密存儲 Notion Token
// ---------------------------------------------------------------------------

router.post('/auth', async (req, res) => {
  try {
    const { userId, token, databaseId } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ ok: false, error: 'Missing userId or token' });
    }

    // 1. 驗證 Notion Token 有效性
    const notion = new Client({ auth: token });
    let workspaceId = null;
    let workspaceName = null;

    try {
      const me = await notion.users.me({});
      // bot user 的 workspace 資訊
      if (me.bot && me.bot.workspace_name) {
        workspaceName = me.bot.workspace_name;
      }
      console.log('[notion] Token validated for user:', userId);
    } catch (err) {
      console.error('[notion] Token validation failed:', err.message);
      return res.status(401).json({ ok: false, error: 'Invalid Notion token' });
    }

    // 2. 如果提供了 databaseId，驗證可存取性
    if (databaseId) {
      try {
        await notion.databases.retrieve({ database_id: databaseId });
        console.log('[notion] Database verified:', databaseId);
      } catch (err) {
        console.error('[notion] Database access failed:', err.message);
        return res.status(400).json({ ok: false, error: 'Invalid or inaccessible database ID' });
      }
    }

    // 3. 加密 Token
    let encryptedToken;
    try {
      encryptedToken = encryptToken(token);
    } catch (err) {
      console.error('[notion] Encryption error:', err.message);
      return res.status(500).json({ ok: false, error: 'Encryption failed' });
    }

    // 4. 存入 DB（upsert）
    const auth = await NotionAuth.findOneAndUpdate(
      { userId },
      {
        encryptedToken,
        databaseId: databaseId || null,
        workspaceId,
        workspaceName,
        status: 'active',
        lastUsedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log('[notion] Auth saved for user:', userId);

    res.json({
      ok: true,
      message: 'Notion account linked',
      auth: {
        userId: auth.userId,
        databaseId: auth.databaseId,
        workspaceName: auth.workspaceName,
        createdAt: auth.createdAt,
      },
    });
  } catch (err) {
    console.error('[notion] Auth error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to link Notion' });
  }
});

// ---------------------------------------------------------------------------
// GET /pages — 拉取 Notion database 頁面
// ---------------------------------------------------------------------------

router.get('/pages', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ ok: false, error: 'Missing userId' });
    }

    // 1. 從 DB 取 auth 記錄
    const auth = await NotionAuth.findOne({ userId, status: 'active' });
    if (!auth) {
      return res.status(404).json({ ok: false, error: 'Notion account not linked' });
    }

    if (!auth.databaseId) {
      return res.status(400).json({ ok: false, error: 'No database configured' });
    }

    // 2. 解密 Token
    let plainToken;
    try {
      plainToken = decryptToken(auth.encryptedToken);
    } catch (err) {
      console.error('[notion] Decryption failed for user:', userId);
      // Token 加密資料損壞 → 標記為 expired
      auth.status = 'expired';
      await auth.save();
      return res.status(401).json({ ok: false, error: 'Token expired or corrupted, please re-link' });
    }

    // 3. 拉取資料
    const pages = await fetchNotionPages(plainToken, auth.databaseId);

    // 4. 更新最後使用時間
    auth.lastUsedAt = new Date();
    await auth.save();

    res.json({
      ok: true,
      pages,
      databaseId: auth.databaseId,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notion] Fetch error:', err.message);

    // Notion Token 過期/撤銷
    if (err.status === 401 || (err.message && err.message.includes('unauthorized'))) {
      return res.status(401).json({ ok: false, error: 'Token expired or revoked' });
    }

    // Notion API 限速（但沒有快取可用）
    if (err.status === 429) {
      return res.status(429).json({ ok: false, error: 'Notion API rate limited, try again later' });
    }

    res.status(500).json({ ok: false, error: 'Failed to fetch pages' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /auth — 撤銷 Notion 連結
// ---------------------------------------------------------------------------

router.delete('/auth', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ ok: false, error: 'Missing userId' });
    }

    // 1. 查找並刪除
    const auth = await NotionAuth.findOneAndDelete({ userId });

    if (!auth) {
      return res.status(404).json({ ok: false, error: 'No linked Notion account' });
    }

    // 2. 清除相關快取
    if (auth.databaseId) {
      await clearCache(auth.databaseId);
    }

    console.log('[notion] Auth revoked for user:', userId);

    res.json({ ok: true, message: 'Notion account unlinked' });
  } catch (err) {
    console.error('[notion] Delete error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to unlink Notion' });
  }
});

module.exports = router;
