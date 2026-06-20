require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const path = require("path");
const packageJson = require("./package.json");

const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;

function normalizeEnvString(value) {
  if (typeof value !== "string") return "";
  let cleaned = value.trim();
  if (
    cleaned.length >= 2 &&
    ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'")))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

function normalizeContactPagePath(value) {
  const cleaned = normalizeEnvString(value);
  if (!cleaned || !cleaned.startsWith("/") || cleaned.startsWith("//") || /[\s"'<>]/.test(cleaned) || cleaned.includes("?") || cleaned.includes("#")) {
    console.error("CONTACT_PAGE_PATH must be a local absolute path such as /about/contact-random-suffix.");
    process.exit(1);
  }
  return cleaned;
}

const REQUIRED_ENV = [
  "CONTACT_PAGE_PATH",
  "CONTACT_TO_EMAIL",
  "CONTACT_FROM_EMAIL",
  "TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  console.error("Copy .env.example to .env and fill in the values.");
  process.exit(1);
}

const CONTACT_PAGE_PATH = normalizeContactPagePath(process.env.CONTACT_PAGE_PATH);
const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL;
const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL;
const SPLASH_OPENAI_API_KEY = process.env.SPLASH_OPENAI_API_KEY || "";
const SPLASH_OPENAI_BASE_URL = (process.env.SPLASH_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
  /\/+$/,
  ""
);
const TURNSTILE_SITE_KEY = normalizeEnvString(process.env.TURNSTILE_SITE_KEY);
const TURNSTILE_SECRET_KEY = normalizeEnvString(process.env.TURNSTILE_SECRET_KEY);
const CF_ACCESS_CLIENT_ID = process.env["CF-Access-Client-Id"] || "";
const CF_ACCESS_CLIENT_SECRET = process.env["CF-Access-Client-Secret"] || "";
const SITE_URL = (process.env.SITE_URL || "https://jahosi.co.uk").replace(/\/+$/, "");
const SERVICE_NAME = process.env.SERVICE_NAME || "jahosi";
const SERVICE_VERSION = process.env.APP_VERSION || packageJson.version;
const SPLASH_OPENAI_HOST = (() => {
  try {
    return new URL(SPLASH_OPENAI_BASE_URL).hostname;
  } catch {
    return "";
  }
})();
const USE_CF_ACCESS_HEADERS =
  Boolean(CF_ACCESS_CLIENT_ID && CF_ACCESS_CLIENT_SECRET) && SPLASH_OPENAI_HOST && SPLASH_OPENAI_HOST !== "api.openai.com";
const CHEM_CHAT_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const CHEM_CHAT_SESSIONS = new Map();
const SITE_HOSTNAME = (() => {
  try {
    return new URL(SITE_URL).hostname.toLowerCase();
  } catch {
    return "";
  }
})();
const REDIRECT_WWW_HOST = SITE_HOSTNAME && !SITE_HOSTNAME.startsWith("www.") ? `www.${SITE_HOSTNAME}` : "";
const SITEMAP_PATHS = [
  "/",
  "/portfolio/hovercraft.html",
  "/portfolio/hamster.html",
  "/portfolio/museum-gallery.html",
  "/portfolio/museum-vms.html",
  "/portfolio/tasker.html",
  "/portfolio/taskit.html",
  "/portfolio/leccy.html",
  "/portfolio/project-ai.html",
  "/portfolio/messaging.html",
  "/portfolio/qglimpse.html",
  "/portfolio/pingme-help.html",
  "/portfolio/socialqa.html",
  "/portfolio/splash.html",
  "/splash/",
  "/splash/help.htm",
  "/splash/appendices.htm",
  "/socialQA/",
  "/socialQA/policy.html",
];

const MAX_REQUESTS_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MIN_FORM_FILL_MS = 3000;
const splashChatRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "rate_limited" });
  },
});
const contactSubmitRateLimit = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: MAX_REQUESTS_PER_WINDOW,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.redirect(`${CONTACT_PAGE_PATH}?error=blocked`);
  },
});
const SPLASH_CHAT_GUIDELINES = [
  "You are a pool assistant for splash!, helping users with general pool problems including water chemistry, heating, water quality, and water colour.",
  "NEVER perform, estimate, or suggest any numerical calculations — no dosing quantities, no formulas, no arithmetic of any kind.",
  "If a user asks how much of any chemical or substance to add (e.g. 'how much chlorine should I add?', 'what quantity of X do I need?'), always respond: 'For dosing quantities, please refer to the manufacturer's guidelines on the product packaging.'",
  "Do not reference or quote any dosing constants, dosing formulas, or volume-based calculations under any circumstances.",
  "You may explain what a chemical does and why it is used, but never how much to use.",
  "Never recommend mixing chemicals directly.",
  "Never recommend unsafe chlorine levels.",
  "If unsure, advise consulting the product manufacturer guidance or a qualified pool technician.",
  "Each browser tab has its own temporary session and conversation history.",
  "Do not suggest saving chats permanently; keep the discussion temporary and in-memory only.",
  "Always include this exact sentence at the end of every answer: Test before and after every addition.",
  "Prefix every answer with: 🤖 General guide — always test first.",
  "If user asks for safety-critical medical or emergency advice, recommend contacting a qualified pool technician.",
  "Reference ranges for context only (do not use these to calculate doses): TA ideal 80-120 ppm, pH ideal 7.4-7.6, FC ideal 2-4 ppm, CYA ideal 40-60 ppm, CC should be < 0.5 ppm.",
  "Keep answers concise and practical, focused on diagnosing problems and explaining what needs to be addressed.",
].join("\n");

const SOCIAL_QA_SOURCES = [
  {
    title: "Care Act 2014",
    organisation: "legislation.gov.uk",
    url: "https://www.legislation.gov.uk/ukpga/2014/23/contents",
    scope: "Primary legislation for adult care and support in England.",
  },
  {
    title: "Care and support statutory guidance",
    organisation: "Department of Health and Social Care / GOV.UK",
    url: "https://www.gov.uk/government/publications/care-act-statutory-guidance/care-and-support-statutory-guidance",
    scope: "Statutory guidance for local authorities under the Care Act 2014.",
  },
  {
    title: "Social care charging for local authorities: 2026 to 2027",
    organisation: "Department of Health and Social Care / GOV.UK",
    url: "https://www.gov.uk/government/publications/social-care-charging-for-local-authorities-2026-to-2027",
    scope: "Current local authority charging circular, capital limits, PEA and related figures.",
  },
  {
    title: "Paying for your own care (self-funding)",
    organisation: "NHS",
    url: "https://www.nhs.uk/social-care-and-support/money-work-and-benefits/paying-for-your-own-care-self-funding/",
    scope: "NHS public guidance on self-funding care and finding specialist care-fees advice.",
  },
  {
    title: "Long-term care",
    organisation: "MoneyHelper",
    url: "https://www.moneyhelper.org.uk/en/family-and-care/long-term-care",
    scope: "Government-backed money guidance on long-term care funding options, deferred payment agreements, equity release, immediate needs annuities and related issues.",
  },
  {
    title: "Help funding care - how to get advice",
    organisation: "MoneyHelper",
    url: "https://www.moneyhelper.org.uk/en/getting-help-and-advice/long-term-care-advice/get-financial-advice-on-how-to-fund-your-long-term-care",
    scope: "Government-backed guidance on specialist care-fees advisers, what to expect, fees, regulation and complaints.",
  },
  {
    title: "FCA Firm Checker",
    organisation: "Financial Conduct Authority",
    url: "https://www.fca.org.uk/consumers/fca-firm-checker",
    scope: "Official FCA tool for checking whether a financial firm is authorised and has permission to provide relevant services.",
  },
  {
    title: "About the Society of Later Life Advisers",
    organisation: "Society of Later Life Advisers",
    url: "https://societyoflaterlifeadvisers.co.uk/about",
    scope: "Recognised later-life adviser accreditation body covering care fees, retirement planning, equity release, tax and estate planning advice areas.",
  },
  {
    title: "National framework for NHS continuing healthcare and NHS-funded nursing care",
    organisation: "Department of Health and Social Care / GOV.UK",
    url: "https://www.gov.uk/government/publications/national-framework-for-nhs-continuing-healthcare-and-nhs-funded-nursing-care",
    scope: "Official CHC and NHS-funded nursing care principles, process and assessment documents.",
  },
  {
    title: "NHS continuing healthcare",
    organisation: "NHS",
    url: "https://www.nhs.uk/social-care-and-support/money-work-and-benefits/nhs-continuing-healthcare/",
    scope: "Plain-English NHS public guidance on CHC.",
  },
  {
    title: "NHS-funded nursing care",
    organisation: "NHS",
    url: "https://www.nhs.uk/social-care-and-support/money-work-and-benefits/nhs-funded-nursing-care/",
    scope: "Plain-English NHS public guidance on funded nursing care.",
  },
  {
    title: "NHS Continuing Healthcare",
    organisation: "NHS England",
    url: "https://www.england.nhs.uk/healthcare/",
    scope: "NHS England public guidance on CHC and the role of integrated care boards.",
  },
  {
    title: "NHS Continuing Healthcare and NHS-funded Nursing Care statistics",
    organisation: "NHS England Digital",
    url: "https://digital.nhs.uk/data-and-information/publications/statistical/nhse-nhs-continuing-healthcare-and-nhs-funded-nursing-care",
    scope: "Official statistics for CHC and NHS-funded nursing care activity in England.",
  },
  {
    title: "Find care services",
    organisation: "Care Quality Commission",
    url: "https://www.cqc.org.uk/care-services",
    scope: "Official care home, nursing home and care provider search with ratings.",
  },
  {
    title: "Using CQC data",
    organisation: "Care Quality Commission",
    url: "https://www.cqc.org.uk/about-us/transparency/using-cqc-data",
    scope: "CQC API and downloadable data for registered services and ratings.",
  },
  {
    title: "Older people with social care needs and multiple long-term conditions",
    organisation: "NICE",
    url: "https://www.nice.org.uk/guidance/ng22/chapter/recommendations",
    scope: "Professional guidance on planning and delivering social care support.",
  },
  {
    title: "Social care",
    organisation: "Office for National Statistics",
    url: "https://www.ons.gov.uk/peoplepopulationandcommunity/healthandsocialcare/socialcare",
    scope: "Official statistics and data publications on social care, including care homes.",
  },
  {
    title: "Attendance Allowance",
    organisation: "GOV.UK",
    url: "https://www.gov.uk/attendance-allowance",
    scope: "Official eligibility, rates and claims guidance for Attendance Allowance.",
  },
  {
    title: "Pension Credit",
    organisation: "GOV.UK",
    url: "https://www.gov.uk/pension-credit",
    scope: "Official Pension Credit eligibility, claims and overview guidance.",
  },
  {
    title: "Make, register or end a lasting power of attorney",
    organisation: "GOV.UK",
    url: "https://www.gov.uk/power-of-attorney",
    scope: "Official guidance on making, registering or ending a lasting power of attorney.",
  },
  {
    title: "Deputies: make decisions for someone who lacks capacity",
    organisation: "GOV.UK",
    url: "https://www.gov.uk/become-deputy",
    scope: "Official guidance on applying to become a deputy for someone who lacks mental capacity.",
  },
  {
    title: "Disabled Facilities Grants",
    organisation: "GOV.UK",
    url: "https://www.gov.uk/disabled-facilities-grants",
    scope: "Official guidance on grants for home adaptations for disabled people.",
  },
  {
    title: "Abuse and neglect of adults at risk",
    organisation: "NHS",
    url: "https://www.nhs.uk/social-care-and-support/help-from-social-services-and-charities/abuse-and-neglect-adults-at-risk/",
    scope: "NHS public guidance on recognising and responding to abuse or neglect of adults at risk.",
  },
  {
    title: "Complaints about health and social care",
    organisation: "Local Government and Social Care Ombudsman",
    url: "https://www.lgo.org.uk/adult-social-care/complaints-about-health-and-social-care",
    scope: "Official route for complaints involving adult social care and joint health/social care issues.",
  },
  {
    title: "How we can help with complaints about continuing healthcare funding",
    organisation: "Parliamentary and Health Service Ombudsman",
    url: "https://www.ombudsman.org.uk/making-complaint/what-we-can-and-cant-help/how-we-can-help-complaints-about-continuing-healthcare-funding",
    scope: "Official route for complaints about NHS continuing healthcare funding.",
  },
];

const SOCIAL_QA_SOURCE_TEXT = SOCIAL_QA_SOURCES.map(
  (source, index) =>
    `${index + 1}. ${source.title} - ${source.organisation}. URL: ${source.url}. Scope: ${source.scope}`
).join("\n");

const SOCIAL_QA_CHAT_GUIDELINES = [
  "You are SocialQA, a plain-English Q&A assistant for people navigating adult social care in England, especially care funding, care homes, nursing homes, NHS Continuing Healthcare, and NHS-funded nursing care.",
  "Source rule: use ONLY the validated sources listed below. Do not use public opinion, popular press, forums, blogs, marketing pages, unverified law firm pages, or memory of uncited facts.",
  "Every user query is headed by this requirement: answer only from robust professional, statutory, official regulator, official data, or official ombudsman sources.",
  "Every answer must include a 'References' section naming the source titles and URLs used.",
  "Use plain text only. Do not use Markdown heading markers such as ###, bold markers such as **, or decorative ASCII formatting.",
  "If the listed sources do not support the answer, say plainly: 'I cannot answer that from the validated sources on this page.' Then suggest which official body or local authority/NHS body the user should contact.",
  "Do not invent rules, thresholds, exceptions, contact details, statistics, dates, figures, eligibility outcomes, or URLs.",
  "Use plain English, short paragraphs, and practical next steps. Explain that this is information, not legal, financial, or medical advice.",
  "If a user enters or appears to enter sensitive personal, medical, financial, safeguarding, identity, account, address, NHS number, National Insurance number, bank, contract, complaint-file, medication, diagnosis, password, or document details, display a clear warning that they should not enter sensitive information. Do not repeat or quote those details back. Explain that SocialQA has no persistent memory beyond the temporary session context, but submitted text is still processed to produce the answer. Provide only general signposting if safe, or ask them to rephrase without sensitive details.",
  "For financial planning, investments, equity release, annuities, tax, estate planning, or regulated financial products, do not give recommendations or product advice. Explain the issue at a high level from the validated sources and signpost to MoneyHelper, the FCA Firm Checker, SOLLA, or a qualified regulated adviser as appropriate.",
  "Reject any request to recommend, choose, compare, rank, endorse, approve, assess suitability of, or predict outcomes for financial products, investments, equity release, annuities, tax plans, estate plans, providers, advisers, care homes, care agencies, hospitals, clinicians, social workers, named people, care packages, funding applications, eligibility decisions, CHC decisions, financial-assessment outcomes, safeguarding decisions, complaint outcomes, appeal outcomes, or whether a user should accept/refuse/sign/pay/move/challenge. When refusing, display a warning that SocialQA cannot make or steer those decisions and must only provide general source-based signposting.",
  "If your draft answer would amount to a recommendation, regulated financial advice, provider recommendation, care assessment, NHS/local authority decision, eligibility prediction, safeguarding decision, legal conclusion, or instruction likely to affect care or finances, stop and replace it with a warning plus neutral signposting to the relevant official body, regulator, ombudsman, MoneyHelper, FCA-authorised adviser, solicitor, local authority, NHS integrated care board, or emergency/safeguarding route.",
  "Be careful about devolution. Unless the user asks otherwise, say the page is focused on England. For Scotland, Wales, or Northern Ireland, explain that rules differ and refer users to the relevant official national body.",
  "Always warn that local variation can significantly affect practical outcomes, and users should check with their own local authority, NHS integrated care board, care provider, regulator, ombudsman, qualified adviser, or professional representative before acting.",
  "Never give opinions, reviews, rankings, endorsements, comparisons, or recommendations about any specific care home, care agency, nursing home, day care centre, hospital, GP surgery, healthcare service, or named person involved in care such as a carer, manager, nurse, GP, social worker, assessor, or clinician.",
  "If asked whether a provider, service, or named person is good, bad, safe, suitable, trustworthy, best, or recommended, do not answer with an opinion. Instead explain how to check official sources such as CQC reports, the provider's own written terms, the relevant local authority or NHS body, and how to seek independent advice.",
  "You may explain how to read official inspection reports, ratings, complaints routes, contracts, fees, and assessment documents, but must not decide which provider or person the user should choose.",
  "For urgent safety, neglect, abuse, or immediate medical risks, advise contacting emergency services, NHS 111/999 as appropriate, the local authority safeguarding team, or the care provider/CQC route as relevant.",
  "Do not recommend paid services or specific providers.",
  "Validated sources:\n" + SOCIAL_QA_SOURCE_TEXT,
].join("\n");

app.use(express.urlencoded({ extended: false }));

const INDEX_HTML_TEMPLATE = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
const INDEX_HTML = INDEX_HTML_TEMPLATE.replaceAll("__CONTACT_PAGE_PATH__", CONTACT_PAGE_PATH);

// index.html is served dynamically so the contact link reflects CONTACT_PAGE_PATH at runtime.
app.get(["/", "/index.html"], (req, res) => {
  setNoCacheHeaders(res);
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

function resolvePublicBaseUrl(req) {
  const forwardedProto = req.get("x-forwarded-proto");
  const protocol = forwardedProto ? forwardedProto.split(",")[0].trim() : req.protocol;
  const host = req.get("host");
  return host ? `${protocol}://${host}` : SITE_URL;
}

function normalizeHostHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function setNoCacheHeaders(res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

function setPublicFileHeaders(res, filePath) {
  const normalizedPath = String(filePath || "").toLowerCase();
  if (
    normalizedPath.endsWith(".html") ||
    normalizedPath.endsWith(".htm") ||
    normalizedPath.endsWith(`${path.sep}splash${path.sep}version.json`)
  ) {
    setNoCacheHeaders(res);
  }
}

app.use((req, res, next) => {
  if (!REDIRECT_WWW_HOST || !SITE_HOSTNAME) return next();
  const requestHost = normalizeHostHeader(req.get("host"));
  if (requestHost !== REDIRECT_WWW_HOST) return next();
  const forwardedProto = req.get("x-forwarded-proto");
  const protocol = forwardedProto ? forwardedProto.split(",")[0].trim() : req.protocol;
  return res.redirect(308, `${protocol}://${SITE_HOSTNAME}${req.originalUrl || "/"}`);
});

app.get("/sitemap.xml", (req, res) => {
  const baseUrl = resolvePublicBaseUrl(req);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAP_PATHS.map((routePath) => `  <url><loc>${baseUrl}${routePath}</loc></url>`).join("\n")}
</urlset>`;
  res.type("application/xml").send(xml);
});

app.get("/robots.txt", (req, res) => {
  const baseUrl = resolvePublicBaseUrl(req);
  const robotsTxt = [
    "User-agent: *",
    "Allow: /",
    `Disallow: ${CONTACT_PAGE_PATH}`,
    "Disallow: /api/contact/submit",
    `Sitemap: ${baseUrl}/sitemap.xml`,
  ].join("\n");
  res.type("text/plain").send(`${robotsTxt}\n`);
});

app.get(/^\/socialQA$/, (req, res) => {
  res.redirect("/socialQA/");
});

app.get("/socialQA/", (req, res) => {
  setNoCacheHeaders(res);
  res.send(renderSocialQaIndexHtml());
});

app.get("/socialQA/index.html", (req, res) => {
  setNoCacheHeaders(res);
  res.send(renderSocialQaIndexHtml());
});

app.get("/socialQA/policy.html", (req, res) => {
  setNoCacheHeaders(res);
  res.send(renderSocialQaPolicyHtml());
});

app.use("/socialQA", express.static(path.join(__dirname, "public", "socialQA"), { index: false, setHeaders: setPublicFileHeaders }));

app.get("/socialQA/local-info", async (req, res) => {
  const postcode = String(req.query.postcode || "").trim().toUpperCase();
  const compactPostcode = postcode.replace(/\s+/g, "");
  const govFindCouncilUrl = "https://www.gov.uk/find-local-council";

  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compactPostcode)) {
    return res.status(400).json({
      error: "invalid_postcode",
      message: "Enter a full UK postcode, for example SW1A 2AA.",
      govFindCouncilUrl,
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const govRes = await fetch(
      `https://www.gov.uk/api/local-authority?postcode=${encodeURIComponent(postcode)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const data = await govRes.json().catch(() => ({}));
    if (!govRes.ok) {
      return res.status(govRes.status).json({
        error: "lookup_failed",
        message: data?.error || "The local authority lookup could not resolve that postcode.",
        govFindCouncilUrl,
      });
    }

    if (Array.isArray(data.addresses)) {
      return res.json({
        postcode,
        ambiguous: true,
        message:
          "This postcode may cross more than one local authority boundary. Use GOV.UK to choose the exact address.",
        addresses: data.addresses.slice(0, 8),
        govFindCouncilUrl,
      });
    }

    const localAuthority = data.local_authority && typeof data.local_authority === "object" ? data.local_authority : null;
    if (!localAuthority) {
      return res.status(404).json({
        error: "not_found",
        message: "No local authority record was returned for that postcode.",
        govFindCouncilUrl,
      });
    }

    const authorities = [localAuthority];
    if (localAuthority.parent && typeof localAuthority.parent === "object") {
      authorities.push(localAuthority.parent);
    }

    return res.json({
      postcode,
      authorities,
      govFindCouncilUrl,
      cqcCareSearchUrl: "https://www.cqc.org.uk/care-services",
      nhsIcbSearchUrl: "https://www.nhs.uk/nhs-services/find-your-local-integrated-care-board/",
      nhsEnglandIcbContactUrl:
        "https://www.england.nhs.uk/contact-us/about-nhs-services/contact-your-local-integrated-care-board-icb/",
    });
  } catch {
    return res.status(502).json({
      error: "lookup_unavailable",
      message: "The postcode lookup is temporarily unavailable.",
      govFindCouncilUrl,
    });
  }
});

app.use(express.static(path.join(__dirname, "public"), { setHeaders: setPublicFileHeaders }));

app.get(/^\/splash$/, (req, res) => {
  res.redirect("/splash/");
});

app.get("/splash/", (req, res) => {
  setNoCacheHeaders(res);
  res.send(renderSplashIndexHtml());
});

app.get("/splash/index.htm", (req, res) => {
  setNoCacheHeaders(res);
  res.send(renderSplashIndexHtml());
});

app.use("/splash", express.static(path.join(__dirname, "public", "splash"), { index: false, setHeaders: setPublicFileHeaders }));

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function isTurnstileEnabled() {
  return Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);
}

function verifyTurnstileToken(token, remoteip) {
  if (!isTurnstileEnabled()) return Promise.resolve(true);
  if (!token) return Promise.resolve(false);

  const params = new URLSearchParams({
    secret: TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (remoteip) params.append("remoteip", remoteip);
  const body = params.toString();

  return new Promise((resolve) => {
    const req = require("https").request(
      {
        hostname: "challenges.cloudflare.com",
        path: "/turnstile/v0/siteverify",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 5000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.success === true);
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}

function pruneChemChatSessions() {
  const now = Date.now();
  for (const [token, entry] of CHEM_CHAT_SESSIONS) {
    if (!entry || now - entry.createdAt > CHEM_CHAT_SESSION_TTL_MS) {
      CHEM_CHAT_SESSIONS.delete(token);
    }
  }
}

function mintChemChatSession() {
  pruneChemChatSessions();
  const token = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  CHEM_CHAT_SESSIONS.set(token, { createdAt: Date.now() });
  return token;
}

function validateChemChatSession(token) {
  if (typeof token !== "string" || !token.trim()) return false;
  pruneChemChatSessions();
  return CHEM_CHAT_SESSIONS.has(token);
}

function chatCompletionHeaders() {
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + SPLASH_OPENAI_API_KEY,
  };
  if (USE_CF_ACCESS_HEADERS) {
    headers["CF-Access-Client-Id"] = CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = CF_ACCESS_CLIENT_SECRET;
  }
  return headers;
}

const SPLASH_INDEX_HTML_TEMPLATE = fs.readFileSync(path.join(__dirname, "public", "splash", "index.htm"), "utf8");
function renderSplashIndexHtml() {
  return SPLASH_INDEX_HTML_TEMPLATE.replace('"__TURNSTILE_SITE_KEY__"', JSON.stringify(TURNSTILE_SITE_KEY));
}

const SOCIAL_QA_INDEX_HTML_TEMPLATE = fs.readFileSync(path.join(__dirname, "public", "socialQA", "index.html"), "utf8");
function renderSocialQaIndexHtml() {
  return SOCIAL_QA_INDEX_HTML_TEMPLATE.replace('"__TURNSTILE_SITE_KEY__"', JSON.stringify(TURNSTILE_SITE_KEY));
}
const SOCIAL_QA_POLICY_HTML_TEMPLATE = fs.readFileSync(path.join(__dirname, "public", "socialQA", "policy.html"), "utf8");
function renderSocialQaPolicyHtml() {
  return SOCIAL_QA_POLICY_HTML_TEMPLATE.replaceAll("__CONTACT_PAGE_PATH__", CONTACT_PAGE_PATH);
}

function normalizeSocialQaReply(reply) {
  return String(reply || "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .trim();
}

function renderContactPage({ status, error, debug }) {
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

  const captchaUi = isTurnstileEnabled()
    ? '<div id="contact-turnstile" class="mt-2 min-h-[65px]"></div><p id="contact-turnstile-note" class="mt-2 text-sm text-slate-600">Complete verification to send your message.</p>'
    : '<p class="mt-2 text-sm text-rose-700">Contact form anti-spam is not configured. Please refresh the page and try again.</p>';
  const turnstileInitScript = isTurnstileEnabled()
    ? `<script>
  (function () {
    const siteKey = ${JSON.stringify(TURNSTILE_SITE_KEY)};
    let renderAttempts = 0;
    const maxRenderAttempts = 40;
    const renderRetryDelayMs = 250;
    const renderTurnstile = () => {
      const container = document.getElementById("contact-turnstile");
      const note = document.getElementById("contact-turnstile-note");
      if (!container || container.dataset.rendered === "1") return;
      if (!window.turnstile || typeof window.turnstile.render !== "function") return;
      window.turnstile.render(container, {
        sitekey: siteKey,
        callback() {
          if (note) note.textContent = "Verification complete.";
        },
        "expired-callback"() {
          if (note) note.textContent = "Verification expired. Please complete it again.";
        },
        "error-callback"(code) {
          if (!note) return;
          note.textContent =
            "Verification could not load (code " +
            String(code || "unknown") +
            "). Ensure this hostname is allowed in Cloudflare Turnstile site key settings.";
        }
      });
      container.dataset.rendered = "1";
    };
    const renderWithRetry = () => {
      renderTurnstile();
      const container = document.getElementById("contact-turnstile");
      if (!container || container.dataset.rendered === "1") return;
      if (renderAttempts >= maxRenderAttempts) return;
      renderAttempts += 1;
      window.setTimeout(renderWithRetry, renderRetryDelayMs);
    };
    if (document.readyState === "complete") {
      renderWithRetry();
    } else {
      window.addEventListener("load", renderWithRetry, { once: true });
    }
    renderWithRetry();
  })();
</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Contact Me</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
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
  ${turnstileInitScript}
</body>
</html>`;
}

app.get(CONTACT_PAGE_PATH, (req, res) => {
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.send(
    renderContactPage({
      status: req.query.status,
      error: req.query.error,
      debug: req.query.debug,
    })
  );
});

app.post("/api/contact/submit", contactSubmitRateLimit, async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const redirectWithError = (code, debugReason) => {
    const params = new URLSearchParams({ error: code });
    if (debugReason) params.set("debug", debugReason);
    return res.redirect(`${CONTACT_PAGE_PATH}?${params.toString()}`);
  };
  const redirectWithStatus = (code) =>
    res.redirect(`${CONTACT_PAGE_PATH}?status=${encodeURIComponent(code)}`);

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

  const turnstileToken = String(req.body["cf-turnstile-response"] || "").trim();
  const turnstileOk = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstileOk) {
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

app.post("/splash/chat", splashChatRateLimit, express.json({ limit: "50kb" }), async (req, res) => {
  if (!SPLASH_OPENAI_API_KEY) {
    return res.status(404).json({ error: "disabled" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const history = Array.isArray(body.history) ? body.history : [];
  const poolState = body.poolState && typeof body.poolState === "object" ? body.poolState : {};
  const chemResults = typeof body.chemResults === "string" ? body.chemResults.trim() : "";
  const chatSessionToken = typeof body.chatSessionToken === "string" ? body.chatSessionToken.trim() : "";
  const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken.trim() : "";
  const remoteip = req.ip || req.socket.remoteAddress || undefined;

  if (!message || message.length > 2000) {
    return res.status(400).json({ error: "invalid_message" });
  }
  if (chemResults.length > 12000) {
    return res.status(400).json({ error: "invalid_chem_results" });
  }

  let resolvedChatSessionToken = chatSessionToken;
  if (isTurnstileEnabled()) {
    if (!validateChemChatSession(resolvedChatSessionToken)) {
      if (!turnstileToken) {
        return res.status(403).json({ error: "turnstile_required" });
      }
      const turnstileOk = await verifyTurnstileToken(turnstileToken, remoteip);
      if (!turnstileOk) {
        return res.status(403).json({ error: "turnstile_failed" });
      }
      resolvedChatSessionToken = mintChemChatSession();
    }
  }

  const allowedStateFields = ["volL", "tempC", "chlorineType", "ta", "ph", "fc", "br", "th", "cya", "tc"];
  const poolStateLines = allowedStateFields.map((field) => {
    const value = poolState[field];
    if (value === null || value === undefined || value === "") return `- ${field}: (not provided)`;
    const printable = String(value).slice(0, 120);
    return `- ${field}: ${printable}`;
  });

  const safeHistory = history
    .slice(-10)
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const role = item.role === "assistant" ? "assistant" : "user";
      const content = String(item.content || "").slice(0, 3000);
      return { role, content };
    })
    .filter((item) => item.content.trim());

  const payloadMessages = [
    {
      role: "system",
      content:
        SPLASH_CHAT_GUIDELINES +
        "\\n\\nCurrent pool state:\\n" +
        poolStateLines.join("\\n") +
        "\\n\\nAuthoritative chemistry card outputs (do not override):\\n" +
        (chemResults || "(none provided)"),
    },
    ...safeHistory,
    { role: "user", content: message },
  ];

  try {
    const llmRes = await fetch(`${SPLASH_OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: chatCompletionHeaders(),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: payloadMessages,
      }),
    });

    if (!llmRes.ok) {
      return res.status(502).json({ error: "upstream_failed" });
    }

    const data = await llmRes.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({ error: "upstream_empty" });
    }
    const response = { reply: reply.trim() };
    if (resolvedChatSessionToken) {
      response.chatSessionToken = resolvedChatSessionToken;
    }
    return res.json(response);
  } catch {
    return res.status(502).json({ error: "upstream_unreachable" });
  }
});

app.post("/socialQA/chat", splashChatRateLimit, express.json({ limit: "50kb" }), async (req, res) => {
  if (!SPLASH_OPENAI_API_KEY) {
    return res.status(404).json({ error: "disabled" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const history = Array.isArray(body.history) ? body.history : [];
  const chatSessionToken = typeof body.chatSessionToken === "string" ? body.chatSessionToken.trim() : "";
  const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken.trim() : "";
  const remoteip = req.ip || req.socket.remoteAddress || undefined;

  if (!message || message.length > 2000) {
    return res.status(400).json({ error: "invalid_message" });
  }

  let resolvedChatSessionToken = chatSessionToken;
  if (isTurnstileEnabled()) {
    if (!validateChemChatSession(resolvedChatSessionToken)) {
      if (!turnstileToken) {
        return res.status(403).json({ error: "turnstile_required" });
      }
      const turnstileOk = await verifyTurnstileToken(turnstileToken, remoteip);
      if (!turnstileOk) {
        return res.status(403).json({ error: "turnstile_failed" });
      }
      resolvedChatSessionToken = mintChemChatSession();
    }
  }

  const safeHistory = history
    .slice(-8)
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const role = item.role === "assistant" ? "assistant" : "user";
      const content = String(item.content || "").slice(0, 2500);
      return { role, content };
    })
    .filter((item) => item.content.trim());

  const payloadMessages = [
    { role: "system", content: SOCIAL_QA_CHAT_GUIDELINES },
    ...safeHistory,
    {
      role: "user",
      content:
        "Requirement: answer only from robust professional, statutory, official regulator, official data, or official ombudsman sources. Include references with URLs. User question: " +
        message,
    },
  ];

  try {
    const llmRes = await fetch(`${SPLASH_OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: chatCompletionHeaders(),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: payloadMessages,
      }),
    });

    if (!llmRes.ok) {
      return res.status(502).json({ error: "upstream_failed" });
    }

    const data = await llmRes.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({ error: "upstream_empty" });
    }
    const response = { reply: normalizeSocialQaReply(reply) };
    if (resolvedChatSessionToken) {
      response.chatSessionToken = resolvedChatSessionToken;
    }
    return res.json(response);
  } catch {
    return res.status(502).json({ error: "upstream_unreachable" });
  }
});

app.get("*", (req, res) => {
  res.status(404).send(INDEX_HTML);
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Portfolio server running on http://127.0.0.1:${port}`);
  console.log(`Private contact page path: ${CONTACT_PAGE_PATH}`);
});
