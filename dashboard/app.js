const TOKEN = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('dashboard_token='))?.split('=')[1] || '';
const API = '';

// Chart.js dark theme defaults
Chart.defaults.color = '#71717a';
Chart.defaults.borderColor = '#27272a';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;

async function apiFetch(path) {
  const res = await fetch(API + path, {
    headers: { 'Authorization': 'Bearer ' + TOKEN }
  });
  if (!res.ok) throw new Error('API error: ' + res.status);
  return res.json();
}

let dailyChart, topPagesChart, topEventsChart;

function getDateRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  };
}

async function loadOverview() {
  const data = await apiFetch('/api/stats/overview');
  document.getElementById('today-travel').textContent = data.travel.todayPageviews;
  document.getElementById('today-icons').textContent = data.icons.todayPageviews;
  document.getElementById('week-travel').textContent = data.travel.weekPageviews;
  document.getElementById('week-icons').textContent = data.icons.weekPageviews;
  document.getElementById('total-travel').textContent = data.travel.totalPageviews;
  document.getElementById('total-icons').textContent = data.icons.totalPageviews;
  document.getElementById('sessions-travel').textContent = data.travel.uniqueSessions;
  document.getElementById('sessions-icons').textContent = data.icons.uniqueSessions;
}

async function loadDaily() {
  const days = parseInt(document.getElementById('time-range').value);
  const { from, to } = getDateRange(days);
  const siteFilter = document.getElementById('site-filter').value;

  const sites = siteFilter === 'all' ? ['travel', 'icons'] : [siteFilter];
  const datasets = [];

  for (const site of sites) {
    const data = await apiFetch(`/api/stats/daily?site=${site}&from=${from}&to=${to}`);
    datasets.push({
      label: site.charAt(0).toUpperCase() + site.slice(1),
      data: data.pageviews.map(d => ({ x: d.date, y: d.count })),
      borderColor: site === 'travel' ? '#6366f1' : '#22c55e',
      backgroundColor: site === 'travel' ? 'rgba(99,102,241,0.08)' : 'rgba(34,197,94,0.08)',
      borderWidth: 2,
      tension: 0.4,
      fill: true,
      pointRadius: 3,
      pointBackgroundColor: site === 'travel' ? '#6366f1' : '#22c55e',
      pointBorderWidth: 0,
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

async function loadTopPages() {
  const siteFilter = document.getElementById('site-filter').value;
  const site = siteFilter === 'all' ? 'travel' : siteFilter;
  const data = await apiFetch(`/api/stats/top-pages?site=${site}&limit=10`);

  if (topPagesChart) topPagesChart.destroy();
  topPagesChart = new Chart(document.getElementById('topPagesChart'), {
    type: 'bar',
    data: {
      labels: data.pages.map(p => p.path),
      datasets: [{
        label: 'Pageviews',
        data: data.pages.map(p => p.count),
        backgroundColor: site === 'travel' ? 'rgba(99,102,241,0.6)' : 'rgba(34,197,94,0.6)',
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true, grid: { color: '#1e1e21' } },
        y: { grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

async function loadTopEvents() {
  const siteFilter = document.getElementById('site-filter').value;
  const site = siteFilter === 'all' ? 'icons' : siteFilter;
  const data = await apiFetch(`/api/stats/events?site=${site}`);

  if (topEventsChart) topEventsChart.destroy();
  topEventsChart = new Chart(document.getElementById('topEventsChart'), {
    type: 'bar',
    data: {
      labels: data.events.map(e => e.eventName),
      datasets: [{
        label: 'Events',
        data: data.events.map(e => e.count),
        backgroundColor: site === 'travel' ? 'rgba(99,102,241,0.6)' : 'rgba(34,197,94,0.6)',
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true, grid: { color: '#1e1e21' } },
        y: { grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

async function loadRecent() {
  const siteFilter = document.getElementById('site-filter').value;
  const sites = siteFilter === 'all' ? ['travel', 'icons'] : [siteFilter];
  let allItems = [];

  for (const site of sites) {
    const data = await apiFetch(`/api/stats/recent?site=${site}`);
    allItems = allItems.concat(data.items.map(i => ({ ...i, site })));
  }

  allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  allItems = allItems.slice(0, 50);

  const container = document.getElementById('recent-items');
  container.innerHTML = allItems.map(item => {
    const time = new Date(item.createdAt).toLocaleTimeString();
    const siteBadge = `<span class="badge badge-${item.site}">${item.site}</span>`;
    const typeBadge = `<span class="badge badge-${item.type}">${item.type}</span>`;
    const detail = item.type === 'pageview' ? item.path : `${item.eventName} ${item.path}`;
    return `<div class="recent-item"><span class="recent-time">${time}</span>${siteBadge}${typeBadge}<span class="recent-path">${detail}</span></div>`;
  }).join('');
}

async function loadAll() {
  await Promise.all([loadOverview(), loadDaily(), loadTopPages(), loadTopEvents(), loadRecent()]);
}

document.getElementById('site-filter').addEventListener('change', loadAll);
document.getElementById('time-range').addEventListener('change', loadAll);

loadAll();
