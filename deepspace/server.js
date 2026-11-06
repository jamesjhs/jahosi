const express = require("express");
const fs = require("fs");
const path = require("path");

// Loaded once at startup, alongside the app, and never served as a public asset.
const DEEP_SPACE_CHAT_GUIDELINES = fs.readFileSync(path.join(__dirname, "instructions.md"), "utf8").trim();

function registerDeepSpace(app, {
  splashChatRateLimit, SPLASH_OPENAI_API_KEY, SPLASH_OPENAI_BASE_URL, TURNSTILE_SITE_KEY,
  isTurnstileEnabled, validateChemChatSession, mintChemChatSession, verifyTurnstileToken,
  chatCompletionHeaders, setNoCacheHeaders, setPublicFileHeaders, resolvePublicBaseUrl, escapeHtml,
}) {
  const DEEP_SPACE_INDEX_HTML_TEMPLATE = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
  function renderDeepSpaceIndexHtml(req) {
    return DEEP_SPACE_INDEX_HTML_TEMPLATE
      .replace('"__TURNSTILE_SITE_KEY__"', JSON.stringify(TURNSTILE_SITE_KEY).replace(/</g, "\\u003c"))
      .replaceAll("__CANONICAL_URL__", escapeHtml(`${resolvePublicBaseUrl(req)}/deepspace/`));
  }

  app.get(/^\/deepspace$/, (_req, res) => res.redirect(308, "/deepspace/"));
  app.get(["/deepspace/", "/deepspace/index.html"], (req, res) => {
    setNoCacheHeaders(res);
    res.send(renderDeepSpaceIndexHtml(req));
  });
  app.use("/deepspace", express.static(path.join(__dirname, "public"), { index: false, setHeaders: setPublicFileHeaders }));

  app.post("/deepspace/chat", splashChatRateLimit, express.json({ limit: "50kb" }), async (req, res) => {
    if (!SPLASH_OPENAI_API_KEY) return res.status(404).json({ error: "disabled" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 2000) return res.status(400).json({ error: "invalid_message" });

    let chatSessionToken = typeof body.chatSessionToken === "string" ? body.chatSessionToken.trim() : "";
    if (isTurnstileEnabled() && !validateChemChatSession(chatSessionToken)) {
      const token = typeof body.turnstileToken === "string" ? body.turnstileToken.trim() : "";
      if (!token) return res.status(403).json({ error: "turnstile_required" });
      if (!(await verifyTurnstileToken(token, req.ip || req.socket.remoteAddress))) {
        return res.status(403).json({ error: "turnstile_failed" });
      }
      chatSessionToken = mintChemChatSession();
    }
    const history = (Array.isArray(body.history) ? body.history : []).slice(-8)
      .filter((item) => item && typeof item === "object" && ["user", "assistant"].includes(item.role))
      .map((item) => ({ role: item.role, content: String(item.content || "").slice(0, 2500) }))
      .filter((item) => item.content.trim());
    try {
      const upstream = await fetch(`${SPLASH_OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: chatCompletionHeaders(),
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model: "gpt-4o-mini", temperature: 0.7,
          messages: [{ role: "system", content: DEEP_SPACE_CHAT_GUIDELINES }, ...history, { role: "user", content: message }],
        }),
      });
      if (!upstream.ok) return res.status(502).json({ error: "upstream_failed" });
      const data = await upstream.json();
      const reply = data?.choices?.[0]?.message?.content;
      if (typeof reply !== "string" || !reply.trim()) return res.status(502).json({ error: "upstream_empty" });
      return res.json({ reply: reply.trim(), ...(chatSessionToken ? { chatSessionToken } : {}) });
    } catch {
      return res.status(502).json({ error: "upstream_error" });
    }
  });
}

module.exports = { registerDeepSpace };
