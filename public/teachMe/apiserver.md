# Jahosi API Server Architecture Plan

Status: planning document
Audience: senior product developer, backend engineer, AI coding agent, Android engineer
Target system: separate Node.js/TypeScript API gateway for TeachMe and similar Jahosi AI tools
Primary consumer: browser clients on `jahosi.co.uk`, future React Android clients, and other first-party clients
Current web host: `jahosi.co.uk`
Preferred API host: `api.jahosi.co.uk`
Current process model: Node app hosted with PM2
Recommended process model: separate PM2 app for web, separate PM2 app for API

## 1. Executive Summary

The existing `jahosi.co.uk` app should remain a browser-focused web platform: static pages, portfolio pages, public tools, policies, and web UI delivery. It should not become the long-term home for shared AI product logic, billing, OpenAI integrations, connector OAuth, or mobile app entitlements.

Create a separate Node.js/TypeScript API server to act as the backend gateway for TeachMe and future Jahosi AI tools such as SocialQA, BlanderQA, splash chemistry chat, or similar constrained-source assistants.

The API server should own:

- OpenAI API calls
- prompt assembly
- source-list validation
- source-scoped resource lookup
- product-specific policy enforcement
- request validation
- rate limits
- entitlement checks
- reporting of AI-generated content
- audit-friendly logs
- future Google Play Billing verification
- future OAuth/MCP connector flows

The web server should own:

- public HTML
- static assets
- SEO pages
- policy pages
- portfolio pages
- browser UX
- lightweight client-side state

This separation keeps the browser platform simple while allowing the backend to become a proper reusable product API.

## 2. Current TeachMe JSON Shape

TeachMe currently uses two server routes.

### 2.1 Current Chat Route

Current route:

```http
POST /teachMe/chat
Content-Type: application/json
```

Current request body:

```json
{
  "message": "What should I understand about fractions this year?",
  "history": [
    {
      "role": "user",
      "content": "What is the multiplication tables check?"
    },
    {
      "role": "assistant",
      "content": "Plain-text answer..."
    }
  ],
  "localContext": {
    "authorities": [
      {
        "name": "Teaching mathematics in primary schools",
        "tier": "Department for Education and NCETM / GOV.UK",
        "homepage_url": "https://www.gov.uk/government/publications/teaching-mathematics-in-primary-schools"
      }
    ],
    "links": [
      {
        "label": "Teaching mathematics in primary schools",
        "href": "https://www.gov.uk/government/publications/teaching-mathematics-in-primary-schools"
      }
    ]
  },
  "schoolYearContext": {
    "year": "Year 4",
    "keyStage": "Key Stage 2",
    "age": "8 to 9",
    "focus": "Lower key stage 2: multiplication tables fluency, wider subject knowledge and increasingly independent learning."
  },
  "chatSessionToken": "optional-turnstile-session-token",
  "turnstileToken": "optional-cloudflare-turnstile-token"
}
```

Current successful response:

```json
{
  "reply": "Plain-text answer...",
  "chatSessionToken": "optional-turnstile-session-token"
}
```

Current error responses:

```json
{ "error": "disabled" }
{ "error": "invalid_message" }
{ "error": "turnstile_required" }
{ "error": "turnstile_failed" }
{ "error": "upstream_failed" }
{ "error": "upstream_empty" }
{ "error": "upstream_error" }
```

Current server behaviour:

- rejects empty or too-long messages
- trims message
- accepts recent history from client
- sanitises recent history to last eight items
- truncates each history content item
- sanitises selected school-year context
- sanitises optional local source context
- optionally gates first chat with Cloudflare Turnstile
- calls OpenAI using a server-side API key
- returns a plain text answer

### 2.2 Current Resource Lookup Route

Current route:

```http
GET /teachMe/resource-info?topic=phonics
Accept: application/json
```

Current response body:

```json
{
  "title": "Reading, phonics and English",
  "summary": "Use these for reading foundations, phonics, English curriculum expectations and parent support.",
  "localLinks": [
    {
      "label": "The reading framework",
      "href": "https://www.gov.uk/government/publications/the-reading-framework-teaching-the-foundations-of-literacy",
      "note": "Department for Education / GOV.UK"
    }
  ],
  "authorities": [
    {
      "name": "The reading framework",
      "tier": "Department for Education / GOV.UK",
      "homepage_url": "https://www.gov.uk/government/publications/the-reading-framework-teaching-the-foundations-of-literacy"
    }
  ],
  "followUps": [
    "Ask: What does reading support look like in this school year?"
  ]
}
```

Current behaviour:

- matches topic text against curated regular expressions
- returns a source bundle
- never performs AI work
- returns only allowed/local source links
- produces local context that can be passed into the next chat request

## 3. Target Architecture

### 3.1 Recommended Host Split

```text
jahosi.co.uk
  Browser web platform
  PM2 app name: jahosi-web
  Responsibilities:
    - HTML/CSS/JS
    - SEO
    - static public tools
    - policy pages
    - portfolio pages
    - redirects

api.jahosi.co.uk
  Product API gateway
  PM2 app name: jahosi-api
  Responsibilities:
    - JSON APIs
    - OpenAI provider calls
    - source-scoped answer generation
    - billing entitlements
    - reports
    - OAuth/MCP connectors
    - rate limits
    - API logs
```

### 3.2 Request Flow

```text
Browser or Android client
  |
  | HTTPS JSON request
  v
api.jahosi.co.uk
  |
  | validate request
  | identify product
  | check entitlement
  | apply rate limit
  | load source pack
  | build prompt/instructions
  | call OpenAI
  | normalise response
  v
JSON response
```

### 3.3 Why A Separate API App

Use a separate API app because:

- mobile clients should not couple to web route names
- future products can share OpenAI, billing, reporting, rate-limit, and source-pack code
- the web app can stay simple and stable
- API deployments can happen independently of portfolio/UI changes
- failures in AI traffic should not take down static portfolio browsing
- secrets and operational logs can be scoped differently
- the API can use stricter CORS, auth, and payload validation

## 4. API Design Principles

### 4.1 JSON-First

Every API route returns JSON, including errors.

Use:

```http
Content-Type: application/json
```

Return:

```json
{
  "ok": true,
  "data": {}
}
```

or:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_message",
    "message": "The message is missing or too long.",
    "requestId": "req_..."
  }
}
```

Do not return plain strings or HTML from API routes.

### 4.2 Versioned Routes

All public client API routes should be versioned:

```text
/v1/...
```

Recommended base URL:

```text
https://api.jahosi.co.uk/v1
```

### 4.3 Product Namespacing

Each product gets its own route namespace:

```text
/v1/teachme/...
/v1/socialqa/...
/v1/blanderqa/...
/v1/splash/...
```

Shared infrastructure routes live outside product namespaces:

```text
/healthz
/readyz
/v1/config
/v1/reports
/v1/entitlements
/v1/billing
/v1/oauth
```

### 4.4 Stable Contracts

The web app and Android app should not depend on OpenAI response shape. They should depend only on the Jahosi API response shape.

OpenAI provider changes should be invisible to clients.

### 4.5 Own-Server Boundary

Clients call Jahosi API only.

Clients must not call:

- OpenAI directly
- Google Play verification directly as the source of truth
- OAuth token exchange endpoints directly except through controlled redirect flows
- remote MCP servers directly for privileged operations

## 5. Recommended API Surface

### 5.1 Health

```http
GET /healthz
```

Simple liveness check. Should not depend on OpenAI.

Response:

```json
{
  "ok": true,
  "service": "jahosi-api",
  "version": "1.0.0",
  "timestamp": "2026-09-19T22:00:00.000Z"
}
```

```http
GET /readyz
```

Readiness check. Can verify required environment configuration, database connectivity, and source-pack loading. Should not make a real paid OpenAI call.

Response:

```json
{
  "ok": true,
  "checks": {
    "env": true,
    "database": true,
    "sourcePacks": true,
    "openaiConfigured": true
  }
}
```

### 5.2 Global Client Config

```http
GET /v1/config
```

Response:

```json
{
  "ok": true,
  "data": {
    "apiVersion": "v1",
    "products": {
      "teachme": {
        "enabled": true,
        "minimumClientVersion": "1.0.0",
        "features": {
          "chat": true,
          "resources": true,
          "reports": true,
          "billing": false,
          "connectors": false
        }
      }
    }
  }
}
```

### 5.3 TeachMe Config

```http
GET /v1/teachme/config
```

Response:

```json
{
  "ok": true,
  "data": {
    "product": "teachme",
    "displayName": "TeachMe",
    "jurisdiction": "England",
    "audience": "Parents and carers",
    "limits": {
      "maxMessageLength": 1000,
      "maxHistoryItems": 8,
      "maxHistoryItemLength": 2500
    },
    "features": {
      "chat": true,
      "resourceLookup": true,
      "answerReports": true,
      "pdfExport": false,
      "connectors": false
    },
    "sourcePack": {
      "id": "teachme-primary-england",
      "version": "2026-09-18",
      "lastReviewed": "2026-09-18"
    },
    "policy": {
      "privacyUrl": "https://jahosi.co.uk/teachMe/policy.html",
      "resourcesUrl": "https://jahosi.co.uk/teachMe/resources.md"
    }
  }
}
```

### 5.4 TeachMe Resources

```http
GET /v1/teachme/resources?topic=phonics
```

Response:

```json
{
  "ok": true,
  "data": {
    "topic": "phonics",
    "title": "Reading, phonics and English",
    "summary": "Use these for reading foundations, phonics, English curriculum expectations and parent support.",
    "sources": [
      {
        "id": "reading-framework",
        "title": "The reading framework",
        "organisation": "Department for Education / GOV.UK",
        "url": "https://www.gov.uk/government/publications/the-reading-framework-teaching-the-foundations-of-literacy",
        "scope": "Teaching the foundations of literacy, including reading, phonics and early language."
      }
    ],
    "followUps": [
      "What does reading support look like in this school year?"
    ],
    "contextToken": "ctx_..."
  }
}
```

Design note: `contextToken` is optional but useful. Instead of making clients send the full source context back into chat, the API can mint a short-lived context token that refers to server-side selected source IDs.

MVP option: omit `contextToken` and let the client send selected `sourceIds`.

### 5.5 TeachMe Sources

```http
GET /v1/teachme/sources
```

Response:

```json
{
  "ok": true,
  "data": {
    "sourcePack": {
      "id": "teachme-primary-england",
      "version": "2026-09-18",
      "lastReviewed": "2026-09-18"
    },
    "sources": [
      {
        "id": "primary-national-curriculum",
        "title": "National curriculum in England: primary curriculum",
        "organisation": "Department for Education / GOV.UK",
        "url": "https://www.gov.uk/government/publications/national-curriculum-in-england-primary-curriculum",
        "scope": "Statutory primary national curriculum programmes of study and attainment targets for maintained schools in England.",
        "topics": ["english", "mathematics", "science", "computing", "history", "geography"]
      }
    ]
  }
}
```

### 5.6 TeachMe Chat

```http
POST /v1/teachme/chat
Content-Type: application/json
```

Recommended request:

```json
{
  "message": "What should I understand about fractions this year?",
  "history": [
    {
      "role": "user",
      "content": "What are they building towards?"
    },
    {
      "role": "assistant",
      "content": "Plain-text answer..."
    }
  ],
  "schoolYear": {
    "id": "year4",
    "label": "Year 4",
    "keyStage": "Key Stage 2",
    "age": "8 to 9",
    "focus": "Lower key stage 2: multiplication tables fluency, wider subject knowledge and increasingly independent learning."
  },
  "sourceContext": {
    "sourceIds": ["primary-mathematics-guidance", "primary-national-curriculum"]
  },
  "client": {
    "type": "web",
    "appVersion": "0.1.0",
    "locale": "en-GB",
    "timezone": "Europe/London"
  },
  "guard": {
    "turnstileToken": "optional-cloudflare-token"
  }
}
```

Recommended response:

```json
{
  "ok": true,
  "data": {
    "answerId": "ans_01J...",
    "reply": "Plain-text answer...",
    "references": [
      {
        "sourceId": "primary-mathematics-guidance",
        "title": "Teaching mathematics in primary schools",
        "url": "https://www.gov.uk/government/publications/teaching-mathematics-in-primary-schools"
      }
    ],
    "outsideScopeSignposting": [],
    "usage": {
      "entitlement": "free",
      "remainingToday": 4
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "model": "configured-server-side",
    "sourcePackVersion": "2026-09-18"
  }
}
```

Design note: keep `reply` plain text for simplicity. Add structured metadata around it so future clients can render citations, reports, usage limits, and exports cleanly.

### 5.7 Answer Report

```http
POST /v1/teachme/reports
Content-Type: application/json
```

Request:

```json
{
  "answerId": "ans_01J...",
  "reason": "unsafe_or_offensive",
  "details": "Optional user-entered text",
  "client": {
    "type": "android",
    "appVersion": "1.0.0"
  }
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "reportId": "rep_01J...",
    "status": "received"
  }
}
```

Reasons:

- `unsafe_or_offensive`
- `incorrect_or_misleading`
- `outside_source_scope`
- `privacy_concern`
- `other`

### 5.8 Future Billing

```http
POST /v1/billing/google/verify
```

Request:

```json
{
  "packageName": "uk.co.jahosi.teachme",
  "productId": "teachme_plus_monthly",
  "purchaseToken": "google-play-token",
  "client": {
    "type": "android",
    "appVersion": "1.0.0"
  }
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "entitlement": "teachme_plus",
    "status": "active",
    "expiresAt": "2026-10-19T00:00:00.000Z"
  }
}
```

### 5.9 Future Connector OAuth

```http
GET /v1/oauth/:provider/start?product=teachme
GET /v1/oauth/:provider/callback
DELETE /v1/oauth/:provider/connection/:connectionId
```

The API server should own token exchange and secure token storage. Android and browser clients should never receive long-lived provider refresh tokens.

## 6. Project Structure

Recommended new repo or sibling folder:

```text
jahosi-api/
  package.json
  tsconfig.json
  ecosystem.config.cjs
  .env.example
  src/
    index.ts
    app.ts
    config/
      env.ts
      cors.ts
      logger.ts
    http/
      errors.ts
      request-id.ts
      validation.ts
      rate-limit.ts
    products/
      teachme/
        routes.ts
        schemas.ts
        prompt.ts
        resources.ts
        source-pack.ts
        answer.ts
      socialqa/
        routes.ts
        prompt.ts
        resources.ts
      blanderqa/
        routes.ts
        prompt.ts
        resources.ts
    providers/
      openai/
        index.ts
        responses.ts
        chat-completions-legacy.ts
        types.ts
      turnstile/
        verify.ts
      google-play/
        verify.ts
    services/
      entitlements.ts
      reports.ts
      usage.ts
      source-validation.ts
    data/
      teachme/
        sources.json
        topics.json
        years.json
    db/
      index.ts
      migrations/
    tests/
      teachme.prompt.test.ts
      teachme.resources.test.ts
      teachme.chat.test.ts
```

If kept inside the existing repository:

```text
api/
  package.json
  tsconfig.json
  ecosystem.config.cjs
  src/
```

Do not mix API TypeScript source into `public/`.

## 7. Technology Choices

### 7.1 Recommended Stack

- Node.js LTS
- TypeScript
- Express or Fastify
- Zod for request/response validation
- OpenAI official JavaScript SDK
- dotenv for local development
- PM2 for process management
- pino or winston for structured logs
- SQLite for MVP if single-server only
- Postgres when billing/accounts/connectors become serious
- Helmet for security headers
- CORS allowlist for browser clients
- express-rate-limit or a Redis-backed limiter if multi-process/high-traffic

### 7.2 Express vs Fastify

Express is acceptable because Jahosi already uses Express and the product is small.

Fastify is attractive if starting fresh because it has good schema-first habits and performance. The decisive factor should be maintainability. A clean Express TypeScript API with Zod is better than a clever framework migration that slows shipping.

Recommendation: start with Express + TypeScript + Zod unless there is a strong personal preference for Fastify.

## 8. Environment Variables

Use a separate `.env` for the API app.

Required:

```text
NODE_ENV=production
PORT=4001
PUBLIC_API_BASE_URL=https://api.jahosi.co.uk
WEB_ORIGIN=https://jahosi.co.uk
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
TEACHME_OPENAI_MODEL=
TURNSTILE_SECRET_KEY=
LOG_LEVEL=info
```

Optional:

```text
DATABASE_URL=
REDIS_URL=
GOOGLE_PLAY_PACKAGE_NAME=
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH=
OAUTH_ENCRYPTION_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
```

Migration aliases:

```text
SPLASH_OPENAI_API_KEY=
SPLASH_OPENAI_BASE_URL=
```

The API server can temporarily support `SPLASH_OPENAI_API_KEY` as a fallback while the existing Jahosi app is migrated, but new code should use `OPENAI_API_KEY`.

## 9. CORS And Client Access

### 9.1 Browser Clients

Allow:

```text
https://jahosi.co.uk
https://www.jahosi.co.uk
```

Possibly allow staging:

```text
https://staging.jahosi.co.uk
http://localhost:3000
http://localhost:5173
```

Do not use `Access-Control-Allow-Origin: *` for authenticated or paid routes.

### 9.2 Android Clients

Native Android requests are not protected by browser CORS. Use:

- app attestation later if abuse becomes a problem
- entitlement checks
- anonymous install IDs or accounts
- strict rate limits
- server-side billing verification
- request signing only if needed

Do not rely on a "secret" in the Android app. Anything shipped in the app can be extracted.

## 10. Authentication And Identity

### 10.1 MVP Without Accounts

For web and early Android testing:

- no account required
- anonymous install/session ID
- daily limit by IP + install ID + fingerprint-light server logic
- Turnstile for browser abuse control
- stricter Android usage controls when monetised

This keeps privacy simple.

### 10.2 Paid Android With Entitlements

When monetised:

- app receives Google Play purchase token
- app sends purchase token to API
- API verifies purchase with Google
- API stores entitlement
- API associates entitlement with a stable app user or anonymous account
- API checks entitlement before expensive AI calls

### 10.3 Accounts

Only add accounts when they unlock real value:

- cross-device purchase restore beyond platform defaults
- saved history sync
- connectors
- family plans

If accounts exist, add deletion and export workflows from day one.

## 11. Rate Limiting

Use layered rate limits.

Recommended layers:

- per IP
- per anonymous install ID
- per authenticated user
- per product
- per route
- per entitlement tier
- per OpenAI cost bucket

Example policy:

```text
GET /v1/teachme/config:
  generous, cacheable

GET /v1/teachme/resources:
  generous, cheap

POST /v1/teachme/chat:
  strict, cost-aware

POST /v1/teachme/reports:
  moderate, abuse-aware
```

Return:

```json
{
  "ok": false,
  "error": {
    "code": "rate_limited",
    "message": "Please wait before asking another question.",
    "retryAfterSeconds": 60,
    "requestId": "req_..."
  }
}
```

## 12. OpenAI Provider Layer

### 12.1 Provider Interface

Do not call OpenAI directly from route handlers.

Use an internal interface:

```ts
export type AiAnswerInput = {
  product: "teachme" | "socialqa" | "blanderqa" | "splash";
  instructions: string;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
  latestUserMessage: string;
  metadata: {
    requestId: string;
    sourcePackVersion?: string;
  };
};

export type AiAnswerOutput = {
  text: string;
  model: string;
  providerResponseId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export interface AiProvider {
  answer(input: AiAnswerInput): Promise<AiAnswerOutput>;
}
```

### 12.2 Responses API As Primary

For new API server work, prefer OpenAI Responses API behind the provider interface.

Suggested shape:

```ts
const response = await client.responses.create({
  model: env.TEACHME_OPENAI_MODEL,
  instructions,
  input,
  store: false,
  metadata: {
    product: "teachme",
    request_id: requestId
  }
});
```

Keep this logic in `providers/openai/responses.ts`.

### 12.3 Legacy Chat Completions Fallback

During migration, a legacy provider can reproduce current behaviour:

```ts
await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model,
    temperature: 0.1,
    messages
  })
});
```

Use the fallback only through the provider interface, not in route handlers.

### 12.4 Model Configuration

Model names must be configuration, not client input.

Use:

```text
TEACHME_OPENAI_MODEL=
SOCIALQA_OPENAI_MODEL=
BLANDERQA_OPENAI_MODEL=
SPLASH_OPENAI_MODEL=
```

Clients should not choose the model.

## 13. Product Modules

Each product should have a consistent module shape.

```text
products/teachme/
  routes.ts
  schemas.ts
  prompt.ts
  resources.ts
  source-pack.ts
  policy.ts
```

### 13.1 Product Config

```ts
export type ProductConfig = {
  id: "teachme";
  displayName: string;
  enabled: boolean;
  audience: string;
  maxMessageLength: number;
  maxHistoryItems: number;
  sourcePackId: string;
  policyUrls: {
    privacy: string;
    resources: string;
  };
};
```

### 13.2 Source Pack

```ts
export type SourcePack = {
  id: string;
  version: string;
  lastReviewed: string;
  jurisdiction?: string;
  sources: Source[];
};

export type Source = {
  id: string;
  title: string;
  organisation: string;
  url: string;
  scope: string;
  topics: string[];
  stages?: string[];
};
```

### 13.3 Topic Matcher

Move current regular expression logic into data or code with tests.

```ts
export type TopicBundle = {
  id: string;
  match: RegExp;
  title: string;
  summary: string;
  sourceIds: string[];
  followUps: string[];
};
```

For a future admin-editable system, store topic matchers in JSON as keyword arrays instead of raw regular expressions.

## 14. TeachMe Source Pack

Create:

```text
src/products/teachme/data/sources.json
```

or:

```text
data/teachme/sources.json
```

Initial sources:

- `primary-national-curriculum`
- `development-matters`
- `reading-framework`
- `eyfs-statutory-framework`
- `primary-mathematics-guidance`
- `eef-working-with-parents`
- `ks2-tests-parent-info`
- `reception-baseline-parent-info`
- `multiplication-tables-check-parent-info`

URLs:

- https://www.gov.uk/government/publications/national-curriculum-in-england-primary-curriculum
- https://www.gov.uk/government/publications/development-matters--2
- https://www.gov.uk/government/publications/the-reading-framework-teaching-the-foundations-of-literacy
- https://www.gov.uk/government/publications/early-years-foundation-stage-framework--2
- https://www.gov.uk/government/publications/teaching-mathematics-in-primary-schools
- https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/supporting-parents
- https://www.gov.uk/government/publications/key-stage-2-tests-information-for-parents
- https://www.gov.uk/government/publications/reception-baseline-assessment-information-for-parents
- https://www.gov.uk/government/publications/multiplication-tables-check-information-for-parents

## 15. Prompt Assembly

Prompt logic belongs in product modules, not routes.

```ts
export function buildTeachMeInstructions(input: {
  sourcePack: SourcePack;
  schoolYear: SchoolYearContext;
  selectedSources: Source[];
}): string;
```

The TeachMe prompt should preserve current principles:

- calm, practical, plain-English guide
- parents and carers as audience
- English early years and primary National Curriculum
- answer curriculum and assessment questions only from allowed resources
- outside-scope links must be separated from references
- do not invent URLs
- do not invent statutory wording, dates, thresholds, assessment details, or policy changes
- adapt to selected school year and key stage
- explain what the child is building toward
- include practical home support
- suggest what to ask school when precision matters
- avoid diagnosis, safeguarding decisions, SEN determinations, legal advice, and professional education advice
- use plain text output
- include references from allowed sources

### 15.1 Prompt Tests

Tests should assert:

- allowed source titles are present
- allowed source URLs are present
- selected year context is present
- outside-scope wording is present
- parent-safe limitation wording is present
- no unrelated product prompt text leaks in

## 16. Request Validation

Use Zod or equivalent.

TeachMe chat schema:

```ts
const TeachMeChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(2500)
  })).max(8).default([]),
  schoolYear: z.object({
    id: z.enum(["all", "reception", "year1", "year2", "year3", "year4", "year5", "year6"]),
    label: z.string().max(40),
    keyStage: z.string().max(40),
    age: z.string().max(40),
    focus: z.string().max(180)
  }),
  sourceContext: z.object({
    sourceIds: z.array(z.string()).max(8).default([])
  }).optional(),
  client: z.object({
    type: z.enum(["web", "android"]),
    appVersion: z.string().max(40).optional(),
    locale: z.string().max(20).optional(),
    timezone: z.string().max(80).optional()
  }).optional(),
  guard: z.object({
    turnstileToken: z.string().max(2048).optional()
  }).optional()
});
```

Do not trust client-supplied source titles or URLs. Clients may send source IDs; the server resolves IDs against the source pack.

## 17. Error Contract

Use one error envelope across all products.

```json
{
  "ok": false,
  "error": {
    "code": "invalid_request",
    "message": "The request body is not valid.",
    "requestId": "req_01J...",
    "details": [
      {
        "path": "message",
        "issue": "Required"
      }
    ]
  }
}
```

Recommended error codes:

- `invalid_request`
- `invalid_message`
- `product_disabled`
- `auth_required`
- `entitlement_required`
- `rate_limited`
- `turnstile_required`
- `turnstile_failed`
- `source_not_found`
- `source_pack_unavailable`
- `upstream_failed`
- `upstream_empty`
- `upstream_timeout`
- `billing_verification_failed`
- `connector_not_connected`
- `connector_scope_missing`
- `internal_error`

HTTP mapping:

```text
400 invalid_request
401 auth_required
402 entitlement_required
403 turnstile_failed / connector_scope_missing
404 source_not_found
408 upstream_timeout
429 rate_limited
500 internal_error
502 upstream_failed / upstream_empty
503 product_disabled / source_pack_unavailable
```

## 18. Security

### 18.1 Secrets

Never expose these to browser or Android clients:

- OpenAI API key
- Turnstile secret key
- Google Play service-account credentials
- OAuth client secrets
- token encryption keys
- provider refresh tokens

### 18.2 Logging

Default logs should include:

- request ID
- route
- product
- status code
- latency
- client type
- entitlement tier
- model name
- approximate usage
- upstream error type

Default logs should not include:

- full user question
- full AI answer
- OAuth access tokens
- refresh tokens
- payment tokens
- child names
- school names

Use sampled or explicit debug logging for deeper investigation, with redaction.

### 18.3 Payload Limits

Set strict limits:

```text
JSON body limit: 50kb for chat
message length: 1000 for clients
server absolute message length: 2000 while migrating
history items: 8
history item length: 2500
```

### 18.4 Timeouts

Use:

- API request timeout
- OpenAI upstream timeout
- graceful cancellation where possible
- clear timeout error code

Do not let PM2 processes pile up waiting indefinitely on upstream calls.

## 19. PM2 Deployment

### 19.1 Process Names

Recommended PM2 apps:

```text
jahosi-web
jahosi-api
```

### 19.2 Example API Ecosystem File

```js
module.exports = {
  apps: [
    {
      name: "jahosi-api",
      script: "dist/index.js",
      cwd: "/var/www/jahosi-api",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "4001"
      },
      max_memory_restart: "300M",
      time: true,
      error_file: "/var/log/jahosi-api/error.log",
      out_file: "/var/log/jahosi-api/out.log"
    }
  ]
};
```

For a small app, `fork` with one instance is fine. If traffic grows, use cluster mode and move rate limiting/session counters to Redis or a database.

### 19.3 Reverse Proxy

Recommended Nginx shape:

```nginx
server {
  server_name api.jahosi.co.uk;

  location / {
    proxy_pass http://127.0.0.1:4001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Keep TLS at the reverse proxy.

### 19.4 Deploy Steps

```text
git pull
npm ci
npm run build
npm test
pm2 reload jahosi-api
pm2 save
curl https://api.jahosi.co.uk/healthz
curl https://api.jahosi.co.uk/readyz
```

## 20. Migration Plan From Current Web App

### Phase 0: Create API Skeleton

Tasks:

- create separate Node.js/TypeScript API project
- add health routes
- add request IDs
- add JSON error envelope
- add CORS allowlist
- add PM2 ecosystem file
- add `.env.example`
- add basic tests

Acceptance criteria:

- `GET /healthz` works locally
- `GET /readyz` verifies config without paid upstream call
- PM2 can run the API app separately from Jahosi web

### Phase 1: Extract TeachMe Source Data

Tasks:

- create `sources.json`
- create `years.json`
- create topic bundles
- port current TeachMe source list exactly
- port current topic matching
- add source validation script
- add tests

Acceptance criteria:

- `/v1/teachme/sources` returns all current sources
- `/v1/teachme/resources?topic=...` matches current web behaviour
- source URLs validate

### Phase 2: Extract TeachMe Prompt And Chat

Tasks:

- port `TEACH_ME_CHAT_GUIDELINES`
- implement prompt builder
- implement OpenAI provider layer
- implement `/v1/teachme/chat`
- implement current plain text normalisation
- add mocked provider tests

Acceptance criteria:

- API answer matches current product behaviour in tone and constraints
- route returns structured `ok/data/meta`
- route never exposes OpenAI provider raw response to client

### Phase 3: Point Web App At API Server

Tasks:

- add `TEACHME_API_BASE_URL` to web app environment
- update browser JavaScript to call `https://api.jahosi.co.uk/v1/teachme/chat`
- update resource lookup to call API
- keep same UI
- keep old server route as fallback for one release

Acceptance criteria:

- current TeachMe page works through API server
- old `/teachMe/chat` can be disabled after confidence period
- web server no longer needs OpenAI key for TeachMe

### Phase 4: Add Shared Product Pattern

Tasks:

- generalise product modules
- move SocialQA and BlanderQA into same API pattern
- create source packs for each product
- create common report endpoint or per-product report endpoints
- create common OpenAI provider

Acceptance criteria:

- at least two products use the same API server pattern
- product-specific prompt and source logic remains isolated

### Phase 5: Android Readiness

Tasks:

- finalise `/v1/teachme/config`
- add client type and app version handling
- add report endpoint
- add entitlement placeholders
- add stable error handling
- add API docs examples for Android developer

Acceptance criteria:

- Android app can be built without depending on web routes
- API supports all MVP Android functions

### Phase 6: Monetisation Readiness

Tasks:

- add Google Play Billing verification
- add entitlements
- add usage limits
- add restore entitlement endpoint
- add usage metrics
- add admin/support reporting

Acceptance criteria:

- expensive AI calls are entitlement-gated
- free and paid limits work server-side
- Play Store purchase state is verified by server

### Phase 7: Connector Readiness

Tasks:

- add OAuth connection model
- add encrypted token storage
- add provider connection screens/endpoints
- add MCP/connector provider layer
- add consent and data-use confirmations
- add disconnect/revoke flow

Acceptance criteria:

- connector use is opt-in
- backend controls OAuth tokens
- client never stores provider refresh tokens
- connector data is only sent to OpenAI after explicit user action

## 21. Database Strategy

### 21.1 MVP

If single-server and no accounts:

- SQLite is acceptable
- use it for usage events, reports, entitlement placeholders
- keep source packs as versioned JSON files

### 21.2 Growth

Move to Postgres when:

- accounts are added
- subscriptions are live
- connector refresh tokens are stored
- multiple API instances are needed
- admin/reporting needs grow

### 21.3 Suggested Tables

```sql
create table api_requests (
  id text primary key,
  product text not null,
  route text not null,
  client_type text,
  status_code integer not null,
  latency_ms integer not null,
  created_at text not null
);

create table usage_events (
  id text primary key,
  product text not null,
  user_id text,
  anonymous_id text,
  entitlement text,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at text not null
);

create table answer_reports (
  id text primary key,
  product text not null,
  answer_id text not null,
  reason text not null,
  details text,
  status text not null,
  created_at text not null
);

create table entitlements (
  id text primary key,
  user_id text,
  anonymous_id text,
  provider text not null,
  product_id text not null,
  status text not null,
  expires_at text,
  updated_at text not null
);
```

## 22. API Documentation

Create machine-friendly docs:

```text
docs/
  api/
    openapi.yaml
    teachme.md
    errors.md
    auth.md
```

The OpenAPI document should describe:

- request schemas
- response schemas
- error envelopes
- example payloads
- auth requirements
- rate limit responses

This will help both human development and future AI-assisted client generation.

## 23. Testing Strategy

### 23.1 Unit Tests

Required:

- source-pack loading
- source ID lookup
- topic matching
- year context validation
- prompt builder
- reply normalisation
- error envelope generation
- entitlement decisions

### 23.2 Integration Tests

Required:

- `GET /healthz`
- `GET /readyz`
- `GET /v1/teachme/config`
- `GET /v1/teachme/sources`
- `GET /v1/teachme/resources`
- `POST /v1/teachme/chat` with mocked OpenAI provider
- `POST /v1/teachme/reports`

### 23.3 Contract Tests

Contract tests should use stored JSON examples from this document and ensure the API continues to accept and return the expected shapes.

### 23.4 Source Validation Tests

Run manually before releases and optionally in CI:

- confirm HTTPS URL status
- confirm redirects are expected
- confirm source page still exists
- confirm `lastReviewed` is updated after manual review

## 24. Observability

Track:

- request volume by product
- chat volume by product
- average latency
- upstream OpenAI latency
- upstream error rate
- token usage
- cost estimate
- rate-limit hits
- report count
- source lookup count
- Android vs web usage

Avoid tracking personal content by default.

Recommended log event:

```json
{
  "level": "info",
  "msg": "api_request_complete",
  "requestId": "req_01J...",
  "product": "teachme",
  "route": "/v1/teachme/chat",
  "clientType": "web",
  "statusCode": 200,
  "latencyMs": 1820,
  "model": "configured-server-side",
  "inputTokens": 1800,
  "outputTokens": 420
}
```

## 25. Web App Integration Pattern

The existing browser app should move from relative calls:

```js
fetch("/teachMe/chat", ...)
fetch("/teachMe/resource-info?topic=...", ...)
```

to API calls:

```js
fetch(`${TEACHME_API_BASE_URL}/v1/teachme/chat`, ...)
fetch(`${TEACHME_API_BASE_URL}/v1/teachme/resources?topic=...`, ...)
```

Because `public/teachMe/index.html` is currently static HTML rendered through the Node web app, the web app can inject:

```html
<script>
  window.TEACHME_API_BASE_URL = "https://api.jahosi.co.uk";
</script>
```

or replace a token:

```text
"__TEACHME_API_BASE_URL__"
```

Fallback plan:

- if API base URL is missing, call current relative routes
- after successful migration, remove fallback

## 26. Future Multi-Product Pattern

The API server should support products with the same basic lifecycle:

```text
source pack -> topic lookup -> prompt builder -> OpenAI provider -> normalised answer -> report/usage
```

Example products:

- TeachMe: English primary curriculum parent guide
- SocialQA: adult social care funding guide
- BlanderQA: Blender 4.0 guide
- splash chemistry: pool chemistry support

Each product should define:

- product ID
- display name
- source pack
- topic matcher
- stage/context model if any
- prompt builder
- safety boundaries
- max message length
- allowed client types
- policy URLs

Shared code should not blur product safety boundaries. A SocialQA prompt must never leak into TeachMe. A TeachMe source pack must never be used as evidence for BlanderQA.

## 27. AI-Agent Implementation Notes

When using an AI coding agent to build this API server:

- read this file first
- read `public/teachMe/android.md`
- read current `jahosi.js` TeachMe routes
- read `public/teachMe/resources.md`
- create the API server separately from the web server
- keep web routes working until migration is complete
- do not move static website concerns into the API app
- do not expose OpenAI keys to browser or Android clients
- use schemas for every request
- use one JSON error envelope
- keep prompt assembly testable
- store source lists as JSON
- prefer explicit product modules over a vague generic chatbot abstraction
- add tests before migrating the web client
- make OpenAI model names server-side configuration
- implement connectors only after base API, reports, and entitlements are stable

## 28. Recommended First Sprint

The first useful sprint should produce a boring but solid API skeleton.

Deliverables:

- `jahosi-api` project
- TypeScript build
- PM2 ecosystem file
- `/healthz`
- `/readyz`
- request ID middleware
- JSON error middleware
- CORS allowlist
- TeachMe `sources.json`
- TeachMe `years.json`
- `GET /v1/teachme/config`
- `GET /v1/teachme/sources`
- `GET /v1/teachme/resources?topic=...`
- tests for source loading and topic lookup

Do not start with billing, accounts, connectors, or Android-specific complexity. The foundation is the reusable source-scoped API.

## 29. Recommended Second Sprint

Deliverables:

- OpenAI provider interface
- Responses API provider
- legacy Chat Completions fallback if needed
- TeachMe prompt builder
- `POST /v1/teachme/chat`
- mocked OpenAI integration tests
- structured answer response
- `POST /v1/teachme/reports`
- web app feature flag to call API server

At the end of the second sprint, the existing TeachMe browser page should be capable of using `api.jahosi.co.uk` without changing the visible UX.

## 30. Decision Summary

Build a separate API server.

Keep `jahosi.co.uk` as the public browser platform.

Use `api.jahosi.co.uk` as the shared product backend for TeachMe and future Jahosi AI assistants.

Make the API boring, typed, versioned, and source-disciplined:

- JSON in
- JSON out
- one error shape
- product namespaces
- source packs
- prompt builders
- OpenAI provider abstraction
- server-side secrets
- PM2 deployment
- clean migration path

The API gateway becomes the durable product foundation. The web app and Android app become clients of that foundation.
