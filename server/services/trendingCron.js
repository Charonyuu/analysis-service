const cron = require('node-cron');
const TrendingSnapshot = require('../models/TrendingSnapshot');
const {
  fetchGoogleTrends,
  fetchGoogleNews,
  fetchRedditPopular,
  fetchHackerNews,
  fetchPTTHot
} = require('./trendingSources');

async function runTrendingFetch() {
  try {
    console.log('[trending] Starting fetch...');

    const [twTrends, news, reddit, hn, ptt] = await Promise.all([
      fetchGoogleTrends(),
      fetchGoogleNews(),
      fetchRedditPopular(),
      fetchHackerNews(),
      fetchPTTHot()
    ]);

    const categories = [
      {
        id: 'tw_trends',
        label: '🔥 台灣熱搜',
        labelEn: '🔥 TW Trending',
        items: twTrends
      },
      {
        id: 'news',
        label: '📰 新聞頭條',
        labelEn: '📰 Top News',
        items: news
      },
      {
        id: 'ptt',
        label: '📋 PTT 熱門',
        labelEn: '📋 PTT Hot',
        items: ptt
      },
      {
        id: 'reddit',
        label: '💬 Reddit 熱門',
        labelEn: '💬 Reddit Popular',
        items: reddit
      },
      {
        id: 'hackernews',
        label: '💻 Hacker News',
        labelEn: '💻 Hacker News',
        items: hn
      }
    ];

    const snapshot = await TrendingSnapshot.create({
      fetchedAt: new Date(),
      categories
    });

    const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);
    console.log(`[trending] Saved snapshot ${snapshot._id} — ${totalItems} items across ${categories.length} categories`);

    // Clean up snapshots older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const deleted = await TrendingSnapshot.deleteMany({ fetchedAt: { $lt: sevenDaysAgo } });
    if (deleted.deletedCount > 0) {
      console.log(`[trending] Cleaned up ${deleted.deletedCount} old snapshots`);
    }
  } catch (err) {
    console.error('[trending] Cron error:', err.message);
  }
}

// Schedule: every 2 hours
cron.schedule('0 */2 * * *', runTrendingFetch, {
  timezone: 'Asia/Taipei'
});

console.log('[trending] Cron scheduled: fetch trending topics every 2 hours (Asia/Taipei)');

// Run once on startup so there's data immediately
runTrendingFetch();
