# UnityQA React Productisation Plan

Status: planning document
Audience: senior product developer, AI coding agent, React engineer, backend engineer
Target product: stylish, simple, own-server-hosted, API-based React app
Current web app location: `/unityQA/`
Current static assets: `public/unityQA/index.html`, `public/unityQA/policy.html`, `public/unityQA/resources.md`
Current backend: `jahosi.js`
Current chat endpoint: `POST /unityQA/chat`
Current resource lookup endpoint: `GET /unityQA/resource-info?topic=...`
Current source list reviewed in app docs: 11 October 2026

## 1. Product Intent

UnityQA should become a focused product for Unity Engine learners and teams who want plain-English, source-constrained help with Editor workflows, keyboard shortcuts, Scene view navigation, GameObjects, Components, Prefabs, scripting, graphics, animation, physics, UI, navigation, profiling, asset workflow, multiplayer and troubleshooting.

The React version should preserve:

- chat constrained to official Unity sources and officially recognised Unity learning/support resources
- topic-based official resource lookup
- selected source context passed into the next question
- local chat history for the current session
- display preferences stored locally
- OpenAI calls through the server only

Avoid turning UnityQA into an Asset Store recommender, unofficial tutorial index, hardware-vendor adviser, legal/licensing adviser, or general web-search bot.

## 2. Current Web App Functions To Preserve

### 2.1 Chat

Current web behaviour:

- user enters a question up to 1000 characters
- client sends `message`, recent `history`, optional `localContext`, optional `chatSessionToken`, and optional Turnstile token
- backend validates the message
- backend sends constrained UnityQA instructions and official source list to OpenAI
- backend returns `{ reply, chatSessionToken? }`
- client stores recent chat state in browser session storage

React equivalent:

- use a proper chat-thread component with loading, retry and empty states
- keep short recent history in local/session storage only by default
- include optional source context from the Sources screen
- provide clear chat, copy answer, share answer and report answer controls
- do not embed any OpenAI key in the React bundle

## 3. Resource Lookup

Current web behaviour:

- user searches a topic such as Editor, shortcuts, Scene view navigation, Prefabs, scripting, graphics, physics, animation, UI, navigation, profiling or multiplayer
- backend returns official Unity links and follow-up prompts
- selected resource context can be attached to a later chat request

React equivalent:

- make Sources a first-class route or tab
- show official source cards with title, organisation, scope and external-link action
- include topic presets: Editor, Keyboard shortcuts, Scene view navigation, GameObjects, Components, Prefabs, Scripting, Graphics, URP, HDRP, Physics, Animation, Audio, UI Toolkit, Navigation, Assets, Profiler, Multiplayer, Troubleshooting
- allow "Ask using these sources"

Suggested endpoint:

```http
GET /api/v1/unityqa/resources?topic=prefabs
```

## 4. Source Of Truth For Data

The source list currently appears in:

- `public/unityQA/resources.md`
- UnityQA source constants inside `jahosi.js`

Before launch, create a single machine-readable file and generate both prompt context and resource display from it.

Recommended file:

```text
data/unityqa/sources.json
```

## 5. API Namespace

Add versioned JSON routes for the React app:

```text
/api/v1/unityqa/config
/api/v1/unityqa/chat
/api/v1/unityqa/resources
/api/v1/unityqa/report
/api/v1/unityqa/export
```

Keep `/unityQA/chat` and `/unityQA/resource-info` working until the static web app has moved.

## 6. React UX Direction

Recommended screens:

- Ask: chat thread, starter prompts, source context strip, clear/copy/share/report controls
- Sources: search, topic presets, source cards, official-link buttons
- Saved: optional local pinned answers only
- Settings: high contrast, text size, policy, delete local data

Visual direction:

- dark, focused and tool-like, with hints of the Unity Editor and unity.com product styling
- graphite surfaces, thin borders, compact panels, white text and a restrained blue/teal accent
- no decorative marketing bloat; make the first screen useful immediately
- make official source links visibly distinct

## 7. Safety And Product Rules

UnityQA must:

- stay within official Unity documentation, Unity product/release pages, Unity Learn, Unity Support and Unity-recognised documentation routes for authoritative claims
- refuse unsupported version-specific claims for unreleased Unity versions
- warn users not to enter confidential studio, client, account, license, project or unreleased build details
- avoid claiming that one workflow is always best when Unity supports several valid routes
- explain alternatives where useful
- direct third-party Asset Store packages, platform-holder requirements, hardware/driver issues and vendor SDK behaviour to the official vendor documentation

Add `POST /api/v1/unityqa/report` before public launch so users can flag unsafe, wrong or unsupported AI answers.

## 8. AI-Agent Implementation Notes

When an AI coding agent works on this project, it should:

- read `public/unityQA/app.md` first
- read `public/unityQA/resources.md`
- read UnityQA source constants and chat guidelines in `jahosi.js`
- preserve the current web app until migration is complete
- create `data/unityqa/sources.json` before changing prompt logic
- add tests for source lookup and prompt construction
- keep OpenAI keys server-side
- avoid broad rewrites
