# jahosi

Node.js portfolio website (Express + Tailwind CDN).

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Private contact page

The app now includes a private contact page served at `CONTACT_PAGE_PATH` (default: `/about/staff-contact-9d2f7c`).
It is not linked from the public pages and is marked `noindex`.

Required environment variables for contact form delivery:

- `SMTP_HOST`
- `SMTP_PORT` (usually `587` for STARTTLS or `465` for SSL/TLS)
- `SMTP_SECURE` (`false` for STARTTLS/port 587, `true` for SSL/TLS/port 465)
- `SMTP_USER`
- `SMTP_PASS`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

Optional:

- `CONTACT_PAGE_PATH`
- `CONTACT_TO_EMAIL` (defaults to `jrowson@gmail.com`)
- `CONTACT_FROM_EMAIL`

## SEO and crawler support

The site includes modern crawl/index signals across public pages:

- Canonical URLs (`rel="canonical"`)
- Rich social metadata (Open Graph + Twitter card tags)
- Descriptive page-level meta descriptions
- Explicit robots directives for public pages and noindex on redirect/private pages
- JSON-LD structured data on key pages

Crawler endpoints served by the app:

- `/sitemap.xml` (XML sitemap for public pages)
- `/robots.txt` (crawler rules + sitemap reference)

## Analytics

The app includes a lightweight first-party analytics area at `/analytics/`.
It is designed to be protected outside the app, for example with a Cloudflare Access policy on `/analytics/*`.
No Cloudflare Access credentials or JWT checks are hardwired into Jahosi.

Analytics are stored in SQLite, defaulting to `./data/jahosi.sqlite`.
The tracker records public page `GET` requests only, skips assets/API/health/crawler routes, excludes obvious bot user agents, respects `DNT: 1` by default, stores no IP address, and uses anonymous first-party visitor/session cookies for session and returning-visitor metrics.

Optional environment variables:

- `ANALYTICS_ENABLED` (defaults to `true`; set `false` to disable collection)
- `ANALYTICS_DB_PATH` (defaults to `./data/jahosi.sqlite`)
- `ANALYTICS_RESPECT_DNT` (defaults to `true`)

Dashboard features:

- KPI cards for views, sessions, visitors, engagement, bounce, returning visitors, search/direct split, and pages per session
- Daily trend
- Top pages, landing pages, exit pages
- Sources, referrers, devices, browser/OS, locales
- Recent sessions
- CSV export at `/analytics/export.csv`

For Cloudflare reliability, keep `/analytics/*` uncached and protected by Access.
If Cloudflare later serves cached HTML without touching the origin, origin-side analytics will undercount those pageviews; use a first-party beacon endpoint or Cloudflare edge analytics if exact cached-hit accounting becomes important.

## splash! notes

- `/splash` now supports global location search (country/city/town) for weather auto-fill.
- It uses Open-Meteo geocoding + forecast APIs and loads a location-aware monthly climate profile from public archive data when available.
- The chemistry bot keeps conversation state per browser tab, stores only temporary in-memory history, and now requires a Turnstile check before the first chat message when configured.
- On splash version changes, the client performs a forced cache refresh/reload while preserving saved pool configuration values in local storage.
- Current splash release is v1.8.0 with a first-time-user quick-start overlay, location/geolocation setup, guided pool/heating/tariff/chemistry capture, and direct hand-off to forecast, chemistry, and chatbot resources.
- Chemistry guidance now includes rough product quantity estimates (location/environment aware) with explicit hard/soft water caveats.
- Splash appendices are published at `/splash/appendices.htm` with formulas and validated reference sources.
- Set `SPLASH_OPENAI_API_KEY` in the server `.env`; optional Turnstile and Cloudflare Access values can also live there for the chatbot.
