require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const createCorsMiddleware = require('./middleware/cors');
const { collectLimiter, statsLimiter } = require('./middleware/rateLimit');
const authBearer = require('./middleware/auth');
const collectRoutes = require('./routes/collect');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Core middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS
app.use(createCorsMiddleware());

// Serve SDK static files
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

// --- Dashboard login ---
app.get('/dashboard/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'login.html'));
});

app.post('/dashboard/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.DASHBOARD_SECRET) {
    res.cookie('dashboard_token', process.env.DASHBOARD_SECRET, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax'
    });
    return res.redirect('/dashboard');
  }
  res.redirect('/dashboard/login?error=1');
});

app.get('/dashboard/logout', (req, res) => {
  res.clearCookie('dashboard_token');
  res.redirect('/dashboard/login?logout=1');
});

// Dashboard auth middleware
function dashboardAuth(req, res, next) {
  const token = req.cookies.dashboard_token;
  if (token === process.env.DASHBOARD_SECRET) {
    return next();
  }
  return res.redirect('/dashboard/login');
}

// Dashboard static files (protected)
app.get('/dashboard', dashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});

app.get('/dashboard/app.js', dashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'app.js'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Analytics service running on port ${PORT}`);
});

module.exports = app;
