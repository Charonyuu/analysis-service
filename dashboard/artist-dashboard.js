// Artist Dashboard JS

let currentUser = null;

// --- Init ---
async function init() {
  try {
    const res = await fetch('/dashboard/me', { credentials: 'same-origin' });
    if (!res.ok) {
      window.location.href = '/dashboard/login';
      return;
    }
    currentUser = await res.json();

    // If admin, allow going to main dashboard
    if (currentUser.role === 'admin') {
      // Admin can still view this page, no redirect
    }

    // Show username in sidebar
    const userEl = document.getElementById('sidebar-user');
    if (userEl) {
      userEl.innerHTML = `<span class="name">${currentUser.username}</span>`;
    }

    loadAssets();
  } catch (err) {
    console.error('Init error:', err);
    window.location.href = '/dashboard/login';
  }
}

// --- View switching ---
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const view = link.dataset.view;
    if (!view) return;

    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + view);
    if (target) target.classList.add('active');

    // Update header
    const titles = { assets: 'My Assets', stats: 'My Stats' };
    const subtitles = { assets: 'Upload and manage your assets', stats: 'View your theme pack statistics' };
    document.getElementById('page-title').textContent = titles[view] || '';
    document.getElementById('page-subtitle').textContent = subtitles[view] || '';
  });
});

// --- Upload Zone ---
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    handleFiles(e.dataTransfer.files);
  }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) {
    handleFiles(fileInput.files);
  }
});

async function handleFiles(files) {
  const type = document.getElementById('asset-type').value;
  const statusEl = document.getElementById('upload-status');

  for (const file of files) {
    try {
      statusEl.className = 'upload-status';
      statusEl.style.display = 'none';

      const formData = new FormData();
      formData.append('image', file);
      formData.append('type', type);

      const res = await fetch('/api/assets/upload', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      });
      const data = await res.json();

      if (data.ok) {
        statusEl.textContent = `"${file.name}" uploaded successfully!`;
        statusEl.className = 'upload-status success';
        statusEl.style.display = 'block';
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      statusEl.textContent = `Upload failed: ${err.message}`;
      statusEl.className = 'upload-status error';
      statusEl.style.display = 'block';
    }
  }

  // Reset file input
  fileInput.value = '';
  // Reload assets
  loadAssets();
}

// --- Load Assets ---
async function loadAssets() {
  try {
    const res = await fetch('/api/assets', { credentials: 'same-origin' });
    const data = await res.json();

    const grid = document.getElementById('asset-grid');
    const empty = document.getElementById('empty-assets');

    if (!data.ok || !data.assets || data.assets.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    grid.innerHTML = data.assets.map(asset => `
      <div class="asset-card">
        <img src="${asset.r2Url}" alt="${asset.originalName || asset.filename}" loading="lazy">
        <div class="name" title="${asset.originalName || asset.filename}">${asset.originalName || asset.filename}</div>
        <div class="meta">
          <span class="type-tag">${asset.type}</span>
          <span class="badge badge-${asset.status}">${asset.status}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Load assets error:', err);
  }
}

// --- Start ---
init();
