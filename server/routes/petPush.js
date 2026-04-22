/**
 * Pet Push API
 * POST /api/pet-push/send   — 女友推播訊息
 * GET  /api/pet-push/poll   — Mac 輪詢（帶 idle 秒數更新在線狀態）
 * GET  /api/pet-push/status — 查詢男友目前狀態
 * GET  /api/pet-push/ui     — 女友用的網頁 UI
 */
const express = require('express');
const router = express.Router();

const queue = [];
let lastSeen = 0;       // timestamp (ms)
let lastIdleSeconds = 0;

const PUSH_TOKEN = process.env.PET_PUSH_TOKEN || 'worknoti-secret';

function authToken(req, res, next) {
  const token = req.headers['x-push-token'] || req.query.token;
  if (token !== PUSH_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// 發送推播
router.post('/send', authToken, (req, res) => {
  const { type = 'normal', message = '理我一下！', sender = '?' } = req.body;
  if (!['normal', 'royal'].includes(type)) {
    return res.status(400).json({ error: 'type must be normal or royal' });
  }
  queue.push({ type, message, sender, createdAt: Date.now() });
  res.json({ ok: true, queued: queue.length });
});

// Mac 輪詢（同時更新 lastSeen + idleSeconds）
router.get('/poll', authToken, (req, res) => {
  lastSeen = Date.now();
  lastIdleSeconds = parseInt(req.query.idle) || 0;
  const pending = queue.splice(0, queue.length);
  res.json({ pending });
});

// 查詢男友狀態
router.get('/status', authToken, (req, res) => {
  const now = Date.now();
  const msSince = lastSeen ? now - lastSeen : Infinity;

  let status;
  if (msSince > 5 * 60 * 1000) {
    status = 'offline';
  } else if (lastIdleSeconds > 300) {
    status = 'idle';
  } else {
    status = 'active';
  }

  res.json({ lastSeen, idleSeconds: lastIdleSeconds, status });
});

// 網頁 UI
router.get('/ui', (req, res) => {
  const token = req.query.token || '';
  res.send(`<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>叫他理我</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #06060a;
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 20px 48px;
      overflow-x: hidden;
    }

    /* 背景光暈 */
    body::before {
      content: '';
      position: fixed;
      top: -30vh;
      left: 50%;
      transform: translateX(-50%);
      width: 80vw;
      height: 80vw;
      max-width: 560px;
      max-height: 560px;
      background: radial-gradient(circle, rgba(191,90,242,0.12) 0%, transparent 65%);
      pointer-events: none;
    }
    body::after {
      content: '';
      position: fixed;
      bottom: -20vh;
      right: -10vw;
      width: 50vw;
      height: 50vw;
      max-width: 360px;
      background: radial-gradient(circle, rgba(255,55,95,0.08) 0%, transparent 65%);
      pointer-events: none;
    }

    .wrap {
      width: 100%;
      max-width: 360px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      position: relative;
      z-index: 1;
    }

    /* 標題 */
    .hd {
      text-align: center;
      padding: 4px 0 8px;
    }
    .hd-crown {
      display: flex;
      justify-content: center;
      margin-bottom: 10px;
      filter: drop-shadow(0 0 8px rgba(191,90,242,0.6));
    }
    .hd-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #e0aaff, #fff 50%, #ffb3c6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .hd-sub {
      font-size: 12px;
      color: rgba(255,255,255,0.28);
      margin-top: 5px;
      letter-spacing: 0.3px;
    }

    /* 玻璃卡片 */
    .card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 22px;
      padding: 18px 20px;
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
    }

    /* 狀態卡 */
    .status-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .status-icon-wrap {
      position: relative;
      flex-shrink: 0;
    }
    .status-icon {
      width: 50px;
      height: 50px;
      border-radius: 15px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .status-icon svg {
      width: 22px;
      height: 22px;
      stroke: rgba(255,255,255,0.55);
      fill: none;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .dot {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      border: 2px solid #06060a;
      position: absolute;
      bottom: -1px;
      right: -1px;
      transition: background 0.4s, box-shadow 0.4s;
    }
    .dot.active  { background: #34d399; box-shadow: 0 0 0 3px rgba(52,211,153,0.2); }
    .dot.idle    { background: #fbbf24; box-shadow: 0 0 0 3px rgba(251,191,36,0.2); }
    .dot.offline { background: #374151; }
    .dot.active::after {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      background: #34d399;
      opacity: 0.25;
      animation: ping 2.2s ease-in-out infinite;
    }
    @keyframes ping {
      0%,100% { transform: scale(1); opacity: 0.25; }
      50%      { transform: scale(2.2); opacity: 0; }
    }

    .status-meta { flex: 1; min-width: 0; }
    .status-badge {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.28);
      margin-bottom: 4px;
    }
    .status-name {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 3px;
    }
    .status-val {
      font-size: 13px;
      font-weight: 400;
      color: rgba(255,255,255,0.4);
      transition: color 0.4s;
    }
    .status-val.active  { color: #34d399; }
    .status-val.idle    { color: #fbbf24; }

    /* 分隔線 */
    .divider {
      height: 1px;
      background: rgba(255,255,255,0.06);
      margin: 4px 0 14px;
    }

    /* 訊息輸入 */
    .field-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.28);
      margin-bottom: 10px;
    }
    textarea {
      width: 100%;
      min-height: 96px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 14px;
      color: #fff;
      padding: 13px 15px;
      font-size: 15px;
      font-family: inherit;
      line-height: 1.55;
      resize: none;
      outline: none;
      transition: border-color 0.2s;
    }
    textarea::placeholder { color: rgba(255,255,255,0.2); }
    textarea:focus { border-color: rgba(191,90,242,0.45); }

    /* 按鈕 */
    .btn-row {
      display: flex;
      gap: 10px;
      margin-top: 12px;
    }
    .btn {
      flex: 1;
      border: none;
      border-radius: 15px;
      padding: 14px 8px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      letter-spacing: -0.1px;
      transition: filter 0.18s, transform 0.14s, box-shadow 0.18s;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:active:not(:disabled) { transform: scale(0.96); }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; }
    .btn svg { width: 15px; height: 15px; flex-shrink: 0; }

    .btn-msg {
      background: rgba(255,255,255,0.08);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.09);
    }
    .btn-msg:hover:not(:disabled) { background: rgba(255,255,255,0.12); }

    .btn-royal {
      background: linear-gradient(135deg, #bf5af2 0%, #ff375f 100%);
      color: #fff;
      box-shadow: 0 4px 22px rgba(191,90,242,0.3);
    }
    .btn-royal:hover:not(:disabled) {
      filter: brightness(1.08);
      box-shadow: 0 6px 30px rgba(191,90,242,0.48);
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%) translateY(16px);
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(18,18,26,0.92);
      border: 1px solid rgba(255,255,255,0.09);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      padding: 11px 18px;
      border-radius: 100px;
      font-size: 13px;
      font-weight: 500;
      color: #fff;
      opacity: 0;
      pointer-events: none;
      white-space: nowrap;
      z-index: 99;
      transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.34,1.56,0.64,1);
    }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .toast-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

    @media (prefers-reduced-motion: reduce) {
      .dot.active::after, .toast { animation: none; transition: none; }
    }
  </style>
</head>
<body>
  <div class="wrap">

    <div class="hd">
      <div class="hd-crown">
        <svg viewBox="0 0 40 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="24">
          <path d="M2 20 L8 6 L14 14 L20 2 L26 14 L32 6 L38 20 Z" fill="url(#cg)" stroke="none"/>
          <rect x="2" y="21" width="36" height="2.5" rx="1.25" fill="url(#cg)"/>
          <defs>
            <linearGradient id="cg" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#bf5af2"/>
              <stop offset="100%" stop-color="#ff375f"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div class="hd-title">女王指令台</div>
      <div class="hd-sub">陛下有令，臣子必達</div>
    </div>

    <!-- 狀態卡 -->
    <div class="card">
      <div class="status-row">
        <div class="status-icon-wrap">
          <div class="status-icon">
            <svg viewBox="0 0 24 24">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <polyline points="8 21 12 17 16 21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div class="dot offline" id="dot"></div>
        </div>
        <div class="status-meta">
          <div class="status-badge">男友動態</div>
          <div class="status-name">男友的工作電腦</div>
          <div class="status-val" id="statusVal">讀取中...</div>
        </div>
      </div>
    </div>

    <!-- 訊息卡 -->
    <div class="card">
      <div class="field-label">傳送訊息</div>
      <textarea id="msg" placeholder="你再繼續工作試試看..."></textarea>
      <div class="btn-row">
        <button class="btn btn-msg" onclick="send('normal')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          傳訊息
        </button>
        <button class="btn btn-royal" onclick="send('royal')">
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M3 18h18l-2.5-9L14 14l-2-6-2 6-4.5-5L3 18z"/>
            <rect x="3" y="19" width="18" height="2" rx="1"/>
          </svg>
          女王下詔
        </button>
      </div>
    </div>

  </div>

  <div class="toast" id="toast">
    <div class="toast-dot" id="toastDot"></div>
    <span id="toastTxt"></span>
  </div>

  <script>
    const TOKEN = '${token}';

    async function fetchStatus() {
      try {
        const r = await fetch('/api/pet-push/status?token=' + TOKEN);
        if (!r.ok) { updateStatus({ lastSeen: 0, idleSeconds: 0, status: 'offline' }); return; }
        updateStatus(await r.json());
      } catch (_) {
        updateStatus({ lastSeen: 0, idleSeconds: 0, status: 'offline' });
      }
    }

    function updateStatus({ lastSeen, idleSeconds, status }) {
      const dot = document.getElementById('dot');
      const val = document.getElementById('statusVal');
      dot.className = 'dot ' + status;
      if (status === 'active') {
        val.className = 'status-val active';
        val.textContent = '男友使用中';
      } else if (status === 'idle') {
        val.className = 'status-val idle';
        const m = Math.floor(idleSeconds / 60);
        val.textContent = m < 1 ? '男友剛剛還在' : '男友閒置 ' + m + ' 分鐘';
      } else {
        val.className = 'status-val';
        val.textContent = lastSeen ? '男友 ' + ago(Date.now() - lastSeen) + ' 前上線' : '男友尚未上線';
      }
    }

    function ago(ms) {
      const s = Math.floor(ms / 1000);
      if (s < 60)  return s + ' 秒前';
      const m = Math.floor(s / 60);
      if (m < 60)  return m + ' 分鐘前';
      const h = Math.floor(m / 60);
      if (h < 24)  return h + ' 小時前';
      return Math.floor(h / 24) + ' 天前';
    }

    async function send(type) {
      const btns = document.querySelectorAll('.btn');
      btns.forEach(b => b.disabled = true);
      const def = type === 'royal' ? '女友大人詔書\\n聽令' : '理我一下！';
      const msg = document.getElementById('msg').value.trim() || def;
      try {
        const r = await fetch('/api/pet-push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-push-token': TOKEN },
          body: JSON.stringify({ type, message: msg })
        });
        if (r.ok) {
          document.getElementById('msg').value = '';
          toast(type === 'royal' ? '詔書已發出' : '訊息已送出',
                type === 'royal' ? '#bf5af2' : '#34d399');
        } else {
          toast('送出失敗', '#f87171');
        }
      } catch (_) { toast('網路錯誤', '#f87171'); }
      btns.forEach(b => b.disabled = false);
    }

    function toast(msg, color) {
      const el = document.getElementById('toast');
      document.getElementById('toastDot').style.background = color;
      document.getElementById('toastTxt').textContent = msg;
      el.classList.add('show');
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove('show'), 2600);
    }

    fetchStatus();
    setInterval(fetchStatus, 8000);
  </script>
</body>
</html>`);
});

module.exports = router;
