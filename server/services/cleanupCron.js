const cron = require('node-cron');
const PageAnalyticsEvent = require('../models/PageAnalyticsEvent');

// 每天凌晨 2:00 執行（台灣時間）
// 保留邏輯：昨天及以前的 raw events 全刪，daily stat snapshot 已有摘要
cron.schedule('0 2 * * *', async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await PageAnalyticsEvent.deleteMany({
      createdAt: { $lt: today }
    });

    console.log(`[cleanup] Deleted ${result.deletedCount} raw events before ${today.toISOString().slice(0, 10)}`);
  } catch (err) {
    console.error('[cleanup] Error:', err.message);
  }
}, {
  timezone: 'Asia/Taipei'
});

console.log('[cleanup] Cron scheduled: daily raw event cleanup at 02:00 Asia/Taipei');
