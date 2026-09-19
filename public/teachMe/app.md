# TeachMe Android Productisation Plan

Status: planning document
Audience: senior product developer, AI coding agent, Android engineer, backend engineer
Target product: stylish, simple, non-bloated, own-server-hosted, API-based React Android app
Current web app location: `/teachMe/`
Current static assets: `public/teachMe/index.html`, `public/teachMe/policy.html`, `public/teachMe/resources.md`
Current backend: `jahosi.js`
Current chat endpoint: `POST /teachMe/chat`
Current source lookup endpoint: `GET /teachMe/resource-info?topic=...`
Current source list reviewed in app: 18 September 2026

## 1. Product Intent

TeachMe should become a small, trustworthy Android product for parents and carers who want plain-English help understanding the English early years and primary National Curriculum.

The Android version should not feel like a wrapped website. It should feel like a calm, fast mobile tool:

- choose a school year
- ask a question
- receive a source-scoped answer
- open the official source links
- export or share the answer
- look up allowed resources by topic
- keep display and accessibility preferences
- keep all OpenAI API keys and paid entitlements on the server
- optionally, later, connect to user-authorised services such as Google Drive or Google Calendar through a backend-mediated OAuth flow

The business goal is a low-support paid utility. Avoid turning it into a large tutoring platform, social network, learning management system, or content marketplace before the core experience proves demand.

## 2. Current Web App Functions To Preserve

The current TeachMe web app already has a clear product shape. The Android app must preserve these functions before adding anything else.

### 2.1 Year Selection

Current web behaviour:

- user selects `All years`, `Reception`, or `Year 1` through `Year 6`
- each option carries key stage, typical age, and focus text
- the selected year is sent to the backend as `schoolYearContext`
- the backend uses that context to adapt answers

Android equivalent:

- use a compact top-level segmented selector or modal picker
- persist the last selected year locally
- show one sentence of stage context under the selector
- include the selected year in every chat request

Suggested React state shape:

```ts
type SchoolYearId =
  | "all"
  | "reception"
  | "year1"
  | "year2"
  | "year3"
  | "year4"
  | "year5"
  | "year6";

type SchoolYearContext = {
  id: SchoolYearId;
  year: string;
  keyStage: string;
  age: string;
  focus: string;
};
```

### 2.2 Chat

Current web behaviour:

- user enters a question
- client sends `message`, recent `history`, optional `localContext`, selected `schoolYearContext`, optional `chatSessionToken`, and optional Turnstile token
- backend validates message length
- backend keeps OpenAI key server-side
- backend sends constrained prompt and allowed source list to OpenAI
- backend returns `{ reply, chatSessionToken? }`
- client stores recent history in browser session storage

Android equivalent:

- store short recent history on-device only by default
- do not send more than the recent window needed for answer continuity
- use the backend as the only caller of OpenAI
- never embed the OpenAI API key in the Android app
- expose clear loading, retry, and empty-state behaviour
- include a "Report answer" control to satisfy AI-generated content expectations for Play Store distribution

Suggested Android chat request:

```json
{
  "message": "What should I understand about fractions this year?",
  "history": [
    { "role": "user", "content": "Year 4: What is the multiplication tables check?" },
    { "role": "assistant", "content": "..." }
  ],
  "schoolYearContext": {
    "id": "year4",
    "year": "Year 4",
    "keyStage": "Key Stage 2",
    "age": "8 to 9",
    "focus": "Lower key stage 2: multiplication tables fluency, wider subject knowledge and increasingly independent learning."
  },
  "localContext": null,
  "client": {
    "platform": "android",
    "appVersion": "1.0.0",
    "locale": "en-GB"
  }
}
```

Suggested Android chat response:

```json
{
  "reply": "Plain-text answer...",
  "references": [
    {
      "title": "National curriculum in England: primary curriculum",
      "url": "https://www.gov.uk/government/publications/national-curriculum-in-england-primary-curriculum"
    }
  ],
  "answerId": "ans_...",
  "usage": {
    "plan": "free",
    "remainingToday": 2
  }
}
```

The current backend returns a plain reply only. A production Android API should evolve toward structured JSON with references extracted and normalised. Keep backwards compatibility while the web app still uses `/teachMe/chat`.

### 2.3 Resource Lookup

Current web behaviour:

- user searches a topic such as phonics, maths, science, assessment, geography
- backend returns only local allowed-source links
- selected source context can be attached to a later chat request

Android equivalent:

- surface "Sources" as a first-class tab or bottom-sheet
- allow searching source topics without invoking AI
- show official source cards with title, publisher, scope, and external link
- allow "Ask using this source context"

Suggested endpoint:

```http
GET /api/v1/teachme/resources?topic=phonics
```

Suggested response:

```json
{
  "title": "Reading and phonics",
  "summary": "Use these official sources for reading foundations and phonics.",
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
    "What should I understand about reading and phonics for this school year?"
  ]
}
```

### 2.4 Display Preferences

Current web behaviour:

- high contrast toggle
- large font toggle
- preference stored locally

Android equivalent:

- respect Android system font scaling
- provide high contrast mode
- avoid tiny grey explanatory text
- keep the interface visually warm but not decorative-heavy
- store settings locally using AsyncStorage, SecureStore, or the framework equivalent

### 2.5 Export

Current web behaviour:

- export chat to PDF in the browser with jsPDF, with print fallback

Android equivalent:

- phase 1: share plain text using Android share sheet
- phase 2: export PDF generated on-device or server-side
- include source URLs in the export
- include a generated date and disclaimer
- do not store exports server-side unless the user explicitly chooses account sync later

### 2.6 Policy And Disclaimer

Current web behaviour:

- policy page explains source scope, privacy, responsible use, and limitations

Android equivalent:

- include in-app Privacy, Source Scope, and Responsible Use pages
- link to the hosted policy page
- keep copy synced with web
- add Play Store data-safety wording and account deletion wording if accounts are introduced

## 3. Source Of Truth For Data

TeachMe should not scrape broad web search results for its core educational answers. Its trust is built on source discipline.

### 3.1 Allowed Curriculum Sources

The canonical app source list currently appears in two places:

- `public/teachMe/resources.md`
- `TEACH_ME_SOURCES` inside `jahosi.js`

This duplication should be removed before production. Create a single machine-readable source file and generate both the app reference display and prompt context from it.

Recommended file:

```text
data/teachme/sources.json
```

Recommended schema:

```json
{
  "lastReviewed": "2026-09-18",
  "jurisdiction": "England",
  "audience": "Parents and carers",
  "sources": [
    {
      "id": "primary-national-curriculum",
      "title": "National curriculum in England: primary curriculum",
      "organisation": "Department for Education / GOV.UK",
      "url": "https://www.gov.uk/government/publications/national-curriculum-in-england-primary-curriculum",
      "scope": "Statutory primary national curriculum programmes of study and attainment targets for maintained schools in England.",
      "stages": ["ks1", "ks2"],
      "topics": ["english", "mathematics", "science", "computing", "history", "geography", "art", "design-and-technology", "music", "physical-education", "languages"]
    }
  ]
}
```

Initial source IDs:

- `primary-national-curriculum`
- `development-matters`
- `reading-framework`
- `eyfs-statutory-framework`
- `primary-mathematics-guidance`
- `eef-working-with-parents`
- `ks2-tests-parent-info`
- `reception-baseline-parent-info`
- `multiplication-tables-check-parent-info`

Current allowed links:

- https://www.gov.uk/government/publications/national-curriculum-in-england-primary-curriculum
- https://www.gov.uk/government/publications/development-matters--2
- https://www.gov.uk/government/publications/the-reading-framework-teaching-the-foundations-of-literacy
- https://www.gov.uk/government/publications/early-years-foundation-stage-framework--2
- https://www.gov.uk/government/publications/teaching-mathematics-in-primary-schools
- https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/supporting-parents
- https://www.gov.uk/government/publications/key-stage-2-tests-information-for-parents
- https://www.gov.uk/government/publications/reception-baseline-assessment-information-for-parents
- https://www.gov.uk/government/publications/multiplication-tables-check-information-for-parents

### 3.2 Source Validation Rules

Before Play Store launch:

- verify each source URL resolves over HTTPS
- verify the source title still matches the page title or official publication title
- update `lastReviewed`
- keep a script that checks HTTP status, redirect target, and changed title
- fail CI if a GOV.UK or EEF source returns a hard error
- do not silently replace source URLs with third-party summaries

Recommended validation script:

```text
scripts/validate-teachme-sources.mjs
```

Validation output should include:

- URL
- status code
- final URL after redirects
- content type
- page title when retrievable
- pass/fail
- checked timestamp

### 3.3 Prompt Grounding Rules

The app should continue to tell the model:

- answer only from allowed and evidence-informed listed resources for curriculum and assessment claims
- signpost outside-scope resources separately
- do not invent URLs
- do not invent policy dates, statutory wording, assessment arrangements, scaled scores, or thresholds
- always adapt to selected year and key stage
- include references from the allowed list
- keep advice parent-safe

In production, make the prompt builder deterministic:

```ts
function buildTeachMeInstructions(input: {
  schoolYearContext: SchoolYearContext;
  allowedSources: TeachMeSource[];
  selectedSourceContext?: TeachMeSource[];
}): string
```

The prompt builder should be unit tested. Treat prompt regressions like product regressions.

## 4. OpenAI Platform Integration

### 4.1 Platform Links That Must Work

Use these links in internal setup documentation and admin runbooks:

- OpenAI Platform: https://platform.openai.com/
- API keys: https://platform.openai.com/api-keys
- Usage: https://platform.openai.com/usage
- Limits: https://platform.openai.com/settings/organization/limits
- OpenAI API docs: https://developers.openai.com/api/docs
- Developer quickstart: https://developers.openai.com/api/docs/quickstart
- Responses migration guide: https://developers.openai.com/api/docs/guides/migrate-to-responses
- MCP/connectors guide: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- Production best practices: https://developers.openai.com/api/docs/guides/production-best-practices

Implementation note: do not make the Android app depend on a clickable OpenAI Platform link. The platform links are for the operator/developer. End users should never need an OpenAI account or API key.

### 4.2 API Key Handling

OpenAI production guidance says API keys must not be exposed in code or public repositories and should be provided through environment variables or a secret management service.

Therefore:

- never store `OPENAI_API_KEY` in the Android app
- never send `OPENAI_API_KEY` to the Android app
- backend reads `OPENAI_API_KEY` from environment or secret manager
- backend enforces auth, billing entitlement, rate limits, and abuse checks before calling OpenAI
- backend has separate staging and production OpenAI projects or keys
- backend has spend limits and alerts configured before launch
- API key rotation is documented

Current app environment variable:

```text
SPLASH_OPENAI_API_KEY
```

Production recommendation:

```text
OPENAI_API_KEY
TEACHME_OPENAI_MODEL
TEACHME_OPENAI_BASE_URL
TEACHME_DAILY_FREE_LIMIT
TEACHME_DAILY_PAID_LIMIT
```

Keep `SPLASH_OPENAI_API_KEY` only as a backwards-compatible alias during migration.

### 4.3 Move From Chat Completions To Responses API

The current TeachMe endpoint uses:

```text
POST /chat/completions
model: gpt-4o-mini
```

For the Android product, use the Responses API for new work. OpenAI documentation describes Responses as the recommended API primitive for new projects and the route for agentic tools such as remote MCP.

Recommended backend abstraction:

```ts
type AiProvider = {
  answerTeachMeQuestion(input: TeachMeAnswerInput): Promise<TeachMeAnswerOutput>;
};
```

Phase 1 can keep Chat Completions while the Android app is being built. Phase 2 should introduce a Responses implementation behind the same internal interface.

Suggested Responses call shape:

```ts
const response = await openai.responses.create({
  model: process.env.TEACHME_OPENAI_MODEL || "gpt-5-mini",
  instructions: buildTeachMeInstructions(...),
  input: buildTeachMeInputItems(...),
  store: false
});
```

Important: confirm the exact production model shortly before implementation. Model availability and pricing change. Do not hard-code a speculative model name without checking the current OpenAI model page and project access.

### 4.4 Connectors And MCP

OpenAI documentation currently separates modern remote MCP usage from legacy `connector_id` usage.

Important current facts:

- for remote MCP servers, pass `server_url`
- authenticated MCP servers commonly require an OAuth access token in the `authorization` field
- the Responses API does not store the `authorization` value, so the application must send it on every Responses API creation request
- `connector_id` is deprecated for models released after September 1, 2026
- existing pre-cutoff models may retain connector support
- available legacy connector IDs include Dropbox, Gmail, Google Calendar, Google Drive, Microsoft Teams, Outlook Calendar, Outlook Email, and SharePoint
- OAuth client registration and authorization must be handled separately by this application

Product interpretation:

- do not build the MVP around legacy `connector_id`
- build the backend around a generic MCP tool configuration model that can use `server_url`
- only use legacy connectors when there is no suitable official remote MCP server and the selected model supports them
- never assume the user's ChatGPT connector setup can be reused in your Android app
- your app must own the OAuth flow, consent screen, token refresh, token storage, and revocation

Connector phase should be optional and paid. It should not block the base TeachMe launch.

Good connector use cases:

- parent imports a school PDF from Google Drive and asks, "What does this mean for Year 4?"
- parent connects Google Calendar and asks, "What school-related dates are coming up this week?"
- parent imports a homework sheet from Dropbox and asks for parent-friendly explanation

Bad connector use cases:

- broad access to every file without obvious need
- writing back to calendars or files in v1
- reading email by default
- searching private family data without clear consent and visible scope

## 5. Recommended Architecture

### 5.1 High-Level System

```text
Android app
  |
  | HTTPS JSON API
  v
TeachMe backend API
  |
  | entitlement, rate limit, source policy, prompt builder
  v
OpenAI Responses API
  |
  | optional: MCP / connector calls with user OAuth token
  v
External user-authorised service
```

Backend remains the product core. Android is a client.

### 5.2 Recommended Technology Choices

Android client:

- React Native if you want a genuinely native app shell and Play Billing integration
- React + Capacitor if you want maximum reuse from a future web React app
- TypeScript either way
- TanStack Query or equivalent for API state
- local storage for preferences and short chat history
- secure storage only for app session tokens, not OpenAI keys

Backend:

- Node.js / Express initially, because the current app is already Express
- TypeScript migration strongly recommended before Android launch
- OpenAI official JavaScript SDK
- SQLite can remain for analytics, but user accounts and entitlements may eventually need Postgres
- rate limiting per user, device, IP, and entitlement tier
- structured logs with request IDs

Billing:

- Google Play Billing for in-app paid access, subscriptions, or feature unlocks
- backend validates purchase tokens with Google APIs
- backend stores entitlements
- Android app treats local purchase state as a convenience only; server is authoritative

### 5.3 API Namespace

Do not keep Android on browser-oriented routes forever. Add versioned JSON API routes:

```text
/api/v1/teachme/config
/api/v1/teachme/chat
/api/v1/teachme/resources
/api/v1/teachme/report
/api/v1/teachme/export
/api/v1/teachme/entitlements
/api/v1/teachme/billing/google/verify
/api/v1/teachme/oauth/:provider/start
/api/v1/teachme/oauth/:provider/callback
/api/v1/teachme/connectors
```

Keep `/teachMe/chat` and `/teachMe/resource-info` for the existing web app until the web app is migrated.

### 5.4 Configuration Endpoint

The Android app should ask the server what features are available. This prevents app updates for every flag change.

```http
GET /api/v1/teachme/config
```

Response:

```json
{
  "app": {
    "minimumSupportedVersion": "1.0.0",
    "latestVersion": "1.0.0"
  },
  "features": {
    "chat": true,
    "sourceLookup": true,
    "pdfExport": false,
    "connectors": false,
    "accounts": false,
    "billing": true
  },
  "limits": {
    "freeQuestionsPerDay": 5,
    "maxMessageLength": 1000,
    "maxHistoryItems": 8
  },
  "sourceList": {
    "lastReviewed": "2026-09-18",
    "url": "https://jahosi.co.uk/teachMe/resources.md"
  },
  "policy": {
    "privacyUrl": "https://jahosi.co.uk/teachMe/policy.html",
    "responsibleUseUrl": "https://jahosi.co.uk/teachMe/policy.html"
  }
}
```

## 6. Android UX Direction

### 6.1 Product Feel

TeachMe should feel:

- calm
- practical
- trustworthy
- light
- modern
- parent-friendly
- not childish
- not like a school system
- not like a generic chatbot clone

Avoid:

- large marketing hero screens inside the app
- bloated onboarding
- noisy gamification
- decorative cards nested inside decorative cards
- too many tabs
- social features
- infinite prompt libraries
- storing unnecessary child data

### 6.2 First Screen

Recommended first screen:

```text
Top bar:
  TeachMe
  Settings icon

School year selector:
  All | Rec | Y1 | Y2 | Y3 | Y4 | Y5 | Y6

Chat panel:
  welcome message
  question input
  send button

Starter chips:
  Reading
  English
  Maths
  Assessment
  Wider curriculum
  Home support

Bottom navigation:
  Ask
  Sources
  Saved
  Settings
```

Keep `Saved` hidden until saved chats or exports exist, if desired. Simplicity wins.

### 6.3 Suggested Screens

Screen 1: Ask

- year selector
- chat thread
- input box
- starter prompts
- clear chat
- report answer
- share/export answer

Screen 2: Sources

- source search
- official source cards
- last reviewed date
- open source link
- ask using source

Screen 3: Saved

- local saved exports or pinned answers
- delete local saved item
- no account required in MVP

Screen 4: Settings

- high contrast
- text size follows system
- privacy policy
- source scope
- responsible use
- subscription/manage access
- delete local data
- report a problem

### 6.4 Visual Design Notes

Use a restrained palette rather than a one-note green theme. Current TeachMe has a warm green identity. Keep that, but add neutral surface colours and one secondary accent.

Suggested palette:

- deep text: `#17201c`
- surface: `#fbfaf6`
- panel: `#ffffff`
- line: `#d8ded8`
- primary green: `#2f7d5a`
- soft green: `#e4f2e9`
- secondary ink/blue: `#315d7c`
- warning amber: `#946200`
- error red: `#9f2d2d`

Typography:

- use system font
- do not scale font sizes with viewport width
- respect Android font scaling
- keep buttons stable with min heights
- avoid text overflow in chips by wrapping or using shorter labels

Interaction:

- send button should be icon + accessible label or clear text
- starter prompts should be compact chips or simple list rows
- source cards can have small external-link icons
- report button should be unobtrusive but always available on AI answers

## 7. Privacy, Safety, And Compliance

This app is parent-facing and AI-generated text is central to the product. Treat compliance as part of product design, not paperwork at the end.

### 7.1 Parent-Facing Positioning

Store listing and in-app wording should say:

- for parents and carers
- supports understanding of English early years and primary curriculum
- does not replace the child's school or teacher
- does not diagnose learning needs
- does not provide safeguarding, legal, medical, or special educational needs determinations
- source-scoped answers should be checked against original official pages for exact wording and dates

### 7.2 AI Reporting Requirement

Google Play policy for AI-generated content requires in-app reporting or flagging for offensive AI-generated content.

Add endpoint:

```http
POST /api/v1/teachme/report
```

Payload:

```json
{
  "answerId": "ans_...",
  "reason": "offensive_or_unsafe",
  "details": "Optional user comment",
  "appVersion": "1.0.0"
}
```

Do not require the user to leave the app to report a bad answer.

### 7.3 Data Minimisation

MVP should avoid accounts if possible. A paid-app or device-local subscription entitlement can reduce data handling. If subscriptions require account restore across devices, add account support deliberately and document deletion.

Collect only:

- app session ID or user ID if needed for entitlements
- chat request content
- selected school year
- short recent history needed for continuity
- moderation/report metadata
- purchase entitlement metadata
- minimal diagnostics

Avoid collecting:

- child's full name
- school name unless the user voluntarily types it
- full postcode
- precise location
- contacts
- microphone/camera data
- broad file access

### 7.4 Retention

Suggested defaults:

- chat content: not stored server-side beyond transient logs unless user opts into saved history
- report submissions: retained long enough to investigate and improve safety
- purchase entitlement: retained while subscription or account exists
- analytics: aggregate, privacy-preserving, no IP storage where feasible

### 7.5 Play Store Billing

If the Android app sells a subscription, question allowance, ad-free mode, or any digital functionality inside the app, use Google Play Billing unless a specific regional/legal exception applies.

Backend must verify purchase tokens and store entitlement state. Do not trust only the client.

## 8. Phased Delivery Plan

### Phase 0: Product And Technical Baseline

Goal: freeze the current TeachMe behaviour into a spec before changing architecture.

Tasks:

- document all current web functions
- snapshot current source list
- snapshot current prompt guidelines
- decide MVP pricing model
- decide whether MVP requires accounts
- decide Android framework: React Native or React + Capacitor
- create source validation script
- add automated checks for source URLs
- create backend API namespace `/api/v1/teachme`

Acceptance criteria:

- `sources.json` exists and drives both backend prompt context and resource endpoint
- all source URLs validate
- current web app still works
- OpenAI Platform setup links are documented and checked
- MVP scope is written in one page

### Phase 1: Backend API Extraction

Goal: turn TeachMe from a page-specific endpoint into an app-ready API.

Tasks:

- create `teachme` backend module
- move prompt-building out of route handler
- move source lookup out of ad hoc route logic
- add `/api/v1/teachme/config`
- add `/api/v1/teachme/chat`
- add `/api/v1/teachme/resources`
- add structured response shape with references and answer ID
- keep `/teachMe/chat` working for existing web app
- add request IDs and structured error codes
- add unit tests for prompt builder and source lookup
- add integration test for chat endpoint with mocked OpenAI response

Acceptance criteria:

- Android API can answer without depending on HTML page code
- web app remains functional
- chat response includes answer ID
- source lookup returns stable JSON
- invalid messages return stable error codes

### Phase 2: OpenAI Responses API Migration

Goal: use the OpenAI API shape recommended for new projects while keeping a fallback path.

Tasks:

- add official OpenAI JavaScript SDK if not already present
- create an internal provider interface
- implement current Chat Completions provider as fallback
- implement Responses API provider as primary
- set `store: false` unless a reviewed product reason requires storage
- move model name to `TEACHME_OPENAI_MODEL`
- add per-environment OpenAI config
- add spend and rate-limit runbook
- add operational health check for OpenAI configuration

Acceptance criteria:

- production backend can call Responses API
- no OpenAI key exists in Android code or static assets
- server logs include request ID and provider, not full private chat content by default
- model can be changed without app release
- rollback to fallback provider is documented

### Phase 3: Android MVP Client

Goal: build a simple, stylish Android app with all current functions.

Tasks:

- scaffold React Native or Capacitor app
- implement Ask screen
- implement school year selector
- implement chat thread
- implement starter prompts
- implement source lookup screen
- implement source cards
- implement local chat history for current session
- implement clear local chat
- implement share/export plain text
- implement settings screen
- implement high contrast
- implement policy links
- implement app update/minimum version handling from config endpoint

Acceptance criteria:

- user can complete every current web workflow in Android
- app works on small and large Android phones
- text respects system font scaling
- source links open correctly
- OpenAI calls go only through own backend
- no unnecessary permissions are requested

### Phase 4: Entitlements And Monetisation

Goal: make the app commercially viable without letting costs run away.

Tasks:

- choose paid model: paid app, subscription, or freemium subscription
- integrate Google Play Billing
- add backend purchase-token verification
- add entitlement table
- add free and paid daily/monthly limits
- add graceful limit-reached UI
- add restore purchases
- add manage subscription link
- add server-side abuse controls
- add admin view or logs for usage and cost

Acceptance criteria:

- backend controls whether AI calls are allowed
- app cannot bypass limits by changing local state
- subscription restore works
- failed billing state does not break free features
- cost per active paid user is measurable

### Phase 5: Safety, Reporting, And Store Readiness

Goal: prepare for Play Store review and public users.

Tasks:

- add in-app AI answer reporting
- add `POST /api/v1/teachme/report`
- add moderation/safety review queue or email workflow
- update privacy policy for Android app
- complete Play Console Data Safety form
- write store description that avoids overclaiming
- add responsible-use onboarding note
- add account deletion flow if accounts exist
- add delete local data setting
- add app review credentials if any area requires login
- run accessibility checks

Acceptance criteria:

- every AI answer has report affordance
- policy is reachable from app and store listing
- Data Safety form matches actual app behaviour
- no unsupported claims in store listing
- app can pass review without hidden credentials or unreachable paid areas

### Phase 6: Optional Accounts And Saved History

Goal: add convenience without damaging the low-data trust model.

Tasks:

- decide whether accounts are needed
- add email/passwordless or identity-provider login
- allow saved chats only after explicit opt-in
- add server-side saved sessions
- add delete account and delete saved data
- add export all saved data
- update privacy policy and retention rules

Acceptance criteria:

- user can use core app without entering child identity details
- saved history is clearly opt-in
- deletion works from inside the app and external web resource
- retention period is documented

### Phase 7: Optional Connectors / MCP

Goal: add paid high-value integrations without making the base app risky or bloated.

Tasks:

- select one connector use case, preferably Google Drive file import or Google Calendar school dates
- implement OAuth flow on backend
- store refresh tokens encrypted, if refresh tokens are needed
- request minimal scopes
- add user-facing connected-services screen
- add disconnect and revoke-token flow
- add MCP `server_url` path first
- add legacy `connector_id` path only if needed and supported by selected model
- add connector-specific prompt guardrails
- add file/document redaction guidance
- add user confirmation before sending private document/calendar context to OpenAI

Acceptance criteria:

- user can connect and disconnect a provider
- app clearly shows what data is being used
- backend sends OAuth access token in each Responses API request when using authenticated MCP
- no broad background sync occurs
- connector is not needed for basic TeachMe use

### Phase 8: Growth Experiments

Goal: test whether monetisation should expand.

Possible experiments:

- "Ask the teacher" question generator
- homework explainer from pasted text
- weekly parent digest generated locally from saved prompts
- multi-child year profiles without child names
- school meeting prep sheet
- printable revision conversation
- source-change alerts when GOV.UK pages update

Rules:

- every experiment must preserve source discipline
- every experiment must have clear value for parents
- avoid features that require unnecessary personal data
- remove experiments that increase support burden without conversion

## 9. Backend Data Model

Start minimal.

### 9.1 Tables

```sql
-- Only needed if accounts or entitlements exist.
users (
  id text primary key,
  created_at text not null,
  deleted_at text
);

entitlements (
  id text primary key,
  user_id text not null,
  provider text not null,
  product_id text not null,
  status text not null,
  expires_at text,
  updated_at text not null
);

usage_events (
  id text primary key,
  user_id text,
  anonymous_device_id text,
  event_type text not null,
  created_at text not null,
  model text,
  estimated_input_tokens integer,
  estimated_output_tokens integer
);

ai_reports (
  id text primary key,
  answer_id text not null,
  user_id text,
  reason text not null,
  details text,
  created_at text not null,
  status text not null
);

oauth_connections (
  id text primary key,
  user_id text not null,
  provider text not null,
  display_label text,
  encrypted_refresh_token text,
  scopes text not null,
  created_at text not null,
  revoked_at text
);
```

If accounts are deferred, replace `user_id` with signed anonymous install IDs for limits, and be careful not to create a hidden identity system without telling users.

## 10. Error Codes

Use stable machine-readable errors so the Android app can stay simple.

```json
{
  "error": {
    "code": "limit_reached",
    "message": "You have used today's free questions.",
    "retryAfter": "2026-09-20T00:00:00Z"
  }
}
```

Recommended codes:

- `invalid_message`
- `message_too_long`
- `auth_required`
- `entitlement_required`
- `limit_reached`
- `source_unavailable`
- `upstream_unavailable`
- `upstream_empty`
- `safety_refused`
- `unsupported_app_version`
- `billing_verification_failed`
- `connector_not_connected`
- `connector_scope_missing`

## 11. Testing Strategy

### 11.1 Backend Tests

Required:

- prompt builder unit tests
- source JSON schema test
- source URL validation script
- resource lookup tests
- chat request validation tests
- entitlement gate tests
- OpenAI provider mocked integration tests
- report endpoint tests
- billing verification tests after monetisation
- OAuth token handling tests after connectors

### 11.2 Android Tests

Required:

- year selector state test
- chat send success test
- chat send failure test
- limit reached UI test
- source lookup UI test
- source external link test
- high contrast snapshot
- large text layout snapshot
- share/export test
- report answer test
- no unnecessary Android permissions

### 11.3 Manual QA Matrix

Test devices:

- small Android phone
- mid-size Android phone
- large Android phone
- Android tablet if tablet support is listed

Test conditions:

- offline launch
- slow network
- OpenAI upstream failure
- source lookup failure
- expired entitlement
- large system font
- dark mode if supported
- high contrast
- first install
- upgrade from previous app version

## 12. Launch Checklist

Before internal test:

- source list validates
- backend has staging OpenAI key
- Android app points to staging API
- no OpenAI key in app package
- basic chat works
- resource lookup works
- policy links work
- reporting works
- crash reporting configured, if used and disclosed

Before closed Play test:

- production API deployed
- production OpenAI key configured
- spend limits and alerts configured
- Play Billing products configured
- purchase verification works
- privacy policy updated
- Data Safety form drafted
- store screenshots created
- test account instructions ready if login exists

Before public launch:

- final source review completed
- `lastReviewed` updated
- production logs checked for sensitive data leakage
- app handles quota exhaustion gracefully
- support email/contact route works
- incident rollback plan exists
- cost per answer estimated
- app listing avoids exaggerated educational claims

## 13. Suggested Repository Shape

If TeachMe remains inside this repo:

```text
data/
  teachme/
    sources.json
    year-contexts.json

src/
  teachme/
    prompt.ts
    sources.ts
    openai-provider.ts
    entitlement.ts
    routes.ts
    schemas.ts

public/
  teachMe/
    index.html
    policy.html
    resources.md
    android.md

android-app/
  package.json
  src/
    api/
    components/
    screens/
    state/
    theme/
```

If this grows beyond a small app, split Android into its own repo and keep the backend API here.

## 14. AI-Agent Implementation Notes

When an AI coding agent works on this project, it should:

- read `android.md` first
- read `resources.md`
- read `TEACH_ME_SOURCES` and `TEACH_ME_CHAT_GUIDELINES` in `jahosi.js`
- avoid broad rewrites
- keep the existing web app working
- create source JSON before changing prompts
- preserve parent-safe limitations
- keep API keys server-side
- use OpenAI Responses API for new Android-specific backend work unless a compatibility reason is documented
- treat connector support as optional phase 7, not MVP
- add tests for prompt/source changes
- never add Android permissions without product justification
- prefer simple screens and clear empty states over decorative onboarding

## 15. Recommended MVP Definition

The smallest worthwhile paid Android MVP is:

- React Android app
- own backend API
- school year selector
- chat with source-scoped answers
- starter prompts
- source lookup
- share/export plain text
- policy and responsible-use screens
- high contrast and system text scaling
- AI answer reporting
- server-side OpenAI call
- server-side rate limits
- Google Play Billing if charging in app

Defer:

- connectors
- accounts
- synced history
- PDF generation
- school document import
- push notifications
- teacher/school dashboards
- multi-language support
- broad web search

This keeps the product useful, shippable, and comprehensible.

## 16. Decision Summary

Build TeachMe Android as an API client, not as a web wrapper.

Keep the backend as the place where trust lives:

- source list
- prompt rules
- OpenAI Platform integration
- API key security
- billing entitlements
- rate limits
- reporting
- future connectors

Keep the Android app as the place where ease lives:

- fast year selection
- simple chat
- clean source cards
- readable answers
- quick sharing
- accessible settings

The product should earn money because it is useful and trustworthy, not because it is large. The best first version is almost boring in scope, but polished enough that a parent would actually keep it on their phone.
