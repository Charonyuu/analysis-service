# Analytics Service

A self-hosted website analytics service built with Node.js, Express, and MongoDB. Supports tracking multiple websites (travel & icons) with independent data isolation.

## Features

- Pageview tracking with session-based unique visitor counting
- Custom event tracking with metadata
- Dashboard with Chart.js visualizations
- JS SDK with auto-tracking (pageviews, clicks, SPA navigation)
- Per-site data isolation (travel / icons)
- Rate limiting and CORS protection
- IP hashing for privacy

## Quick Start

### Prerequisites

- Node.js >= 18
- MongoDB (local or Atlas)

### Setup

1. Clone the repository and install dependencies:

```bash
cd analytics-service
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
MONGODB_URI=mongodb://localhost:27017/analytics
DASHBOARD_SECRET=your-super-secret-token-change-this
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:3002
PORT=3099
NODE_ENV=development
```

3. Start the server:

```bash
npm start
# or for development with auto-reload:
npm run dev
```

4. Open the dashboard at `http://localhost:3099/dashboard`

## Deploy

### Railway / Fly.io / VPS

1. Set environment variables on your platform:
   - `MONGODB_URI` — your MongoDB connection string (MongoDB Atlas recommended for cloud deploy)
   - `DASHBOARD_SECRET` — a strong random string for dashboard authentication
   - `ALLOWED_ORIGINS` — comma-separated list of allowed origins for CORS
   - `PORT` — the port to listen on (usually set by the platform)
   - `NODE_ENV=production`

2. Start command: `npm start`

3. Update the SDK `apiBase` in `sdk/analytics.travel.js` and `sdk/analytics.icons.js` to point to your deployed URL.

## SDK Usage

### Travel Site

```html
<script src="https://your-analytics-api.com/sdk/analytics.travel.js"></script>

<!-- Auto-track clicks with data attributes -->
<button data-track="click_book_now" data-track-id="hero-cta">Book Now</button>

<!-- Manual tracking -->
<script>
  Analytics.track('click_search', { metadata: { query: 'tokyo' } });
</script>
```

### Icons Site

```html
<script src="https://your-analytics-api.com/sdk/analytics.icons.js"></script>

<button data-track="click_download"
        data-track-id="btn-dl-cat"
        data-track-meta='{"iconName":"cat"}'>
  Download
</button>
```

## API Endpoints

### Collect (public, CORS-protected)

- `POST /api/pageview` — Record a pageview
- `POST /api/event` — Record a custom event

### Stats (requires Bearer token)

- `GET /api/stats/overview` — Overview for both sites
- `GET /api/stats/daily?site=travel&from=&to=` — Daily trend
- `GET /api/stats/top-pages?site=icons&limit=10` — Top pages
- `GET /api/stats/events?site=icons` — Event stats
- `GET /api/stats/recent?site=travel` — Recent 50 items

### Health

- `GET /health` — Health check

## Verification

```bash
npm run check:1   # Phase 1: DB connection & models
npm run check:2   # Phase 2: Collect API
npm run check:3   # Phase 3: Stats API
npm run check:4   # Phase 4: Dashboard & SDK
npm run check:all # Run all checks
```
