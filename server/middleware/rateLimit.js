const rateLimit = require('express-rate-limit');

const collectLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100,
  message: { ok: false, error: 'rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false
});

const statsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  message: { ok: false, error: 'rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { collectLimiter, statsLimiter };
