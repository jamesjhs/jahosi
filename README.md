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
