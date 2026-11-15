# Technical notes

## Architecture

The frontend uses React and TypeScript, D3 for scales and shapes, and MapLibre GL. It sends requests to a FastAPI service through `/api/catalog`, `/api/analyze`, `/api/region/{id}`, `/api/rerun`, and `/api/validation`.

The service runs the analysis in Python using NumPy, SciPy, and pymannkendall. Records pass through quality checks, seasonal adjustment, trend estimation, replay, detectability calculations, verdict assignment, and result wording, in that order.

For point data, the service uses an httpx client to request NASA POWER records. The client makes up to three attempts with a 30-second timeout. Responses are stored in files indexed by coordinates. Satellite data comes from a bundled Giovanni CSV export, which is validated when loaded.

The browser never contacts NASA directly. Every displayed number is calculated by the service and includes its provenance. The full replay is calculated in one request and returned as arrays. Once loaded, playback and timeline scrubbing run locally without further analysis requests. A single container serves the API and the built frontend.

## Statistical decisions

### Trend estimates

The main trend rate is calculated with Theil–Sen. Its confidence interval is Sen's rank-based interval, using the autocorrelation-corrected Mann–Kendall variance. This means the interval excludes zero exactly when the corrected Mann–Kendall test rejects.

The second test uses a least-squares slope with its own confidence interval based on the effective sample size. The evidence funnel plots the Theil–Sen estimate and its interval. The least-squares interval is never shown around the Theil–Sen estimate.

### Mann–Kendall correction

The original concept specified the Hamed–Rao test from pymannkendall. In testing, that implementation rejected 9–28% of trendless AR(1) records. The final implementation uses the Hamed–Rao variance formula but models rank autocorrelation as AR(1). pymannkendall is still used to calculate the uncorrected statistic and as a reference in tests.

Lag-1 autocorrelation estimated from detrended residuals tends to be too low, particularly in short records. Both tests correct it using `r₁ + (1 + 4r₁)/n`.

### Historical replay

Every replay frame is calculated from the record ending in that year. Seasonal climatology, anomalies, both trend fits, and the verdict are recalculated without using later observations. A test changes all observations after a selected year and checks that every earlier frame remains bit-for-bit identical.

A year counts as detected only if both tests reject in the same direction. This is also the rule used for the full-record verdict. The evidence band changes from the cool colour to the warm detection colour only on frames that meet the rule.

### Record length estimate

The estimated record length needed for detection is withheld when the rate is within one standard error of zero, when the two estimators have opposite signs, when persistence is above 0.95, or when the estimate exceeds 200 years. The interface displays the reason in place of the number.

### Data preparation

NASA POWER joins GEWEX SRB data through 2000 with CERES SYN1deg from 2001 onward. The analysis uses only the CERES period.

The first and last calendar years are included only if they contain at least 9 of 12 months. This keeps the calendar months represented almost equally and places replay endpoints on year boundaries.

For OMI satellite records, daily values are averaged into monthly values using valid days only. A month must have at least five valid days. Fill values are removed, but negative retrieval values are kept.

All result wording comes from fixed templates filled with calculated values. An automated test checks that the templates never use the word "proves" or make a causal claim.

## Interface

Discovery and Observatory use the same records. Discovery starts with Earth and then shows the record. Observatory starts with the charts. The design system is documented in [DESIGN.md](../DESIGN.md).

Three.js replaced the earlier 2D canvas globe for rendering the textured sphere. Its use is limited to that job. The renderer is isolated in `frontend/src/charts/earthGL.ts` (about 200 lines). A custom shader blends day and night textures based on the real direction of the Sun, shades terrain using an elevation map, darkens the edge of the sphere, and adds a thin atmosphere.

The camera uses orthographic projection, matching the geometry of d3-geo's orthographic projection. Picking, footprints, borders, and labels are still handled by d3-geo and drawn on a 2D canvas above the WebGL canvas. As a result, the point clicked on the globe, the displayed grid cell, and the coordinates sent to the API stay aligned. If WebGL or the textures fail, the component draws a vector Earth instead. The rest of the interface continues to work.

Desktop textures are 4096 × 2048. On narrow screens, or when the GPU has a lower texture limit, they are 2048 × 1024. The globe is redrawn only when the view changes.

A time-series database, a different frontend framework, and server-side rendering were considered but not adopted. Each record contains only a few hundred monthly values, the source files are already cached with provenance, and a record can be analysed in about a third of a second.

## Accessibility

Primary controls use native buttons, links, inputs, or `details` elements and can be reached by keyboard. The timeline is a native range input. The arrow keys move by one year, Home and End jump to either end, and Space starts or pauses playback. Its spoken value describes the full state of the current frame.

Each chart has a text summary for screen readers. Verdicts use a symbol and a word as well as colour. Measured contrast against the background is 18.3:1 for primary text, 13.6:1 for secondary text, 9.7:1 for labels, 11.1:1 for glacier blue, and 7.5:1 for cinnabar.

The layout switches to a single column on narrow screens. It was checked at 390 px without horizontal overflow. Testing with a physical screen reader and with browsers other than Chromium has not yet been done.

## Performance

Measurements were taken on a four-core development machine. Analysing a 45-year record, including its 36-frame replay, took about 0.35 seconds on the first request. The result is memoised for later requests. A first-time NASA POWER retrieval took about 1.1 seconds.

The concept document set a 300 ms target for analysis. The first request was slightly above that target, while subsequent requests met it.

The frontend bundle is about 840 kB gzipped, including the map library, Three.js, and coastline data. Earth imagery adds about 2.4 MB on desktop or 0.8 MB on phones. In headless Chromium with software rendering, the globe ran at 60 frames per second during rotation. Performance has not been measured on physical phones.

## API

`GET /api/catalog` returns the available variables, indexed locations, and satellite regions, including availability and reasons.

`GET /api/analyze?latitude&longitude&variable[&name]` returns a complete NASA POWER record for the requested point.

`GET /api/region/{id}` returns the complete record for a bundled satellite region.

`POST /api/rerun` recalculates a record from its stored series and reports any differences.

`GET /api/validation` returns the Monte Carlo results shown in the Methods panel.
