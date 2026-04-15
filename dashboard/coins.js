(() => {
  // Role check
  fetch('/dashboard/me', { credentials: 'same-origin' })
    .then(r => r.json())
    .then(data => {
      if (data.role === 'artist') {
        window.location.href = '/dashboard/artist-dashboard';
      }
    })
    .catch(() => {});

  const API = '/api/iap';

  // ── State ────────────────────────────────────────────────────────────────
  let usersPage = 0, txnsPage = 0;
  const PAGE_SIZE = 20;

  // ── Utils ─────────────────────────────────────────────────────────────────
  function fmt(n) { return Number(n).toLocaleString(); }
  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }
  function shortId(id) {
    if (!id) return '—';
    return String(id).length > 20 ? String(id).slice(0, 8) + '…' + String(id).slice(-6) : id;
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  async function apiFetch(path, opts = {}) {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    return res.json();
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  async function loadStats() {
    const [data, themeData] = await Promise.all([
      apiFetch('/stats'),
      apiFetch('/theme-stats'),
    ]);
    document.getElementById('stat-users').textContent = fmt(data.totalUsers ?? 0);
    document.getElementById('stat-coins').textContent = fmt(data.totalCoinsGranted ?? 0);
    document.getElementById('stat-txns').textContent = fmt(data.totalTransactions ?? 0);
    const totalPurchases = (themeData.items || []).reduce((s, t) => s + t.totalPurchases, 0);
    const totalCoins = (themeData.items || []).reduce((s, t) => s + t.totalCoinsSpent, 0);
    document.getElementById('stat-theme-purchases').textContent = fmt(totalPurchases);
    document.getElementById('stat-theme-coins').textContent = fmt(totalCoins);
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  async function loadUsers(page = 0) {
    usersPage = page;
    const data = await apiFetch(`/users?page=${page}&limit=${PAGE_SIZE}`);
    const tbody = document.getElementById('users-tbody');
    const empty = document.getElementById('users-empty');

    if (!data.items || data.items.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = '';
      document.getElementById('users-pagination').innerHTML = '';
      return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = data.items.map(u => `
      <tr>
        <td><span class="monospace" title="${u._id}">${shortId(u._id)}</span></td>
        <td><span class="coins-badge">🪙 ${fmt(u.coins)}</span></td>
        <td>${fmtDate(u.createdAt)}</td>
      </tr>
    `).join('');

    renderPagination('users-pagination', page, data.total, PAGE_SIZE, loadUsers);
  }

  // ── Transactions ──────────────────────────────────────────────────────────
  async function loadTransactions(page = 0) {
    txnsPage = page;
    const data = await apiFetch(`/transactions?page=${page}&limit=${PAGE_SIZE}`);
    const tbody = document.getElementById('txns-tbody');
    const empty = document.getElementById('txns-empty');

    if (!data.items || data.items.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = '';
      document.getElementById('txns-pagination').innerHTML = '';
      return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = data.items.map(t => {
      const productClass = t.productId === 'coins_small' ? 'product-small' : 'product-big';
      return `
        <tr>
          <td><span class="monospace" title="${t._id}">${shortId(t._id)}</span></td>
          <td><span class="monospace" title="${t.userId}">${shortId(t.userId)}</span></td>
          <td><span class="product-badge ${productClass}">${t.productId}</span></td>
          <td><span class="coins-badge">🪙 ${fmt(t.coins)}</span></td>
          <td>${fmtDate(t.createdAt)}</td>
        </tr>
      `;
    }).join('');

    renderPagination('txns-pagination', page, data.total, PAGE_SIZE, loadTransactions);
  }

  // ── Themes ────────────────────────────────────────────────────────────────
  async function loadThemes() {
    const data = await apiFetch('/theme-stats');
    const tbody = document.getElementById('themes-tbody');
    const empty = document.getElementById('themes-empty');

    if (!data.items || data.items.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = '';
      return;
    }

    empty.style.display = 'none';
    const max = data.items[0].totalPurchases || 1;
    tbody.innerHTML = data.items.map(t => {
      const pct = Math.round((t.totalPurchases / max) * 100);
      return `
        <tr>
          <td><code style="color:#fafafa;font-size:13px">${t.themeId}</code></td>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
              <span style="font-variant-numeric:tabular-nums">${fmt(t.totalPurchases)}</span>
            </div>
          </td>
          <td style="color:#a1a1aa">${fmt(t.uniqueUsers)}</td>
          <td><span class="coins-badge">🪙 ${fmt(t.totalCoinsSpent)}</span></td>
        </tr>
      `;
    }).join('');
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  function renderPagination(id, page, total, size, loadFn) {
    const pages = Math.ceil(total / size);
    const el = document.getElementById(id);
    if (pages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <button ${page === 0 ? 'disabled' : ''} onclick="(${loadFn.name})(${page - 1})">← Prev</button>
      <span>Page ${page + 1} of ${pages}</span>
      <button ${page >= pages - 1 ? 'disabled' : ''} onclick="(${loadFn.name})(${page + 1})">Next →</button>
    `;
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ── Refresh ───────────────────────────────────────────────────────────────
  function loadAll() {
    loadStats();
    loadUsers(0);
    loadTransactions(0);
    loadThemes();
  }

  document.getElementById('btn-refresh').addEventListener('click', loadAll);

  // expose for pagination inline handlers
  window.loadUsers = loadUsers;
  window.loadTransactions = loadTransactions;

  // ── Init ──────────────────────────────────────────────────────────────────
  loadAll();
})();
