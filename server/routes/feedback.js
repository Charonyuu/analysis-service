const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');

// POST /api/feedback — public, anyone can submit
router.post('/', async (req, res) => {
  try {
    const { site, email, name, message } = req.body;

    if (!site) return res.status(400).json({ ok: false, error: 'site is required' });
    if (!message || !message.trim()) return res.status(400).json({ ok: false, error: 'message is required' });

    await Feedback.create({
      site: String(site).slice(0, 50),
      email: email ? String(email).slice(0, 200) : '',
      name: name ? String(name).slice(0, 100) : '',
      message: String(message).slice(0, 5000)
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// GET /api/feedback — protected, for dashboard
router.get('/', async (req, res) => {
  try {
    const { site, page, limit } = req.query;
    const match = {};
    if (site) match.site = site;

    const p = parseInt(page) || 0;
    const lim = parseInt(limit) || 20;

    const [items, total] = await Promise.all([
      Feedback.find(match).sort({ createdAt: -1 }).skip(p * lim).limit(lim).lean(),
      Feedback.countDocuments(match)
    ]);

    const unread = await Feedback.countDocuments({ ...match, read: false });

    res.json({ items, total, unread, page: p, pageSize: lim });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// PATCH /api/feedback/:id/read — mark as read
router.patch('/:id/read', async (req, res) => {
  try {
    await Feedback.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// DELETE /api/feedback/:id
router.delete('/:id', async (req, res) => {
  try {
    await Feedback.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal error' });
  }
});

module.exports = router;
