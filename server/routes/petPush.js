/**
 * Pet Push API
 * POST /api/pet-push/send  — 女友推播訊息
 * GET  /api/pet-push/poll  — Mac 輪詢待處理訊息
 * GET  /api/pet-push/ui    — 簡單網頁（女友用）
 */
const express = require('express');
const router = express.Router();

// In-memory queue（夠用，重啟清空不影響體驗）
const queue = [];

// 從 .env 取 token，預設 'worknoti-secret'
const PUSH_TOKEN = process.env.PET_PUSH_TOKEN || 'worknoti-secret';

function authToken(req, res, next) {
  const token = req.headers['x-push-token'] || req.query.token;
  if (token !== PUSH_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// 發送推播（女友用）
router.post('/send', authToken, (req, res) => {
  const { type = 'normal', message = '想你了！', sender = '?' } = req.body;
  if (!['normal', 'royal'].includes(type)) {
    return res.status(400).json({ error: 'type must be normal or royal' });
  }
  queue.push({ type, message, sender, createdAt: Date.now() });
  res.json({ ok: true, queued: queue.length });
});

// Mac 輪詢（取出並清空）
router.get('/poll', authToken, (req, res) => {
  const pending = queue.splice(0, queue.length);
  res.json({ pending });
});

// 簡單網頁 UI（女友開這個頁面按按鈕）
router.get('/ui', (req, res) => {
  const token = req.query.token || '';
  res.send(`<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>叫他理我 🐾</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #0f0f0f; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; padding: 24px; }
    h1 { font-size: 1.4rem; opacity: 0.9; }
    .card { background: #1c1c1e; border-radius: 16px; padding: 20px; width: 100%; max-width: 360px; display: flex; flex-direction: column; gap: 12px; }
    label { font-size: 0.8rem; opacity: 0.6; }
    input, textarea, select { background: #2c2c2e; border: none; border-radius: 10px; color: #fff; padding: 12px; font-size: 1rem; width: 100%; outline: none; }
    textarea { height: 80px; resize: none; }
    button { border: none; border-radius: 12px; padding: 14px; font-size: 1rem; font-weight: 600; cursor: pointer; width: 100%; transition: opacity 0.2s; }
    button:active { opacity: 0.7; }
    .btn-normal { background: #0a84ff; color: #fff; }
    .btn-royal  { background: linear-gradient(135deg, #bf5af2, #ff375f); color: #fff; }
    .toast { position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); background: #1c1c1e; border: 1px solid #3a3a3c; padding: 10px 20px; border-radius: 20px; font-size: 0.9rem; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
  </style>
</head>
<body>
  <h1>🐾 叫他理我</h1>
  <div class="card">
    <label>訊息</label>
    <textarea id="msg" placeholder="快來理我！"></textarea>
    <button class="btn-normal" onclick="send('normal')">📨 傳訊息</button>
    <button class="btn-royal"  onclick="send('royal')">👑 女王下詔</button>
  </div>
  <div class="toast" id="toast"></div>
  <script>
    const TOKEN = '${token}';
    async function send(type) {
      const msg = document.getElementById('msg').value.trim() || '理我一下！';
      const r = await fetch('/api/pet-push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-push-token': TOKEN },
        body: JSON.stringify({ type, message: msg })
      });
      const d = await r.json();
      showToast(r.ok ? (type === 'royal' ? '👑 詔書已發出！' : '📨 已送出！') : '❌ 失敗');
    }
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.opacity = 1;
      setTimeout(() => t.style.opacity = 0, 2000);
    }
  </script>
</body>
</html>`);
});

module.exports = router;
