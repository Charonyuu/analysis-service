// Role check
fetch('/dashboard/me', { credentials: 'same-origin' })
  .then(r => r.json())
  .then(data => {
    if (data.role === 'artist') {
      window.location.href = '/dashboard/artist-dashboard';
    }
  })
  .catch(() => {});

const API = '';
const SITE_COLORS = { travel: '#6366f1', icons: '#22c55e', pixel_frame: '#f59e0b', resume: '#0d9488' };
const DEFAULT_COLORS = ['#ec4899', '#06b6d4', '#f97316'];
const SITE_NAMES = { travel: '旅趣 Tripi', icons: '像素圖庫', pixel_frame: '像素框 App', resume: '個人履歷' };

Chart.defaults.color = '#71717a';
Chart.defaults.borderColor = '#27272a';

async function apiFetch(path) {
  const res = await fetch(API + path, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('API error: ' + res.status);
  return res.json();
}

let allSites = [];
let currentSite = 'all';
let dailyChart, clicksChart;
let recentItems = [];
let recentPage = 0;
const PAGE_SIZE = 20;

function siteColor(site, idx) {
  return SITE_COLORS[site] || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
}

function siteName(site) {
  return SITE_NAMES[site] || site;
}

function fmtSec(s) {
  if (s < 60) return s + 's';
  return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
}

function getDateRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// --- Sidebar ---
function buildSidebar() {
  const container = document.getElementById('nav-sites');
  const mobileSelect = document.getElementById('mobile-site-filter');

  container.innerHTML = allSites.map(site => {
    const color = siteColor(site, allSites.indexOf(site));
    return `<a href="#" class="nav-site" data-site="${site}">
      <span class="nav-dot" style="background:${color}"></span>
      ${siteName(site)}
    </a>`;
  }).join('');

  // Mobile select
  while (mobileSelect.options.length > 1) mobileSelect.remove(1);
  allSites.forEach(site => {
    const opt = document.createElement('option');
    opt.value = site;
    opt.textContent = siteName(site);
    mobileSelect.appendChild(opt);
  });

  // Bind clicks
  document.querySelectorAll('.nav-site').forEach(a => {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      switchSite(this.getAttribute('data-site'));
    });
  });

  mobileSelect.addEventListener('change', function () {
    switchSite(this.value);
  });
}

function switchSite(site) {
  currentSite = site;
  currentView = 'analytics';
  recentPage = 0;

  // Switch view
  document.getElementById('view-analytics').classList.add('active');
  document.getElementById('view-feedback').classList.remove('active');
  document.getElementById('nav-feedback').classList.remove('active');
  document.querySelector('.header-actions').style.display = 'flex';

  // Update active state
  document.querySelectorAll('.nav-site').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-site') === site);
  });

  // Update title
  document.getElementById('page-title').textContent = site === 'all' ? '所有站點' : siteName(site);
  document.querySelector('.page-header .subtitle').textContent = '頁面流量分析總覽';

  // Update mobile select
  document.getElementById('mobile-site-filter').value = site;

  loadAll();
}

// --- Overview ---
async function loadOverview() {
  const container = document.getElementById('overview-container');

  if (currentSite === 'all') {
    // All Sites: show summary per site
    let html = '';
    for (const site of allSites) {
      const data = await apiFetch('/api/stats/overview?site=' + site);
      const pages = Object.values(data.pages);
      const todayEnter = pages.reduce((s, p) => s + p.todayEnter, 0);
      const weekEnter = pages.reduce((s, p) => s + p.weekEnter, 0);
      const totalEnter = pages.reduce((s, p) => s + p.totalEnter, 0);
      const totalDur = pages.reduce((s, p) => s + p.totalDurationSec, 0);
      const avgDur = totalEnter > 0 ? Math.round(totalDur / totalEnter) : 0;
      const color = siteColor(site, allSites.indexOf(site));

      html += `<div class="page-stats-section">
        <h2 style="display:flex;align-items:center;gap:8px">
          <span class="nav-dot" style="background:${color}"></span>
          ${siteName(site)}
        </h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="label">今日</div>
            <div class="num">${todayEnter}</div>
          </div>
          <div class="stat-card">
            <div class="label">本週</div>
            <div class="num">${weekEnter}</div>
          </div>
          <div class="stat-card">
            <div class="label">總計</div>
            <div class="num">${totalEnter}</div>
          </div>
          <div class="stat-card">
            <div class="label">平均停留</div>
            <div class="num">${fmtSec(avgDur)}</div>
            <div class="sub">total: ${fmtSec(totalDur)}</div>
          </div>
        </div>
      </div>`;
    }
    container.innerHTML = html || '<div style="color:#52525b;padding:40px;text-align:center">尚無資料</div>';
  } else {
    // Single site: compact table view
    const data = await apiFetch('/api/stats/overview?site=' + currentSite);
    const pages = Object.entries(data.pages);

    if (pages.length === 0) {
      container.innerHTML = '<div style="color:#52525b;padding:40px;text-align:center">尚無資料</div>';
      return;
    }

    // Summary row
    const totalToday = pages.reduce((s, [, p]) => s + p.todayEnter, 0);
    const totalWeek = pages.reduce((s, [, p]) => s + p.weekEnter, 0);
    const totalAll = pages.reduce((s, [, p]) => s + p.totalEnter, 0);
    const totalDur = pages.reduce((s, [, p]) => s + p.totalDurationSec, 0);
    const avgDur = totalAll > 0 ? Math.round(totalDur / totalAll) : 0;

    let html = `
      <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card"><div class="label">今日</div><div class="num">${totalToday}</div></div>
        <div class="stat-card"><div class="label">本週</div><div class="num">${totalWeek}</div></div>
        <div class="stat-card"><div class="label">總計</div><div class="num">${totalAll}</div></div>
        <div class="stat-card"><div class="label">平均停留</div><div class="num">${fmtSec(avgDur)}</div><div class="sub">total: ${fmtSec(totalDur)}</div></div>
      </div>
      <div class="chart-card">
        <h3>各頁面明細</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead>
            <tr style="border-bottom:1px solid #27272a;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">
              <th style="text-align:left;padding:10px 12px">頁面</th>
              <th style="text-align:right;padding:10px 12px">今日</th>
              <th style="text-align:right;padding:10px 12px">本週</th>
              <th style="text-align:right;padding:10px 12px">總計</th>
              <th style="text-align:right;padding:10px 12px">平均停留</th>
            </tr>
          </thead>
          <tbody>`;

    // Sort by total descending
    pages.sort((a, b) => b[1].totalEnter - a[1].totalEnter);
    for (const [page, stats] of pages) {
      html += `
            <tr style="border-bottom:1px solid #1e1e21">
              <td style="padding:10px 12px;color:#e4e4e7;font-weight:500">${page}</td>
              <td style="text-align:right;padding:10px 12px;color:${stats.todayEnter > 0 ? '#4ade80' : '#52525b'};font-variant-numeric:tabular-nums">${stats.todayEnter}</td>
              <td style="text-align:right;padding:10px 12px;color:#a1a1aa;font-variant-numeric:tabular-nums">${stats.weekEnter}</td>
              <td style="text-align:right;padding:10px 12px;color:#fafafa;font-weight:600;font-variant-numeric:tabular-nums">${stats.totalEnter}</td>
              <td style="text-align:right;padding:10px 12px;color:#71717a">${fmtSec(stats.avgDurationSec)}</td>
            </tr>`;
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }
}

// --- Daily chart ---
async function loadDaily() {
  const days = parseInt(document.getElementById('time-range').value);
  const { from, to } = getDateRange(days);
  const sites = currentSite === 'all' ? allSites : [currentSite];

  // Collect all data first
  const allData = {};
  const allDates = new Set();

  for (const site of sites) {
    const data = await apiFetch(`/api/stats/daily?site=${site}&from=${from}&to=${to}`);
    const byDate = {};
    for (const d of data.daily) {
      byDate[d.date] = d.enterCount;
      allDates.add(d.date);
    }
    allData[site] = byDate;
  }

  // Sort dates chronologically
  const sortedDates = Array.from(allDates).sort();

  const datasets = sites.map(site => {
    const color = siteColor(site, allSites.indexOf(site));
    return {
      label: siteName(site),
      data: sortedDates.map(d => allData[site][d] || 0),
      borderColor: color,
      backgroundColor: color + '14',
      borderWidth: 2, tension: 0.4, fill: true,
      pointRadius: 3, pointBackgroundColor: color, pointBorderWidth: 0,
    };
  });

  if (dailyChart) dailyChart.destroy();
  dailyChart = new Chart(document.getElementById('dailyChart'), {
    type: 'line',
    data: { labels: sortedDates, datasets },
    options: {
      responsive: true,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: '#1e1e21' } }
      },
      plugins: { legend: { position: 'top' } }
    }
  });
}

// --- Clicks chart ---
async function loadClicks() {
  const sites = currentSite === 'all' ? allSites : [currentSite];
  let allClicks = {};

  for (const site of sites) {
    const data = await apiFetch(`/api/stats/clicks?site=${site}`);
    for (const c of data.clicks) {
      const key = sites.length > 1 ? `${site}:${c.eventName}` : c.eventName;
      allClicks[key] = (allClicks[key] || 0) + c.count;
    }
  }

  const sorted = Object.entries(allClicks).sort((a, b) => b[1] - a[1]).slice(0, 15);

  if (clicksChart) clicksChart.destroy();
  clicksChart = new Chart(document.getElementById('clicksChart'), {
    type: 'bar',
    data: {
      labels: sorted.map(s => s[0]),
      datasets: [{
        label: 'Clicks',
        data: sorted.map(s => s[1]),
        backgroundColor: '#ec489999',
        borderRadius: 4, borderSkipped: false
      }]
    },
    options: {
      responsive: true, indexAxis: 'y',
      scales: {
        x: { beginAtZero: true, grid: { color: '#1e1e21' } },
        y: { grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// --- Recent with pagination ---
async function loadRecent() {
  const sites = currentSite === 'all' ? allSites : [currentSite];
  recentItems = [];

  for (const site of sites) {
    const data = await apiFetch(`/api/stats/recent?site=${site}`);
    recentItems = recentItems.concat(data.items.map(i => ({ ...i, site })));
  }

  recentItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  recentPage = 0;
  renderRecent();
}

function renderRecent() {
  const start = recentPage * PAGE_SIZE;
  const pageItems = recentItems.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(recentItems.length / PAGE_SIZE);

  const container = document.getElementById('recent-items');
  if (recentItems.length === 0) {
    container.innerHTML = '<div style="color:#52525b;padding:20px;text-align:center">沒有最近活動</div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  container.innerHTML = pageItems.map(item => {
    const time = new Date(item.createdAt).toLocaleString();
    const pageBadge = `<span class="badge badge-page">${item.page}</span>`;
    const actionBadge = `<span class="badge badge-${item.action}">${item.action}</span>`;
    let detail = '';
    if (item.action === 'click') {
      detail = item.eventName || '';
    } else if (item.action === 'leave' && item.durationSec) {
      const path = (item.path || '').length > 50 ? (item.path.slice(0, 50) + '...') : (item.path || '');
      detail = `${path} (${fmtSec(item.durationSec)})`;
    } else {
      detail = (item.path || '').length > 60 ? (item.path.slice(0, 60) + '...') : (item.path || '');
    }
    return `<div class="recent-item">
      <span class="recent-time">${time}</span>
      ${pageBadge}${actionBadge}
      <span class="recent-path" title="${item.path || ''}">${detail}</span>
    </div>`;
  }).join('');

  // Pagination
  const pag = document.getElementById('pagination');
  if (totalPages <= 1) {
    pag.innerHTML = '';
    return;
  }
  pag.innerHTML = `
    <button id="prev-page" ${recentPage === 0 ? 'disabled' : ''}>上一頁</button>
    <span>${recentPage + 1} / ${totalPages}</span>
    <button id="next-page" ${recentPage >= totalPages - 1 ? 'disabled' : ''}>下一頁</button>
  `;
  document.getElementById('prev-page').addEventListener('click', () => { recentPage--; renderRecent(); });
  document.getElementById('next-page').addEventListener('click', () => { recentPage++; renderRecent(); });
}

// --- Load all ---
async function loadAll() {
  await Promise.all([loadOverview(), loadDaily(), loadClicks(), loadRecent()]);
}

async function init() {
  const data = await apiFetch('/api/stats/sites');
  allSites = data.sites;
  buildSidebar();
  buildFeedbackFilter();
  await loadAll();
  loadUnreadCount();
}

// --- View switching ---
let currentView = 'analytics';

function showView(view) {
  currentView = view;
  document.getElementById('view-analytics').classList.toggle('active', view === 'analytics');
  document.getElementById('view-feedback').classList.toggle('active', view === 'feedback');
  document.getElementById('view-trending').classList.toggle('active', view === 'trending');

  // Deactivate all nav highlights
  document.querySelectorAll('.nav-site').forEach(a => a.classList.remove('active'));
  document.getElementById('nav-feedback').classList.remove('active');
  document.getElementById('nav-trending').classList.remove('active');

  if (view === 'feedback') {
    document.getElementById('page-title').textContent = '回饋';
    document.querySelector('.page-header .subtitle').textContent = '來自所有 App 的使用者回饋';
    document.querySelector('.header-actions').style.display = 'none';
    document.getElementById('nav-feedback').classList.add('active');
    loadFeedback();
  } else if (view === 'trending') {
    document.getElementById('page-title').textContent = '熱門趨勢';
    document.querySelector('.page-header .subtitle').textContent = '目前各平台的熱門話題';
    document.querySelector('.header-actions').style.display = 'none';
    document.getElementById('nav-trending').classList.add('active');
    loadTrending();
  } else {
    document.querySelector('.header-actions').style.display = 'flex';
    switchSite(currentSite);
  }
}

// --- Feedback ---
let feedbackPage = 0;

async function loadFeedback() {
  const siteFilter = document.getElementById('feedback-site-filter').value;
  const query = siteFilter ? `?site=${siteFilter}&page=${feedbackPage}` : `?page=${feedbackPage}`;
  const data = await apiFetch('/api/feedback' + query);

  const container = document.getElementById('feedback-list');

  if (data.items.length === 0) {
    container.innerHTML = '<div class="feedback-empty">尚無回饋</div>';
    document.getElementById('feedback-pagination').innerHTML = '';
    return;
  }

  container.innerHTML = data.items.map(item => {
    const time = new Date(item.createdAt).toLocaleString();
    const color = siteColor(item.site, 0);
    const displayName = siteName(item.site);
    const unreadClass = item.read ? '' : ' unread';

    return `<div class="feedback-item${unreadClass}" data-id="${item._id}">
      <div class="feedback-item-header">
        <div class="feedback-meta">
          <span class="badge" style="background:${color}22;color:${color}">${displayName}</span>
          ${item.name ? `<span class="name">${item.name}</span>` : ''}
          ${item.email ? `<span>${item.email}</span>` : ''}
          <span>${time}</span>
        </div>
        <div class="feedback-actions">
          ${!item.read ? `<button onclick="markRead('${item._id}')">標為已讀</button>` : ''}
          <button class="btn-delete" onclick="deleteFeedback('${item._id}')">刪除</button>
        </div>
      </div>
      <div class="feedback-message">${escapeHtml(item.message)}</div>
    </div>`;
  }).join('');

  // Pagination
  const totalPages = Math.ceil(data.total / data.pageSize);
  const pag = document.getElementById('feedback-pagination');
  if (totalPages <= 1) { pag.innerHTML = ''; return; }
  pag.innerHTML = `
    <button id="fb-prev" ${feedbackPage === 0 ? 'disabled' : ''}>上一頁</button>
    <span>${feedbackPage + 1} / ${totalPages}</span>
    <button id="fb-next" ${feedbackPage >= totalPages - 1 ? 'disabled' : ''}>下一頁</button>
  `;
  document.getElementById('fb-prev').addEventListener('click', () => { feedbackPage--; loadFeedback(); });
  document.getElementById('fb-next').addEventListener('click', () => { feedbackPage++; loadFeedback(); });

  // Update unread badge
  updateUnreadBadge(data.unread);
}

function updateUnreadBadge(count) {
  const badge = document.getElementById('unread-badge');
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function markRead(id) {
  await fetch(API + '/api/feedback/' + id + '/read', { method: 'PATCH', credentials: 'same-origin' });
  loadFeedback();
}

async function deleteFeedback(id) {
  if (!confirm('確定要刪除這則回饋？')) return;
  await fetch(API + '/api/feedback/' + id, { method: 'DELETE', credentials: 'same-origin' });
  loadFeedback();
}

async function loadUnreadCount() {
  try {
    const data = await apiFetch('/api/feedback?limit=0');
    updateUnreadBadge(data.unread);
  } catch (e) {}
}

// Build feedback site filter
function buildFeedbackFilter() {
  const select = document.getElementById('feedback-site-filter');
  while (select.options.length > 1) select.remove(1);
  allSites.forEach(site => {
    const opt = document.createElement('option');
    opt.value = site;
    opt.textContent = siteName(site);
    select.appendChild(opt);
  });
}

// --- Trending ---
async function loadTrending() {
  const container = document.getElementById('trending-container');
  const updatedEl = document.getElementById('trending-updated');
  container.innerHTML = '<div style="color:#52525b;padding:40px;text-align:center">載入中...</div>';

  try {
    const data = await apiFetch('/api/trending');
    if (!data.categories || data.categories.length === 0) {
      container.innerHTML = '<div style="color:#52525b;padding:40px;text-align:center">目前沒有熱門話題資料</div>';
      updatedEl.textContent = '';
      return;
    }

    container.innerHTML = data.categories.map(cat => {
      const items = (cat.items || []).map((item, i) => {
        const rankClass = i < 3 ? ' top3' : '';
        return `<div class="trending-item">
          <span class="trending-rank${rankClass}">${i + 1}</span>
          <span class="trending-title">${escapeHtml(item.title)}</span>
          <span class="trending-source">${item.source || ''}</span>
          ${item.score ? `<span class="trending-score">${item.score}</span>` : ''}
        </div>`;
      }).join('');

      return `<div class="trending-category">
        <h3>${cat.label || cat.id}</h3>
        ${items || '<div style="color:#52525b;padding:12px">尚無資料</div>'}
      </div>`;
    }).join('');

    if (data.updatedAt) {
      updatedEl.textContent = '最後更新：' + new Date(data.updatedAt).toLocaleString();
    }
  } catch (err) {
    container.innerHTML = `<div style="color:#fca5a5;padding:40px;text-align:center">載入失敗：${err.message}</div>`;
  }
}

// --- Event listeners ---
document.getElementById('time-range').addEventListener('change', loadAll);

document.getElementById('btn-refresh').addEventListener('click', async function () {
  const btn = this;
  btn.classList.add('loading');
  btn.disabled = true;
  try {
    if (currentView === 'analytics') await loadAll();
    else if (currentView === 'trending') await loadTrending();
    else await loadFeedback();
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});

document.getElementById('nav-feedback').addEventListener('click', function (e) {
  e.preventDefault();
  showView('feedback');
});

document.getElementById('nav-trending').addEventListener('click', function (e) {
  e.preventDefault();
  showView('trending');
});

document.getElementById('feedback-site-filter').addEventListener('change', function () {
  feedbackPage = 0;
  loadFeedback();
});

// Override switchSite to also switch view back
const _origSwitchSite = switchSite;

init();
