# Splash React Productisation Plan

Status: planning document
Audience: senior product developer, AI coding agent, React engineer, backend engineer
Target product: installable React planner with own-server-hosted chemistry assistant
Current web app location: `/splash/`
Current static assets: `public/splash/index.htm`, `public/splash/help.htm`, `public/splash/appendices.htm`, `public/splash/resources.md`, `public/splash/manifest.webmanifest`, `public/splash/sw.js`
Current backend: `jahosi.js`
Current chemistry chat endpoint: `POST /splash/chat`
Current weather providers: Open-Meteo geocoding, forecast and archive APIs called from the browser
Current app version shown in page: 1.8.0
Current source list reviewed in app docs: 20 September 2026

## 1. Product Intent

Splash should become a React planning app for people estimating outdoor playpool or hot-tub heating, cover savings, seasonal electricity costs, temperature trends and routine chemistry context.

The React version should preserve:

- guided setup for first-time users
- local/manual pool setup
- optional location/weather lookup
- 48-hour weather-driven temperature trend
- seasonal cost estimates
- chemistry guide and month-by-month planner
- chemistry bot with strict no-dosing-calculation boundaries
- local exports
- offline-friendly saved configuration

Splash should remain a planning tool, not a pool safety authority, professional installer, or chemical dosing calculator.

## 2. Current Web App Functions To Preserve

### 2.1 Quick Start

Current web behaviour:

- first-time overlay captures location, pool dimensions, base/shade, target temperature, season dates, pool use, chemistry, heating setup, cover use and electricity tariff
- finishing the guide recalculates the planner, saves browser-local configuration, opens the chemistry bot and moves the user toward results

React equivalent:

- implement the quick start as a routed wizard or modal flow
- persist progress locally
- allow skip/manual mode
- keep every field editable later from Settings or Planner

### 2.2 Planner State

Core state should include:

```ts
type SplashPlannerState = {
  aquaticMode: "pool" | "hot-tub";
  poolShape: "rectangular" | "round";
  dimensions: {
    lengthM?: number;
    widthM?: number;
    radiusM?: number;
    depthM?: number;
  };
  volumeL: number;
  ground: "grass" | "decking" | "concrete" | "insulated" | "other";
  shadePercent: number;
  targetTempC: number;
  currentTempC: number;
  heatMode: "none" | "electric" | "heat-pump" | "solar" | "mixed";
  heaterPowerKw?: number;
  heaterEfficiencyPercent?: number;
  heatingHoursPerDay?: number;
  coverType: "none" | "basic" | "solar" | "insulated";
  coverHoursPerDay: number;
  seasonStart: string;
  seasonEnd: string;
  electricityPencePerKwh: number;
  location?: {
    label: string;
    latitude: number;
    longitude: number;
  };
  chemistry: {
    chlorineType?: string;
    ta?: number;
    ph?: number;
    fc?: number;
    br?: number;
    th?: number;
    cya?: number;
    tc?: number;
  };
};
```

### 2.3 Weather And Climate

Current web behaviour:

- Open-Meteo geocoding searches global places
- selected place fetches daily and hourly forecast data
- 48-hour hourly weather includes solar radiation when available
- archive API builds a monthly climate profile
- fallback baselines are used when lookup fails

React equivalent:

- keep weather lookup optional
- make manual values available at all times
- cache the last selected location locally
- show data provenance: live forecast, archive profile or fallback baseline
- consider proxying Open-Meteo through backend only if rate limiting or privacy controls require it

Suggested production routes, if backend proxying is added:

```text
/api/v1/splash/geocode
/api/v1/splash/forecast
/api/v1/splash/climate
```

### 2.4 Chemistry Bot

Current web behaviour:

- floating chemistry chat panel
- user sends `message`, recent `history`, `poolState`, `chemResults`, optional `chatSessionToken` and optional Turnstile token
- backend injects strict chemistry guidelines and current pool state
- backend returns `{ reply, chatSessionToken? }`

React equivalent:

- make Chemistry a first-class panel or bottom sheet
- pass the current planner state and chemistry card outputs
- expose starter issues such as cloudy water, green water, high pH, low chlorine and high CYA
- show the no-dosing-calculation warning near the input
- keep answer history temporary by default

## 3. Source Of Truth For Data

Splash currently has calculation logic in `public/splash/index.htm` and chemistry assistant rules in `SPLASH_CHAT_GUIDELINES` inside `jahosi.js`.

Before React launch, separate:

- planner formulas
- chemistry reference ranges
- weather provider configuration
- source/resource metadata
- UI state

Recommended files:

```text
data/splash/resources.json
data/splash/chemistry-ranges.json
src/splash/calculations.ts
src/splash/weather.ts
src/splash/chemistry.ts
```

## 4. API Namespace

Add versioned routes for React where server involvement is needed:

```text
/api/v1/splash/config
/api/v1/splash/chat
/api/v1/splash/report
/api/v1/splash/resources
/api/v1/splash/geocode
/api/v1/splash/forecast
/api/v1/splash/climate
```

Keep `/splash/chat` working for the current page until migration is complete.

Suggested config response:

```json
{
  "app": {
    "minimumSupportedVersion": "1.0.0",
    "latestVersion": "1.0.0"
  },
  "features": {
    "planner": true,
    "weatherLookup": true,
    "chemistryGuide": true,
    "chemistryChat": true,
    "localExports": true,
    "accounts": false
  },
  "limits": {
    "maxChemChatMessageLength": 2000,
    "maxHistoryItems": 10
  },
  "sourceList": {
    "lastReviewed": "2026-09-20",
    "url": "https://jahosi.co.uk/splash/resources.md"
  },
  "policy": {
    "appendicesUrl": "https://jahosi.co.uk/splash/appendices.htm",
    "helpUrl": "https://jahosi.co.uk/splash/help.htm"
  }
}
```

## 5. React UX Direction

Recommended screens:

- Setup: quick-start wizard and manual setup
- Planner: temperature, heating, cover, cost and forecast outputs
- Chemistry: readings, guide cards, chemistry bot
- Weather: selected location, forecast source, climate profile, manual override
- Exports: summary, JSON, CSV, chemistry schedule
- Settings: local data, units, high contrast, help, appendices

First screen:

```text
Top bar:
  Splash
  Settings icon

Planner summary:
  Current water estimate
  Target reachability
  Season cost

Primary actions:
  Quick start
  Fetch forecast
  Open chemistry

Bottom navigation:
  Planner | Chemistry | Weather | Exports | Settings
```

Visual direction:

- practical calculator, not marketing page
- use stable panels and compact controls
- keep charts and result cards readable on mobile
- use clear provenance labels for estimates
- avoid making estimates look more certain than they are

## 6. Chemistry Bot Safety Rules

The chemistry bot must:

- refuse all numerical dosing calculations
- never substitute user numbers into dosing formulas
- direct dosing questions to manufacturer packaging or official product advice sheets
- never recommend mixing chemicals directly
- never recommend unsafe chlorine levels
- end every answer with: `Test before and after every addition.`
- keep answers concise and practical
- use the supplied pool state and app chemistry outputs as context

Reference ranges for context only:

- TA ideal 80-120 ppm
- pH ideal 7.4-7.6
- FC ideal 2-4 ppm
- hardness ideal 200-400 ppm
- CYA ideal 40-60 ppm
- CC should be under 0.5 ppm and ideally around 0-0.2 ppm

## 7. Phased Delivery Plan

Phase 0: Baseline

- snapshot current `index.htm` behaviour
- extract calculation functions into tested modules
- create `data/splash/resources.json`
- document weather provider response shapes

Phase 1: React shell

- scaffold React + TypeScript app
- implement planner state store
- implement quick-start wizard
- implement local persistence and version migration
- port core calculations with tests

Phase 2: Weather and exports

- port geocoding, forecast and climate profile flows
- implement fallback baselines
- port summary, JSON and CSV exports
- keep offline-friendly behaviour

Phase 3: Chemistry

- port chemistry guide cards
- add `/api/v1/splash/chat`
- pass planner state and chemistry results to chat
- add report answer endpoint
- keep `/splash/chat` working

## 8. AI-Agent Implementation Notes

When an AI coding agent works on this project, it should:

- read `public/splash/app.md` first
- read `public/splash/resources.md`
- read `public/splash/README.md`
- read `SPLASH_CHAT_GUIDELINES` in `jahosi.js`
- preserve current `index.htm` behaviour until the React app is verified
- extract calculations with tests before redesigning UI
- keep all chemical dosing boundaries intact
- keep OpenAI keys server-side
- avoid changing weather provider behaviour without checking forecast and fallback outputs
