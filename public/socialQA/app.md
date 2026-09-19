# SocialQA React Productisation Plan

Status: planning document
Audience: senior product developer, AI coding agent, React engineer, backend engineer
Target product: restrained, trustworthy, own-server-hosted, API-based React app
Current web app location: `/socialQA/`
Current static assets: `public/socialQA/index.html`, `public/socialQA/policy.html`, `public/socialQA/resources.md`
Current backend: `jahosi.js`
Current chat endpoint: `POST /socialQA/chat`
Current local lookup endpoint: `GET /socialQA/local-info?postcode=...`
Current source list reviewed in app docs: 20 September 2026

## 1. Product Intent

SocialQA should become a careful React product for people navigating adult social care funding and related care routes in England. It should translate difficult official information into clearer questions, next steps and signposts, without making decisions for the user.

The React version should preserve:

- source-constrained adult social care Q&A
- local authority and NHS signposting by postcode
- clear warnings about sensitive information
- no provider recommendations
- no regulated financial advice
- no legal, medical, safeguarding or complaint-handling advice
- export/share for the user's own records
- OpenAI key and safety rules held server-side

## 2. Current Web App Functions To Preserve

### 2.1 Chat

Current web behaviour:

- user enters a question up to 1000 characters
- client sends `message`, recent `history`, optional `localContext`, optional `chatSessionToken`, and optional Turnstile token
- backend validates the message
- backend sends constrained SocialQA instructions and source list to OpenAI
- backend returns `{ reply, chatSessionToken? }`
- client keeps recent chat in browser session storage

React equivalent:

- show a visible "do not enter sensitive details" warning near the input
- keep recent history short and local by default
- include local authority context only after postcode lookup
- provide report, copy, share and clear controls on answers
- keep the server as the only OpenAI caller

### 2.2 Local Signposting

Current web behaviour:

- user enters a full UK postcode
- backend queries `https://www.gov.uk/api/local-authority?postcode=...`
- backend returns council details, useful local links, directory search terms and national signposts

React equivalent:

- make Local a first-class screen or panel
- accept a postcode, then immediately explain that local variation matters
- show council, adult social care, safeguarding, local directory, NHS ICB and CQC links
- allow "Use this local context in my next question"
- avoid storing postcodes after the current session unless the user explicitly saves them

Suggested endpoint:

```http
GET /api/v1/socialqa/local-info?postcode=SW1A%202AA
```

## 3. Source Of Truth For Data

The source list currently appears in:

- `public/socialQA/resources.md`
- `SOCIAL_QA_SOURCES` inside `jahosi.js`

Before React launch, create one machine-readable file and generate the source page, prompt context and resource cards from it.

Recommended file:

```text
data/socialqa/sources.json
```

Recommended schema:

```json
{
  "lastReviewed": "2026-09-20",
  "product": "socialqa",
  "jurisdiction": "England",
  "sources": [
    {
      "id": "care-act-2014",
      "title": "Care Act 2014",
      "organisation": "legislation.gov.uk",
      "url": "https://www.legislation.gov.uk/ukpga/2014/23/contents",
      "scope": "Primary legislation for adult care and support in England.",
      "topics": ["care-act", "assessment", "eligibility", "charging"]
    }
  ]
}
```

## 4. API Namespace

Add versioned JSON routes for the React app:

```text
/api/v1/socialqa/config
/api/v1/socialqa/chat
/api/v1/socialqa/local-info
/api/v1/socialqa/resources
/api/v1/socialqa/report
/api/v1/socialqa/export
```

Keep `/socialQA/chat` and `/socialQA/local-info` working for the current page until migration is complete.

Suggested config response:

```json
{
  "app": {
    "minimumSupportedVersion": "1.0.0",
    "latestVersion": "1.0.0"
  },
  "features": {
    "chat": true,
    "localLookup": true,
    "sourceList": true,
    "pdfExport": false,
    "accounts": false
  },
  "limits": {
    "maxMessageLength": 1000,
    "maxHistoryItems": 8
  },
  "sourceList": {
    "lastReviewed": "2026-09-20",
    "url": "https://jahosi.co.uk/socialQA/resources.md"
  },
  "policy": {
    "privacyUrl": "https://jahosi.co.uk/socialQA/policy.html",
    "responsibleUseUrl": "https://jahosi.co.uk/socialQA/policy.html"
  }
}
```

## 5. React UX Direction

Recommended screens:

- Ask: warnings, chat, starter questions, answer controls
- Local: postcode lookup, council/NHS/CQC signposts, local context handoff
- Sources: official source list with topic filters
- Saved: optional local-only exports
- Settings: high contrast, text size, policy, delete local data

First screen:

```text
Top bar:
  SocialQA
  Settings icon

Warning strip:
  Do not enter personal, medical, financial or identifying details.

Starter questions:
  Care fees | Financial assessment | NHS CHC | Care home checks | Complaints

Chat:
  welcome answer
  question input
  send button

Bottom navigation:
  Ask | Local | Sources | Saved | Settings
```

## 6. Safety And Compliance Rules

SocialQA must:

- refuse requests to recommend, rank, compare or endorse providers, advisers, products, care homes, agencies, hospitals, clinicians or named people
- refuse regulated financial advice, legal advice, medical advice, safeguarding decisions and eligibility predictions
- warn users not to enter sensitive information
- not repeat sensitive details back
- explain that local variation matters
- signpost urgent danger to 999, NHS 111 or local safeguarding routes as appropriate
- say when a question needs a local authority, ICB, CQC, ombudsman, solicitor, qualified adviser or professional

Add `POST /api/v1/socialqa/report` before public launch so users can flag unsafe or incorrect AI answers.

## 7. Phased Delivery Plan

Phase 0: Baseline

- snapshot current web behaviour
- create `data/socialqa/sources.json`
- validate source URLs
- document local lookup response shape

Phase 1: Backend API extraction

- add `/api/v1/socialqa/config`
- add `/api/v1/socialqa/resources`
- add `/api/v1/socialqa/local-info`
- add `/api/v1/socialqa/chat`
- return structured references and `answerId`
- keep legacy endpoints working

Phase 2: React client

- scaffold React + TypeScript app
- implement Ask, Local, Sources and Settings
- implement local session history
- implement postcode lookup and local context handoff
- implement copy/share answer
- implement high contrast and local data deletion

## 8. AI-Agent Implementation Notes

When an AI coding agent works on this project, it should:

- read `public/socialQA/app.md` first
- read `public/socialQA/resources.md`
- read `SOCIAL_QA_SOURCES`, `SOCIAL_QA_SOURCE_NOTES` and `SOCIAL_QA_CHAT_GUIDELINES` in `jahosi.js`
- preserve the current static app until migration is complete
- keep source, prompt and safety boundaries separate from TeachMe and BlanderQA
- add tests before changing refusal logic
- keep OpenAI keys server-side
