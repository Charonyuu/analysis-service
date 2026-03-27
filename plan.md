# 網站分析服務 — 需求規格單 v2
# （MongoDB 版 · 一次做到底 · 含逐階段檢查機制）

---

## 給 Claude Code 的總指令

> 請依照本文件從頭到尾完整實作整個專案，**不要在中途停下來等待確認**。
> 每完成一個 Phase，執行該 Phase 的「✅ 自動檢查腳本」，確認全數通過後才繼續下一個 Phase。
> 若檢查失敗，**自行修復後重新執行檢查**，直到通過為止，再繼續下一步。

---

## 一、技術選型

| 層級 | 技術 |
|------|------|
| API Server | Node.js + Express |
| 資料庫 | MongoDB + Mongoose |
| Dashboard 前端 | HTML + Chart.js（內嵌在 Express 靜態目錄） |
| JS SDK | 純 Vanilla JS，兩個網站各自獨立引入 |
| 部署目標 | Railway / Fly.io / VPS（單一 Node process） |

---

## 二、專案目錄結構（請完整建立）

```
analytics-service/
├── server/
│   ├── index.js                  # Express 入口、middleware 全掛在這
│   ├── config/
│   │   └── db.js                 # Mongoose 連線
│   ├── models/
│   │   ├── Pageview.js           # Pageview Schema
│   │   └── Event.js              # Event Schema
│   ├── routes/
│   │   ├── collect.js            # POST /api/pageview、POST /api/event
│   │   └── stats.js              # GET /api/stats/*
│   └── middleware/
│       ├── auth.js               # Bearer token 驗證
│       ├── cors.js               # CORS 白名單
│       └── rateLimit.js          # Rate limiting
├── dashboard/
│   ├── index.html                # Dashboard 主頁（需登入後才能看）
│   ├── login.html                # 密碼登入頁
│   └── app.js                   # Chart.js 圖表邏輯
├── sdk/
│   ├── analytics.js              # 通用 SDK 原始碼
│   ├── analytics.travel.js       # 旅遊網站專用（SITE_ID 已內建）
│   └── analytics.icons.js        # Icon 庫網站專用（SITE_ID 已內建）
├── scripts/
│   ├── check-phase1.js           # Phase 1 自動檢查腳本
│   ├── check-phase2.js           # Phase 2 自動檢查腳本
│   ├── check-phase3.js           # Phase 3 自動檢查腳本
│   └── check-phase4.js           # Phase 4 自動檢查腳本
├── .env.example
├── .env                          # 實際環境變數（gitignore）
├── package.json
└── README.md
```

---

## 三、環境變數（.env）

```env
# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/analytics

# 驗證
DASHBOARD_SECRET=your-super-secret-token-change-this

# 允許的來源網域（逗號分隔，無空格）
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:3002,https://travel-site.com,https://icon-lib.com

# Port
PORT=3000

# 環境
NODE_ENV=development
```

---

## 四、MongoDB Schema 設計

### 4-1. Pageview Model（`server/models/Pageview.js`）

```javascript
// 重點：site 欄位是主要分隔鍵，所有查詢都必須帶 site
const PageviewSchema = new mongoose.Schema({
  site: {
    type: String,
    required: true,
    enum: ['travel', 'icons'],   // 只接受這兩個值，防止髒資料
    index: true
  },
  path: {
    type: String,
    required: true,
    maxlength: 500
  },
  referrer: {
    type: String,
    maxlength: 500,
    default: ''
  },
  userAgent: {
    type: String,
    maxlength: 500
  },
  ipHash: {           // IP 做 SHA-256，不儲存原始 IP
    type: String,
    maxlength: 64
  },
  sessionId: {        // 前端產生的隨機 UUID，用來去重複計算 UV
    type: String,
    maxlength: 64
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// 複合 index，加速日期範圍查詢
PageviewSchema.index({ site: 1, createdAt: -1 });
PageviewSchema.index({ site: 1, path: 1 });
```

### 4-2. Event Model（`server/models/Event.js`）

```javascript
// 重點：site 欄位是主要分隔鍵，確保兩個網站的點擊資料完全獨立
const EventSchema = new mongoose.Schema({
  site: {
    type: String,
    required: true,
    enum: ['travel', 'icons'],
    index: true
  },
  eventName: {
    type: String,
    required: true,
    maxlength: 100
    // 範例值：'click_download_icon', 'click_search', 'click_hero_cta'
  },
  elementId: {        // 被點擊元素的 id 或 data-track-id
    type: String,
    maxlength: 100,
    default: ''
  },
  path: {             // 發生在哪個頁面
    type: String,
    maxlength: 500,
    default: ''
  },
  metadata: {         // 任意額外資料，例如 { iconName: 'cat', category: 'animal' }
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  sessionId: {
    type: String,
    maxlength: 64
  },
  ipHash: {
    type: String,
    maxlength: 64
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

EventSchema.index({ site: 1, createdAt: -1 });
EventSchema.index({ site: 1, eventName: 1 });
```

---

## 五、API 端點規格

### 5-1. 記錄 Pageview

```
POST /api/pageview
Content-Type: application/json
Origin: https://travel-site.com  （CORS 白名單驗證）

Request Body：
{
  "site": "travel",              // 必填，enum: ['travel', 'icons']
  "path": "/blog/tokyo",         // 必填
  "referrer": "https://google.com",  // 選填
  "sessionId": "uuid-v4-string"  // 選填，前端產生
}

成功回應 201：{ "ok": true }
失敗回應 400：{ "ok": false, "error": "site is required" }
失敗回應 403：{ "ok": false, "error": "origin not allowed" }
失敗回應 429：{ "ok": false, "error": "rate limit exceeded" }
```

### 5-2. 記錄點擊事件

```
POST /api/event
Content-Type: application/json

Request Body：
{
  "site": "icons",               // 必填，enum: ['travel', 'icons']
  "eventName": "click_download", // 必填
  "elementId": "btn-dl-cat",     // 選填
  "path": "/icons/animals",      // 選填
  "metadata": { "iconName": "cat" },  // 選填
  "sessionId": "uuid-v4-string"  // 選填
}

成功回應 201：{ "ok": true }
```

### 5-3. 統計 API（Dashboard 專用，需 Bearer Token）

所有 stats 端點都必須帶：
```
Authorization: Bearer <DASHBOARD_SECRET>
```

#### 取得整體概覽（兩個網站分開）
```
GET /api/stats/overview?from=2025-01-01&to=2025-12-31

回應：
{
  "travel": {
    "totalPageviews": 1250,
    "uniqueSessions": 430,
    "todayPageviews": 45,
    "weekPageviews": 310
  },
  "icons": {
    "totalPageviews": 8800,
    "uniqueSessions": 2100,
    "todayPageviews": 220,
    "weekPageviews": 1540
  }
}
```

#### 取得每日趨勢
```
GET /api/stats/daily?site=travel&from=2025-01-01&to=2025-03-31

回應：
{
  "site": "travel",
  "pageviews": [
    { "date": "2025-01-01", "count": 30 },
    { "date": "2025-01-02", "count": 45 },
    ...
  ],
  "events": [
    { "date": "2025-01-01", "count": 12 },
    ...
  ]
}
```

#### 取得熱門頁面
```
GET /api/stats/top-pages?site=icons&limit=10

回應：
{
  "site": "icons",
  "pages": [
    { "path": "/icons/animals", "count": 850 },
    { "path": "/icons/food",    "count": 630 },
    ...
  ]
}
```

#### 取得點擊事件統計
```
GET /api/stats/events?site=icons&from=2025-01-01

回應：
{
  "site": "icons",
  "events": [
    { "eventName": "click_download", "count": 420 },
    { "eventName": "click_preview",  "count": 280 },
    ...
  ]
}
```

#### 取得即時 Log（最近 50 筆）
```
GET /api/stats/recent?site=travel

回應：
{
  "site": "travel",
  "items": [
    {
      "type": "pageview",
      "path": "/blog/tokyo",
      "createdAt": "2025-03-27T10:22:11Z"
    },
    {
      "type": "event",
      "eventName": "click_search",
      "path": "/search",
      "createdAt": "2025-03-27T10:21:55Z"
    },
    ...
  ]
}
```

---

## 六、JS SDK 規格（重要：分網站，資料絕不混在一起）

### SDK 核心設計原則

**每個網站有自己的預建構版本**，`site` 值在 build 時就已固定，
前端引入時完全不需要設定任何參數，杜絕設定錯誤導致資料串台。

### `sdk/analytics.js`（通用核心，不直接引入）

```javascript
(function(config) {
  // config = { site: 'travel' | 'icons', apiBase: 'https://...' }

  const SITE = config.site;           // 固定，不可被外部覆寫
  const API_BASE = config.apiBase;

  // --- Session ID ---
  // 用 sessionStorage，關閉 tab 就失效，不用 cookie
  function getSessionId() {
    let id = sessionStorage.getItem('_analytics_sid');
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      sessionStorage.setItem('_analytics_sid', id);
    }
    return id;
  }

  // --- 送出資料（fire-and-forget，失敗不影響使用者體驗）---
  function send(endpoint, data) {
    // 優先用 sendBeacon（頁面關閉時也能送出）
    const payload = JSON.stringify({ ...data, site: SITE, sessionId: getSessionId() });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API_BASE + endpoint, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(API_BASE + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {}); // 靜默失敗
    }
  }

  // --- 1. 自動追蹤 Pageview ---
  function trackPageview() {
    send('/api/pageview', {
      path: location.pathname + location.search,
      referrer: document.referrer || ''
    });
  }

  // --- 2. 追蹤點擊事件 ---
  function trackEvent(eventName, options) {
    options = options || {};
    send('/api/event', {
      eventName: eventName,
      elementId: options.elementId || '',
      path: location.pathname + location.search,
      metadata: options.metadata || {}
    });
  }

  // --- 3. 自動掃描 data-track attribute ---
  function bindAutoTrack() {
    document.addEventListener('click', function(e) {
      const el = e.target.closest('[data-track]');
      if (!el) return;
      const eventName = el.getAttribute('data-track');
      const elementId = el.id || el.getAttribute('data-track-id') || '';
      let metadata = {};
      try {
        const raw = el.getAttribute('data-track-meta');
        if (raw) metadata = JSON.parse(raw);
      } catch(err) {}
      trackEvent(eventName, { elementId, metadata });
    }, true); // capture phase，確保動態新增的元素也能被捕捉
  }

  // --- 4. SPA 路由變化偵測 ---
  function bindSPATracking() {
    // 攔截 pushState / replaceState
    const _push = history.pushState.bind(history);
    const _replace = history.replaceState.bind(history);
    history.pushState = function() { _push.apply(this, arguments); trackPageview(); };
    history.replaceState = function() { _replace.apply(this, arguments); trackPageview(); };
    // 攔截 back/forward
    window.addEventListener('popstate', trackPageview);
    window.addEventListener('hashchange', trackPageview);
  }

  // --- 初始化 ---
  function init() {
    // 等 DOM 就緒
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        trackPageview();
        bindAutoTrack();
      });
    } else {
      trackPageview();
      bindAutoTrack();
    }
    bindSPATracking();
  }

  // --- 對外暴露（方便手動呼叫）---
  window.Analytics = {
    track: trackEvent,
    // 讓開發者能確認目前是哪個網站，防止設定錯誤
    site: SITE
  };

  init();

})({ site: '__SITE_ID__', apiBase: '__API_BASE__' }); // build 時替換
```

### `sdk/analytics.travel.js`（預建構，直接引入）

```javascript
// 此檔案由 build script 自動產生，請勿手動修改
// 旅遊網站專用版本 — site 固定為 'travel'
(function(config) {
  // ... 同上完整邏輯，但 SITE 已固定為 'travel'
})({ site: 'travel', apiBase: 'https://your-analytics-api.com' });
```

### `sdk/analytics.icons.js`（預建構，直接引入）

```javascript
// Icon 庫網站專用版本 — site 固定為 'icons'
(function(config) {
  // ... 同上完整邏輯，但 SITE 已固定為 'icons'
})({ site: 'icons', apiBase: 'https://your-analytics-api.com' });
```

### 在網站中使用

**旅遊網站**（HTML）：
```html
<script src="https://your-analytics-api.com/sdk/analytics.travel.js"></script>
<!-- 完成！不需要任何額外設定 -->

<!-- 追蹤按鈕點擊（方式 A：無需 JS）-->
<button data-track="click_book_now" data-track-id="hero-cta">立即預訂</button>

<!-- 追蹤帶 metadata（方式 A）-->
<a data-track="click_destination" data-track-meta='{"city":"tokyo"}' href="/tokyo">東京</a>

<!-- 手動追蹤（方式 B）-->
<script>
  Analytics.track('click_search', { metadata: { query: '東京' } });

  // 隨時確認目前網站 ID
  console.log(Analytics.site); // 'travel'
</script>
```

**Icon 庫網站**（HTML）：
```html
<script src="https://your-analytics-api.com/sdk/analytics.icons.js"></script>

<button data-track="click_download"
        data-track-id="btn-dl-cat"
        data-track-meta='{"iconName":"cat","category":"animal"}'>
  下載
</button>

<script>
  console.log(Analytics.site); // 'icons'  ← 永遠不會是 'travel'
</script>
```

### 加入新網站（未來擴充）

只需在後端 `enum` 加入新的 site 值，再複製 SDK 改 SITE 參數即可，
所有資料天然隔離，不影響現有兩個網站的資料。

---

## 七、Dashboard 規格

### 登入機制
- `GET /dashboard/login` → 顯示密碼輸入頁
- `POST /dashboard/login` → 驗證密碼，成功後設定 httpOnly cookie（`dashboard_token`），有效期 24 小時
- 所有 `/dashboard/*` 路由都先驗證 cookie，無效則 redirect 到登入頁
- **不使用 Bearer Token，改用 session cookie，更符合瀏覽器操作習慣**

### Dashboard 頁面佈局

```
┌─────────────────────────────────────────────────────────┐
│  網站選擇：[全部] [旅遊網站] [Icon 庫]   時間：[7天▼]   │
├──────────────┬──────────────┬──────────────┬────────────┤
│  今日訪客     │  本週訪客    │  本月訪客    │  總點擊數  │
│  旅遊: 45    │  旅遊: 310   │  旅遊: 1250  │  旅遊: 89  │
│  Icons: 220  │  Icons:1540  │  Icons:8800  │  Icons:420 │
├─────────────────────────────────────────────────────────┤
│  📈 每日 Pageview 趨勢（折線圖，兩個網站疊在一起對比）   │
│  旅遊 ——  Icon庫 - - -                                  │
├────────────────────────┬────────────────────────────────┤
│  🔥 熱門頁面 Top 10    │  👆 點擊事件 Top 10            │
│  （長條圖）             │  （長條圖）                    │
│  可切換網站篩選         │  可切換網站篩選                │
├─────────────────────────────────────────────────────────┤
│  🕐 即時活動 Log（最近 50 筆，兩個網站混合顯示含 badge） │
│  [Travel] /blog/tokyo  pageview  10:22:11               │
│  [Icons]  click_download cat     10:21:55               │
└─────────────────────────────────────────────────────────┘
```

### 圖表技術
- 使用 Chart.js 4.x（CDN 引入）
- 顏色規則：旅遊網站 = `#4f86f7`（藍），Icon 庫 = `#2ec27e`（綠）
- 切換時間範圍 / 網站時，用 fetch 重新呼叫 `/api/stats/*` 更新圖表，不 reload 頁面

---

## 八、安全設計

### CORS（`server/middleware/cors.js`）
```javascript
// 讀取 .env ALLOWED_ORIGINS，只允許白名單
// /api/pageview 和 /api/event 允許白名單 Origin
// /api/stats/* 只允許 same-origin（Dashboard 直接呼叫）
```

### Rate Limiting（`server/middleware/rateLimit.js`）
```javascript
// 使用 express-rate-limit
// collect 端點：100 requests / 10 minutes / per IP
// stats 端點：60 requests / 1 minute / per IP
```

### Input Sanitization
- 所有字串欄位 trim 並限制 maxLength
- `site` 欄位只接受 enum 值，其他值直接 400
- `metadata` 限制巢狀深度，防止超大 payload

---

## 九、逐階段開發與自動檢查機制

---

### Phase 1：專案骨架 + 資料庫連線

**要做的事：**
1. 初始化 `package.json`，安裝 `express mongoose dotenv cors express-rate-limit`
2. 建立 `server/config/db.js`，連線 MongoDB
3. 建立兩個 Mongoose Model（Pageview、Event）
4. 建立 `server/index.js`，啟動 Express，掛上 `/health` endpoint
5. 建立 `.env.example`

**✅ Phase 1 自動檢查腳本（`scripts/check-phase1.js`）：**

```javascript
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
    process.exit(1);
  } else {
    console.log('\n✅ Phase 1 全部通過！繼續 Phase 2。');
    process.exit(0);
  }
}
check();
```

---

### Phase 2：Collect API 端點

**要做的事：**
1. 實作 `POST /api/pageview`（含 IP hash、驗證、CORS）
2. 實作 `POST /api/event`（同上）
3. 掛上 Rate Limiting middleware
4. 在 Express 開放 `sdk/` 目錄為靜態檔案（`/sdk/analytics.travel.js` 可公開存取）

**✅ Phase 2 自動檢查腳本（`scripts/check-phase2.js`）：**

```javascript
// 執行：node scripts/check-phase2.js
const BASE = `http://localhost:${process.env.PORT || 3000}`;

async function check() {
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
  if (failed.length > 0) {
    console.error(`\n❌ Phase 2 未通過，${failed.length} 個檢查失敗。`);
    process.exit(1);
  } else {
    console.log('\n✅ Phase 2 全部通過！繼續 Phase 3。');
    process.exit(0);
  }
}
check();
```

---

### Phase 3：Stats API + Dashboard 後端

**要做的事：**
1. 實作 `GET /api/stats/overview`
2. 實作 `GET /api/stats/daily`
3. 實作 `GET /api/stats/top-pages`
4. 實作 `GET /api/stats/events`
5. 實作 `GET /api/stats/recent`
6. 實作 Dashboard cookie 登入（`/dashboard/login`）
7. 開放 `dashboard/` 目錄為靜態檔案（含 auth middleware）

**✅ Phase 3 自動檢查腳本（`scripts/check-phase3.js`）：**

```javascript
const BASE = `http://localhost:${process.env.PORT || 3000}`;
require('dotenv').config();
const TOKEN = process.env.DASHBOARD_SECRET;

async function check() {
  const results = [];

  // 先用 Phase 2 寫入一些測試資料
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
  if (failed.length > 0) {
    console.error(`\n❌ Phase 3 未通過，${failed.length} 個檢查失敗。`);
    process.exit(1);
  } else {
    console.log('\n✅ Phase 3 全部通過！繼續 Phase 4。');
    process.exit(0);
  }
}
check();
```

---

### Phase 4：Dashboard 前端 + SDK 產出 + 最終整合

**要做的事：**
1. 完成 `dashboard/login.html` 登入頁
2. 完成 `dashboard/index.html` + `dashboard/app.js`（Chart.js 圖表全部跑通）
3. 產出 `sdk/analytics.travel.js`（site 固定為 travel）
4. 產出 `sdk/analytics.icons.js`（site 固定為 icons）
5. 建立 `README.md`（說明如何部署）

**✅ Phase 4 自動檢查腳本（`scripts/check-phase4.js`）：**

```javascript
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
```

---

## 十、package.json scripts

```json
{
  "scripts": {
    "start": "node server/index.js",
    "dev": "nodemon server/index.js",
    "check:1": "node scripts/check-phase1.js",
    "check:2": "node scripts/check-phase2.js",
    "check:3": "node scripts/check-phase3.js",
    "check:4": "node scripts/check-phase4.js",
    "check:all": "npm run check:1 && npm run check:2 && npm run check:3 && npm run check:4"
  },
  "dependencies": {
    "express": "^4.18.0",
    "mongoose": "^8.0.0",
    "dotenv": "^16.0.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.0.0",
    "cookie-parser": "^1.4.6"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

---

## 十一、給 Cursor / Claude Code 的總執行指令

```
請完整實作這份 PRD，從 Phase 1 開始一路做到 Phase 4。

規則：
1. 每完成一個 Phase，執行對應的 check script（npm run check:1 等）
2. 若 check 失敗，自行找出原因修復，直到全部通過才進入下一個 Phase
3. 不要跳過任何 Phase
4. SDK 的 analytics.travel.js 和 analytics.icons.js 必須是完全獨立的檔案，
   site 值在檔案中硬編碼，不依賴任何外部設定
5. 所有資料庫查詢都必須帶 site 條件，確保兩個網站的數據絕對不會混在一起
6. 完成後執行 npm run check:all 做最終驗證
```

---

*v2 — MongoDB 版 · 含自動檢查機制 · 分網站 SDK*