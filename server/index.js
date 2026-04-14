require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
const createCorsMiddleware = require('./middleware/cors');
const { collectLimiter, statsLimiter } = require('./middleware/rateLimit');
const { authBearer, dashboardAuth, requireRole } = require('./middleware/auth');
const collectRoutes = require('./routes/collect');
const statsRoutes = require('./routes/stats');
const feedbackRoutes = require('./routes/feedback');
const iconsRoutes = require('./routes/icons');
const iapRoutes = require('./routes/iap');
const iapAdminRoutes = require('./routes/iapAdmin');
const trendingRoutes = require('./routes/trending');
const coupleRoutes = require('./routes/couple');
const assetsRoutes = require('./routes/assets');
const adminRoutes = require('./routes/admin');
const DashboardUser = require('./models/DashboardUser');
const seedAdmin = require('./services/seedAdmin');
require('./services/cleanupCron');
require('./services/trendingCron');

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = () => process.env.JWT_SECRET || process.env.DASHBOARD_SECRET;

// Connect to MongoDB
connectDB().then(() => {
  seedAdmin();
});

// Core middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS
app.use(createCorsMiddleware());

// Serve SDK
app.use('/sdk', express.static(path.join(__dirname, '..', 'sdk')));

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Collect API (with rate limiting)
app.use('/api', collectLimiter, collectRoutes);

// Stats API (with auth + rate limiting)
app.use('/api/stats', statsLimiter, authBearer, statsRoutes);

// Feedback API (POST is public, GET/PATCH/DELETE require auth)
app.use('/api/feedback', (req, res, next) => {
  if (req.method === 'POST') return collectLimiter(req, res, next);
  authBearer(req, res, next);
}, feedbackRoutes);

// Icons API (全部需要 auth)
app.use('/api/icons', authBearer, iconsRoutes);

// Assets API (auth required)
app.use('/api/assets', authBearer, assetsRoutes);

// Admin API (auth required, role check inside routes)
app.use('/api/admin', authBearer, adminRoutes);

// Trending topics API (public, rate-limited)
app.use('/api/trending', trendingRoutes);

// Couple API (rate-limited, secret check via header)
app.use('/api/couple', coupleRoutes);

// IAP public API — POST /iap/verify, GET /iap/user/:userId, POST /iap/coupon/redeem
app.use('/iap', iapRoutes);

// IAP admin API (auth required)
app.use('/api/iap', authBearer, iapAdminRoutes);

// --- Dashboard login ---
app.get('/dashboard/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'login.html'));
});

app.post('/dashboard/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await DashboardUser.findOne({ username });
    if (!user) return res.redirect('/dashboard/login?error=1');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.redirect('/dashboard/login?error=1');
    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      JWT_SECRET(),
      { expiresIn: '7d' }
    );
    res.cookie('dashboard_jwt', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });
    // Redirect based on role
    if (user.role === 'artist') {
      return res.redirect('/dashboard/artist-dashboard');
    }
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    res.redirect('/dashboard/login?error=1');
  }
});

app.get('/dashboard/logout', (req, res) => {
  res.clearCookie('dashboard_jwt');
  res.clearCookie('dashboard_token');
  res.redirect('/dashboard/login?logout=1');
});

// Dashboard /me API
app.get('/dashboard/me', dashboardAuth, (req, res) => {
  res.json({
    username: req.user.username,
    role: req.user.role,
    userId: req.user.userId,
  });
});

// Admin-only dashboard middleware: dashboardAuth + role check
function dashboardAdminOnly(req, res, next) {
  dashboardAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.redirect('/dashboard/artist-dashboard');
    }
    next();
  });
}

// Dashboard static files (protected)
app.get('/dashboard', dashboardAdminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});

app.get('/dashboard/app.js', dashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'app.js'));
});

// Icon Splitter page (admin only)
app.get('/dashboard/icons', dashboardAdminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'icons.html'));
});

app.get('/dashboard/icons.js', dashboardAdminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'icons.js'));
});

// Coins dashboard page (admin only)
app.get('/dashboard/coins', dashboardAdminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'coins.html'));
});

app.get('/dashboard/coins.js', dashboardAdminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'coins.js'));
});

// Artist Guide page
app.get('/dashboard/artist-guide', dashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'artist-guide.html'));
});

// Artist Dashboard page
app.get('/dashboard/artist-dashboard', dashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'artist-dashboard.html'));
});

app.get('/dashboard/artist-dashboard.js', dashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'artist-dashboard.js'));
});

// R2 Assets page (admin only)
app.get('/dashboard/r2-assets', dashboardAdminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'r2-assets.html'));
});

app.get('/dashboard/r2-assets.js', dashboardAdminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'r2-assets.js'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Analytics service running on port ${PORT}`);
});

module.exports = app;
