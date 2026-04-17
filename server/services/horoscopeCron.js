const cron = require('node-cron');
const HoroscopeSnapshot = require('../models/HoroscopeSnapshot');
const { fetchAllHoroscopes } = require('./horoscopeSources');

async function runHoroscopeFetch() {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
    console.log(`[horoscope] Starting fetch for ${today}...`);

    // Check if we already have data for today
    const existing = await HoroscopeSnapshot.findOne({ date: today }).lean();
    if (existing && existing.signs.length >= 12) {
      console.log(`[horoscope] Already have ${existing.signs.length} signs for ${today}, skipping`);
      return;
    }

    const signs = await fetchAllHoroscopes();

    if (signs.length === 0) {
      console.error('[horoscope] No signs fetched, skipping save');
      return;
    }

    const snapshot = await HoroscopeSnapshot.create({
      fetchedAt: new Date(),
      date: today,
      signs,
    });

    console.log(`[horoscope] Saved snapshot ${snapshot._id} — ${signs.length} signs for ${today}`);

    // Clean up snapshots older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const deleted = await HoroscopeSnapshot.deleteMany({ fetchedAt: { $lt: sevenDaysAgo } });
    if (deleted.deletedCount > 0) {
      console.log(`[horoscope] Cleaned up ${deleted.deletedCount} old snapshots`);
    }
  } catch (err) {
    console.error('[horoscope] Cron error:', err.message);
  }
}

// Schedule: every day at 00:15, 06:15, 12:15 (Asia/Taipei)
// Elle updates daily; we check 3 times to ensure we have the latest
cron.schedule('15 0,6,12 * * *', runHoroscopeFetch, {
  timezone: 'Asia/Taipei',
});

console.log('[horoscope] Cron scheduled: fetch horoscope at 00:15, 06:15, 12:15 (Asia/Taipei)');

// Run once on startup
runHoroscopeFetch();
