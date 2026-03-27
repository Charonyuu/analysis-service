const API = '';

Chart.defaults.color = '#71717a';
Chart.defaults.borderColor = '#27272a';

async function apiFetch(path) {
  const res = await fetch(API + path, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('API error: ' + res.status);
  return res.json();
}

let allSites = [];
let dailyChart;

function fmtSec(s) {
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m + 'm ' + sec + 's';
}

function getDateRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function buildSiteFilter() {
  const select = document.getElementById('site-filter');
  while (select.options.length > 1) select.remove(1);
  allSites.forEach(site => {
    const opt = document.createElement('option');
    opt.value = site;
    opt.textContent = site.charAt(0).toUpperCase() + site.slice(1);
    select.appendChild(opt);
  });
}

async function loadOverview() {
  const siteFilter = document.getElementById('site-filter').value;
  const query = siteFilter === 'all' ? '' : '?site=' + siteFilter;
  const data = await apiFetch('/api/stats/overview' + query);

  const container = document.getElementById('overview-container');
  let html = '';

  for (const [page, stats] of Object.entries(data.pages)) {
    html += `<div class="page-stats-section">
      <h2>${page}</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="label">Today Enter</div>
          <div class="num">${stats.todayEnter}</div>
        </div>
        <div class="stat-card">
          <div class="label">This Week Enter</div>
          <div class="num">${stats.weekEnter}</div>
        </div>
        <div class="stat-card">
          <div class="label">Total Enter</div>
          <div class="num">${stats.totalEnter}</div>
        </div>
        <div class="stat-card">
          <div class="label">Avg Duration</div>
          <div class="num">${fmtSec(stats.avgDurationSec)}</div>
          <div class="sub">total: ${fmtSec(stats.totalDurationSec)}</div>
        </div>
      </div>
    </div>`;
  }

  if (!html) {
    html = '<div style="color:#52525b;padding:40px;text-align:center">No data yet</div>';
  }

  container.innerHTML = html;
}

const PAGE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'];

async function loadDaily() {
  const days = parseInt(document.getElementById('time-range').value);
  const { from, to } = getDateRange(days);
  const siteFilter = document.getElementById('site-filter').value;
  const sites = siteFilter === 'all' ? allSites : [siteFilter];

  const datasets = [];
  let colorIdx = 0;

  for (const site of sites) {
    const data = await apiFetch(`/api/stats/daily?site=${site}&from=${from}&to=${to}`);
    const color = PAGE_COLORS[colorIdx % PAGE_COLORS.length];
    datasets.push({
      label: site,
      data: data.daily.map(d => ({ x: d.date, y: d.enterCount })),
      borderColor: color,
      backgroundColor: color + '14',
      borderWidth: 2,
      tension: 0.4,
      fill: true,
      pointRadius: 3,
      pointBackgroundColor: color,
      pointBorderWidth: 0,
    });
    colorIdx++;
  }

  if (dailyChart) dailyChart.destroy();
  dailyChart = new Chart(document.getElementById('dailyChart'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: { type: 'category', grid: { display: false } },
        y: { beginAtZero: true, grid: { color: '#1e1e21' } }
      },
      plugins: { legend: { position: 'top' } }
    }
  });
}

async function loadRecent() {
  const siteFilter = document.getElementById('site-filter').value;
  const sites = siteFilter === 'all' ? allSites : [siteFilter];
  let allItems = [];

  for (const site of sites) {
    const data = await apiFetch(`/api/stats/recent?site=${site}`);
    allItems = allItems.concat(data.items.map(i => ({ ...i, site })));
  }

  allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  allItems = allItems.slice(0, 50);

  const container = document.getElementById('recent-items');
  if (allItems.length === 0) {
    container.innerHTML = '<div style="color:#52525b;padding:20px;text-align:center">No recent activity</div>';
    return;
  }

  container.innerHTML = allItems.map(item => {
    const time = new Date(item.createdAt).toLocaleString();
    const pageBadge = `<span class="badge badge-page">${item.page}</span>`;
    const actionBadge = `<span class="badge badge-${item.action}">${item.action}</span>`;
    const duration = item.action === 'leave' && item.durationSec ? ` (${fmtSec(item.durationSec)})` : '';
    return `<div class="recent-item">
      <span class="recent-time">${time}</span>
      ${pageBadge}${actionBadge}
      <span class="recent-path" title="${item.path || ''}">${(item.path || '').length > 60 ? (item.path.slice(0, 60) + '...') : (item.path || '')}${duration}</span>
    </div>`;
  }).join('');
}

async function loadAll() {
  await Promise.all([loadOverview(), loadDaily(), loadRecent()]);
}

async function init() {
  const data = await apiFetch('/api/stats/sites');
  allSites = data.sites;
  buildSiteFilter();
  await loadAll();
}

document.getElementById('site-filter').addEventListener('change', loadAll);
document.getElementById('time-range').addEventListener('change', loadAll);

document.getElementById('btn-refresh').addEventListener('click', async function () {
  const btn = this;
  btn.classList.add('loading');
  btn.disabled = true;
  try { await loadAll(); } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});

init();
