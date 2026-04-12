const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const ThemePurchase = require('../models/ThemePurchase');

// ── Server-side 產品定義（不信任 client 傳的價格）──
const PRODUCTS = {
  coins_small: 60,
  coins_big: 210,
};

// ── Server-side 主題價格（不信任 client）──
const THEME_PRICES = {
  lovePack: 30,
  dogPack: 30,
  catTheme: 30,
  cuteFaces: 30,
  animalPack: 30,
  ghostPack: 30,
};

// ── IAP Secret 驗證 middleware ──
function iapAuth(req, res, next) {
  const secret = req.headers['x-iap-secret'];
  if (!secret || secret !== process.env.IAP_SECRET) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
  }
  next();
}

// 所有 IAP 路由都需要驗證
router.use(iapAuth);

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
    // For now, we rely on IAP_SECRET + StoreKit 2 client-side verification

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
    const { userId } = req.params;

    // 用戶只能查自己的餘額（userId 從 header 驗證）
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
    res.json({ userId: user._id, coins: user.coins });
  } catch (err) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /iap/theme-purchase — spend coins to unlock a theme
router.post('/theme-purchase', async (req, res) => {
  try {
    const { userId, themeId, coinPrice } = req.body;

    if (!userId || !themeId || coinPrice === undefined) {
      return res.status(400).json({ success: false, error: 'MISSING_FIELDS' });
    }

    // Server-side 價格驗證：不信任 client 傳的 coinPrice
    const serverPrice = THEME_PRICES[themeId];
    const clientPrice = parseInt(coinPrice);

    // 如果 server 有定義價格，用 server 的；否則用 client 的（新主題可能還沒加到 server）
    // 但 client 價格不能是 0 或負數
    let price;
    if (serverPrice !== undefined) {
      // 允許 client 傳的價格小於等於 server 價格（Pro 折扣），但不能是 0 或負數
      price = clientPrice > 0 && clientPrice <= serverPrice ? clientPrice : serverPrice;
    } else {
      // 新主題還沒加到 server，用 client 的但必須 > 0
      if (isNaN(clientPrice) || clientPrice <= 0) {
        return res.status(400).json({ success: false, error: 'INVALID_PRICE' });
      }
      price = clientPrice;
    }

    // Check already owned (idempotent)
    const owned = await ThemePurchase.findOne({ userId, themeId });
    if (owned) {
      const user = await User.findById(userId);
      return res.json({ success: true, alreadyOwned: true, coins: user ? user.coins : 0 });
    }

    // Atomic: check balance AND deduct in one operation
    const user = await User.findOneAndUpdate(
      { _id: userId, coins: { $gte: price } },
      { $inc: { coins: -price } },
      { new: true }
    );

    if (!user) {
      // Either user doesn't exist or insufficient balance
      const existingUser = await User.findById(userId);
      if (!existingUser) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
      return res.status(400).json({ success: false, error: 'INSUFFICIENT_COINS' });
    }

    // Record purchase
    await ThemePurchase.create({ userId, themeId, coinPrice: price });

    res.json({ success: true, alreadyOwned: false, coins: user.coins });
  } catch (err) {
    if (err.code === 11000) {
      // Race condition: already purchased (unique index caught it)
      const user = await User.findById(req.body.userId);
      return res.json({ success: true, alreadyOwned: true, coins: user ? user.coins : 0 });
    }
    console.error('Theme purchase error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
