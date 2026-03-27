const cors = require('cors');

function createCorsMiddleware() {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  const allowedPatterns = (process.env.ALLOWED_ORIGIN_PATTERNS || '').split(',').filter(Boolean)
    .map(p => new RegExp('^' + p.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'));
  const port = process.env.PORT || 3000;
  const selfOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];

  return cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (server-to-server, curl, same-origin in some browsers)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || selfOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (allowedPatterns.some(re => re.test(origin))) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true
  });
}

module.exports = createCorsMiddleware;
