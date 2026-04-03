(() => {
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
    document.getElementById('stat-coupons').textContent = fmt(data.totalCoupons ?? 0);

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
      const productClass = t.productId === 'coins_small' ? 'product-small'
        : t.productId === 'coins_big' ? 'product-big' : 'product-coupon';
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

  // ── Coupons ───────────────────────────────────────────────────────────────
  async function loadCoupons() {
    const data = await apiFetch('/coupons');
    const tbody = document.getElementById('coupons-tbody');
    const empty = document.getElementById('coupons-empty');

    if (!data.items || data.items.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = '';
      return;
    }

    empty.style.display = 'none';
    const now = new Date();
    tbody.innerHTML = data.items.map(c => {
      const expired = new Date(c.expireAt) < now;
      const full = c.usedCount >= c.limit;
      const statusClass = expired ? 'status-expired' : full ? 'status-full' : 'status-active';
      const statusLabel = expired ? 'Expired' : full ? 'Full' : 'Active';
      const pct = Math.min(100, Math.round((c.usedCount / c.limit) * 100));

      return `
        <tr>
          <td><code style="color:#fafafa;font-size:13px">${c.code}</code></td>
          <td><span class="coins-badge">🪙 ${fmt(c.coins)}</span></td>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
              <span style="color:#71717a;font-size:12px">${fmt(c.usedCount)} / ${fmt(c.limit)}</span>
            </div>
          </td>
          <td style="color:#71717a">${fmtDate(c.expireAt)}</td>
          <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
          <td>
            <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="deleteCoupon('${c.code}')">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
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

  window.deleteCoupon = async (code) => {
    if (!confirm(`Delete coupon "${code}"?`)) return;
    await apiFetch(`/coupons/${code}`, { method: 'DELETE' });
    loadCoupons();
    loadStats();
  };

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

  // ── Create Coupon Modal ───────────────────────────────────────────────────
  const modal = document.getElementById('coupon-modal');

  document.getElementById('btn-new-coupon').addEventListener('click', () => {
    document.getElementById('input-code').value = '';
    document.getElementById('input-coins').value = '';
    document.getElementById('input-limit').value = '';
    document.getElementById('input-expire').value = '';
    document.getElementById('modal-error').style.display = 'none';
    modal.classList.add('open');
  });

  document.getElementById('btn-cancel-modal').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  document.getElementById('btn-create-coupon').addEventListener('click', async () => {
    const code = document.getElementById('input-code').value.trim().toUpperCase();
    const coins = parseInt(document.getElementById('input-coins').value);
    const limit = parseInt(document.getElementById('input-limit').value);
    const expireAt = document.getElementById('input-expire').value;
    const errEl = document.getElementById('modal-error');

    if (!code || !coins || !limit || !expireAt) {
      errEl.textContent = 'All fields are required.';
      errEl.style.display = '';
      return;
    }

    const res = await apiFetch('/coupons', {
      method: 'POST',
      body: JSON.stringify({ code, coins, limit, expireAt }),
    });

    if (!res.ok) {
      errEl.textContent = res.error || 'Failed to create coupon.';
      errEl.style.display = '';
      return;
    }

    modal.classList.remove('open');
    loadCoupons();
    loadStats();
  });

  // ── Bulk Generate Modal ───────────────────────────────────────────────────
  const bulkModal = document.getElementById('bulk-modal');
  const bulkResultModal = document.getElementById('bulk-result-modal');

  document.getElementById('btn-bulk-coupon').addEventListener('click', () => {
    document.getElementById('bulk-prefix').value = '';
    document.getElementById('bulk-count').value = '';
    document.getElementById('bulk-coins').value = '';
    document.getElementById('bulk-limit').value = '1';
    document.getElementById('bulk-expire').value = '';
    document.getElementById('bulk-error').style.display = 'none';
    bulkModal.classList.add('open');
  });

  document.getElementById('btn-cancel-bulk').addEventListener('click', () => {
    bulkModal.classList.remove('open');
  });

  bulkModal.addEventListener('click', (e) => {
    if (e.target === bulkModal) bulkModal.classList.remove('open');
  });

  document.getElementById('btn-do-bulk').addEventListener('click', async () => {
    const prefix = document.getElementById('bulk-prefix').value.trim().toUpperCase();
    const count = parseInt(document.getElementById('bulk-count').value);
    const coins = parseInt(document.getElementById('bulk-coins').value);
    const limit = parseInt(document.getElementById('bulk-limit').value);
    const expireAt = document.getElementById('bulk-expire').value;
    const errEl = document.getElementById('bulk-error');

    if (!prefix || !count || !coins || !limit || !expireAt) {
      errEl.textContent = 'All fields are required.';
      errEl.style.display = '';
      return;
    }
    if (count > 500) {
      errEl.textContent = 'Max 500 per batch.';
      errEl.style.display = '';
      return;
    }

    const btn = document.getElementById('btn-do-bulk');
    btn.textContent = 'Generating…';
    btn.disabled = true;

    const res = await apiFetch('/coupons/bulk', {
      method: 'POST',
      body: JSON.stringify({ prefix, count, coins, limit, expireAt }),
    });

    btn.textContent = 'Generate';
    btn.disabled = false;

    if (!res.ok) {
      errEl.textContent = res.error || 'Failed.';
      errEl.style.display = '';
      return;
    }

    bulkModal.classList.remove('open');
    document.getElementById('bulk-result-count').textContent = `— ${res.count} codes`;
    document.getElementById('bulk-result-codes').value = res.codes.join('\n');
    bulkResultModal.classList.add('open');
    loadCoupons();
    loadStats();
  });

  document.getElementById('btn-copy-codes').addEventListener('click', () => {
    const ta = document.getElementById('bulk-result-codes');
    navigator.clipboard.writeText(ta.value).then(() => {
      const btn = document.getElementById('btn-copy-codes');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy All'; }, 2000);
    });
  });

  document.getElementById('btn-close-result').addEventListener('click', () => {
    bulkResultModal.classList.remove('open');
  });

  bulkResultModal.addEventListener('click', (e) => {
    if (e.target === bulkResultModal) bulkResultModal.classList.remove('open');
  });

  // ── Refresh ───────────────────────────────────────────────────────────────
  function loadAll() {
    loadStats();
    loadUsers(0);
    loadTransactions(0);
    loadCoupons();
    loadThemes();
  }

  document.getElementById('btn-refresh').addEventListener('click', loadAll);

  // expose for pagination inline handlers
  window.loadUsers = loadUsers;
  window.loadTransactions = loadTransactions;

  // ── Init ──────────────────────────────────────────────────────────────────
  loadAll();
})();
