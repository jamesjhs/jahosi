const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const Database = require("better-sqlite3");

const BASIC_BOT_REGEX = /bot|spider|crawl|slurp|wget|curl|headless|uptime|monitor|python-requests|fetcher|preview|pingdom|ahrefs|semrush|facebookexternalhit/i;
const ANALYTICS_COOKIE = "jahosi_aid";
const ANALYTICS_SESSION_COOKIE = "jahosi_asid";
const DEFAULT_RETENTION_DAYS = 365;
const SESSION_SECONDS = 30 * 60;
const VISITOR_SECONDS = 365 * 24 * 60 * 60;

let db;
let insertEventStmt;
let upsertSessionStmt;
let lastCleanupAt = 0;

function initAnalytics(options = {}) {
  const dbPath = options.dbPath || path.join(__dirname, "data", "jahosi.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
      path TEXT NOT NULL,
      query_string TEXT DEFAULT '',
      referrer TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      device_type TEXT DEFAULT '',
      os_name TEXT DEFAULT '',
      browser_name TEXT DEFAULT '',
      browser_locale TEXT DEFAULT '',
      locale_region TEXT DEFAULT '',
      visitor_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      source TEXT DEFAULT '',
      medium TEXT DEFAULT '',
      campaign TEXT DEFAULT '',
      term TEXT DEFAULT '',
      content TEXT DEFAULT '',
      is_new_visitor INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS analytics_sessions (
      session_id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      event_count INTEGER NOT NULL DEFAULT 1,
      landing_path TEXT NOT NULL DEFAULT '',
      last_path TEXT NOT NULL DEFAULT '',
      source TEXT DEFAULT '',
      medium TEXT DEFAULT '',
      campaign TEXT DEFAULT '',
      term TEXT DEFAULT '',
      content TEXT DEFAULT '',
      device_type TEXT DEFAULT '',
      os_name TEXT DEFAULT '',
      browser_name TEXT DEFAULT '',
      browser_locale TEXT DEFAULT '',
      locale_region TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS analytics_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_events_time ON analytics_events (occurred_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_path ON analytics_events (path);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_source_medium ON analytics_events (source, medium);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events (session_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor ON analytics_events (visitor_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_sessions_started ON analytics_sessions (started_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_seen ON analytics_sessions (last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_sessions_source_medium ON analytics_sessions (source, medium);
    CREATE INDEX IF NOT EXISTS idx_analytics_sessions_visitor ON analytics_sessions (visitor_id);
  `);
  db.prepare("INSERT OR IGNORE INTO analytics_settings (key, value) VALUES (?, ?)").run(
    "retention_days",
    String(DEFAULT_RETENTION_DAYS)
  );

  insertEventStmt = db.prepare(
    `INSERT INTO analytics_events
    (occurred_at, path, query_string, referrer, user_agent, device_type, os_name, browser_name, browser_locale, locale_region, visitor_id, session_id, source, medium, campaign, term, content, is_new_visitor)
    VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  upsertSessionStmt = db.prepare(
    `INSERT INTO analytics_sessions
    (session_id, visitor_id, started_at, last_seen_at, event_count, landing_path, last_path, source, medium, campaign, term, content, device_type, os_name, browser_name, browser_locale, locale_region)
    VALUES (?, ?, datetime('now'), datetime('now'), 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      last_seen_at = datetime('now'),
      event_count = analytics_sessions.event_count + 1,
      last_path = excluded.last_path,
      source = CASE WHEN TRIM(COALESCE(excluded.source, '')) <> '' THEN excluded.source ELSE analytics_sessions.source END,
      medium = CASE WHEN TRIM(COALESCE(excluded.medium, '')) <> '' THEN excluded.medium ELSE analytics_sessions.medium END,
      campaign = CASE WHEN TRIM(COALESCE(excluded.campaign, '')) <> '' THEN excluded.campaign ELSE analytics_sessions.campaign END,
      term = CASE WHEN TRIM(COALESCE(excluded.term, '')) <> '' THEN excluded.term ELSE analytics_sessions.term END,
      content = CASE WHEN TRIM(COALESCE(excluded.content, '')) <> '' THEN excluded.content ELSE analytics_sessions.content END,
      device_type = CASE WHEN TRIM(COALESCE(excluded.device_type, '')) <> '' THEN excluded.device_type ELSE analytics_sessions.device_type END,
      os_name = CASE WHEN TRIM(COALESCE(excluded.os_name, '')) <> '' THEN excluded.os_name ELSE analytics_sessions.os_name END,
      browser_name = CASE WHEN TRIM(COALESCE(excluded.browser_name, '')) <> '' THEN excluded.browser_name ELSE analytics_sessions.browser_name END,
      browser_locale = CASE WHEN TRIM(COALESCE(excluded.browser_locale, '')) <> '' THEN excluded.browser_locale ELSE analytics_sessions.browser_locale END,
      locale_region = CASE WHEN TRIM(COALESCE(excluded.locale_region, '')) <> '' THEN excluded.locale_region ELSE analytics_sessions.locale_region END`
  );

  cleanupOldAnalytics();
  return db;
}

function analyticsTrackingMiddleware(options = {}) {
  const enabled = String(options.enabled ?? "true").toLowerCase() !== "false";
  const siteUrl = String(options.siteUrl || "").replace(/\/+$/, "");
  const respectDnt = String(options.respectDnt ?? "true").toLowerCase() !== "false";
  if (!enabled) return (_req, _res, next) => next();

  return (req, res, next) => {
    if (!db || !shouldTrack(req)) return next();
    if (respectDnt && String(req.get("dnt") || "") === "1") return next();

    const userAgent = clip(req.headers["user-agent"], 512);
    if (BASIC_BOT_REGEX.test(userAgent)) return next();

    const cookies = parseCookies(req.headers.cookie || "");
    const hadVisitorCookie = Boolean(String(cookies[ANALYTICS_COOKIE] || "").trim());
    const visitorId = ensureCookie(req, res, ANALYTICS_COOKIE, VISITOR_SECONDS);
    const sessionId = ensureCookie(req, res, ANALYTICS_SESSION_COOKIE, SESSION_SECONDS);
    const pathOnly = clip(req.path || "/", 255);
    const queryString = clip(extractQuery(req.originalUrl || ""), 2048);
    const referrer = clip(req.headers.referer, 2048);
    const attribution = deriveAttribution(req, referrer, siteUrl);
    const device = detectDevice(userAgent);
    const locale = detectLocale(req.headers["accept-language"]);

    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      try {
        maybeCleanupAnalytics();
        insertEventStmt.run(
          pathOnly,
          queryString,
          referrer,
          userAgent,
          device.type,
          device.os,
          device.browser,
          locale.locale,
          locale.region,
          visitorId,
          sessionId,
          attribution.source,
          attribution.medium,
          attribution.campaign,
          attribution.term,
          attribution.content,
          hadVisitorCookie ? 0 : 1
        );
        upsertSessionStmt.run(
          sessionId,
          visitorId,
          pathOnly,
          pathOnly,
          attribution.source,
          attribution.medium,
          attribution.campaign,
          attribution.term,
          attribution.content,
          device.type,
          device.os,
          device.browser,
          locale.locale,
          locale.region
        );
      } catch (err) {
        console.error("Analytics insert failed:", err);
      }
    });

    return next();
  };
}

function registerAnalyticsRoutes(app) {
  app.get(/^\/analytics$/, (_req, res) => res.redirect("/analytics/"));

  app.get("/analytics/export.csv", (req, res) => {
    const range = parseRange(req.query || {});
    const filters = parseFilters(req.query || {});
    const where = buildEventWhereClause(range, filters);
    const rows = db
      .prepare(
        `SELECT occurred_at, path, query_string, source, medium, campaign, referrer, device_type, os_name, browser_name, browser_locale, locale_region
         FROM analytics_events e
         ${where.sql}
         ORDER BY occurred_at DESC
         LIMIT 10000`
      )
      .all(...where.params);
    const csv = toCsv(rows);
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="jahosi-analytics-${range.startDate}-to-${range.endDate}.csv"`);
    res.send(csv);
  });

  app.get("/analytics/", (req, res) => {
    setPrivateNoCache(res);
    res.send(renderAnalyticsDashboard(req));
  });
}

function renderAnalyticsDashboard(req) {
  const range = parseRange(req.query || {});
  const filters = parseFilters(req.query || {});
  const eventWhere = buildEventWhereClause(range, filters);
  const sessionWhere = buildSessionWhereClause(range, filters);
  const sessionDurationExpr = durationSecondsSql("s.started_at", "s.last_seen_at");
  const retentionDays = getRetentionDays();

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS views,
         COUNT(DISTINCT e.session_id) AS sessions,
         COUNT(DISTINCT e.visitor_id) AS visitors,
         SUM(CASE WHEN e.is_new_visitor = 1 THEN 1 ELSE 0 END) AS new_visits
       FROM analytics_events e
       ${eventWhere.sql}`
    )
    .get(...eventWhere.params);

  const sessionKpi = db
    .prepare(
      `SELECT
         COUNT(*) AS sessions,
         SUM(CASE WHEN event_count = 1 THEN 1 ELSE 0 END) AS single_page_sessions,
         AVG(CAST(event_count AS REAL)) AS avg_events_per_session,
         AVG(${sessionDurationExpr}) AS avg_session_seconds,
         SUM(CASE WHEN event_count >= 2 OR ${sessionDurationExpr} >= 10 THEN 1 ELSE 0 END) AS engaged_sessions,
         SUM(CASE WHEN LOWER(COALESCE(medium, '')) = 'organic' THEN 1 ELSE 0 END) AS organic_sessions,
         SUM(CASE WHEN LOWER(COALESCE(medium, '')) IN ('(none)', 'none') OR LOWER(COALESCE(source, '')) = '(direct)' THEN 1 ELSE 0 END) AS direct_sessions
       FROM analytics_sessions s
       ${sessionWhere.sql}`
    )
    .get(...sessionWhere.params);

  const visitorKpi = db
    .prepare(
      `SELECT
         COUNT(DISTINCT s.visitor_id) AS visitors,
         COUNT(DISTINCT CASE
           WHEN EXISTS (
             SELECT 1
             FROM analytics_sessions prev
             WHERE prev.visitor_id = s.visitor_id
               AND prev.started_at < ?
           ) THEN s.visitor_id
           ELSE NULL
         END) AS returning_visitors
       FROM analytics_sessions s
       ${sessionWhere.sql}`
    )
    .get(range.startTs, ...sessionWhere.params);

  const trendRows = db
    .prepare(
      `SELECT
         strftime('%Y-%m-%d', e.occurred_at) AS bucket,
         COUNT(*) AS views,
         COUNT(DISTINCT e.session_id) AS sessions,
         COUNT(DISTINCT e.visitor_id) AS visitors
       FROM analytics_events e
       ${eventWhere.sql}
       GROUP BY bucket
       ORDER BY bucket DESC
       LIMIT 45`
    )
    .all(...eventWhere.params);

  const pagesRows = queryGroupedRows(
    `e.path`,
    `e.path AS path, COUNT(*) AS views, COUNT(DISTINCT e.session_id) AS sessions, COUNT(DISTINCT e.visitor_id) AS visitors`,
    `analytics_events e`,
    eventWhere,
    `views DESC, e.path ASC`,
    20
  );
  const landingRows = queryGroupedRows(
    `s.landing_path`,
    `s.landing_path AS path, COUNT(*) AS sessions, COUNT(DISTINCT s.visitor_id) AS visitors`,
    `analytics_sessions s`,
    sessionWhere,
    `sessions DESC, s.landing_path ASC`,
    20
  );
  const exitRows = queryGroupedRows(
    `s.last_path`,
    `s.last_path AS path, COUNT(*) AS exits`,
    `analytics_sessions s`,
    sessionWhere,
    `exits DESC, s.last_path ASC`,
    20
  );
  const sourceRows = queryGroupedRows(
    `e.source, e.medium, e.campaign`,
    `e.source, e.medium, e.campaign, COUNT(*) AS views, COUNT(DISTINCT e.session_id) AS sessions, COUNT(DISTINCT e.visitor_id) AS visitors`,
    `analytics_events e`,
    eventWhere,
    `views DESC, e.source ASC`,
    20
  );
  const referrerRows = db
    .prepare(
      `SELECT e.referrer, COUNT(*) AS views, COUNT(DISTINCT e.session_id) AS sessions
       FROM analytics_events e
       ${appendWhere(eventWhere, "TRIM(COALESCE(e.referrer, '')) <> ''")}
       GROUP BY e.referrer
       ORDER BY views DESC
       LIMIT 20`
    )
    .all(...eventWhere.params);
  const deviceRows = queryGroupedRows(
    `e.device_type, e.os_name, e.browser_name`,
    `e.device_type, e.os_name, e.browser_name, COUNT(*) AS views, COUNT(DISTINCT e.session_id) AS sessions, COUNT(DISTINCT e.visitor_id) AS visitors`,
    `analytics_events e`,
    eventWhere,
    `views DESC, e.device_type ASC`,
    24
  );
  const localeRows = queryGroupedRows(
    `e.browser_locale, e.locale_region`,
    `e.browser_locale, e.locale_region, COUNT(*) AS views, COUNT(DISTINCT e.session_id) AS sessions, COUNT(DISTINCT e.visitor_id) AS visitors`,
    `analytics_events e`,
    eventWhere,
    `views DESC, e.browser_locale ASC`,
    20
  );
  const recentSessions = db
    .prepare(
      `SELECT s.started_at, s.last_seen_at, s.event_count, s.landing_path, s.last_path, s.source, s.medium, s.device_type, s.os_name, s.browser_name,
              ${sessionDurationExpr} AS duration_seconds
       FROM analytics_sessions s
       ${sessionWhere.sql}
       ORDER BY s.started_at DESC
       LIMIT 30`
    )
    .all(...sessionWhere.params);

  const views = number(totals.views);
  const sessions = number(sessionKpi.sessions);
  const visitors = number(totals.visitors);
  const avgSessionSeconds = number(sessionKpi.avg_session_seconds);
  const bounceRate = sessions ? number(sessionKpi.single_page_sessions) / sessions : 0;
  const returningVisitorRate = number(visitorKpi.visitors)
    ? number(visitorKpi.returning_visitors) / number(visitorKpi.visitors)
    : 0;
  const engagedRate = sessions ? number(sessionKpi.engaged_sessions) / sessions : 0;

  const maxTrendViews = Math.max(1, ...trendRows.map((row) => number(row.views)));
  const exportUrl = `/analytics/export.csv?${buildQuery(range, filters)}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Jahosi Analytics</title>
  <style>${analyticsCss()}</style>
</head>
<body>
  <header class="topbar">
    <a href="/" class="brand">Jahosi</a>
    <nav>
      <a href="/analytics/">Analytics</a>
      <a href="${escapeAttr(exportUrl)}">CSV</a>
    </nav>
  </header>
  <main class="shell">
    <section class="hero">
      <div>
        <p class="eyebrow">First-party visitor analytics</p>
        <h1>Analytics</h1>
        <p class="lede">Built from the JHS-CMS analytics model and aligned to common web analytics questions: acquisition, engagement, content performance, device fit, exits, and returning interest.</p>
      </div>
      <dl class="heroMeta">
        <div><dt>Range</dt><dd>${escapeHtml(range.startDate)} to ${escapeHtml(range.endDate)}</dd></div>
        <div><dt>Retention</dt><dd>${formatNumber(retentionDays)} days</dd></div>
        <div><dt>Collection</dt><dd>Origin page requests</dd></div>
      </dl>
    </section>

    <form class="filters" method="get" action="/analytics/">
      <label>Preset
        <select name="preset">
          ${presetOption(range, 7, "Last 7 days")}
          ${presetOption(range, 30, "Last 30 days")}
          ${presetOption(range, 90, "Last 90 days")}
          ${presetOption(range, 365, "Last year")}
        </select>
      </label>
      <label>Start <input type="date" name="start" value="${escapeAttr(range.mode === "custom" ? range.startDate : "")}"></label>
      <label>End <input type="date" name="end" value="${escapeAttr(range.mode === "custom" ? range.endDate : "")}"></label>
      <label>Path <input name="path" value="${escapeAttr(filters.path)}" placeholder="/portfolio/"></label>
      <label>Source <input name="source" value="${escapeAttr(filters.source)}" placeholder="google / direct"></label>
      <label>Medium <input name="medium" value="${escapeAttr(filters.medium)}" placeholder="organic / referral"></label>
      <label>Device
        <select name="device">
          <option value="">All</option>
          ${selectOption(filters.device, "desktop")}
          ${selectOption(filters.device, "mobile")}
          ${selectOption(filters.device, "tablet")}
          ${selectOption(filters.device, "unknown")}
        </select>
      </label>
      <div class="filterActions">
        <button type="submit">Apply</button>
        <a href="/analytics/?preset=30">Reset</a>
      </div>
    </form>

    <section class="questionGrid" aria-label="Analytics questions">
      ${questionCard("How many people visited?", formatNumber(visitors), `${formatNumber(views)} views from ${formatNumber(sessions)} sessions`)}
      ${questionCard("Are visitors engaging?", formatPercent(engagedRate), `${formatDuration(avgSessionSeconds)} average session time`)}
      ${questionCard("Do they leave quickly?", formatPercent(bounceRate), `${formatNumber(sessionKpi.single_page_sessions)} single-page sessions`)}
      ${questionCard("Do they come back?", formatPercent(returningVisitorRate), `${formatNumber(visitorKpi.returning_visitors)} returning visitors`)}
      ${questionCard("Search contribution", formatShare(sessionKpi.organic_sessions, sessions), `${formatShare(sessionKpi.direct_sessions, sessions)} direct sessions`)}
      ${questionCard("Pages per session", formatNumber(number(sessionKpi.avg_events_per_session)), `Common content-depth signal`)}
    </section>

    <section class="panel">
      <div class="panelHead">
        <div>
          <h2>Daily Trend</h2>
          <p>Views, sessions, and visitors by day. Recent days are shown first.</p>
        </div>
      </div>
      <div class="bars">
        ${trendRows
          .map(
            (row) => `<div class="barRow">
              <span>${escapeHtml(row.bucket)}</span>
              <div class="barTrack"><i style="width:${Math.max(4, (number(row.views) / maxTrendViews) * 100).toFixed(1)}%"></i></div>
              <strong>${formatNumber(row.views)}</strong>
            </div>`
          )
          .join("") || emptyState("No trend data yet.")}
      </div>
    </section>

    <section class="split">
      ${tablePanel("Top Pages", "Which content attracts attention?", ["Path", "Views", "Sessions", "Visitors"], pagesRows, (row) => [
        linkPath(row.path),
        formatNumber(row.views),
        formatNumber(row.sessions),
        formatNumber(row.visitors),
      ])}
      ${tablePanel("Landing Pages", "Where sessions begin.", ["Path", "Sessions", "Visitors"], landingRows, (row) => [
        linkPath(row.path),
        formatNumber(row.sessions),
        formatNumber(row.visitors),
      ])}
    </section>

    <section class="split">
      ${tablePanel("Sources", "How people arrived.", ["Source", "Medium", "Campaign", "Views", "Sessions"], sourceRows, (row) => [
        escapeHtml(row.source || "(unknown)"),
        escapeHtml(row.medium || ""),
        escapeHtml(row.campaign || ""),
        formatNumber(row.views),
        formatNumber(row.sessions),
      ])}
      ${tablePanel("Referrers", "External pages that sent traffic.", ["Referrer", "Views", "Sessions"], referrerRows, (row) => [
        externalLink(row.referrer),
        formatNumber(row.views),
        formatNumber(row.sessions),
      ])}
    </section>

    <section class="split">
      ${tablePanel("Devices", "Mobile friendliness and browser fit.", ["Device", "OS", "Browser", "Views", "Sessions"], deviceRows, (row) => [
        escapeHtml(row.device_type || "unknown"),
        escapeHtml(row.os_name || "unknown"),
        escapeHtml(row.browser_name || "unknown"),
        formatNumber(row.views),
        formatNumber(row.sessions),
      ])}
      ${tablePanel("Locales", "Browser language and region hints.", ["Locale", "Region", "Views", "Sessions"], localeRows, (row) => [
        escapeHtml(row.browser_locale || "unknown"),
        escapeHtml(row.locale_region || "unknown"),
        formatNumber(row.views),
        formatNumber(row.sessions),
      ])}
    </section>

    <section class="split">
      ${tablePanel("Exit Pages", "Where sessions ended.", ["Path", "Exits"], exitRows, (row) => [
        linkPath(row.path),
        formatNumber(row.exits),
      ])}
      ${tablePanel("Recent Sessions", "Latest session-level journeys.", ["Started", "Views", "Landing", "Exit", "Source", "Device", "Time"], recentSessions, (row) => [
        escapeHtml(row.started_at),
        formatNumber(row.event_count),
        linkPath(row.landing_path),
        linkPath(row.last_path),
        escapeHtml(row.source || "(direct)"),
        escapeHtml([row.device_type, row.browser_name].filter(Boolean).join(" / ")),
        formatDuration(row.duration_seconds),
      ])}
    </section>

    <section class="notes">
      <h2>Method Notes</h2>
      <p>Metrics follow the same practical structure as JHS-CMS: anonymous visitor and session cookies, event rows, session upserts, bot exclusion, UTM/referrer attribution, device and locale classification, no IP storage, and retention cleanup.</p>
      <p>Common dashboard questions mirror established analytics tools: Plausible focuses on visitors, views, sources, pages, devices, and bounce rate; Matomo separates visits, unique visitors, actions, referrers, devices, and visit duration; GA4 uses users, sessions, engaged sessions, engagement rate, and bounce rate. This dashboard keeps those ideas visible without importing third-party trackers.</p>
      <p class="small">Single-page session duration is inherently limited in server-side request analytics because the browser does not send a final “left page” request. Treat duration and bounce as directional signals, especially on small traffic volumes.</p>
    </section>
  </main>
</body>
</html>`;
}

function shouldTrack(req) {
  if (!req || req.method !== "GET") return false;
  const pathOnly = String(req.path || "");
  if (!pathOnly || pathOnly.startsWith("/analytics")) return false;
  if (pathOnly.startsWith("/api/")) return false;
  if (pathOnly.startsWith("/images/")) return false;
  if (pathOnly === "/favicon.ico" || pathOnly === "/readyz" || pathOnly === "/robots.txt" || pathOnly === "/sitemap.xml") {
    return false;
  }
  if (/\.(?:css|js|map|png|jpg|jpeg|gif|svg|webp|ico|xml|txt|json|webmanifest|woff|woff2)$/i.test(pathOnly)) {
    return false;
  }
  return true;
}

function parseRange(query) {
  const now = new Date();
  const today = toDateOnly(now);
  const start = parseDateOnly(query.start);
  const end = parseDateOnly(query.end);
  if (start && end && start <= end) {
    return buildRange("custom", "", start, end);
  }
  const presetDays = Math.max(1, Math.min(365, Math.floor(Number(query.preset) || 30)));
  const endDate = parseDateOnly(today);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - presetDays + 1);
  return buildRange("preset", presetDays, toDateOnly(startDate), today);
}

function buildRange(mode, presetDays, startDate, endDate) {
  return {
    mode,
    presetDays,
    startDate,
    endDate,
    startTs: `${startDate} 00:00:00`,
    endTs: `${endDate} 23:59:59`,
  };
}

function parseFilters(query) {
  return {
    path: clip(query.path, 120).trim(),
    source: clip(query.source, 120).trim(),
    medium: clip(query.medium, 120).trim(),
    device: clip(query.device, 40).trim(),
  };
}

function buildEventWhereClause(range, filters) {
  const clauses = ["e.occurred_at BETWEEN ? AND ?"];
  const params = [range.startTs, range.endTs];
  addLikeFilter(clauses, params, "e.path", filters.path);
  addLikeFilter(clauses, params, "e.source", filters.source);
  addLikeFilter(clauses, params, "e.medium", filters.medium);
  addExactFilter(clauses, params, "e.device_type", filters.device);
  return { sql: `WHERE ${clauses.join(" AND ")}`, params };
}

function buildSessionWhereClause(range, filters) {
  const clauses = ["s.started_at BETWEEN ? AND ?"];
  const params = [range.startTs, range.endTs];
  addLikeFilter(clauses, params, "s.landing_path", filters.path);
  addLikeFilter(clauses, params, "s.source", filters.source);
  addLikeFilter(clauses, params, "s.medium", filters.medium);
  addExactFilter(clauses, params, "s.device_type", filters.device);
  return { sql: `WHERE ${clauses.join(" AND ")}`, params };
}

function addLikeFilter(clauses, params, column, value) {
  if (!value) return;
  clauses.push(`${column} LIKE ?`);
  params.push(`%${value}%`);
}

function addExactFilter(clauses, params, column, value) {
  if (!value) return;
  clauses.push(`${column} = ?`);
  params.push(value);
}

function appendWhere(where, clause) {
  if (!where.sql) return `WHERE ${clause}`;
  return `${where.sql} AND ${clause}`;
}

function queryGroupedRows(groupBy, select, from, where, orderBy, limit) {
  return db
    .prepare(
      `SELECT ${select}
       FROM ${from}
       ${where.sql}
       GROUP BY ${groupBy}
       ORDER BY ${orderBy}
       LIMIT ${Number(limit) || 20}`
    )
    .all(...where.params);
}

function deriveAttribution(req, referrer, siteUrl) {
  const params = new URLSearchParams(extractQuery(req.originalUrl || ""));
  const sourceRaw = String(params.get("utm_source") || "").trim();
  const mediumRaw = String(params.get("utm_medium") || "").trim();
  const campaignRaw = String(params.get("utm_campaign") || "").trim();
  const termRaw = String(params.get("utm_term") || "").trim();
  const contentRaw = String(params.get("utm_content") || "").trim();
  if (sourceRaw || mediumRaw || campaignRaw || termRaw || contentRaw) {
    return {
      source: clip(sourceRaw || "(direct)", 120),
      medium: clip(mediumRaw || "(none)", 120),
      campaign: clip(campaignRaw, 160),
      term: clip(termRaw, 160),
      content: clip(contentRaw, 160),
    };
  }
  if (params.get("gclid")) return { source: "google", medium: "cpc", campaign: "", term: "", content: "gclid" };
  if (params.get("msclkid")) return { source: "bing", medium: "cpc", campaign: "", term: "", content: "msclkid" };
  if (params.get("fbclid")) return { source: "facebook", medium: "paid_social", campaign: "", term: "", content: "fbclid" };

  const appHost = safeHost(siteUrl);
  const refHost = safeHost(referrer);
  if (!refHost) return { source: "(direct)", medium: "(none)", campaign: "", term: "", content: "" };
  if (appHost && refHost === appHost) return { source: "(self)", medium: "internal", campaign: "", term: "", content: "" };

  const searchEngines = ["google.", "bing.", "duckduckgo.", "yahoo.", "baidu.", "ecosia.", "startpage."];
  const socialHosts = ["facebook.", "instagram.", "t.co", "x.com", "twitter.", "linkedin.", "pinterest.", "reddit.", "bsky."];
  if (searchEngines.some((host) => refHost.includes(host))) {
    return { source: clip(refHost, 120), medium: "organic", campaign: "", term: "", content: "" };
  }
  if (socialHosts.some((host) => refHost.includes(host))) {
    return { source: clip(refHost, 120), medium: "social", campaign: "", term: "", content: "" };
  }
  return { source: clip(refHost, 120), medium: "referral", campaign: "", term: "", content: "" };
}

function detectDevice(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  if (!ua) return { type: "unknown", os: "unknown", browser: "unknown" };
  let type = "desktop";
  if (/smart-tv|smarttv|hbbtv|appletv|googletv|tv;/i.test(ua)) type = "smart_tv";
  else if (/playstation|xbox|nintendo switch/i.test(ua)) type = "console";
  else if (/ipad|tablet|playbook|silk(?!.*mobile)/i.test(ua)) type = "tablet";
  else if (/kindle|kobo/i.test(ua)) type = "ereader";
  else if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) type = "mobile";

  let os = "other";
  if (/windows nt/i.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod|ios/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/cros/i.test(ua)) os = "ChromeOS";
  else if (/linux/i.test(ua)) os = "Linux";
  else if (/roku|tizen|web0s|webos|smart-tv|smarttv/i.test(ua)) os = "TV OS";

  let browser = "Other";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";
  else if (/samsungbrowser\//i.test(ua)) browser = "Samsung Internet";
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua) && !/opr\//i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "Safari";
  else if (/trident|msie/i.test(ua)) browser = "Internet Explorer";
  return { type, os, browser };
}

function detectLocale(acceptLanguage) {
  const raw = String(acceptLanguage || "").split(",")[0].trim();
  if (!raw) return { locale: "unknown", region: "unknown" };
  const normalized = raw.replace(/_/g, "-");
  const parts = normalized.split("-");
  return {
    locale: clip(normalized.toLowerCase(), 32),
    region: parts.length > 1 ? clip(parts[parts.length - 1].toUpperCase(), 12) : "unknown",
  };
}

function ensureCookie(_req, res, name, maxAgeSeconds) {
  const cookies = parseCookies(_req.headers.cookie || "");
  let value = String(cookies[name] || "").trim();
  if (!value) value = crypto.randomUUID();
  res.cookie(name, value, {
    maxAge: maxAgeSeconds * 1000,
    httpOnly: true,
    sameSite: "lax",
    secure: String(process.env.NODE_ENV || "").toLowerCase() === "production",
    path: "/",
  });
  return value;
}

function parseCookies(cookieHeader) {
  const out = {};
  for (const segment of String(cookieHeader || "").split(";")) {
    const piece = segment.trim();
    if (!piece) continue;
    const eq = piece.indexOf("=");
    if (eq <= 0) continue;
    out[piece.slice(0, eq).trim()] = safeDecodeURIComponent(piece.slice(eq + 1).trim());
  }
  return out;
}

function safeDecodeURIComponent(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return String(text || "");
  }
}

function maybeCleanupAnalytics() {
  const now = Date.now();
  if (now - lastCleanupAt < 60 * 60 * 1000) return;
  cleanupOldAnalytics();
}

function cleanupOldAnalytics() {
  if (!db) return;
  lastCleanupAt = Date.now();
  const retentionDays = getRetentionDays();
  db.prepare("DELETE FROM analytics_events WHERE occurred_at < datetime('now', ?)").run(`-${retentionDays} days`);
  db.prepare("DELETE FROM analytics_sessions WHERE last_seen_at < datetime('now', ?)").run(`-${retentionDays} days`);
}

function getRetentionDays() {
  const row = db.prepare("SELECT value FROM analytics_settings WHERE key = 'retention_days'").get();
  return Math.max(1, Math.min(3650, Math.floor(Number(row?.value) || DEFAULT_RETENTION_DAYS)));
}

function extractQuery(originalUrl) {
  const idx = String(originalUrl).indexOf("?");
  return idx < 0 ? "" : originalUrl.slice(idx + 1);
}

function safeHost(maybeUrl) {
  try {
    return new URL(String(maybeUrl || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function durationSecondsSql(startColumn, endColumn) {
  return `MAX(0, CAST((julianday(${endColumn}) - julianday(${startColumn})) * 86400 AS INTEGER))`;
}

function toCsv(rows) {
  const headers = rows[0] ? Object.keys(rows[0]) : ["occurred_at", "path", "source", "medium"];
  return `${headers.join(",")}\n${rows
    .map((row) => headers.map((header) => csvCell(row[header])).join(","))
    .join("\n")}\n`;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function tablePanel(title, intro, headers, rows, mapRow) {
  return `<section class="panel">
    <div class="panelHead"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(intro)}</p></div></div>
    <div class="tableWrap">
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (row) =>
                      `<tr>${mapRow(row)
                        .map((cell, index) => `<td data-label="${escapeAttr(headers[index])}">${cell}</td>`)
                        .join("")}</tr>`
                  )
                  .join("")
              : `<tr><td colspan="${headers.length}">${emptyState("No matching data yet.")}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  </section>`;
}

function questionCard(label, value, hint) {
  return `<article class="qCard"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`;
}

function linkPath(value) {
  const pathOnly = String(value || "/");
  return `<a href="${escapeAttr(pathOnly)}">${escapeHtml(pathOnly)}</a>`;
}

function externalLink(value) {
  const href = String(value || "");
  if (!href) return "";
  return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href.replace(/^https?:\/\//i, ""))}</a>`;
}

function emptyState(text) {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

function presetOption(range, days, label) {
  return `<option value="${days}"${range.mode === "preset" && range.presetDays === days ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function selectOption(selected, value) {
  return `<option value="${escapeAttr(value)}"${selected === value ? " selected" : ""}>${escapeHtml(value)}</option>`;
}

function buildQuery(range, filters) {
  const params = new URLSearchParams();
  if (range.mode === "custom") {
    params.set("start", range.startDate);
    params.set("end", range.endDate);
  } else {
    params.set("preset", String(range.presetDays || 30));
  }
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function setPrivateNoCache(res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

function parseDateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return toDateOnly(date);
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatNumber(value) {
  const numeric = number(value);
  if (!Number.isInteger(numeric)) return numeric.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  return numeric.toLocaleString("en-GB");
}

function formatPercent(ratio) {
  return `${Math.round(number(ratio) * 100)}%`;
}

function formatShare(part, total) {
  return total ? formatPercent(number(part) / number(total)) : "0%";
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(number(seconds)));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) return `${minutes}m ${remaining}s`;
  return `${remaining}s`;
}

function clip(value, maxLen) {
  return String(value || "").slice(0, Number(maxLen || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function analyticsCss() {
  return `
:root{color-scheme:light;--bg:#f7f8fb;--panel:#fff;--text:#182033;--muted:#667085;--line:#d9e0ea;--accent:#047857;--accent2:#2563eb;--soft:#ecfdf5;--warn:#92400e}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.45}
a{color:var(--accent2);text-decoration:none}
a:hover{text-decoration:underline}
.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px clamp(14px,3vw,28px);border-bottom:1px solid var(--line);background:rgba(247,248,251,.94);backdrop-filter:blur(10px)}
.brand{font-weight:800;color:var(--text)}
nav{display:flex;gap:10px;flex-wrap:wrap}
nav a{font-size:14px;font-weight:700;color:#344054}
.shell{width:min(1480px,100%);margin:0 auto;padding:18px clamp(12px,2vw,28px) 44px}
.hero{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;margin-bottom:18px;padding:clamp(18px,3vw,30px);border:1px solid var(--line);background:var(--panel)}
.eyebrow{margin:0 0 8px;color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
h1,h2{margin:0;color:#101828;line-height:1.1}
h1{font-size:clamp(32px,6vw,56px)}
h2{font-size:20px}
.lede{max-width:780px;margin:12px 0 0;color:var(--muted)}
.heroMeta{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:0}
.heroMeta div,.qCard,.panel,.notes{border:1px solid var(--line);background:var(--panel)}
.heroMeta div{padding:12px}
dt{font-size:12px;color:var(--muted)}dd{margin:4px 0 0;font-weight:800}
.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:18px;padding:12px;border:1px solid var(--line);background:var(--panel)}
label{display:grid;gap:5px;font-size:12px;font-weight:800;color:#344054}
input,select,button{width:100%;min-height:40px;border:1px solid var(--line);background:#fff;color:var(--text);font:inherit}
input,select{padding:8px 10px}
button{padding:8px 12px;background:var(--accent);border-color:var(--accent);color:#fff;font-weight:800;cursor:pointer}
.filterActions{display:flex;align-items:end;gap:8px}
.filterActions a{display:inline-flex;align-items:center;min-height:40px;padding:0 12px;border:1px solid var(--line);font-weight:800;color:#344054}
.questionGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:18px}
.qCard{display:grid;gap:7px;padding:14px;min-width:0}
.qCard span{color:var(--muted);font-size:12px;font-weight:800}
.qCard strong{font-size:clamp(24px,5vw,36px);line-height:1}
.qCard small{color:var(--muted)}
.panel,.notes{margin-bottom:18px;padding:14px}
.panelHead{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}
.panelHead p,.notes p{margin:6px 0 0;color:var(--muted)}
.split{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}
.bars{display:grid;gap:8px}
.barRow{display:grid;grid-template-columns:92px minmax(90px,1fr) 54px;gap:10px;align-items:center;font-size:13px}
.barTrack{height:12px;background:#edf2f7;overflow:hidden}
.barTrack i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2))}
.tableWrap{overflow:auto}
table{width:100%;border-collapse:collapse;min-width:560px}
th,td{padding:10px;border-top:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px}
th{color:#475467;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
td{overflow-wrap:anywhere}
.empty{margin:0;color:var(--muted);font-style:italic}
.notes{background:#fbfcfe}
.notes .small{font-size:13px;color:var(--warn)}
@media (min-width:900px){
  .hero{grid-template-columns:minmax(0,1.6fr) minmax(260px,.7fr);align-items:end}
  .split{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:680px){
  .topbar{position:static}
  .filterActions{grid-column:1/-1}
  .barRow{grid-template-columns:82px minmax(70px,1fr) 44px}
  table{min-width:0}
  thead{display:none}
  tr{display:grid;gap:6px;padding:10px 0;border-top:1px solid var(--line)}
  td{display:grid;grid-template-columns:104px minmax(0,1fr);gap:8px;padding:0;border:0}
  td::before{content:attr(data-label);color:#667085;font-size:12px;font-weight:800}
}`;
}

module.exports = {
  initAnalytics,
  analyticsTrackingMiddleware,
  registerAnalyticsRoutes,
};
