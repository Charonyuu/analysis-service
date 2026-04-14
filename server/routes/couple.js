const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const CoupleRelation = require('../models/CoupleRelation');
const UserCoupleProfile = require('../models/UserCoupleProfile');
const PairCode = require('../models/PairCode');

const coupleLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { success: false, error: 'rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false
});

router.use(coupleLimiter);

// MARK: - Haversine distance calculation

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // meters
}

function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  if (meters < 100000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return '不同城市';
}

// MARK: - Generate 6-digit pair code

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/couple/pair-code — Generate a pair code
router.post('/pair-code', async (req, res) => {
  try {
    const { userId, nickname, character } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    // Check if already paired
    const existing = await CoupleRelation.findOne({
      $or: [{ userA: userId }, { userB: userId }],
      isActive: true
    });
    if (existing) {
      return res.status(400).json({ success: false, error: '已有配對關係' });
    }

    // Generate unique code
    let code;
    let attempts = 0;
    do {
      code = generateCode();
      const exists = await PairCode.findOne({ code, used: false, expiresAt: { $gt: new Date() } });
      if (!exists) break;
      attempts++;
    } while (attempts < 10);

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await PairCode.create({
      code,
      userId,
      nickname: nickname || '',
      character: character || 'charon',
      expiresAt
    });

    res.json({ code, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    console.error('[couple] pair-code error:', err.message);
    res.status(500).json({ success: false, error: 'server error' });
  }
});

// POST /api/couple/pair — Pair with a code
router.post('/pair', async (req, res) => {
  try {
    const { userId, code, nickname, character } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ success: false, error: 'userId and code required' });
    }

    // Find valid code
    const pairCode = await PairCode.findOne({
      code,
      used: false,
      expiresAt: { $gt: new Date() }
    });

    if (!pairCode) {
      return res.status(400).json({ success: false, error: '配對碼無效或已過期' });
    }

    // Can't pair with self
    if (pairCode.userId === userId) {
      return res.status(400).json({ success: false, error: '不能和自己配對' });
    }

    // Check if either user already paired
    const existingA = await CoupleRelation.findOne({
      $or: [{ userA: userId }, { userB: userId }],
      isActive: true
    });
    const existingB = await CoupleRelation.findOne({
      $or: [{ userA: pairCode.userId }, { userB: pairCode.userId }],
      isActive: true
    });

    if (existingA || existingB) {
      return res.status(400).json({ success: false, error: '其中一方已有配對' });
    }

    // Mark code as used
    pairCode.used = true;
    await pairCode.save();

    // Create relation
    await CoupleRelation.create({
      userA: pairCode.userId,
      userB: userId,
      userA_nickname: pairCode.nickname || '',
      userB_nickname: nickname || '',
      userA_character: pairCode.character || 'charon',
      userB_character: character || 'mina',
      anniversaryDate: new Date()
    });

    // Create profiles if not exist
    await UserCoupleProfile.findOneAndUpdate(
      { userId: pairCode.userId },
      { $setOnInsert: { userId: pairCode.userId } },
      { upsert: true }
    );
    await UserCoupleProfile.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId } },
      { upsert: true }
    );

    res.json({ success: true, message: '配對成功' });
  } catch (err) {
    console.error('[couple] pair error:', err.message);
    res.status(500).json({ success: false, error: 'server error' });
  }
});

// GET /api/couple/status?userId=xxx — Get couple status
router.get('/status', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ isPaired: false, error: 'userId required' });
    }

    const relation = await CoupleRelation.findOne({
      $or: [{ userA: userId }, { userB: userId }],
      isActive: true
    });

    if (!relation) {
      return res.json({ isPaired: false });
    }

    const isUserA = relation.userA === userId;
    const partnerId = isUserA ? relation.userB : relation.userA;
    const myProfile = await UserCoupleProfile.findOne({ userId });
    const partnerProfile = await UserCoupleProfile.findOne({ userId: partnerId });

    // Calculate distance
    let distanceText = null;
    let lastLocationUpdate = null;

    if (myProfile?.lastLocation?.lat != null && partnerProfile?.lastLocation?.lat != null) {
      const meters = haversineDistance(
        myProfile.lastLocation.lat, myProfile.lastLocation.lon,
        partnerProfile.lastLocation.lat, partnerProfile.lastLocation.lon
      );
      distanceText = formatDistance(meters);
      lastLocationUpdate = partnerProfile.lastLocation.updatedAt?.toISOString() || null;
    }

    // Calculate days together
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysTogether = Math.floor((Date.now() - relation.anniversaryDate.getTime()) / msPerDay);

    res.json({
      isPaired: true,
      partnerNickname: isUserA ? relation.userB_nickname : relation.userA_nickname,
      partnerCharacter: isUserA ? relation.userB_character : relation.userA_character,
      myNickname: isUserA ? relation.userA_nickname : relation.userB_nickname,
      myCharacter: isUserA ? relation.userA_character : relation.userB_character,
      distanceText,
      daysTogether,
      partnerMoodEmoji: partnerProfile?.mood || null,
      partnerMoodMessage: partnerProfile?.message || null,
      anniversaryDate: relation.anniversaryDate.toISOString(),
      lastLocationUpdate
    });
  } catch (err) {
    console.error('[couple] status error:', err.message);
    res.status(500).json({ isPaired: false, error: 'server error' });
  }
});

// POST /api/couple/location — Upload location
router.post('/location', async (req, res) => {
  try {
    const { userId, lat, lon } = req.body;
    if (!userId || lat == null || lon == null) {
      return res.status(400).json({ success: false, error: 'userId, lat, lon required' });
    }

    await UserCoupleProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          'lastLocation.lat': lat,
          'lastLocation.lon': lon,
          'lastLocation.updatedAt': new Date(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[couple] location error:', err.message);
    res.status(500).json({ success: false, error: 'server error' });
  }
});

// POST /api/couple/mood — Set mood
router.post('/mood', async (req, res) => {
  try {
    const { userId, emoji, message } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const trimmedMessage = (message || '').substring(0, 30);

    await UserCoupleProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          mood: emoji || '',
          message: trimmedMessage,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    res.json({ success: true, message: '心情已更新' });
  } catch (err) {
    console.error('[couple] mood error:', err.message);
    res.status(500).json({ success: false, error: 'server error' });
  }
});

// DELETE /api/couple/unpair — Unpair
router.delete('/unpair', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const relation = await CoupleRelation.findOne({
      $or: [{ userA: userId }, { userB: userId }],
      isActive: true
    });

    if (!relation) {
      return res.status(400).json({ success: false, error: '沒有配對關係' });
    }

    relation.isActive = false;
    await relation.save();

    res.json({ success: true, message: '已解除配對' });
  } catch (err) {
    console.error('[couple] unpair error:', err.message);
    res.status(500).json({ success: false, error: 'server error' });
  }
});

module.exports = router;
