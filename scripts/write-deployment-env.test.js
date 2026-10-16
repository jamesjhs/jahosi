const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { deploymentEnv } = require("./write-deployment-env");
const nodemailer = require("nodemailer");

const settings = {
  BRANCH_NAME: "main", JAHOSI_TRAEFIK_RULE: "Host(`jahosi.co.uk`) || Host(`www.jahosi.co.uk`)",
  IMAGE_REF: "ghcr.io/example/jahosi:test", PORT: "3000",
  CONTACT_FROM_EMAIL: "Jahosi Contact <contact@example.com>",
  CONTACT_TO_EMAIL: "recipient@example.com", SMTP_HOST: "smtp.resend.com",
  SMTP_PORT: "587", SMTP_SECURE: "false", SMTP_USER: "resend",
  TURNSTILE_SITE_KEY: "public-site-key", TURNSTILE_SECRET_KEY: "private-secret-key",
};

test("rejects invalid envelope settings and SMTP types without exposing values", () => {
  for (const [key, value] of [
    ["CONTACT_FROM_EMAIL", ""], ["CONTACT_TO_EMAIL", "invalid"],
    ["SMTP_PORT", "abc"], ["SMTP_PORT", "65536"], ["SMTP_SECURE", "0"],
    ["SMTP_USER", "private@example.com"], ["SMTP_PASS", "secret\nline"],
  ]) {
    assert.throws(() => deploymentEnv({ ...settings, [key]: value }));
  }
});

test("Compose preserves credentials, routing, and string settings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jahosi-env-test-"));
  try {
    const envPath = path.join(dir, "runtime.env");
    for (const password of [
      "re_test$literal${UNSET} # hash", "quote'and\"double", "back\\slash",
      "trailing\\", "back\\'quote", " leading and trailing ",
    ]) {
      fs.writeFileSync(envPath, deploymentEnv({ ...settings, SMTP_PASS: password }));
      const output = execFileSync("docker", [
        "compose", "--env-file", envPath, "-f", path.resolve(__dirname, "../docker-compose.yml"),
        "config", "--format", "json",
      ], { encoding: "utf8", env: { ...process.env, JAHOSI_ENV_FILE: envPath } });
      const service = JSON.parse(output).services.jahosi;
      // Compose escapes dollars in its rendered config so it can be reused.
      assert.equal(service.environment.SMTP_PASS.replaceAll("$$", "$"), password);
      assert.equal(service.environment.CONTACT_FROM_EMAIL, settings.CONTACT_FROM_EMAIL);
      assert.equal(service.environment.SMTP_PORT, "587");
      assert.equal(service.environment.SMTP_SECURE, "false");
      assert.equal(service.environment.TURNSTILE_SITE_KEY, settings.TURNSTILE_SITE_KEY);
      assert.equal(service.environment.TURNSTILE_SECRET_KEY, settings.TURNSTILE_SECRET_KEY);
      assert.equal(service.container_name, "jahosi-main");
      assert.equal(service.image, settings.IMAGE_REF);
      assert.equal(service.labels["traefik.http.routers.jahosi-main.rule"], settings.JAHOSI_TRAEFIK_RULE);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Nodemailer builds the envelope from plain and display-name sender syntax", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  for (const from of ["contact@example.com", "Jahosi Contact <contact@example.com>"]) {
    const info = await transport.sendMail({
      from, to: settings.CONTACT_TO_EMAIL, replyTo: "visitor@example.net",
      subject: "Contact form configuration check", text: "Offline test; no email is sent.",
    });
    assert.equal(info.envelope.from, "contact@example.com");
    assert.deepEqual(info.envelope.to, [settings.CONTACT_TO_EMAIL]);
    assert.match(info.message.toString(), /Reply-To: visitor@example.net/);
  }
});
