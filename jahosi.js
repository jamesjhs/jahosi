require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");
const packageJson = require("./package.json");

const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;

const REQUIRED_ENV = [
  "CONTACT_PAGE_PATH",
  "CONTACT_TO_EMAIL",
  "CONTACT_FROM_EMAIL",
  "MATH_SECRET",
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  console.error("Copy .env.example to .env and fill in the values.");
  process.exit(1);
}

const CONTACT_PAGE_PATH = process.env.CONTACT_PAGE_PATH;
const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL;
const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL;
const MATH_SECRET = process.env.MATH_SECRET;
const SERVICE_NAME = process.env.SERVICE_NAME || "jahosi";
const SERVICE_VERSION = process.env.APP_VERSION || packageJson.version;

const MAX_REQUESTS_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MIN_FORM_FILL_MS = 3000;
const MATH_CHALLENGE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_BUCKETS = new Map();

app.use(express.urlencoded({ extended: false }));

const INDEX_HTML_TEMPLATE = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
const INDEX_HTML = INDEX_HTML_TEMPLATE.replace("__CONTACT_PAGE_PATH__", CONTACT_PAGE_PATH);

// index.html is served dynamically so the contact link reflects CONTACT_PAGE_PATH at runtime.
app.get("/", (req, res) => {
  res.send(INDEX_HTML);
});

app.get("/readyz", (req, res) => {
  res.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
  });
});

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

function generateMathChallenge() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const answer = a + b;
  const windowSlot = Math.floor(Date.now() / MATH_CHALLENGE_WINDOW_MS);
  const hmac = crypto
    .createHmac("sha256", MATH_SECRET)
    .update(`${answer}:${windowSlot}`)
    .digest("hex");
  return { a, b, hmac };
}

function verifyMathAnswer(userAnswer, hmac) {
  if (typeof hmac !== "string" || hmac.length !== 64) return false;
  const now = Date.now();
  const windowSlot = Math.floor(now / MATH_CHALLENGE_WINDOW_MS);
  const value = parseInt(userAnswer, 10);
  if (!Number.isFinite(value)) return false;
  for (const w of [windowSlot, windowSlot - 1]) {
    const expected = crypto
      .createHmac("sha256", MATH_SECRET)
      .update(`${value}:${w}`)
      .digest("hex");
    try {
      if (crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hmac, "hex"))) {
        return true;
      }
    } catch {
      // length mismatch — ignore
    }
  }
  return false;
}

function renderContactPage({ status, error, debug, mathChallenge }) {
  const statusMessage =
    status === "sent"
      ? '<div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Thanks. Your message has been sent.</div>'
      : "";
  const debugSuffix = debug
    ? ` <span class="font-mono text-rose-600 opacity-80">[debug: ${escapeHtml(debug)}]</span>`
    : "";
  const errorMessage =
    error === "blocked"
      ? '<div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Your request could not be accepted. Please try again later.</div>'
      : error === "failed"
      ? `<div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">There was a problem sending your message. Please try again.${debugSuffix}</div>`
      : "";

  const captchaUi = mathChallenge
    ? `<div class="mt-2">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold">Human check: what is ${escapeHtml(String(mathChallenge.a))} + ${escapeHtml(String(mathChallenge.b))}?</span>
          <input class="w-32 rounded-lg border border-slate-300 px-3 py-2" type="number" name="mathAnswer" min="1" max="18" required>
          <input type="hidden" name="mathHmac" value="${escapeHtml(mathChallenge.hmac)}">
        </label>
      </div>`
    : '<p class="mt-2 text-sm text-rose-700">Contact form is not configured. Please refresh the page and try again.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Contact Me</title>
  <script src="https://cdn.tailwindcss.com"></script>
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
        <div class="flex items-center gap-3">
          <button class="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700" type="submit">Send</button>
          <a class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:text-slate-900" href="/">Back</a>
        </div>
      </form>
    </section>
  </main>
</body>
</html>`;
}

app.get(CONTACT_PAGE_PATH, (req, res) => {
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  const mathChallenge = generateMathChallenge();
  res.send(
    renderContactPage({
      status: req.query.status,
      error: req.query.error,
      debug: req.query.debug,
      mathChallenge,
    })
  );
});

app.post("/api/contact/submit", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const redirectWithError = (code, debugReason) => {
    const params = new URLSearchParams({ error: code });
    if (debugReason) params.set("debug", debugReason);
    return res.redirect(`${CONTACT_PAGE_PATH}?${params.toString()}`);
  };
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

  const captchaOk = verifyMathAnswer(req.body["mathAnswer"], req.body["mathHmac"]);
  if (!captchaOk) {
    return redirectWithError("blocked");
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || "587");
  const smtpSecure = String(process.env.SMTP_SECURE || "false") === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    const missing = [!smtpHost && "SMTP_HOST", !smtpUser && "SMTP_USER", !smtpPass && "SMTP_PASS"]
      .filter(Boolean)
      .join(", ");
    console.error(`Contact form failed: missing SMTP config (${missing})`);
    return redirectWithError("failed", `missing env: ${missing}`);
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
  } catch (err) {
    console.error("Contact form send failed:", err);
    return redirectWithError("failed", `smtp error: ${err.code || "unknown"}`);
  }
});

app.get("*", (req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Portfolio server running on http://127.0.0.1:${port}`);
  console.log(`Private contact page path: ${CONTACT_PAGE_PATH}`);
});
