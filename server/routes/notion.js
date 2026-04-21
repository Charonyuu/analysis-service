/**
 * Notion Integration Routes — OAuth Flow
 *
 * OAuth 流程：
 *   1. iOS 呼叫 GET /api/notion/oauth/authorize?redirect_uri=xxx&state=xxx
 *      → 返回 Notion OAuth URL，iOS 在 Safari 開啟
 *   2. 使用者在 Notion 授權後，重定向回 redirect_uri?code=xxx&state=xxx
 *   3. iOS 接收 code，呼叫 POST /api/notion/oauth/callback
 *      → 後端交換 access token，加密存儲到 DB，返回 userId
 *
 * API 端點：
 *   GET    /api/notion/oauth/authorize    — 取得 OAuth 授權 URL
 *          Query: userId, redirect_uri, state
 *          Response: { ok, authUrl }
 *
 *   POST   /api/notion/oauth/callback     — 交換 authorization code → access token
 *          Body: { userId, code, redirect_uri, databaseId? }
 *          Response: { ok, auth: { userId, workspaceName, databaseId } }
 *
 *   GET    /api/notion/pages              — 拉取 Notion database 頁面
 *          Query: userId (required)
 *          Response: { pages, databaseId, updatedAt }
 *
 *   DELETE /api/notion/auth               — 撤銷 Notion 連結
 *          Query: userId (required)
 *          Response: { ok, message }
 *
 * 環境變數：
 *   NOTION_OAUTH_CLIENT_ID         — Notion OAuth app client ID
 *   NOTION_OAUTH_CLIENT_SECRET     — Notion OAuth app client secret
 *   NOTION_ENCRYPTION_KEY          — AES-256-GCM key (32 bytes)
 *   REDIS_HOST, REDIS_PORT, etc.   — Optional caching
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const { Client } = require('@notionhq/client');
const NotionAuth = require('../models/NotionAuth');
const { encryptToken, decryptToken } = require('../utils/encryption');
const { fetchNotionPages, clearCache } = require('../services/notionSources');

// 環境變數驗證
const NOTION_CLIENT_ID = process.env.NOTION_OAUTH_CLIENT_ID;
const NOTION_CLIENT_SECRET = process.env.NOTION_OAUTH_CLIENT_SECRET;

if (!NOTION_CLIENT_ID || !NOTION_CLIENT_SECRET) {
  console.warn('[notion] OAuth credentials not configured, OAuth endpoints will fail');
}

// ---------------------------------------------------------------------------
// GET /oauth/authorize — 生成 OAuth 授權 URL
// ---------------------------------------------------------------------------

router.get('/oauth/authorize', (req, res) => {
  try {
    const { userId, redirect_uri, state } = req.query;

    if (!userId || !redirect_uri || !state) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required params: userId, redirect_uri, state'
      });
    }

    if (!NOTION_CLIENT_ID) {
      return res.status(500).json({
        ok: false,
        error: 'OAuth not configured on backend'
      });
    }

    // 組建 Notion OAuth URL
    const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
    authUrl.searchParams.append('client_id', NOTION_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', redirect_uri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);

    res.json({
      ok: true,
      authUrl: authUrl.toString()
    });
  } catch (err) {
    console.error('[notion] OAuth authorize error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to generate auth URL' });
  }
});

// ---------------------------------------------------------------------------
// POST /oauth/callback — 交換 authorization code → access token
// ---------------------------------------------------------------------------

router.post('/oauth/callback', async (req, res) => {
  try {
    const { userId, code, redirect_uri, databaseId } = req.body;

    if (!userId || !code || !redirect_uri) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required params: userId, code, redirect_uri'
      });
    }

    if (!NOTION_CLIENT_ID || !NOTION_CLIENT_SECRET) {
      return res.status(500).json({
        ok: false,
        error: 'OAuth not configured on backend'
      });
    }

    // 1. 用 code 交換 access token
    const accessToken = await exchangeCodeForToken(code, redirect_uri);
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        error: 'Failed to exchange authorization code'
      });
    }

    // 2. 驗證 token 有效性
    const notion = new Client({ auth: accessToken });
    let workspaceName = null;

    try {
      const me = await notion.users.me({});
      if (me.bot && me.bot.workspace_name) {
        workspaceName = me.bot.workspace_name;
      }
      console.log('[notion] OAuth token validated for user:', userId);
    } catch (err) {
      console.error('[notion] Token validation failed:', err.message);
      return res.status(401).json({
        ok: false,
        error: 'Invalid Notion token after OAuth exchange'
      });
    }

    // 3. 如果提供了 databaseId，驗證可存取性
    if (databaseId) {
      try {
        await notion.databases.retrieve({ database_id: databaseId });
        console.log('[notion] Database verified:', databaseId);
      } catch (err) {
        console.error('[notion] Database access failed:', err.message);
        return res.status(400).json({
          ok: false,
          error: 'Invalid or inaccessible database ID'
        });
      }
    }

    // 4. 加密 Token
    let encryptedToken;
    try {
      encryptedToken = encryptToken(accessToken);
    } catch (err) {
      console.error('[notion] Encryption error:', err.message);
      return res.status(500).json({ ok: false, error: 'Encryption failed' });
    }

    // 5. 存入 DB（upsert）
    const auth = await NotionAuth.findOneAndUpdate(
      { userId },
      {
        encryptedToken,
        databaseId: databaseId || null,
        workspaceName,
        status: 'active',
        lastUsedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log('[notion] OAuth completed for user:', userId);

    res.json({
      ok: true,
      message: 'Notion account linked via OAuth',
      auth: {
        userId: auth.userId,
        databaseId: auth.databaseId,
        workspaceName: auth.workspaceName,
        createdAt: auth.createdAt,
      },
    });
  } catch (err) {
    console.error('[notion] OAuth callback error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to complete OAuth' });
  }
});

// ---------------------------------------------------------------------------
// Helper: Exchange authorization code for access token
// ---------------------------------------------------------------------------

function exchangeCodeForToken(code, redirectUri) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const options = {
      hostname: 'api.notion.com',
      path: '/v1/oauth/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length,
        'Authorization': `Basic ${Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64')}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            resolve(response.access_token);
          } else {
            console.error('[notion] Token exchange failed:', response);
            resolve(null);
          }
        } catch (err) {
          console.error('[notion] Failed to parse token response:', err.message);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[notion] Token exchange request failed:', err.message);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

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
