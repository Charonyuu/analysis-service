/**
 * Trending topic sources — each function fetches top 10 items from its source.
 * All functions return [] on failure so one broken source never blocks the others.
 */

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
 * Fetch PTT through Cloudflare Worker proxy.
 * Set PTT_PROXY_WORKER_URL + PTT_PROXY_SECRET in .env.
 * Falls back to direct fetch if not configured.
 */
async function fetchWithProxy(url, options = {}, timeoutMs = 10000) {
  const workerUrl = process.env.PTT_PROXY_WORKER_URL;
  const workerSecret = process.env.PTT_PROXY_SECRET;

  // 沒設定 Worker → 直連
  if (!workerUrl || !workerSecret) {
    return fetchWithTimeout(url, options, timeoutMs);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Proxy-Secret': workerSecret,
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
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
      score: 100 - i * 10, // top item = 100, decreasing
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
// PTT 熱門文章（爬 PTT Web 版各大看板最新推爆文章）
// ---------------------------------------------------------------------------

async function fetchPTTHot() {
  try {
    // PTT 需要 over18 cookie 才能看八卦版等看板
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Cookie': 'over18=1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    // 爬多個熱門看板的最新文章
    const boards = ['Gossiping', 'Stock', 'NBA', 'LoL', 'Baseball', 'movie'];
    const allItems = [];

    const boardResults = await Promise.all(
      boards.map(async (board) => {
        try {
          // 爬最新頁（走 proxy）
          const res = await fetchWithProxy(
            `https://www.ptt.cc/bbs/${board}/index.html`,
            { headers },
            8000
          );
          if (!res.ok) {
            console.error(`[trending] PTT ${board}: HTTP ${res.status}`);
            return [];
          }
          const html = await res.text();
          console.log(`[trending] PTT ${board}: HTML length=${html.length}, has r-ent=${html.includes('r-ent')}`);
          const items = parsePTTBoard(html, board);

          // 如果最新頁不夠，爬前一頁
          if (items.length < 3) {
            const prevMatch = html.match(/href="\/bbs\/[^/]+\/index(\d+)\.html">&lsaquo;/);
            if (prevMatch) {
              try {
                const prevRes = await fetchWithProxy(
                  `https://www.ptt.cc/bbs/${board}/index${prevMatch[1]}.html`,
                  { headers },
                  8000
                );
                if (prevRes.ok) {
                  const prevHtml = await prevRes.text();
                  items.push(...parsePTTBoard(prevHtml, board));
                }
              } catch { /* ignore */ }
            }
          }
          return items;
        } catch (err) {
          console.error(`[trending] PTT ${board}: fetch error:`, err.message);
          return [];
        }
      })
    );

    for (const items of boardResults) {
      allItems.push(...items);
    }

    console.log(`[trending] PTT total items across all boards: ${allItems.length}`);

    // 按推文數排序，取前 10
    allItems.sort((a, b) => b.score - a.score);
    const top10 = allItems.slice(0, 10);

    // 爬每篇文章的摘要（前 100 字）
    await Promise.all(
      top10.map(async (item) => {
        try {
          const res = await fetchWithProxy(item.url, { headers }, 5000);
          if (!res.ok) return;
          const html = await res.text();
          item.excerpt = extractPTTExcerpt(html);
        } catch {
          // 摘要失敗不影響整體
        }
      })
    );

    return top10;
  } catch (err) {
    console.error('[trending] fetchPTTHot error:', err.message);
    return [];
  }
}

/**
 * Extract first ~100 chars of PTT article content as excerpt.
 */
function extractPTTExcerpt(html) {
  const startIdx = html.indexOf('<div id="main-content"');
  if (startIdx === -1) return '';
  // 取 main-content 到第一個 push 之間的內容
  const pushIdx = html.indexOf('<div class="push">', startIdx);
  let text = pushIdx > -1
    ? html.substring(startIdx, pushIdx)
    : html.substring(startIdx);
  // Remove metalines
  text = text.replace(/<div class="article-metaline[^"]*">[\s\S]*?<\/div>/g, '');
  // Strip HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode entities
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  text = text.replace(/\s+/g, ' ').trim();
  // Remove URLs from excerpt
  text = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  // 取前 100 字
  return text.length > 100 ? text.substring(0, 100) + '…' : text;
}

/**
 * Parse PTT board HTML to extract articles with push counts.
 * PTT HTML structure: each article is in a <div class="r-ent"> block.
 */
function parsePTTBoard(html, board) {
  const items = [];
  // Match each r-ent block
  const entryRegex = /<div class="r-ent">([\s\S]*?)<\/div>\s*<\/div>/gi;
  // Simpler: match nrec + title + href together
  const rowRegex = /<div class="nrec"><span[^>]*>([^<]*)<\/span><\/div>[\s\S]*?<div class="title">\s*<a href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const pushText = match[1].trim();
    const href = match[2].trim();
    const title = match[3].trim();

    // Skip announcements and reposts
    if (title.startsWith('[公告]') || title.startsWith('Fw:')) continue;

    // Parse push count: "爆" = 100, "XX" = -100, number = number
    let pushCount = 0;
    if (pushText === '爆') pushCount = 100;
    else if (pushText === 'XX') pushCount = -10;
    else if (pushText === 'X1') pushCount = -1;
    else pushCount = parseInt(pushText, 10) || 0;

    // Only include articles with decent engagement
    if (pushCount < 5) continue;

    items.push({
      title: title,
      titleEn: title, // PTT titles are mostly Chinese, keep as-is
      source: 'ptt',
      url: `https://www.ptt.cc${href}`,
      score: pushCount,
      tags: getTags(title),
    });
  }

  return items;
}

module.exports = {
  fetchGoogleTrends,
  fetchGoogleNews,
  fetchHackerNews,
  fetchPTTHot
};
