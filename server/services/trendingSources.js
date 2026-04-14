/**
 * Trending topic sources — each function fetches top 10 items from its source.
 * All functions return [] on failure so one broken source never blocks the others.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      score: 100 - i * 10 // top item = 100, decreasing
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
      score: 100 - i * 10
    }));
  } catch (err) {
    console.error('[trending] fetchGoogleNews error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Reddit /r/popular
// ---------------------------------------------------------------------------

async function fetchRedditPopular() {
  try {
    const redditUrl = 'https://old.reddit.com/r/popular/.json';
    console.log(`[trending] Reddit: fetching ${redditUrl}`);
    const res = await fetchWithTimeout(redditUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Lumee/1.0; +https://charonyu.cc)'
      }
    });
    console.log(`[trending] Reddit: HTTP ${res.status}, headers:`, Object.fromEntries(res.headers.entries()));
    if (!res.ok) {
      const body = await res.text();
      console.error(`[trending] Reddit: error body (first 500):`, body.substring(0, 500));
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    const posts = (json.data?.children || []).slice(0, 10);
    console.log(`[trending] Reddit: got ${posts.length} posts`);
    return posts.map((child) => {
      const d = child.data;
      return {
        title: d.title || '',
        titleEn: d.title || '',
        source: 'reddit',
        url: `https://www.reddit.com${d.permalink || ''}`,
        score: d.score || 0
      };
    });
  } catch (err) {
    console.error('[trending] fetchRedditPopular error:', err.message);
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
            score: item.score || 0
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
      'User-Agent': 'Mozilla/5.0 (compatible; Lumee-TrendingBot/1.0)',
      'Cookie': 'over18=1'
    };

    // 爬多個熱門看板的最新文章
    const boards = ['Gossiping', 'HatePolitics', 'Stock', 'LoL', 'NBA'];
    const allItems = [];

    const boardResults = await Promise.all(
      boards.map(async (board) => {
        try {
          const res = await fetchWithTimeout(
            `https://www.ptt.cc/bbs/${board}/index.html`,
            { headers },
            8000
          );
          if (!res.ok) return [];
          const html = await res.text();
          return parsePTTBoard(html, board);
        } catch {
          return [];
        }
      })
    );

    for (const items of boardResults) {
      allItems.push(...items);
    }

    // 按推文數排序，取前 10
    allItems.sort((a, b) => b.score - a.score);
    const top10 = allItems.slice(0, 10);

    // 爬每篇文章的摘要（前 100 字）
    await Promise.all(
      top10.map(async (item) => {
        try {
          const res = await fetchWithTimeout(item.url, { headers }, 5000);
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
    if (pushCount < 10) continue;

    items.push({
      title: title,
      titleEn: title, // PTT titles are mostly Chinese, keep as-is
      source: 'ptt',
      url: `https://www.ptt.cc${href}`,
      score: pushCount
    });
  }

  return items;
}

module.exports = {
  fetchGoogleTrends,
  fetchGoogleNews,
  fetchRedditPopular,
  fetchHackerNews,
  fetchPTTHot
};
