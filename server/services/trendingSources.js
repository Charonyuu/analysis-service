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
    const res = await fetchWithTimeout('https://www.reddit.com/r/popular.json', {
      headers: {
        'User-Agent': 'Lumee-TrendingBot/1.0 (analytics-service)'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const posts = (json.data?.children || []).slice(0, 10);
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

module.exports = {
  fetchGoogleTrends,
  fetchGoogleNews,
  fetchRedditPopular,
  fetchHackerNews
};
