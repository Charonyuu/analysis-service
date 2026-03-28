const API = '';
const SITE_COLORS = { travel: '#6366f1', icons: '#22c55e' };
const DEFAULT_COLORS = ['#f59e0b', '#ec4899', '#06b6d4', '#f97316'];

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
      ${site.charAt(0).toUpperCase() + site.slice(1)}
    </a>`;
  }).join('');

  // Mobile select
  while (mobileSelect.options.length > 1) mobileSelect.remove(1);
  allSites.forEach(site => {
    const opt = document.createElement('option');
    opt.value = site;
    opt.textContent = site.charAt(0).toUpperCase() + site.slice(1);
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
  recentPage = 0;

  // Update active state
  document.querySelectorAll('.nav-site').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-site') === site);
  });

  // Update title
  const title = site === 'all' ? 'All Sites' : site.charAt(0).toUpperCase() + site.slice(1);
  document.getElementById('page-title').textContent = title;

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
          ${site.charAt(0).toUpperCase() + site.slice(1)}
        </h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="label">Today</div>
            <div class="num">${todayEnter}</div>
          </div>
          <div class="stat-card">
            <div class="label">This Week</div>
            <div class="num">${weekEnter}</div>
          </div>
          <div class="stat-card">
            <div class="label">Total</div>
            <div class="num">${totalEnter}</div>
          </div>
          <div class="stat-card">
            <div class="label">Avg Duration</div>
            <div class="num">${fmtSec(avgDur)}</div>
            <div class="sub">total: ${fmtSec(totalDur)}</div>
          </div>
        </div>
      </div>`;
    }
    container.innerHTML = html || '<div style="color:#52525b;padding:40px;text-align:center">No data yet</div>';
  } else {
    // Single site: show per page
    const data = await apiFetch('/api/stats/overview?site=' + currentSite);
    let html = '';

    for (const [page, stats] of Object.entries(data.pages)) {
      html += `<div class="page-stats-section">
        <h2>${page}</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="label">Today</div>
            <div class="num">${stats.todayEnter}</div>
          </div>
          <div class="stat-card">
            <div class="label">This Week</div>
            <div class="num">${stats.weekEnter}</div>
          </div>
          <div class="stat-card">
            <div class="label">Total</div>
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
    container.innerHTML = html || '<div style="color:#52525b;padding:40px;text-align:center">No data yet</div>';
  }
}

// --- Daily chart ---
async function loadDaily() {
  const days = parseInt(document.getElementById('time-range').value);
  const { from, to } = getDateRange(days);
  const sites = currentSite === 'all' ? allSites : [currentSite];
  const datasets = [];

  for (const site of sites) {
    const data = await apiFetch(`/api/stats/daily?site=${site}&from=${from}&to=${to}`);
    const color = siteColor(site, allSites.indexOf(site));
    datasets.push({
      label: site,
      data: data.daily.map(d => ({ x: d.date, y: d.enterCount })),
      borderColor: color,
      backgroundColor: color + '14',
      borderWidth: 2, tension: 0.4, fill: true,
      pointRadius: 3, pointBackgroundColor: color, pointBorderWidth: 0,
    });
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
    container.innerHTML = '<div style="color:#52525b;padding:20px;text-align:center">No recent activity</div>';
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
    <button id="prev-page" ${recentPage === 0 ? 'disabled' : ''}>Prev</button>
    <span>${recentPage + 1} / ${totalPages}</span>
    <button id="next-page" ${recentPage >= totalPages - 1 ? 'disabled' : ''}>Next</button>
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
  await loadAll();
}

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
