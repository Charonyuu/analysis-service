function authBearer(req, res, next) {
  // Try Bearer token first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === process.env.DASHBOARD_SECRET) return next();
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
  // Fall back to dashboard cookie
  const cookieToken = req.cookies?.dashboard_token;
  if (cookieToken === process.env.DASHBOARD_SECRET) return next();
  return res.status(401).json({ ok: false, error: 'unauthorized' });
}

module.exports = authBearer;
