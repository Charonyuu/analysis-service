// 執行：node scripts/check-phase2.js
require('dotenv').config();
const mongoose = require('mongoose');
const BASE = `http://localhost:${process.env.PORT || 3000}`;

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const results = [];

  // CHECK 1：POST /api/pageview 正常寫入
  try {
    const res = await fetch(`${BASE}/api/pageview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3001' },
      body: JSON.stringify({ site: 'travel', path: '/check-phase2', referrer: '' })
    });
    const data = await res.json();
    if (res.status === 201 && data.ok) {
      results.push({ check: 'POST /api/pageview', status: '✅ PASS' });
    } else {
      throw new Error(`status ${res.status}, ok=${data.ok}`);
    }
  } catch (e) {
    results.push({ check: 'POST /api/pageview', status: '❌ FAIL', error: e.message });
  }

  // CHECK 2：POST /api/event 正常寫入
  try {
    const res = await fetch(`${BASE}/api/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3002' },
      body: JSON.stringify({ site: 'icons', eventName: 'click_test', path: '/check', metadata: { test: true } })
    });
    const data = await res.json();
    if (res.status === 201 && data.ok) {
      results.push({ check: 'POST /api/event', status: '✅ PASS' });
    } else {
      throw new Error(`status ${res.status}`);
    }
  } catch (e) {
    results.push({ check: 'POST /api/event', status: '❌ FAIL', error: e.message });
  }

  // CHECK 3：非法 site 值應被拒絕（400）
  try {
    const res = await fetch(`${BASE}/api/pageview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3001' },
      body: JSON.stringify({ site: 'HACKED', path: '/test' })
    });
    if (res.status === 400) {
      results.push({ check: '非法 site 值拒絕', status: '✅ PASS' });
    } else {
      throw new Error(`應回 400，但得到 ${res.status}`);
    }
  } catch (e) {
    results.push({ check: '非法 site 值拒絕', status: '❌ FAIL', error: e.message });
  }

  // CHECK 4：缺少必填欄位應被拒絕（400）
  try {
    const res = await fetch(`${BASE}/api/pageview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3001' },
      body: JSON.stringify({ site: 'travel' }) // 缺少 path
    });
    if (res.status === 400) {
      results.push({ check: '缺少必填欄位拒絕', status: '✅ PASS' });
    } else {
      throw new Error(`應回 400，但得到 ${res.status}`);
    }
  } catch (e) {
    results.push({ check: '缺少必填欄位拒絕', status: '❌ FAIL', error: e.message });
  }

  // CHECK 5：SDK 靜態檔案可存取
  try {
    const res = await fetch(`${BASE}/sdk/analytics.travel.js`);
    if (res.status === 200) {
      results.push({ check: 'SDK travel.js 可存取', status: '✅ PASS' });
    } else {
      throw new Error(`status ${res.status}`);
    }
  } catch (e) {
    results.push({ check: 'SDK travel.js 可存取', status: '❌ FAIL', error: e.message });
  }

  // CHECK 6：確認資料庫中 travel 和 icons 資料是分開的
  try {
    const Pageview = require('../server/models/Pageview');
    const travelCount = await Pageview.countDocuments({ site: 'travel', path: '/check-phase2' });
    const iconsCount  = await Pageview.countDocuments({ site: 'icons',  path: '/check-phase2' });
    if (travelCount >= 1 && iconsCount === 0) {
      results.push({ check: '資料分網站儲存驗證', status: '✅ PASS' });
    } else {
      throw new Error(`travel=${travelCount}, icons=${iconsCount}`);
    }
  } catch (e) {
    results.push({ check: '資料分網站儲存驗證', status: '❌ FAIL', error: e.message });
  }

  console.table(results);
  const failed = results.filter(r => r.status.includes('FAIL'));
  await mongoose.disconnect();
  if (failed.length > 0) {
    console.error(`\n❌ Phase 2 未通過，${failed.length} 個檢查失敗。`);
    process.exit(1);
  } else {
    console.log('\n✅ Phase 2 全部通過！繼續 Phase 3。');
    process.exit(0);
  }
}
check();
