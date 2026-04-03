const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Coupon = require('../models/Coupon');
const CouponUsage = require('../models/CouponUsage');

const PRODUCTS = {
  coins_small: 60,
  coins_big: 210,
};

// POST /iap/verify — iOS StoreKit purchase verification
router.post('/verify', async (req, res) => {
  try {
    const { userId, transactionId, productId } = req.body;

    if (!userId || !transactionId || !productId) {
      return res.status(400).json({ success: false, error: 'MISSING_FIELDS' });
    }

    const coins = PRODUCTS[productId];
    if (coins === undefined) {
      return res.status(400).json({ success: false, error: 'INVALID_PRODUCT' });
    }

    // Idempotency: if already processed, return current coins
    const existing = await Transaction.findById(transactionId);
    if (existing) {
      const user = await User.findById(userId);
      return res.json({ success: true, coins: user ? user.coins : 0 });
    }

    // TODO: verify Apple receipt via App Store Server API before granting coins

    await Transaction.create({ _id: transactionId, userId, productId, coins });

    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { coins } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, coins: user.coins });
  } catch (err) {
    console.error('IAP verify error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /user/:userId — get user coin balance
router.get('/user/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).lean();
    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
    res.json({ userId: user._id, coins: user.coins });
  } catch (err) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /coupon/redeem — redeem a coupon code
router.post('/coupon/redeem', async (req, res) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({ success: false, error: 'MISSING_FIELDS' });
    }

    const upperCode = String(code).toUpperCase().trim();
    const coupon = await Coupon.findOne({ code: upperCode });

    if (!coupon) return res.status(404).json({ success: false, error: 'INVALID_CODE' });
    if (coupon.expireAt < new Date()) return res.status(400).json({ success: false, error: 'EXPIRED' });
    if (coupon.usedCount >= coupon.limit) return res.status(400).json({ success: false, error: 'LIMIT_REACHED' });

    // Check if user already used this code
    const alreadyUsed = await CouponUsage.findOne({ userId, code: upperCode });
    if (alreadyUsed) return res.status(400).json({ success: false, error: 'ALREADY_USED' });

    // Grant coins atomically
    await CouponUsage.create({ userId, code: upperCode });
    await Coupon.updateOne({ code: upperCode }, { $inc: { usedCount: 1 } });

    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { coins: coupon.coins } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, coins: user.coins });
  } catch (err) {
    console.error('Coupon redeem error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
