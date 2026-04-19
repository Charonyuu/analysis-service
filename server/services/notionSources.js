/**
 * Notion API Service — 調用 Notion API 並使用 Redis 快取
 *
 * 快取策略：
 * - Redis key: notion:pages:{databaseId}
 * - TTL: 30 分鐘 (1800 秒)
 * - Cache miss 時調用 Notion API
 * - Notion API 限速時返回快取資料（即使過期）
 */

const { Client } = require('@notionhq/client');

// ---------------------------------------------------------------------------
// Redis client（lazy init，支援未配置 Redis 時 graceful fallback）
// ---------------------------------------------------------------------------

let redisClient = null;
let redisReady = false;

async function getRedisClient() {
  if (redisClient) return redisReady ? redisClient : null;

  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT || 6379;

  if (!host) {
    console.log('[notion] Redis not configured, cache disabled');
    return null;
  }

  try {
    const { createClient } = require('redis');
    redisClient = createClient({
      socket: { host, port: Number(port) },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    redisClient.on('error', (err) => {
      console.error('[notion] Redis error:', err.message);
      redisReady = false;
    });

    redisClient.on('ready', () => {
      console.log('[notion] Redis connected');
      redisReady = true;
    });

    await redisClient.connect();
    return redisClient;
  } catch (err) {
    console.error('[notion] Redis connect failed:', err.message);
    redisClient = null;
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback cache（當 Redis 不可用時）
// ---------------------------------------------------------------------------

const memCache = new Map();
const CACHE_TTL = 1800; // 30 minutes in seconds

function getMemCache(key) {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expireAt) {
    memCache.delete(key);
    return null;
  }
  return entry.data;
}

function setMemCache(key, data) {
  memCache.set(key, {
    data,
    expireAt: Date.now() + CACHE_TTL * 1000,
  });
}

// ---------------------------------------------------------------------------
// fetchNotionPages
// ---------------------------------------------------------------------------

/**
 * 拉取 Notion database 的頁面列表
 * @param {string} decryptedToken - 解密後的 Notion API token
 * @param {string} databaseId - Notion database ID
 * @param {object} filter - 可選的 Notion API filter 物件
 * @returns {Array} pages
 */
async function fetchNotionPages(decryptedToken, databaseId, filter = null) {
  const cacheKey = `notion:pages:${databaseId}`;

  // 1. 檢查快取
  const redis = await getRedisClient();
  let cached = null;

  if (redis) {
    try {
      const raw = await redis.get(cacheKey);
      if (raw) {
        console.log('[notion] Cache hit:', cacheKey);
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[notion] Redis get error:', err.message);
    }
  } else {
    cached = getMemCache(cacheKey);
    if (cached) {
      console.log('[notion] Memory cache hit:', cacheKey);
      return cached;
    }
  }

  // 2. 調用 Notion API
  try {
    const notion = new Client({ auth: decryptedToken });

    const queryParams = {
      database_id: databaseId,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: 10,
    };

    // 如果有自訂 filter 就用，否則不加（拉全部）
    if (filter && Object.keys(filter).length > 0) {
      queryParams.filter = filter;
    }

    const response = await notion.databases.query(queryParams);

    const pages = response.results.map((page) => ({
      id: page.id,
      title: extractTitle(page),
      createdTime: page.created_time,
      lastEditedTime: page.last_edited_time,
      icon: page.icon?.emoji || page.icon?.external?.url || null,
      archived: page.archived,
    }));

    // 3. 寫入快取
    if (redis) {
      try {
        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(pages));
        console.log('[notion] Cached:', cacheKey);
      } catch (err) {
        console.error('[notion] Redis set error:', err.message);
      }
    } else {
      setMemCache(cacheKey, pages);
      console.log('[notion] Memory cached:', cacheKey);
    }

    return pages;
  } catch (err) {
    // Notion API 限速 → 嘗試返回過期快取
    if (err.status === 429) {
      console.error('[notion] Rate limited by Notion API, trying stale cache');
      if (redis) {
        try {
          const stale = await redis.get(cacheKey);
          if (stale) return JSON.parse(stale);
        } catch { /* ignore */ }
      }
      const stale = getMemCache(cacheKey);
      if (stale) return stale;
    }

    console.error('[notion] API error:', err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helper: 從 Notion page 提取標題
// ---------------------------------------------------------------------------

function extractTitle(page) {
  const props = page.properties || {};
  // 嘗試常見的 title property 名稱
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop.type === 'title' && prop.title && prop.title.length > 0) {
      return prop.title.map((t) => t.plain_text).join('');
    }
  }
  return '(Untitled)';
}

// ---------------------------------------------------------------------------
// clearCache — 清除指定 databaseId 的快取
// ---------------------------------------------------------------------------

async function clearCache(databaseId) {
  const cacheKey = `notion:pages:${databaseId}`;
  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.del(cacheKey);
    } catch (err) {
      console.error('[notion] Redis del error:', err.message);
    }
  }
  memCache.delete(cacheKey);
  console.log('[notion] Cache cleared:', cacheKey);
}

module.exports = { fetchNotionPages, clearCache };
