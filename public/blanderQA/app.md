# BlanderQA React Productisation Plan

Status: planning document
Audience: senior product developer, AI coding agent, React engineer, backend engineer
Target product: stylish, simple, own-server-hosted, API-based React app
Current web app location: `/blanderQA/`
Current static assets: `public/blanderQA/index.html`, `public/blanderQA/policy.html`, `public/blanderQA/resources.md`
Current backend: `jahosi.js`
Current chat endpoint: `POST /blanderQA/chat`
Current resource lookup endpoint: `GET /blanderQA/resource-info?topic=...`
Current source list reviewed in app docs: 20 September 2026

## 1. Product Intent

BlanderQA should become a focused React product for Blender 4.0 learners who want plain-English, source-constrained help with modelling, shading, rendering, animation, rigging, Geometry Nodes, troubleshooting and basic Python/API workflows.

The React version should preserve:

- chat constrained to official Blender 4.0 sources
- topic-based official resource lookup
- selected source context passed into the next question
- local chat history for the current session
- display preferences stored locally
- OpenAI calls through the server only

Avoid turning BlanderQA into a marketplace, add-on recommender, production consultancy, or general web-search bot.

## 2. Current Web App Functions To Preserve

### 2.1 Chat

Current web behaviour:

- user enters a question up to 1000 characters
- client sends `message`, recent `history`, optional `localContext`, optional `chatSessionToken`, and optional Turnstile token
- backend validates the message
- backend sends constrained BlanderQA instructions and official source list to OpenAI
- backend returns `{ reply, chatSessionToken? }`
- client stores recent chat state in browser session storage

React equivalent:

- use a proper chat-thread component with loading, retry and empty states
- keep short recent history in local/session storage only by default
- include optional source context from the Sources screen
- provide clear chat, copy answer, share answer and report answer controls
- do not embed any OpenAI key in the React bundle

Suggested chat request:

```json
{
  "message": "How should I decide between a modifier stack and Geometry Nodes?",
  "history": [
    { "role": "user", "content": "I am modelling a repeated fence pattern." },
    { "role": "assistant", "content": "..." }
  ],
  "localContext": {
    "title": "Modeling and layout",
    "links": [
      { "label": "Modeling", "href": "https://docs.blender.org/manual/en/4.0/modeling/index.html" },
      { "label": "Geometry Nodes", "href": "https://docs.blender.org/manual/en/4.0/modeling/geometry_nodes/index.html" }
    ]
  },
  "client": {
    "platform": "react",
    "appVersion": "1.0.0",
    "locale": "en-GB"
  }
}
```

### 2.2 Resource Lookup

Current web behaviour:

- user searches a topic such as modelling, shading, animation, troubleshooting or Python
- backend returns official Blender links and follow-up prompts
- selected resource context can be attached to a later chat request

React equivalent:

- make Sources a first-class route or tab
- show official source cards with title, organisation, scope and external-link action
- include topic presets: Modeling, Geometry Nodes, Shading, Rendering, Animation, Rigging, Python, Troubleshooting
- allow "Ask using these sources"

Suggested endpoint:

```http
GET /api/v1/blanderqa/resources?topic=geometry%20nodes
```

## 3. Source Of Truth For Data

The source list currently appears in:

- `public/blanderQA/resources.md`
- `BLANDER_QA_SOURCES` inside `jahosi.js`

Before launch, create a single machine-readable file and generate both prompt context and resource display from it.

Recommended file:

```text
data/blanderqa/sources.json
```

Initial source IDs:

- `blender-40-manual`
- `about-blender`
- `help-system`
- `user-interface`
- `editors`
- `scenes-objects`
- `modeling`
- `transform-snapping`
- `snapping`
- `geometry-nodes`
- `sculpting-painting`
- `animation-rigging`
- `principled-bsdf`
- `rendering`
- `compositing`
- `files-assets-data`
- `addons`
- `advanced`
- `troubleshooting`
- `blender-40-release`
- `blender-support-faq`
- `blender-python-api-40`

## 4. API Namespace

Add versioned JSON routes for the React app:

```text
/api/v1/blanderqa/config
/api/v1/blanderqa/chat
/api/v1/blanderqa/resources
/api/v1/blanderqa/report
/api/v1/blanderqa/export
```

Keep `/blanderQA/chat` and `/blanderQA/resource-info` working until the static web app has moved.

Suggested config response:

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
    "accounts": false
  },
  "limits": {
    "maxMessageLength": 1000,
    "maxHistoryItems": 8
  },
  "sourceList": {
    "lastReviewed": "2026-09-20",
    "url": "https://jahosi.co.uk/blanderQA/resources.md"
  },
  "policy": {
    "privacyUrl": "https://jahosi.co.uk/blanderQA/policy.html",
    "responsibleUseUrl": "https://jahosi.co.uk/blanderQA/policy.html"
  }
}
```

## 5. React UX Direction

Recommended screens:

- Ask: chat thread, starter prompts, source context strip, clear/copy/share/report controls
- Sources: search, topic presets, source cards, official-link buttons
- Saved: optional local pinned answers only
- Settings: high contrast, text size, policy, delete local data

Visual direction:

- practical, creative, studio-tool feel
- restrained teal, graphite, white and one warm accent
- avoid a generic chatbot look
- make official source links visibly distinct

## 6. Safety And Product Rules

BlanderQA must:

- stay within official Blender 4.0 sources for authoritative claims
- refuse unsupported version-specific claims for newer Blender releases
- warn users not to enter confidential studio, client, account or unreleased project details
- avoid claiming that one workflow is always best
- explain alternatives where useful
- direct hardware, driver, crash and third-party add-on issues to official troubleshooting or vendor support

Add `POST /api/v1/blanderqa/report` before public launch so users can flag unsafe, wrong or unsupported AI answers.

## 7. Phased Delivery Plan

Phase 0: Baseline

- snapshot existing static behaviour
- validate `resources.md`
- create `data/blanderqa/sources.json`
- add source URL validation

Phase 1: Backend API extraction

- add `/api/v1/blanderqa/config`
- add `/api/v1/blanderqa/resources`
- add `/api/v1/blanderqa/chat`
- return structured references and `answerId`
- keep old endpoints working

Phase 2: React client

- scaffold React + TypeScript app
- implement Ask, Sources and Settings
- implement local chat state and display preferences
- implement source-context handoff into chat
- implement copy/share answer

## 8. AI-Agent Implementation Notes

When an AI coding agent works on this project, it should:

- read `public/blanderQA/app.md` first
- read `public/blanderQA/resources.md`
- read `BLANDER_QA_SOURCES` and `BLANDER_QA_CHAT_GUIDELINES` in `jahosi.js`
- preserve the current web app until migration is complete
- create `data/blanderqa/sources.json` before changing prompt logic
- add tests for source lookup and prompt construction
- keep OpenAI keys server-side
- avoid broad rewrites
