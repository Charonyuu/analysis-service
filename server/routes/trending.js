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
  const { chromium } = require('playwright');
  let browser;
  try {
    const { url } = req.query;
    if (!url || !url.startsWith('https://www.ptt.cc/bbs/')) {
      return res.status(400).json({ ok: false, error: 'invalid PTT URL' });
    }

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'zh-TW',
    });
    await context.addCookies([{ name: 'over18', value: '1', domain: '.ptt.cc', path: '/' }]);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

    const article = await page.evaluate(() => {
      // Meta
      const meta = {};
      document.querySelectorAll('.article-metaline').forEach(el => {
        const tag = el.querySelector('.article-meta-tag')?.textContent.trim();
        const val = el.querySelector('.article-meta-value')?.textContent.trim();
        if (tag === '作者') meta.author = val;
        else if (tag === '標題') meta.title = val;
        else if (tag === '時間') meta.date = val;
      });
      const boardEl = document.querySelector('.article-metaline-right .article-meta-value');
      if (boardEl) meta.board = boardEl.textContent.trim();

      // Content
      const main = document.getElementById('main-content');
      let content = '';
      if (main) {
        const clone = main.cloneNode(true);
        clone.querySelectorAll('.article-metaline, .article-metaline-right, .push, .f2').forEach(e => e.remove());
        content = clone.textContent.trim();
      }

      // Pushes
      const pushes = [];
      document.querySelectorAll('.push').forEach(el => {
        const tag = el.querySelector('.push-tag')?.textContent.trim() || '';
        const user = el.querySelector('.push-userid')?.textContent.trim() || '';
        const text = (el.querySelector('.push-content')?.textContent || '').replace(/^:\s*/, '').trim();
        const time = el.querySelector('.push-ipdatetime')?.textContent.trim() || '';
        let type = 'neutral';
        if (tag.includes('推')) type = 'push';
        else if (tag.includes('噓')) type = 'boo';
        pushes.push({ type, user, text, time });
      });

      return {
        author: meta.author || '',
        board: meta.board || '',
        title: meta.title || '',
        date: meta.date || '',
        content,
        pushes,
        pushCount: pushes.filter(p => p.type === 'push').length,
        booCount: pushes.filter(p => p.type === 'boo').length,
        neutralCount: pushes.filter(p => p.type === 'neutral').length,
      };
    });

    article.url = url;
    await browser.close();
    res.json({ ok: true, article });
  } catch (err) {
    console.error('[trending] ptt-article error:', err.message);
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ ok: false, error: 'failed to fetch article' });
  }
});

module.exports = router;
