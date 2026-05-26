# splash!

Interactive playpool thermal and cost planner.

## v1.6.2 highlights

- The chemistry bot now requires a Turnstile check before the first chat message when configured, while keeping history temporary and in-memory only.
- Saved weather-location context now restores more completely (selected place, hourly forecast, and climate profile state) across sessions.
- Launch-time weather refresh now reuses saved selection data and falls back to saved coordinates if geocoding from the search text returns no match.

## v1.6.0 highlights

- Expert-flow UX order for controls/results (location and environment first, deeper controls later).
- Main-page “Fetch current forecast” action, mobile floating options button, and bottom close button in sidebar.
- Target temperature kept as a single value with auto-calculated sensible ± range for pool/hot-tub mode.
- Rough environment/location-aware chemistry product quantity guidance, including hard/soft water caveats.
- New appendices page (`/splash/appendices.htm`) listing formulas and robust/official calculation sources.
- Upgrades near-term forecast modelling to a 2-day (48-hour) hourly horizon and uses hourly shortwave solar radiation data when available.
- Removes the old 7-day schedule simulation chart in favour of weather-driven near-term trend output.
- Includes prior global location search, 3-day + hourly weather, climate profile loading, and version-based cache refresh behavior.
