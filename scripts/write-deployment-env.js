const fs = require("node:fs");

// GitHub secrets and variables both arrive as strings. Quote values for Compose
// so passwords containing $, #, quotes, or spaces reach the container unchanged.
function composeValue(value) {
  if (/[\r\n\0]/.test(value)) throw new Error("Deployment values must be single-line strings");
  return JSON.stringify(value).replaceAll("$", () => "$$");
}

function deploymentEnv(env) {
  for (const key of ["CONTACT_FROM_EMAIL", "CONTACT_TO_EMAIL"]) {
    const value = (env[key] || "").trim();
    const address = value.match(/<([^<>]+)>$/)?.[1] || value;
    if (/[\r\n\0]/.test(value) || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(address)) {
      throw new Error(`${key} must contain one valid email address (optionally Name <address>)`);
    }
  }
  if (!/^\d+$/.test(env.SMTP_PORT) || Number(env.SMTP_PORT) < 1 || Number(env.SMTP_PORT) > 65535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }
  if (!["true", "false"].includes(env.SMTP_SECURE)) {
    throw new Error("SMTP_SECURE must be true or false");
  }
  if (env.SMTP_HOST === "smtp.resend.com" && env.SMTP_USER !== "resend") {
    throw new Error("For smtp.resend.com, the SMTP_USER secret must be resend; SMTP_PASS must be a Resend API key");
  }

  const keys = [
    "BRANCH_NAME", "JAHOSI_TRAEFIK_RULE", "PORT", "HOST", "NODE_ENV", "TRUST_PROXY",
    "SITE_URL", "SERVICE_NAME", "APP_TIMEZONE", "CONTACT_TO_EMAIL", "CONTACT_FROM_EMAIL",
    "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS",
    "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "SPLASH_OPENAI_API_KEY",
    "SPLASH_OPENAI_BASE_URL", "ANALYTICS_ENABLED", "ANALYTICS_DB_PATH", "ANALYTICS_RESPECT_DNT",
  ];
  const values = Object.fromEntries(keys.map((key) => [key, env[key] || ""]));
  values.JAHOSI_IMAGE = env.IMAGE_REF || "";
  values["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID || "";
  values["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET || "";

  // The remote deployment reads BRANCH_NAME with awk before recreating Docker.
  if (!/^[A-Za-z0-9_.-]+$/.test(values.BRANCH_NAME)) throw new Error("Invalid BRANCH_NAME");
  return Object.entries(values).map(([key, value]) =>
    `${key}=${key === "BRANCH_NAME" ? value : composeValue(value)}`
  ).join("\n") + "\n";
}

if (require.main === module) {
  try {
    fs.writeFileSync(".env", deploymentEnv(process.env), { mode: 0o600 });
    console.log("Validated deployment configuration and wrote .env (values hidden).");
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { composeValue, deploymentEnv };
