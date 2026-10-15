# jahosi

Node.js portfolio website (Express + Tailwind CDN).

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Docker deployment

This repo is containerised for the same Traefik + Cloudflare Tunnel pattern as `qglimpse`.
Pushes to `main` deploy to the GitHub `production` environment and serve
`www.jahosi.co.uk`. Pushes to `testing` deploy to the GitHub `testing`
environment and serve `www-test.jahosi.co.uk`.
Pushing a version tag such as `v1.4.0` publishes a versioned GHCR package and
creates a GitHub Release; it does not deploy by itself.

The server must already have an external Docker network named `proxy`, with
Traefik attached to it. The workflow builds and pushes a GHCR image, copies
`docker-compose.yml` and a generated `.env` file over the Cloudflare SSH tunnel,
then runs `docker compose up -d`.

Production is intentionally served by the `www.jahosi.co.uk` endpoint. If the
apex domain should also work, handle it at Cloudflare with a redirect from
`https://jahosi.co.uk/*` to `https://www.jahosi.co.uk/${1}` instead of adding the
apex host to the application container route.

Required GitHub repository/environment secrets used by deployment:

- Repository secrets: `SSH_PRIVATE_KEY`, `CF_ACCESS_CLIENT_ID`,
  `CF_ACCESS_CLIENT_SECRET`
- Environment secrets: `SMTP_USER`, `SMTP_PASS`, `TURNSTILE_SECRET_KEY`
- Optional repository secrets: `GHCR_USERNAME`, `GHCR_TOKEN` if the Debian host
  must authenticate to pull private GHCR images
- Optional environment secrets: `SPLASH_OPENAI_API_KEY`,
  `SPLASH_CF_ACCESS_CLIENT_ID`, `SPLASH_CF_ACCESS_CLIENT_SECRET`

Required GitHub environment variables:

- `SITE_URL`: `https://www.jahosi.co.uk` in `production`,
  `https://www-test.jahosi.co.uk` in `testing`
- `CONTACT_TO_EMAIL`
- `CONTACT_FROM_EMAIL`
- `SMTP_HOST`
- `TURNSTILE_SITE_KEY`

Recommended GitHub environment variables:

- `PORT=3000`
- `HOST=0.0.0.0`
- `NODE_ENV=production`
- `TRUST_PROXY=true`
- `SERVICE_NAME=jahosi`
- `APP_TIMEZONE=Europe/London`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SPLASH_OPENAI_BASE_URL=https://api.openai.com/v1`
- `ANALYTICS_ENABLED=true`
- `ANALYTICS_DB_PATH=./data/jahosi.sqlite`
- `ANALYTICS_RESPECT_DNT=true`

Keep these values in environment variables rather than secrets because they are
non-sensitive runtime configuration. Keep credentials, API keys, service tokens,
SMTP passwords, and Turnstile secrets in secrets.

To create a production release marker after the desired commit is on `main`:

```bash
git tag v1.4.0
git push origin v1.4.0
```

## Private contact page

The app includes a private contact page served at the current `yymmdd` path.
It is marked `noindex`. The contact page URL and form API both use a date-varying `yymmdd` segment, using `APP_TIMEZONE` if set or `Europe/London` by default. For example, the page is `/260915` and the form posts to `/api/contact/260915/submit`. Stale or guessed contact dates return `404`.

Senders can add an optional subject of up to 140 characters, enforced in the form and on the server. Subject text is HTML-escaped and control characters are rejected. Email subjects use `Jahosi: <subject> [Human check: passed (<answer>); Turnstile: passed]`, with check results appended only after server verification.

Required environment variables for contact form delivery:

- `SMTP_HOST`
- `SMTP_PORT` (usually `587` for STARTTLS or `465` for SSL/TLS)
- `SMTP_SECURE` (`false` for STARTTLS/port 587, `true` for SSL/TLS/port 465)
- `SMTP_USER`
- `SMTP_PASS`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

Optional:

- `CONTACT_TO_EMAIL` (defaults to `jrowson@gmail.com`)
- `CONTACT_FROM_EMAIL`
- `APP_TIMEZONE` (defaults to `Europe/London`)

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
