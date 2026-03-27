function authBearer(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const token = authHeader.slice(7);
  if (token !== process.env.DASHBOARD_SECRET) {
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
  next();
}

module.exports = authBearer;
