/**
 * Trending topic sources — each function fetches top 10 items from its source.
 * All functions return [] on failure so one broken source never blocks the others.
 */

const { chromium } = require('playwright');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 內容標籤關鍵字 — 讓前端可選擇隱藏特定類型新聞 */
const TAG_KEYWORDS = {
  political: [
    // 政黨
    '民進黨', '國民黨', '民眾黨', 'DPP', 'KMT', 'TPP',
    // 政治人物
    '賴清德', '蔡英文', '柯文哲', '侯友宜', '韓國瑜', '蕭美琴',
    '黃國昌', '王世堅', '鄭文燦', '陳建仁', '卓榮泰', '鄭麗君',
    '趙少康', '朱立倫', '馬英九', '蘇貞昌', '林佳龍', '盧秀燕',
    '習近平', '川普', 'Trump',
    // 政治相關詞彙
    '立法院', '立委', '總統', '行政院', '內閣', '閣揆',
    '選舉', '投票', '公投', '罷免', '彈劾', '質詢',
    '兩岸', '統獨', '統一', '台獨', '九二共識',
    '國防', '軍購', '共軍', '解放軍', '飛彈',
    '外交部', '國台辦', '陸委會',
    '政黨', '黨團', '黨主席', '黨產',
  ],
  crime: [
    // 兇殺 / 暴力犯罪
    '兇殺', '殺人', '命案', '殺害', '砍殺', '刺殺', '槍殺',
    '棄屍', '分屍', '碎屍', '焚屍', '埋屍', '屍體',
    '虐殺', '虐童', '虐死', '家暴致死',
    '隨機殺', '隨機砍', '隨機攻擊',
    '性侵', '強暴', '猥褻', '性騷擾',
    '綁架', '擄人', '擄走', '撕票',
    '詐騙集團', '販毒', '毒品', '吸毒',
    '槍擊', '開槍', '持刀', '持槍', '揮刀',
    '行刑式', '滅門', '血案', '慘案', '凶案',
  ],
};

/** 根據標題回傳匹配的標籤陣列 */
function getTags(title) {
  const tags = [];
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some(kw => title.includes(kw))) {
      tags.push(tag);
    }
  }
  return tags;
}

/** Fetch with a timeout (default 10s) */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Minimal RSS item extractor — pulls <item> blocks and a chosen tag from each.
 * Works for Google Trends / Google News RSS without a heavy XML library.
 */
function extractRssItems(xml, titleTag = 'title') {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(new RegExp(`<${titleTag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|<${titleTag}>([^<]*)<`));
    const linkMatch = block.match(/<link>([^<]*)</);
    const title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : '';
    const url = linkMatch ? linkMatch[1].trim() : '';
    if (title) items.push({ title, url });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Google Trends TW
// ---------------------------------------------------------------------------

async function fetchGoogleTrends() {
  try {
    const res = await fetchWithTimeout('https://trends.google.com/trending/rss?geo=TW');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = extractRssItems(xml);
    return items.slice(0, 10).map((item, i) => ({
      title: item.title,
      titleEn: '',
      source: 'google_trends',
      url: item.url,
      score: 100 - i * 10,
      tags: getTags(item.title),
    }));
  } catch (err) {
    console.error('[trending] fetchGoogleTrends error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Google News TW
// ---------------------------------------------------------------------------

async function fetchGoogleNews() {
  try {
    const res = await fetchWithTimeout('https://news.google.com/rss?hl=zh-TW&gl=TW&ceid=TW:zh-Hant');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = extractRssItems(xml);
    return items.slice(0, 10).map((item, i) => ({
      title: item.title,
      titleEn: '',
      source: 'google_news',
      url: item.url,
      score: 100 - i * 10,
      tags: getTags(item.title),
    }));
  } catch (err) {
    console.error('[trending] fetchGoogleNews error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Hacker News
// ---------------------------------------------------------------------------

async function fetchHackerNews() {
  try {
    const res = await fetchWithTimeout('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ids = await res.json();
    const topIds = ids.slice(0, 10);

    const items = await Promise.all(
      topIds.map(async (id) => {
        try {
          const r = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {}, 5000);
          if (!r.ok) return null;
          const item = await r.json();
          return {
            title: item.title || '',
            titleEn: item.title || '',
            source: 'hackernews',
            url: item.url || `https://news.ycombinator.com/item?id=${id}`,
            score: item.score || 0,
            tags: [],
          };
        } catch {
          return null;
        }
      })
    );

    return items.filter(Boolean);
  } catch (err) {
    console.error('[trending] fetchHackerNews error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// PTT 熱門文章（Playwright 爬 PTT Web 版各大看板最新推爆文章）
// ---------------------------------------------------------------------------

async function fetchPTTHot() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'zh-TW',
    });

    // 設定 over18 cookie
    await context.addCookies([{
      name: 'over18',
      value: '1',
      domain: '.ptt.cc',
      path: '/',
    }]);

    const page = await context.newPage();
    const boards = ['Gossiping', 'Stock', 'NBA', 'LoL', 'Baseball', 'movie'];
    const allItems = [];

    for (const board of boards) {
      try {
        await page.goto(`https://www.ptt.cc/bbs/${board}/index.html`, {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        });

        const items = await page.evaluate(() => {
          const results = [];
          const entries = document.querySelectorAll('.r-ent');

          for (const entry of entries) {
            const nrecEl = entry.querySelector('.nrec span');
            const titleEl = entry.querySelector('.title a');
            if (!titleEl) continue;

            const title = titleEl.textContent.trim();
            const href = titleEl.getAttribute('href') || '';
            const pushText = nrecEl ? nrecEl.textContent.trim() : '0';

            // Skip announcements and reposts
            if (title.startsWith('[公告]') || title.startsWith('Fw:')) continue;

            let pushCount = 0;
            if (pushText === '爆') pushCount = 100;
            else if (pushText === 'XX') pushCount = -10;
            else if (pushText.startsWith('X')) pushCount = -1;
            else pushCount = parseInt(pushText, 10) || 0;

            if (pushCount < 5) continue;

            results.push({
              title,
              url: `https://www.ptt.cc${href}`,
              score: pushCount,
            });
          }
          return results;
        });

        // 如果最新頁不夠，爬前一頁
        if (items.length < 3) {
          const prevUrl = await page.evaluate(() => {
            const link = document.querySelector('.btn-group-paging a:nth-child(2)');
            return link ? link.getAttribute('href') : null;
          });
          if (prevUrl) {
            try {
              await page.goto(`https://www.ptt.cc${prevUrl}`, {
                waitUntil: 'domcontentloaded',
                timeout: 8000,
              });
              const prevItems = await page.evaluate(() => {
                const results = [];
                const entries = document.querySelectorAll('.r-ent');
                for (const entry of entries) {
                  const nrecEl = entry.querySelector('.nrec span');
                  const titleEl = entry.querySelector('.title a');
                  if (!titleEl) continue;
                  const title = titleEl.textContent.trim();
                  const href = titleEl.getAttribute('href') || '';
                  const pushText = nrecEl ? nrecEl.textContent.trim() : '0';
                  if (title.startsWith('[公告]') || title.startsWith('Fw:')) continue;
                  let pushCount = 0;
                  if (pushText === '爆') pushCount = 100;
                  else if (pushText === 'XX') pushCount = -10;
                  else if (pushText.startsWith('X')) pushCount = -1;
                  else pushCount = parseInt(pushText, 10) || 0;
                  if (pushCount < 5) continue;
                  results.push({ title, url: `https://www.ptt.cc${href}`, score: pushCount });
                }
                return results;
              });
              items.push(...prevItems);
            } catch { /* ignore prev page error */ }
          }
        }

        console.log(`[trending] PTT ${board}: ${items.length} items`);
        allItems.push(...items.map(item => ({
          ...item,
          titleEn: item.title,
          source: 'ptt',
          tags: getTags(item.title),
        })));
      } catch (err) {
        console.error(`[trending] PTT ${board}: error:`, err.message);
      }
    }

    // 按推文數排序，取前 10
    allItems.sort((a, b) => b.score - a.score);
    const top10 = allItems.slice(0, 10);

    // 爬每篇文章的摘要
    for (const item of top10) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        item.excerpt = await page.evaluate(() => {
          const main = document.getElementById('main-content');
          if (!main) return '';
          // Clone to avoid modifying the DOM
          const clone = main.cloneNode(true);
          // Remove metalines and pushes
          clone.querySelectorAll('.article-metaline, .article-metaline-right, .push').forEach(el => el.remove());
          let text = clone.textContent.replace(/\s+/g, ' ').trim();
          // Remove URLs
          text = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
          return text.length > 100 ? text.substring(0, 100) + '…' : text;
        });
      } catch {
        // 摘要失敗不影響整體
      }
    }

    await browser.close();
    console.log(`[trending] PTT total: ${top10.length} items`);
    return top10;
  } catch (err) {
    console.error('[trending] fetchPTTHot error:', err.message);
    if (browser) await browser.close().catch(() => {});
    return [];
  }
}

module.exports = {
  fetchGoogleTrends,
  fetchGoogleNews,
  fetchHackerNews,
  fetchPTTHot
};
