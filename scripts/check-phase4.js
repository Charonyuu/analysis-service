require('dotenv').config();
const BASE = `http://localhost:${process.env.PORT || 3000}`;
const fs = require('fs');
const path = require('path');

async function check() {
  const results = [];

  // CHECK 1：SDK travel.js 存在且包含正確的 site 值
  try {
    const content = fs.readFileSync(path.join(__dirname, '../sdk/analytics.travel.js'), 'utf8');
    if (content.includes("site: 'travel'") && !content.includes("site: 'icons'")) {
      results.push({ check: 'SDK travel.js site 值正確', status: '✅ PASS' });
    } else {
      throw new Error('site 值不正確或混入 icons');
    }
  } catch (e) {
    results.push({ check: 'SDK travel.js site 值正確', status: '❌ FAIL', error: e.message });
  }

  // CHECK 2：SDK icons.js 存在且包含正確的 site 值
  try {
    const content = fs.readFileSync(path.join(__dirname, '../sdk/analytics.icons.js'), 'utf8');
    if (content.includes("site: 'icons'") && !content.includes("site: 'travel'")) {
      results.push({ check: 'SDK icons.js site 值正確', status: '✅ PASS' });
    } else {
      throw new Error('site 值不正確或混入 travel');
    }
  } catch (e) {
    results.push({ check: 'SDK icons.js site 值正確', status: '❌ FAIL', error: e.message });
  }

  // CHECK 3：SDK travel.js 不含 __SITE_ID__ placeholder
  try {
    const content = fs.readFileSync(path.join(__dirname, '../sdk/analytics.travel.js'), 'utf8');
    if (!content.includes('__SITE_ID__') && !content.includes('__API_BASE__')) {
      results.push({ check: 'SDK travel.js placeholder 已替換', status: '✅ PASS' });
    } else {
      throw new Error('仍含有未替換的 placeholder');
    }
  } catch (e) {
    results.push({ check: 'SDK travel.js placeholder 已替換', status: '❌ FAIL', error: e.message });
  }

  // CHECK 4：Dashboard 登入頁可存取
  try {
    const res = await fetch(`${BASE}/dashboard/login`);
    if (res.status === 200) {
      results.push({ check: 'Dashboard 登入頁', status: '✅ PASS' });
    } else {
      throw new Error(`status ${res.status}`);
    }
  } catch (e) {
    results.push({ check: 'Dashboard 登入頁', status: '❌ FAIL', error: e.message });
  }

  // CHECK 5：未登入訪問 Dashboard 應導向登入
  try {
    const res = await fetch(`${BASE}/dashboard`, { redirect: 'manual' });
    if (res.status === 302 || res.status === 301) {
      results.push({ check: '未登入 Dashboard 重導向', status: '✅ PASS' });
    } else {
      throw new Error(`應重導向，但得到 ${res.status}`);
    }
  } catch (e) {
    results.push({ check: '未登入 Dashboard 重導向', status: '❌ FAIL', error: e.message });
  }

  // CHECK 6：README.md 存在且包含部署說明
  try {
    const content = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
    if (content.length > 200 && (content.includes('MONGODB_URI') || content.includes('deploy'))) {
      results.push({ check: 'README.md 包含部署說明', status: '✅ PASS' });
    } else {
      throw new Error('README 太短或缺少部署說明');
    }
  } catch (e) {
    results.push({ check: 'README.md 包含部署說明', status: '❌ FAIL', error: e.message });
  }

  // CHECK 7：兩個 SDK 的 sendBeacon 都指向同一個 API_BASE
  try {
    const t = fs.readFileSync(path.join(__dirname, '../sdk/analytics.travel.js'), 'utf8');
    const i = fs.readFileSync(path.join(__dirname, '../sdk/analytics.icons.js'), 'utf8');
    const tBase = t.match(/apiBase:\s*['"](.+?)['"]/)?.[1];
    const iBase = i.match(/apiBase:\s*['"](.+?)['"]/)?.[1];
    if (tBase && iBase && tBase === iBase) {
      results.push({ check: '兩個 SDK apiBase 一致', status: '✅ PASS' });
    } else {
      throw new Error(`travel=${tBase}, icons=${iBase}`);
    }
  } catch (e) {
    results.push({ check: '兩個 SDK apiBase 一致', status: '❌ FAIL', error: e.message });
  }

  console.table(results);
  const failed = results.filter(r => r.status.includes('FAIL'));
  if (failed.length > 0) {
    console.error(`\n❌ Phase 4 未通過，${failed.length} 個檢查失敗。`);
    process.exit(1);
  } else {
    console.log('\n🎉 所有 Phase 全部通過！專案完成，可以部署了。');
    process.exit(0);
  }
}
check();
