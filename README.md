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
- `SMTP_PORT` (usually `587`)
- `SMTP_SECURE` (`true` for SSL/TLS port 465, else `false`)
- `SMTP_USER`
- `SMTP_PASS`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

Optional:

- `CONTACT_PAGE_PATH`
- `CONTACT_TO_EMAIL` (defaults to `jrowson@gmail.com`)
- `CONTACT_FROM_EMAIL`
