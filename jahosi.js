const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

const CONTACT_PAGE_PATH =
  process.env.CONTACT_PAGE_PATH || "/about/staff-contact-9d2f7c";
const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || "jrowson@gmail.com";
const CONTACT_FROM_EMAIL =
  process.env.CONTACT_FROM_EMAIL || "Portfolio Contact <no-reply@localhost>";
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";

const MAX_REQUESTS_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MIN_FORM_FILL_MS = 3000;
const RATE_LIMIT_BUCKETS = new Map();

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isRateLimited(ip) {
  const now = Date.now();
  const existing = RATE_LIMIT_BUCKETS.get(ip) || [];
  const recent = existing.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    RATE_LIMIT_BUCKETS.set(ip, recent);
    return true;
  }

  recent.push(now);
  RATE_LIMIT_BUCKETS.set(ip, recent);
  return false;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

async function verifyTurnstile(token, remoteIp) {
  if (!TURNSTILE_SECRET_KEY) {
    return false;
  }

  const payload = new URLSearchParams({
    secret: TURNSTILE_SECRET_KEY,
    response: token || "",
    remoteip: remoteIp || "",
  });

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString(),
    }
  );

  if (!response.ok) {
    return false;
  }

  const result = await response.json();
  return Boolean(result.success);
}

function renderContactPage({ status, error }) {
  const statusMessage =
    status === "sent"
      ? '<div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Thanks. Your message has been sent.</div>'
      : "";
  const errorMessage =
    error === "blocked"
      ? '<div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Your request could not be accepted. Please try again later.</div>'
      : error === "failed"
      ? '<div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">There was a problem sending your message. Please try again.</div>'
      : "";

  const captchaUi = TURNSTILE_SITE_KEY
    ? `<div class="cf-turnstile mt-2" data-sitekey="${escapeHtml(
        TURNSTILE_SITE_KEY
      )}"></div>`
    : '<p class="mt-2 text-sm text-rose-700">Contact form is not configured yet. CAPTCHA site key is missing.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Contact Me</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <style>
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: linear-gradient(130deg, #f8fafc, #eef2ff);
      color: #0f172a;
    }
  </style>
</head>
<body class="min-h-screen">
  <main class="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
      <h1 class="text-3xl font-bold tracking-tight">Contact Me</h1>
      <p class="mt-2 text-sm text-slate-600">Send a private message.</p>
      <div class="mt-4 space-y-3">${statusMessage}${errorMessage}</div>
      <form class="mt-6 space-y-4" method="post" action="/api/contact/submit" autocomplete="off">
        <input type="hidden" name="submittedAt" value="${Date.now()}">
        <div class="hidden" aria-hidden="true">
          <label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
        </div>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold">Name</span>
          <input class="w-full rounded-lg border border-slate-300 px-3 py-2" type="text" name="name" maxlength="120" required>
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold">Email</span>
          <input class="w-full rounded-lg border border-slate-300 px-3 py-2" type="email" name="email" maxlength="254" required>
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold">Message</span>
          <textarea class="min-h-40 w-full rounded-lg border border-slate-300 px-3 py-2" name="message" maxlength="5000" required></textarea>
        </label>
        ${captchaUi}
        <button class="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700" type="submit">Send</button>
      </form>
    </section>
  </main>
</body>
</html>`;
}

app.get(CONTACT_PAGE_PATH, (req, res) => {
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.send(
    renderContactPage({
      status: req.query.status,
      error: req.query.error,
    })
  );
});

app.post("/api/contact/submit", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const redirectWithError = (code) =>
    res.redirect(`${CONTACT_PAGE_PATH}?error=${encodeURIComponent(code)}`);
  const redirectWithStatus = (code) =>
    res.redirect(`${CONTACT_PAGE_PATH}?status=${encodeURIComponent(code)}`);

  if (isRateLimited(ip)) {
    return redirectWithError("blocked");
  }

  const { name, email, message, website, submittedAt } = req.body;
  const filledAt = Number(submittedAt);

  if (website) {
    return redirectWithStatus("sent");
  }

  if (!Number.isFinite(filledAt) || Date.now() - filledAt < MIN_FORM_FILL_MS) {
    return redirectWithError("blocked");
  }

  if (
    !name ||
    !email ||
    !message ||
    name.length > 120 ||
    email.length > 254 ||
    message.length > 5000 ||
    !isValidEmail(email)
  ) {
    return redirectWithError("blocked");
  }

  const captchaToken = req.body["cf-turnstile-response"];
  const captchaOk = await verifyTurnstile(captchaToken, ip);
  if (!captchaOk) {
    return redirectWithError("blocked");
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || "587");
  const smtpSecure = String(process.env.SMTP_SECURE || "false") === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return redirectWithError("failed");
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: CONTACT_FROM_EMAIL,
      to: CONTACT_TO_EMAIL,
      replyTo: email,
      subject: `Portfolio contact from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    });

    return redirectWithStatus("sent");
  } catch (error) {
    console.error("Contact form send failed:", error);
    return redirectWithError("failed");
  }
});

app.get("*", (req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Portfolio server running on http://127.0.0.1:${port}`);
  console.log(`Private contact page path: ${CONTACT_PAGE_PATH}`);
});
