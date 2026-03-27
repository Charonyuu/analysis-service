// 執行：node scripts/check-phase1.js
const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  const results = [];

  // CHECK 1：能否連線 MongoDB
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    results.push({ check: 'MongoDB 連線', status: '✅ PASS' });
  } catch (e) {
    results.push({ check: 'MongoDB 連線', status: '❌ FAIL', error: e.message });
  }

  // CHECK 2：Pageview model 能否寫入並讀取
  try {
    const Pageview = require('../server/models/Pageview');
    const doc = await Pageview.create({ site: 'travel', path: '/test-phase1' });
    const found = await Pageview.findById(doc._id);
    if (found.site !== 'travel') throw new Error('site mismatch');
    await Pageview.deleteOne({ _id: doc._id });
    results.push({ check: 'Pageview model CRUD', status: '✅ PASS' });
  } catch (e) {
    results.push({ check: 'Pageview model CRUD', status: '❌ FAIL', error: e.message });
  }

  // CHECK 3：Event model 能否寫入並讀取
  try {
    const Event = require('../server/models/Event');
    const doc = await Event.create({ site: 'icons', eventName: 'test_phase1', path: '/test' });
    const found = await Event.findById(doc._id);
    if (found.site !== 'icons') throw new Error('site mismatch');
    await Event.deleteOne({ _id: doc._id });
    results.push({ check: 'Event model CRUD', status: '✅ PASS' });
  } catch (e) {
    results.push({ check: 'Event model CRUD', status: '❌ FAIL', error: e.message });
  }

  // CHECK 4：site enum 驗證是否有效（帶入非法值應拋錯）
  try {
    const Pageview = require('../server/models/Pageview');
    await Pageview.create({ site: 'INVALID_SITE', path: '/test' });
    results.push({ check: 'site enum 驗證', status: '❌ FAIL', error: '不應允許 INVALID_SITE' });
  } catch (e) {
    results.push({ check: 'site enum 驗證', status: '✅ PASS' });
  }

  // CHECK 5：health endpoint
  try {
    const res = await fetch(`http://localhost:${process.env.PORT || 3000}/health`);
    const data = await res.json();
    if (data.status === 'ok') {
      results.push({ check: '/health endpoint', status: '✅ PASS' });
    } else {
      throw new Error('status not ok');
    }
  } catch (e) {
    results.push({ check: '/health endpoint', status: '❌ FAIL', error: e.message });
  }

  console.table(results);
  const failed = results.filter(r => r.status.includes('FAIL'));
  if (failed.length > 0) {
    console.error(`\n❌ Phase 1 未通過，${failed.length} 個檢查失敗，請修復後重試。`);
    await mongoose.disconnect();
    process.exit(1);
  } else {
    console.log('\n✅ Phase 1 全部通過！繼續 Phase 2。');
    await mongoose.disconnect();
    process.exit(0);
  }
}
check();
