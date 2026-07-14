# splash!

Interactive playpool thermal and cost planner.

## v1.7.0 highlights

- Adds a first-time-user quick-start overlay with eight guided setup steps and a visible progress bar.
- Captures location/geolocation, pool dimensions, base/shade, target-temperature preset, season dates, pool use, chemistry, heating system, cover use, and electricity tariff.
- Finishing the guide recalculates the planner, saves browser-local configuration, opens the chemistry bot, and moves the user toward temperature and chemistry resources.

## v1.6.3 highlights

- The chemistry guide now makes clear that its bands are standard residential outdoor chlorine-pool targets rather than strip-brand-specific normals.
- The default CYA ideal band is now a more conservative 40–60 ppm while keeping 30 ppm as the outdoor minimum and 90 ppm as the high-end limit.
- Hardness messaging now uses a broader default guide and calls out surface-dependent variation between vinyl/liner and plaster/concrete pools.

## v1.6.0 highlights

- Expert-flow UX order for controls/results (location and environment first, deeper controls later).
- Main-page “Fetch current forecast” action, mobile floating options button, and bottom close button in sidebar.
- Target temperature kept as a single value with auto-calculated sensible ± range for pool/hot-tub mode.
- Rough environment/location-aware chemistry product quantity guidance, including hard/soft water caveats.
- New appendices page (`/splash/appendices.htm`) listing formulas and robust/official calculation sources.
- Upgrades near-term forecast modelling to a 2-day (48-hour) hourly horizon and uses hourly shortwave solar radiation data when available.
- Removes the old 7-day schedule simulation chart in favour of weather-driven near-term trend output.
- Includes prior global location search, 3-day + hourly weather, climate profile loading, and version-based cache refresh behavior.
