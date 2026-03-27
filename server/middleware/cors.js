const cors = require('cors');

function createCorsMiddleware() {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  // Also allow same-origin requests from the server itself
  const port = process.env.PORT || 3000;
  const selfOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];

  return cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (server-to-server, curl, same-origin in some browsers)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || selfOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true
  });
}

module.exports = createCorsMiddleware;
