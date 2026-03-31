const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { splitSpriteSheet } = require('../services/iconSplitter');
const { uploadToR2, deleteFromR2, listR2Objects } = require('../services/r2Storage');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// Session store（記憶體，1 小時自動清除）
const sessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > 60 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000);

// ─── POST /api/icons/split ── 上傳 sprite sheet，切割後回傳預覽 ─────────────
router.post('/split', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '請上傳圖片檔案 (field name: image)' });
    }

    const options = {
      grid: parseInt(req.body.grid) || 4,
      outputSize: parseInt(req.body.outputSize) || 256,
      paddingRatio: parseFloat(req.body.paddingRatio) || 0.12,
      bgThreshold: parseInt(req.body.bgThreshold) || 240,
      brightThresh: parseInt(req.body.brightThresh) || 220,
      varThresh: parseInt(req.body.varThresh) || 15,
      names: req.body.names ? JSON.parse(req.body.names) : null,
    };

    const result = await splitSpriteSheet(req.file.buffer, options);

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
      createdAt: Date.now(),
      icons: result.icons,
      gridInfo: result.gridInfo,
    });

    // 回傳 base64 預覽
    const previews = result.icons.map(icon => ({
      index: icon.index,
      name: icon.name,
      cropRegion: icon.cropRegion,
      preview: `data:image/png;base64,${icon.buffer.toString('base64')}`,
    }));

    res.json({ sessionId, gridInfo: result.gridInfo, icons: previews });
  } catch (err) {
    console.error('Icon split error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/icons/session/:sessionId ── 取得 session 預覽 ──────────────────
router.get('/session/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session 不存在或已過期' });
  }

  const previews = session.icons.map(icon => ({
    index: icon.index,
    name: icon.name,
    preview: `data:image/png;base64,${icon.buffer.toString('base64')}`,
  }));

  res.json({ icons: previews, gridInfo: session.gridInfo });
});

// ─── PATCH /api/icons/session/:sessionId/rename ── 重命名 icon ───────────────
router.patch('/session/:sessionId/rename', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session 不存在或已過期' });
  }

  const { renames } = req.body; // { 0: "new_name", 3: "another_name" }
  if (!renames || typeof renames !== 'object') {
    return res.status(400).json({ error: 'renames 必須是 { index: newName } 物件' });
  }

  for (const [indexStr, newName] of Object.entries(renames)) {
    const icon = session.icons.find(i => i.index === parseInt(indexStr));
    if (icon) icon.name = newName;
  }

  res.json({ ok: true });
});

// ─── POST /api/icons/session/:sessionId/publish ── 推送選中的 icon 到 R2 ─────
router.post('/session/:sessionId/publish', async (req, res) => {
  try {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session 不存在或已過期' });
    }

    const { selectedIndexes, prefix = 'icons' } = req.body;
    if (!Array.isArray(selectedIndexes)) {
      return res.status(400).json({ error: 'selectedIndexes 必須是陣列，例如 [0, 1, 3]' });
    }

    const uploaded = [];
    for (const idx of selectedIndexes) {
      const icon = session.icons.find(i => i.index === idx);
      if (!icon) continue;

      const key = `${prefix}/${icon.name}.png`;
      const url = await uploadToR2(key, icon.buffer);
      uploaded.push({ index: idx, name: icon.name, key, url });
    }

    res.json({ uploaded });
  } catch (err) {
    console.error('R2 publish error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/icons/session/:sessionId ── 清除 session ────────────────────
router.delete('/session/:sessionId', (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ ok: true });
});

// ─── GET /api/icons/r2 ── 列出 R2 上的 icon ─────────────────────────────────
router.get('/r2', async (req, res) => {
  try {
    const prefix = req.query.prefix || 'icons';
    const objects = await listR2Objects(prefix);
    res.json({ objects });
  } catch (err) {
    console.error('R2 list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/icons/r2/:key ── 從 R2 刪除 icon ───────────────────────────
router.delete('/r2/:key', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    if (!key) return res.status(400).json({ error: '請提供 key' });

    await deleteFromR2(key);
    res.json({ ok: true, deleted: key });
  } catch (err) {
    console.error('R2 delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
