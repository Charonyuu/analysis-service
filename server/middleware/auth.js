const jwt = require('jsonwebtoken');

const JWT_SECRET = () => process.env.JWT_SECRET || process.env.DASHBOARD_SECRET;

/**
 * API 用：支援 JWT cookie + Bearer token
 * 失敗回 401
 */
function authBearer(req, res, next) {
  // 1. Try JWT cookie
  const jwtToken = req.cookies?.dashboard_jwt;
  if (jwtToken) {
    try {
      const decoded = jwt.verify(jwtToken, JWT_SECRET());
      req.user = { userId: decoded.userId, username: decoded.username, role: decoded.role };
      return next();
    } catch (e) {
      // JWT invalid, fall through
    }
  }

  // 2. Try Bearer token (backward compat — check DASHBOARD_SECRET)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === process.env.DASHBOARD_SECRET) {
      req.user = { userId: null, username: 'bearer', role: 'admin' };
      return next();
    }
    // Also try JWT in Bearer
    try {
      const decoded = jwt.verify(token, JWT_SECRET());
      req.user = { userId: decoded.userId, username: decoded.username, role: decoded.role };
      return next();
    } catch (e) {
      // invalid
    }
  }

  // 3. Legacy cookie fallback
  const cookieToken = req.cookies?.dashboard_token;
  if (cookieToken === process.env.DASHBOARD_SECRET) {
    req.user = { userId: null, username: 'legacy', role: 'admin' };
    return next();
  }

  return res.status(401).json({ ok: false, error: 'unauthorized' });
}

/**
 * Dashboard 頁面用：JWT cookie only，失敗 redirect to login
 */
function dashboardAuth(req, res, next) {
  const jwtToken = req.cookies?.dashboard_jwt;
  if (jwtToken) {
    try {
      const decoded = jwt.verify(jwtToken, JWT_SECRET());
      req.user = { userId: decoded.userId, username: decoded.username, role: decoded.role };
      return next();
    } catch (e) {
      // invalid JWT
    }
  }

  // Legacy cookie fallback
  const cookieToken = req.cookies?.dashboard_token;
  if (cookieToken === process.env.DASHBOARD_SECRET) {
    req.user = { userId: null, username: 'legacy', role: 'admin' };
    return next();
  }

  return res.redirect('/dashboard/login');
}

/**
 * Role check middleware factory
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ ok: false, error: 'forbidden: requires ' + role + ' role' });
    }
    next();
  };
}

module.exports = { authBearer, dashboardAuth, requireRole };
