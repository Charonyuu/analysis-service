// Role check
fetch('/dashboard/me', { credentials: 'same-origin' })
  .then(r => r.json())
  .then(data => {
    if (data.role === 'artist') {
      window.location.href = '/dashboard/artist-dashboard';
    }
  })
  .catch(() => {});

// ═══ State ═══
let currentFile = null;
let sessionId = null;
let icons = [];
let selectedSet = new Set();

// ═══ DOM ═══
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const btnSplit = document.getElementById('btn-split');
const btnPublish = document.getElementById('btn-publish');
const btnSelectAll = document.getElementById('btn-select-all');
const btnDeselectAll = document.getElementById('btn-deselect-all');
const statusBar = document.getElementById('status-bar');
const statusSpinner = document.getElementById('status-spinner');
const statusMsg = document.getElementById('status-msg');
const originalPreview = document.getElementById('original-preview');
const originalImg = document.getElementById('original-img');
const originalFilename = document.getElementById('original-filename');
const resultsSection = document.getElementById('results-section');
const iconGrid = document.getElementById('icon-grid');
const selectedCount = document.getElementById('selected-count');
const totalCount = document.getElementById('total-count');

// ═══ Upload Zone ═══
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
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    setFile(file);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

function setFile(file) {
  currentFile = file;
  btnSplit.disabled = false;

  // Show original preview
  const url = URL.createObjectURL(file);
  originalImg.src = url;
  originalFilename.textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)';
  originalPreview.style.display = '';

  // Clear previous results
  resultsSection.style.display = 'none';
  iconGrid.innerHTML = '';
  icons = [];
  selectedSet.clear();
  sessionId = null;
}

// ═══ Split ═══
btnSplit.addEventListener('click', doSplit);

async function doSplit() {
  if (!currentFile) return;

  showStatus('loading', 'Splitting sprite sheet...');
  btnSplit.disabled = true;

  const formData = new FormData();
  formData.append('image', currentFile);
  formData.append('grid', document.getElementById('opt-grid').value);
  formData.append('outputSize', document.getElementById('opt-size').value);
  formData.append('paddingRatio', document.getElementById('opt-padding').value);
  formData.append('bgThreshold', document.getElementById('opt-threshold').value);

  try {
    const res = await fetch('/api/icons/split', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Split failed: ' + res.status);
    }

    const data = await res.json();
    sessionId = data.sessionId;
    icons = data.icons;

    // Select all by default
    selectedSet = new Set(icons.map(i => i.index));

    renderGrid();
    resultsSection.style.display = '';
    showStatus('success', `Done! ${icons.length} icons split.`);
  } catch (err) {
    showStatus('error', err.message);
  } finally {
    btnSplit.disabled = false;
  }
}

// ═══ Render Grid ═══
function renderGrid() {
  totalCount.textContent = icons.length;
  updateSelectedCount();

  iconGrid.innerHTML = icons.map(icon => `
    <div class="icon-card ${selectedSet.has(icon.index) ? 'selected' : ''}"
         data-index="${icon.index}">
      <div class="check"></div>
      <img src="${icon.preview}" alt="${icon.name}">
      <input class="icon-name-input" value="${icon.name}"
             data-index="${icon.index}"
             onclick="event.stopPropagation()"
             onchange="renameIcon(${icon.index}, this.value)">
    </div>
  `).join('');

  // Click to toggle selection
  iconGrid.querySelectorAll('.icon-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('icon-name-input')) return;
      const idx = parseInt(card.dataset.index);
      if (selectedSet.has(idx)) {
        selectedSet.delete(idx);
        card.classList.remove('selected');
      } else {
        selectedSet.add(idx);
        card.classList.add('selected');
      }
      updateSelectedCount();
    });
  });
}

function updateSelectedCount() {
  selectedCount.textContent = selectedSet.size;
  btnPublish.disabled = selectedSet.size === 0;
}

// ═══ Rename ═══
async function renameIcon(index, newName) {
  if (!sessionId) return;
  const icon = icons.find(i => i.index === index);
  if (icon) icon.name = newName;

  try {
    await fetch(`/api/icons/session/${sessionId}/rename`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ renames: { [index]: newName } }),
    });
  } catch (err) {
    console.error('Rename failed:', err);
  }
}

// ═══ Select / Deselect All ═══
btnSelectAll.addEventListener('click', () => {
  selectedSet = new Set(icons.map(i => i.index));
  iconGrid.querySelectorAll('.icon-card').forEach(c => c.classList.add('selected'));
  updateSelectedCount();
});

btnDeselectAll.addEventListener('click', () => {
  selectedSet.clear();
  iconGrid.querySelectorAll('.icon-card').forEach(c => c.classList.remove('selected'));
  updateSelectedCount();
});

// ═══ Publish to R2 ═══
btnPublish.addEventListener('click', doPublish);

async function doPublish() {
  if (!sessionId || selectedSet.size === 0) return;

  const prefix = 'staging';

  showStatus('loading', `Publishing ${selectedSet.size} icons to R2...`);
  btnPublish.disabled = true;

  try {
    const res = await fetch(`/api/icons/session/${sessionId}/publish`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedIndexes: [...selectedSet],
        prefix: prefix || 'icons',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Publish failed: ' + res.status);
    }

    const data = await res.json();
    showStatus('success', `Published ${data.uploaded.length} icons to R2!`);
  } catch (err) {
    showStatus('error', err.message);
  } finally {
    btnPublish.disabled = selectedSet.size === 0;
  }
}

// ═══ Status Bar ═══
function showStatus(type, msg) {
  statusBar.className = 'status-bar visible';
  statusSpinner.style.display = 'none';

  if (type === 'loading') {
    statusSpinner.style.display = '';
  } else if (type === 'success') {
    statusBar.classList.add('success');
  } else if (type === 'error') {
    statusBar.classList.add('error');
  }

  statusMsg.textContent = msg;

  if (type !== 'loading') {
    setTimeout(() => {
      statusBar.classList.remove('visible');
    }, 5000);
  }
}
