// R2 Assets Dashboard JS

const R2_CDN = 'https://pub-c54e74352c804aeca33e003f2539764c.r2.dev';

// --- Role check ---
fetch('/dashboard/me', { credentials: 'same-origin' })
  .then(r => r.json())
  .then(data => {
    if (data.role === 'artist') {
      window.location.href = '/dashboard/artist-dashboard';
    }
  })
  .catch(() => {});

// --- Tab switching ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('section-' + tab.dataset.section);
    if (target) target.classList.add('active');

    // Lazy load
    if (tab.dataset.section === 'stickers' && !stickersLoaded) loadStickers();
    if (tab.dataset.section === 'staging' && !stagingLoaded) loadStaging();
    if (tab.dataset.section === 'users' && !usersLoaded) loadUsers();
  });
});

// --- Load Themes ---
let themesLoaded = false;
async function loadThemes() {
  try {
    const res = await fetch(`${R2_CDN}/lumee_config/themes.json?t=${Date.now()}`);
    const data = await res.json();
    const themes = data.themes || data || [];

    const grid = document.getElementById('theme-grid');
    const loading = document.getElementById('themes-loading');
    loading.style.display = 'none';

    if (!Array.isArray(themes) || themes.length === 0) {
      grid.innerHTML = '<div class="empty-state">No themes found</div>';
      return;
    }

    grid.innerHTML = themes.map(theme => {
      // colors is an object { background, card, accent, ... }, extract values for swatches
      const colorsObj = theme.colors || {};
      const colorKeys = ['background', 'card', 'textPrimary', 'accent'];
      const colorDots = colorKeys
        .filter(k => colorsObj[k])
        .map(k => `<div class="color-dot" style="background:${colorsObj[k]}" title="${k}: ${colorsObj[k]}"></div>`)
        .join('');
      const price = theme.coinPrice != null ? theme.coinPrice : (theme.price != null ? theme.price : '-');
      const stickerCount = theme.iconStickers?.length || theme.bundledStickerIDs?.length || 0;
      const typeCount = (theme.supportedTypes || []).length;

      return `
        <div class="theme-card">
          <h4>${theme.name || theme.id || 'Unnamed'}</h4>
          <div class="meta">
            <span>ID: ${theme.id || '-'}</span><br>
            <span>Price: ${price === null ? 'Free' : price + ' coins'}</span>
            <span>Stickers: ${stickerCount}</span><br>
            <span>Types: ${typeCount} supported</span>
            ${theme.artistName ? `<br><span>Artist: ${theme.artistName}</span>` : ''}
          </div>
          ${colorDots ? `<div class="color-dots">${colorDots}</div>` : ''}
        </div>
      `;
    }).join('');

    themesLoaded = true;
  } catch (err) {
    console.error('Load themes error:', err);
    document.getElementById('themes-loading').textContent = 'Failed to load themes: ' + err.message;
  }
}

// --- Load Stickers ---
let stickersLoaded = false;
async function loadStickers() {
  try {
    const res = await fetch(`${R2_CDN}/lumee_config/stickers.json?t=${Date.now()}`);
    const data = await res.json();
    const stickers = data.stickers || data || [];

    const grid = document.getElementById('sticker-grid');
    const loading = document.getElementById('stickers-loading');
    loading.style.display = 'none';

    if (!Array.isArray(stickers) || stickers.length === 0) {
      grid.innerHTML = '<div class="empty-state">No stickers found</div>';
      return;
    }

    // stickers are objects with { id, name, category, remoteURL }
    grid.innerHTML = stickers.map(s => {
      const name = typeof s === 'string' ? s : (s.name || s.id || '');
      const url = typeof s === 'string'
        ? `${R2_CDN}/stickers/${s}.png`
        : (s.remoteURL || s.url || `${R2_CDN}/stickers/${s.name || s.id}.png`);
      return `
        <div class="sticker-item">
          <img src="${url}" alt="${name}" loading="lazy" onerror="this.style.opacity='0.3'">
          <div class="label" title="${name}">${name}</div>
        </div>
      `;
    }).join('');

    stickersLoaded = true;
  } catch (err) {
    console.error('Load stickers error:', err);
    document.getElementById('stickers-loading').textContent = 'Failed to load stickers: ' + err.message;
  }
}

// --- Load Staging ---
let stagingLoaded = false;
async function loadStaging() {
  try {
    const res = await fetch('/api/assets/staging', { credentials: 'same-origin' });
    const data = await res.json();

    const grid = document.getElementById('staging-grid');
    const loading = document.getElementById('staging-loading');
    const empty = document.getElementById('staging-empty');
    loading.style.display = 'none';

    if (!data.ok || !data.assets || data.assets.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      stagingLoaded = true;
      return;
    }

    empty.style.display = 'none';
    grid.innerHTML = data.assets.map(asset => `
      <div class="staging-card" id="staging-${asset._id}">
        <img src="${asset.r2Url}" alt="${asset.originalName}" loading="lazy">
        <div class="info" title="${asset.originalName}">${asset.originalName || asset.filename}</div>
        <div class="artist">by ${asset.artistUsername} | ${asset.type}</div>
        <div class="actions">
          <button class="btn btn-approve" onclick="reviewAsset('${asset._id}', 'approved')">Approve</button>
          <button class="btn btn-reject" onclick="reviewAsset('${asset._id}', 'rejected')">Reject</button>
        </div>
      </div>
    `).join('');

    stagingLoaded = true;
  } catch (err) {
    console.error('Load staging error:', err);
    document.getElementById('staging-loading').textContent = 'Failed to load: ' + err.message;
  }
}

async function reviewAsset(id, status) {
  try {
    const res = await fetch(`/api/assets/${id}/status`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (data.ok) {
      // Remove from grid or update badge
      const card = document.getElementById('staging-' + id);
      if (card) {
        card.style.opacity = '0.5';
        card.querySelector('.actions').innerHTML = `<span class="badge badge-${status}">${status}</span>`;
      }
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// --- Load Users ---
let usersLoaded = false;
async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users', { credentials: 'same-origin' });
    const data = await res.json();

    const tbody = document.getElementById('users-tbody');

    if (!data.ok || !data.users || data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#52525b">No users found</td></tr>';
      return;
    }

    tbody.innerHTML = data.users.map(user => `
      <tr>
        <td>${user.username}</td>
        <td>${user.displayName || '-'}</td>
        <td><span class="badge badge-${user.role}">${user.role}</span></td>
        <td style="color:#71717a;font-size:12px">${new Date(user.createdAt).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteUser('${user._id}', '${user.username}')">Delete</button>
        </td>
      </tr>
    `).join('');

    usersLoaded = true;
  } catch (err) {
    console.error('Load users error:', err);
  }
}

async function deleteUser(id, username) {
  if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;
  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const data = await res.json();
    if (data.ok) {
      usersLoaded = false;
      loadUsers();
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// --- Create User ---
document.getElementById('btn-create-user').addEventListener('click', async () => {
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value;
  const displayName = document.getElementById('new-display').value.trim();
  const statusEl = document.getElementById('form-status');

  if (!username || !password) {
    statusEl.textContent = 'Username and password are required';
    statusEl.className = 'form-status error';
    statusEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role, displayName }),
    });
    const data = await res.json();

    if (data.ok) {
      statusEl.textContent = `User "${username}" created successfully!`;
      statusEl.className = 'form-status success';
      statusEl.style.display = 'block';
      document.getElementById('new-username').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('new-display').value = '';
      usersLoaded = false;
      loadUsers();
    } else {
      statusEl.textContent = data.error || 'Failed to create user';
      statusEl.className = 'form-status error';
      statusEl.style.display = 'block';
    }
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'form-status error';
    statusEl.style.display = 'block';
  }
});

// --- Init ---
loadThemes();
