require('dotenv').config();
const mongoose = require('mongoose');
const BASE = `http://localhost:${process.env.PORT || 3000}`;
const TOKEN = process.env.DASHBOARD_SECRET;

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const results = [];

  // Seed test data
  await fetch(`${BASE}/api/pageview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3001' },
    body: JSON.stringify({ site: 'travel', path: '/stats-test' })
  });
  await fetch(`${BASE}/api/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3002' },
    body: JSON.stringify({ site: 'icons', eventName: 'stats_test_click', path: '/' })
  });

  // CHECK 1：overview 回傳兩個網站的獨立數據
  try {
    const res = await fetch(`${BASE}/api/stats/overview`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const data = await res.json();
    if (res.status === 200 && data.travel && data.icons) {
      results.push({ check: 'overview 含 travel+icons', status: '✅ PASS' });
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (e) {
    results.push({ check: 'overview 含 travel+icons', status: '❌ FAIL', error: e.message });
  }

  // CHECK 2：daily 可指定 site
  try {
    const res = await fetch(`${BASE}/api/stats/daily?site=travel`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const data = await res.json();
    if (res.status === 200 && data.site === 'travel' && Array.isArray(data.pageviews)) {
      results.push({ check: 'daily?site=travel', status: '✅ PASS' });
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (e) {
    results.push({ check: 'daily?site=travel', status: '❌ FAIL', error: e.message });
  }

  // CHECK 3：top-pages 只回傳指定網站
  try {
    const res = await fetch(`${BASE}/api/stats/top-pages?site=travel`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const data = await res.json();
    if (res.status === 200 && data.site === 'travel') {
      results.push({ check: 'top-pages?site=travel', status: '✅ PASS' });
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (e) {
    results.push({ check: 'top-pages?site=travel', status: '❌ FAIL', error: e.message });
  }

  // CHECK 4：events 只回傳指定網站
  try {
    const res = await fetch(`${BASE}/api/stats/events?site=icons`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const data = await res.json();
    if (res.status === 200 && data.site === 'icons') {
      results.push({ check: 'events?site=icons', status: '✅ PASS' });
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (e) {
    results.push({ check: 'events?site=icons', status: '❌ FAIL', error: e.message });
  }

  // CHECK 5：無 Token 的請求應被拒絕（401）
  try {
    const res = await fetch(`${BASE}/api/stats/overview`);
    if (res.status === 401) {
      results.push({ check: '無 Token 拒絕 401', status: '✅ PASS' });
    } else {
      throw new Error(`應回 401，但得到 ${res.status}`);
    }
  } catch (e) {
    results.push({ check: '無 Token 拒絕 401', status: '❌ FAIL', error: e.message });
  }

  // CHECK 6：recent 回傳含 type 欄位區分 pageview/event
  try {
    const res = await fetch(`${BASE}/api/stats/recent?site=travel`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const data = await res.json();
    const hasType = Array.isArray(data.items) && data.items.every(i => i.type);
    if (res.status === 200 && hasType) {
      results.push({ check: 'recent 含 type 欄位', status: '✅ PASS' });
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (e) {
    results.push({ check: 'recent 含 type 欄位', status: '❌ FAIL', error: e.message });
  }

  console.table(results);
  const failed = results.filter(r => r.status.includes('FAIL'));
  await mongoose.disconnect();
  if (failed.length > 0) {
    console.error(`\n❌ Phase 3 未通過，${failed.length} 個檢查失敗。`);
    process.exit(1);
  } else {
    console.log('\n✅ Phase 3 全部通過！繼續 Phase 4。');
    process.exit(0);
  }
}
check();
