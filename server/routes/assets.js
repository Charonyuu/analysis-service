const express = require('express');
const multer = require('multer');
const { uploadToR2 } = require('../services/r2Storage');
const ArtistAsset = require('../models/ArtistAsset');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// ─── POST /api/assets/upload ── Artist 上傳素材到 R2 staging ──────────────────
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Please upload an image file (field: image)' });
    }

    const { type } = req.body; // sticker, background, diy
    if (!type || !['sticker', 'background', 'diy'].includes(type)) {
      return res.status(400).json({ ok: false, error: 'type must be one of: sticker, background, diy' });
    }

    const username = req.user.username;
    const originalName = req.file.originalname;
    const ext = originalName.split('.').pop() || 'png';
    const filename = `${Date.now()}_${originalName}`;
    const r2Key = `stickers/_staging/${username}/${filename}`;

    const r2Url = await uploadToR2(r2Key, req.file.buffer, req.file.mimetype);

    const asset = await ArtistAsset.create({
      artistUsername: username,
      originalName,
      filename,
      type,
      r2Key,
      r2Url,
      status: 'staging',
    });

    res.json({ ok: true, asset });
  } catch (err) {
    console.error('Asset upload error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/assets ── 查詢素材列表 ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const query = {};
    // artist 只能看自己的
    if (req.user.role === 'artist') {
      query.artistUsername = req.user.username;
    }
    // 可選 filter
    if (req.query.status) query.status = req.query.status;
    if (req.query.type) query.type = req.query.type;
    if (req.query.artistUsername && req.user.role === 'admin') {
      query.artistUsername = req.query.artistUsername;
    }

    const assets = await ArtistAsset.find(query).sort({ createdAt: -1 }).limit(200);
    res.json({ ok: true, assets });
  } catch (err) {
    console.error('Asset list error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/assets/staging ── Admin only，查詢所有 staging 素材 ─────────────
router.get('/staging', requireRole('admin'), async (req, res) => {
  try {
    const assets = await ArtistAsset.find({ status: 'staging' }).sort({ createdAt: -1 });
    res.json({ ok: true, assets });
  } catch (err) {
    console.error('Staging list error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /api/assets/:id/status ── Admin only，更新素材狀態 ────────────────
router.patch('/:id/status', requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'status must be approved or rejected' });
    }

    const asset = await ArtistAsset.findByIdAndUpdate(
      req.params.id,
      {
        status,
        reviewedAt: new Date(),
        reviewedBy: req.user.username,
      },
      { new: true }
    );

    if (!asset) {
      return res.status(404).json({ ok: false, error: 'Asset not found' });
    }

    res.json({ ok: true, asset });
  } catch (err) {
    console.error('Asset status update error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
