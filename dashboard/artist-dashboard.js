// Artist Dashboard JS

let currentUser = null;
let allAssets = [];

// --- Theme presets ---
const themePresets = {
  basic:      { background:'#F2F2F7', card:'#FFFFFF', textPrimary:'#000000', textSecondary:'#8E8E93', accent:'#8B6914', buttonForeground:'#FFFFFF' },
  dogPack:    { background:'#F7F5F2', card:'#F0EDE8', textPrimary:'#2C2C2C', textSecondary:'#8A8A8A', accent:'#E8985A', buttonForeground:'#FFFFFF' },
  catTheme:   { background:'#F9FAFB', card:'#E5E7EB', textPrimary:'#1F2937', textSecondary:'#6B7280', accent:'#C4B5FD', buttonForeground:'#FFFFFF' },
  ghostPack:  { background:'#F5F3FF', card:'#EDE9FE', textPrimary:'#1E1B4B', textSecondary:'#6D5DB3', accent:'#8B5CF6', buttonForeground:'#FFFFFF' },
  lovePack:   { background:'#FFF9F5', card:'#FFF1EB', textPrimary:'#4A2C2A', textSecondary:'#A0706C', accent:'#FBCFE8', buttonForeground:'#4A2C2A' },
};

const colorKeys = ['background','card','textPrimary','textSecondary','accent','buttonForeground'];

// --- Init ---
async function init() {
  try {
    const res = await fetch('/dashboard/me', { credentials: 'same-origin' });
    if (!res.ok) {
      window.location.href = '/dashboard/login';
      return;
    }
    currentUser = await res.json();

    const userEl = document.getElementById('sidebar-user');
    if (userEl) {
      userEl.innerHTML = `<span class="name">${currentUser.username}</span>`;
    }

    loadAssets();
    initColorPickers();
    updateWidgetPreview();
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

    const titles = { assets: '我的素材', guide: '素材指南', stats: '我的數據' };
    const subtitles = { assets: '上傳與管理你的素材', guide: '插畫家素材交付規格與範例', stats: '查看你的主題包統計數據' };
    document.getElementById('page-title').textContent = titles[view] || '';
    document.getElementById('page-subtitle').textContent = subtitles[view] || '';
  });
});

// --- Upload Spec Hints ---
const specHints = {
  sticker: '貼圖：透明背景 PNG，200×200 ~ 300×300 px，建議 8-16 張（同時用於 Widget 角色 + DIY 拼貼）',
  background: '背景圖：PNG，450×450 px，建議 3-4 張',
};
const assetTypeSelect = document.getElementById('asset-type');
const specHintEl = document.getElementById('upload-spec-hint');
assetTypeSelect.addEventListener('change', () => {
  specHintEl.textContent = specHints[assetTypeSelect.value] || '';
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
        statusEl.textContent = `「${file.name}」上傳成功！`;
        statusEl.className = 'upload-status success';
        statusEl.style.display = 'block';
      } else {
        throw new Error(data.error || '上傳失敗');
      }
    } catch (err) {
      statusEl.textContent = `上傳失敗：${err.message}`;
      statusEl.className = 'upload-status error';
      statusEl.style.display = 'block';
    }
  }

  fileInput.value = '';
  loadAssets();
}

// --- Load Assets (grouped by type) ---
async function loadAssets() {
  try {
    const res = await fetch('/api/assets', { credentials: 'same-origin' });
    const data = await res.json();

    allAssets = (data.ok && data.assets) ? data.assets : [];

    const groups = { sticker: [], background: [] };
    allAssets.forEach(a => {
      // diy 合併到 sticker
      const t = a.type === 'diy' ? 'sticker' : a.type;
      if (groups[t]) groups[t].push(a);
    });

    const typeLabels = { sticker: '貼圖', background: '背景圖' };
    const statusLabels = { staging: '審核中', approved: '已通過', rejected: '未通過' };

    ['sticker', 'background'].forEach(type => {
      const section = document.getElementById('section-' + type);
      const items = groups[type];
      const label = typeLabels[type];

      let html = `<div class="asset-section-header">
        <h3>${label}</h3>
        <span class="count-badge">${items.length}</span>
      </div>`;

      if (items.length === 0) {
        html += `<div class="empty-section">尚無素材</div>`;
      } else {
        html += `<div class="asset-grid">`;
        items.forEach(asset => {
          html += `<div class="asset-card">
            <img src="${asset.r2Url}" alt="${asset.originalName || asset.filename}" loading="lazy">
            <div class="name" title="${asset.originalName || asset.filename}">${asset.originalName || asset.filename}</div>
            <div class="meta">
              <span class="type-tag">${label}</span>
              <span class="badge badge-${asset.status}">${statusLabels[asset.status] || asset.status}</span>
            </div>
          </div>`;
        });
        html += `</div>`;
      }

      section.innerHTML = html;
    });

    // Update widget preview sticker
    updateWidgetPreview();
  } catch (err) {
    console.error('Load assets error:', err);
  }
}

// --- Color Picker Logic ---
function initColorPickers() {
  colorKeys.forEach(key => {
    const picker = document.getElementById('clr-' + key);
    const hexEl = document.getElementById('hex-' + key);
    if (!picker || !hexEl) return;

    picker.addEventListener('input', () => {
      hexEl.textContent = picker.value.toUpperCase();
      updateWidgetPreview();
    });
  });

  // Theme reference dropdown
  const refSelect = document.getElementById('theme-ref-select');
  refSelect.addEventListener('change', () => {
    const preset = themePresets[refSelect.value];
    if (!preset) return;

    colorKeys.forEach(key => {
      const picker = document.getElementById('clr-' + key);
      const hexEl = document.getElementById('hex-' + key);
      if (picker && hexEl) {
        picker.value = preset[key];
        hexEl.textContent = preset[key].toUpperCase();
      }
    });
    updateWidgetPreview();
  });
}

function getColors() {
  const c = {};
  colorKeys.forEach(key => {
    const picker = document.getElementById('clr-' + key);
    c[key] = picker ? picker.value : '#000000';
  });
  return c;
}

// --- Widget Preview ---
function updateWidgetPreview() {
  const c = getColors();

  // Find first sticker
  const firstSticker = allAssets.find(a => a.type === 'sticker');
  const stickerHtml = firstSticker
    ? `<img class="wm-sticker" src="${firstSticker.r2Url}" alt="sticker">`
    : '';

  // Today's date
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dayNames = ['週日','週一','週二','週三','週四','週五','週六'];
  const dayName = dayNames[now.getDay()];

  // Mood widget — 文字居中，背景用 background 色
  const moodEl = document.getElementById('widget-mood');
  moodEl.style.background = c.background;
  moodEl.style.border = 'none';
  moodEl.innerHTML = `
    <div class="wm-mood-text" style="color:${c.textPrimary}">把握當下的每一刻，讓生活充滿溫暖</div>
    ${stickerHtml}
  `;

  // Weather widget — classic layout，背景用 background 色
  const weatherEl = document.getElementById('widget-weather');
  weatherEl.style.background = c.background;
  weatherEl.style.border = 'none';
  weatherEl.innerHTML = `
    <div class="wm-temp" style="color:${c.textPrimary}">25°</div>
    <div class="wm-condition">
      <span class="wm-condition-icon" style="color:${c.accent}">☀️</span>
      <span style="color:${c.textSecondary}">晴天</span>
    </div>
    <div class="wm-location" style="color:${c.textSecondary}">
      <span class="wm-location-icon">📍</span>
      <span>台北市</span>
    </div>
    ${stickerHtml}
  `;
}

// --- Start ---
init();
