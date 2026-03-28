/**
 * Migrate analytics data from search-airline (itinerary-planner DB)
 * to analytics-service (analytics DB).
 *
 * Usage: node scripts/migrate-from-search-airline.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const SOURCE_URI = 'mongodb+srv://charonyuwork_db_user:QbbO7XEfD370TvUZ@cluster0.tzgtsqo.mongodb.net/itinerary-planner?retryWrites=true&w=majority';
const TARGET_URI = process.env.MONGODB_URI;
const SITE = 'travel';

async function migrate() {
  const sourceConn = await mongoose.createConnection(SOURCE_URI).asPromise();
  const targetConn = await mongoose.createConnection(TARGET_URI).asPromise();

  console.log('Connected to both databases');

  // --- Migrate PageAnalyticsEvents ---
  const sourceEvents = sourceConn.collection('pageanalyticsevents');
  const targetEvents = targetConn.collection('pageanalyticsevents');

  const events = await sourceEvents.find({}).toArray();
  console.log(`Found ${events.length} events to migrate`);

  if (events.length > 0) {
    const mapped = events.map(e => {
      const { _id, __v, updatedAt, source, ...rest } = e;
      return { ...rest, site: SITE };
    });
    await targetEvents.insertMany(mapped);
    console.log(`Migrated ${mapped.length} events`);
  }

  // --- Migrate PageAnalyticsDailyStats ---
  const sourceStats = sourceConn.collection('pageanalyticsdailystats');
  const targetStats = targetConn.collection('pageanalyticsdailystats');

  const stats = await sourceStats.find({}).toArray();
  console.log(`Found ${stats.length} daily stats to migrate`);

  if (stats.length > 0) {
    for (const s of stats) {
      const { _id, __v, updatedAt, createdAt, ...rest } = s;
      // Upsert to avoid duplicates if run multiple times
      await targetStats.updateOne(
        { site: SITE, page: rest.page, dateKey: rest.dateKey },
        { $inc: { enterCount: rest.enterCount, totalDurationMs: rest.totalDurationMs } },
        { upsert: true }
      );
    }
    console.log(`Migrated ${stats.length} daily stats`);
  }

  await sourceConn.close();
  await targetConn.close();
  console.log('Migration complete!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
