const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const TrendingSnapshot = require('../models/TrendingSnapshot');

const trendingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  message: { ok: false, error: 'rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false
});

router.use(trendingLimiter);

// GET /api/trending
// GET /api/trending?category=tw_trends
router.get('/', async (req, res) => {
  try {
    const snapshot = await TrendingSnapshot.findOne()
      .sort({ fetchedAt: -1 })
      .lean();

    if (!snapshot) {
      return res.json({ categories: [], updatedAt: null });
    }

    let { categories } = snapshot;
    const { category, hideTags } = req.query;

    if (category) {
      categories = categories.filter((c) => c.id === category);
    }

    // Filter out items by tags: ?hideTags=political,crime
    if (hideTags) {
      const tagsToHide = hideTags.split(',').map((t) => t.trim()).filter(Boolean);
      categories = categories.map((c) => ({
        ...c,
        items: c.items.filter((item) =>
          !item.tags?.some((t) => tagsToHide.includes(t))
        ),
      }));
    }

    res.json({
      categories,
      updatedAt: snapshot.fetchedAt
    });
  } catch (err) {
    console.error('[trending] API error:', err.message);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/trending/refresh — 手動觸發一次 fetch，回傳完整結果
router.get('/refresh', async (req, res) => {
  try {
    const {
      fetchGoogleTrends,
      fetchGoogleNews,
      fetchHackerNews,
      fetchPTTHot
    } = require('../services/trendingSources');

    const results = {};
    const errors = {};

    const sources = [
      { key: 'tw_trends', fn: fetchGoogleTrends },
      { key: 'news', fn: fetchGoogleNews },
      { key: 'ptt', fn: fetchPTTHot },
      { key: 'hackernews', fn: fetchHackerNews }
    ];

    await Promise.all(
      sources.map(async ({ key, fn }) => {
        try {
          const items = await fn();
          results[key] = { count: items.length, items };
        } catch (err) {
          errors[key] = err.message;
          results[key] = { count: 0, items: [] };
        }
      })
    );

    // Save to DB
    const TrendingSnapshot = require('../models/TrendingSnapshot');
    const categories = [
      { id: 'tw_trends', label: '🔥 台灣熱搜', labelEn: '🔥 TW Trending', items: results.tw_trends.items },
      { id: 'news', label: '📰 新聞頭條', labelEn: '📰 Top News', items: results.news.items },
      { id: 'ptt', label: '📋 PTT 熱門', labelEn: '📋 PTT Hot', items: results.ptt.items },
      { id: 'hackernews', label: '💻 Hacker News', labelEn: '💻 Hacker News', items: results.hackernews.items }
    ];

    await TrendingSnapshot.create({ fetchedAt: new Date(), categories });

    const summary = {};
    for (const key in results) {
      summary[key] = {
        count: results[key].count,
        firstTitle: results[key].items[0]?.title || '(empty)',
        excerpt: results[key].items[0]?.excerpt || undefined
      };
    }

    res.json({
      ok: true,
      summary,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      savedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/trending/ptt-article?url=https://www.ptt.cc/bbs/Stock/M.xxx.html
router.get('/ptt-article', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || !url.startsWith('https://www.ptt.cc/bbs/')) {
      return res.status(400).json({ ok: false, error: 'invalid PTT URL' });
    }

    // Use CF Worker proxy if available (PTT blocks datacenter IPs)
    const workerUrl = process.env.PTT_PROXY_WORKER_URL;
    const workerSecret = process.env.PTT_PROXY_SECRET;

    let response;
    if (workerUrl && workerSecret) {
      response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Proxy-Secret': workerSecret,
        },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(10000),
      });
    } else {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Cookie': 'over18=1',
        },
        signal: AbortSignal.timeout(10000),
      });
    }

    if (!response.ok) {
      return res.status(502).json({ ok: false, error: `PTT returned ${response.status}` });
    }

    const html = await response.text();
    const article = parsePTTArticle(html);
    article.url = url;

    res.json({ ok: true, article });
  } catch (err) {
    console.error('[trending] ptt-article error:', err.message);
    res.status(500).json({ ok: false, error: 'failed to fetch article' });
  }
});

/**
 * Parse PTT article HTML into structured data.
 */
function parsePTTArticle(html) {
  // Extract meta fields (author, board, title, date)
  const metaRegex = /<div class="article-metaline">\s*<span class="article-meta-tag">([^<]*)<\/span>\s*<span class="article-meta-value">([^<]*)<\/span>/g;
  const meta = {};
  let m;
  while ((m = metaRegex.exec(html)) !== null) {
    const key = m[1].trim();
    const value = m[2].trim();
    if (key === '作者') meta.author = value;
    else if (key === '標題') meta.title = value;
    else if (key === '時間') meta.date = value;
  }

  // Extract board from metaline-right
  const boardMatch = html.match(/<div class="article-metaline-right">[\s\S]*?<span class="article-meta-value">([^<]*)<\/span>/);
  if (boardMatch) meta.board = boardMatch[1].trim();

  // Extract main content: everything in #main-content after metalines, before pushes
  let content = '';
  const mainMatch = html.match(/<div id="main-content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
  if (mainMatch) {
    let body = mainMatch[1];
    // Remove metalines
    body = body.replace(/<div class="article-metaline[^"]*">[\s\S]*?<\/div>/g, '');
    // Remove everything from first push onward
    const pushIdx = body.indexOf('<div class="push">');
    if (pushIdx !== -1) body = body.substring(0, pushIdx);
    // Remove HTML tags but keep line breaks
    body = body.replace(/<br\s*\/?>/gi, '\n');
    body = body.replace(/<span[^>]*>/gi, '').replace(/<\/span>/gi, '');
    body = body.replace(/<[^>]+>/g, '');
    // Decode HTML entities
    body = body.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    content = body.trim();
  }

  // Extract pushes (comments)
  const pushes = [];
  const pushRegex = /<div class="push">\s*<span class="[^"]*push-tag">([^<]*)<\/span>\s*<span class="[^"]*push-userid">([^<]*)<\/span>\s*<span class="[^"]*push-content">([^<]*)<\/span>\s*<span class="push-ipdatetime">([^<]*)<\/span>/g;
  let pm;
  while ((pm = pushRegex.exec(html)) !== null) {
    const tag = pm[1].trim();   // "推 " / "→ " / "噓 "
    const user = pm[2].trim();
    const text = pm[3].replace(/^:\s*/, '').trim();
    const time = pm[4].trim();
    let type = 'neutral';
    if (tag.includes('推')) type = 'push';
    else if (tag.includes('噓')) type = 'boo';
    pushes.push({ type, user, text, time });
  }

  return {
    author: meta.author || '',
    board: meta.board || '',
    title: meta.title || '',
    date: meta.date || '',
    content,
    pushes,
    pushCount: pushes.filter(p => p.type === 'push').length,
    booCount: pushes.filter(p => p.type === 'boo').length,
    neutralCount: pushes.filter(p => p.type === 'neutral').length
  };
}

module.exports = router;
