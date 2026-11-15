# The Long Watch

**How long must we watch before we know?**

The Long Watch is our project for the NASA Space Apps Challenge 2026 Earth-science trend challenge. It uses NASA environmental records to answer a question that a typical trend chart leaves out: when did the evidence become strong enough to detect a change?

Select a place on Earth, choose an environmental question, and predict whether the record is rising, falling or has no detectable trend. The application then plays the record forward from its first year. At each year, it shows the trend estimate, its 95% confidence interval and whether the evidence meets the detection rule. If no trend is detected in the full record, it estimates how long a record would be needed for a 90% chance of detection, under stated assumptions.

NASA Giovanni, NASA POWER and KNMI Climate Explorer already provide time-series plots and trend analyses. Our focus is the history of the evidence. The Long Watch repeats the analysis at every past endpoint, using only the observations available up to that year, and shows the data source and limits alongside the result.

## What we built

The application has two views built around the same data.

In **Discovery**, users explore a globe made with real NASA Earth imagery. It can be rotated, zoomed and clicked at any point. There are also 22 indexed cities and three satellite regions to choose from. When a place is selected, the globe moves to it and outlines the area represented by the data at its actual size. The questions use plain language, with each one linked to a specific NASA variable.

Before the record appears, the user chooses rising, falling or no detectable change. The Watch Replay then starts at the beginning of the record and adds observations over time. Each completed year gets a new trend estimate and confidence interval. The replay pauses when the record first reaches what is later identified as sustained detection. Users can also put two variables from the same place on a shared time axis and compare their results.

**Observatory** gives a closer look at the analysis. It shows the original monthly values, the series after removing the seasonal cycle, and the evidence funnel that tracks the rate and confidence interval through time. The current test values appear beside the charts. There are also notes, a session logbook, and a provenance drawer containing the NASA request, processing steps, methods, limitations and start-year sensitivity results. Results can be exported as a PNG case card, re-runnable JSON or a CSV of the monthly series.

Switching between Discovery and Observatory keeps the selected place, variable, prediction and replay year.

## Data and interpretation

The environmental records come from NASA POWER's monthly API and three OMI/Aura NO₂ exports obtained through NASA Giovanni. NASA POWER can retrieve a record for any selected point on Earth. The application contains no simulated or placeholder environmental records. Stored copies of the 22 indexed cities and the flagship cases retain their original request URLs and retrieval times. If a live request fails, the interface labels any stored copy it uses; it does not substitute unrelated data.

The globe uses NASA Blue Marble and Earth at Night composites with Natural Earth borders. These are static reference images. The lighting follows the current time, not the year being replayed, and the imagery is not part of the trend measurement.

Temperature, precipitation and root-zone soil wetness come from MERRA-2 reanalysis and its land model. Those products combine observations and modelling; they are not direct measurements from weather stations. Surface sunlight uses CERES SYN1deg from 2001 onward, without joining it to the earlier GEWEX SRB series. The NO₂ records are OMI satellite estimates of atmospheric column amounts, not measurements of air quality at ground level.

The rates, confidence intervals and p-values are calculated estimates. The projected record length assumes a steady trend and unchanged noise, so it is presented as a range of possible lengths rather than a future calendar year. The application withholds the estimate when the rate is within one standard error of zero. It also flags records that curve or reverse, where a single straight-line trend may be misleading. That shape check is experimental.

The year of sustained detection is found in hindsight. It is the earliest year after which the detection rule remains satisfied at every later endpoint. That conclusion depends on the later observations, so it could not have been known in that year. It is only reported when the final record is detected, and it can change if the starting year changes.

## Madrid: the main example

We screened 22 cities across four variables, giving 88 analyses, before choosing Madrid for the main demonstration. All cases use the same rules and their full available records. The selection process and complete results are in [docs/FINDINGS.md](docs/FINDINGS.md).

For the Madrid MERRA-2 grid cell, both records cover 1981–2025.

**Air temperature:** A rising trend is detected. The estimated rate is **+0.33 °C per decade**, with a 95% interval of **+0.21 to +0.45 °C**. The detection criterion holds at every endpoint from **2016** onward, after 36 years of observations from 1981 to 2016. This is a retrospective result.

**Precipitation:** No trend is detected in the 45-year record. The estimated rate is **+0.03 mm/day per decade**, with a 95% interval of **−0.03 to +0.10 mm/day per decade**. At the estimated rate, a record of about **77 years in total** would give a 90% chance of detection under the model assumptions. At the stronger end of the interval, the existing record would already be long enough; at the weaker end, which includes zero, no finite record length guarantees detection.

Both rates are positive, but the temperature trend is much stronger relative to the variation in its record. The rainfall result describes precipitation in MERRA-2, not measurements from local rain gauges.

The temperature rate also depends on where the record begins: **+0.33 °C per decade from 1981, +0.49 from 1991 and +0.60 from 2001**. A constant-rate model does not fully describe this record. In simulations using a steady trend of the full-record size, 98% of records reached sustained detection earlier than the real Madrid record did. The details are in [docs/VALIDATION.md](docs/VALIDATION.md).

## Statistical method

A record needs at least 10 usable years and coverage of at least 90% of its months. The first and last calendar years must each have at least 9 of 12 months. Fill values are removed and missing observations are not interpolated.

The seasonal cycle is removed by subtracting calendar-month averages. For each replay year, those averages and the entire analysis are recalculated from data available up to that point. Later observations are never used to calculate an earlier frame.

The headline rate is a Theil–Sen slope per decade, with a Sen confidence interval adjusted for autocorrelation. Detection requires agreement between two tests: Mann–Kendall with a Hamed–Rao variance correction based on AR(1) rank autocorrelation, and a least-squares t-test using an effective sample size. Both must give **p < 0.05** and the same trend direction. The null hypothesis is no linear trend, with departures from the seasonal cycle following an AR(1) process.

Sustained detection starts at the earliest endpoint that satisfies this rule at every remaining endpoint. A result held for fewer than five years is labelled provisional. Start-year sensitivity is checked by repeating the analysis with the starting year moved forward in five-year steps.

For records without detection, the estimate of years needed for a 90% chance of detection at the 95% level follows Weatherhead et al. (1998). It is calculated from the estimated rate and both ends of its interval, and was checked against simulation.

## Validation

The statistical tests were checked on simulated trendless records with different lengths and levels of persistence. Across 1,000 simulations per setting, the adopted individual tests falsely detected trends in **3.2–7.4%** of records at a nominal 5% level. The combined detection rule gave **3.2–5.4%**. Without correction for autocorrelation, false-positive rates reached **14–52%** when persistence was present.

The validation also tested recovery of known trends, confidence-interval coverage, the record-length formula and the replay's behaviour. Two calibration problems were found and corrected. Some original acceptance criteria were not met, including the proposed accuracy of the exact detection year. Those results and the remaining limits are reported in [docs/VALIDATION.md](docs/VALIDATION.md), along with the independent comparison of Madrid temperature against a ground-station record.

The analysis runs in a Python service using NumPy, SciPy and pymannkendall. The interface is built with React and TypeScript, with Three.js for the globe and D3 for the charts. Scientific calculations are done in the service; replay controls work with the completed results returned to the browser.

## Repository

```text
backend/longwatch/stats/   coverage, seasonal cycle, trend tests, replay, years needed, verdict, shape
backend/longwatch/         NASA POWER client, Giovanni loader, catalogue, analysis record, wording, API
backend/data/              stored NASA responses and the Giovanni export, with provenance
backend/scripts/           city screening, Monte Carlo validation, detectability curve, Delhi audit, report builder, command-line re-run
backend/tests/             75 tests
frontend/src/charts/       Earth (Three.js with vector fallback), watch stage, instrument charts
frontend/src/components/   Discovery, Observatory, provenance, logbook, methods
frontend/public/earth/     NASA Earth imagery used by the globe
docs/                      scientific findings, technical documentation, validation reports and results
```

## Documents

- [docs/VALIDATION.md](docs/VALIDATION.md): scientific validation report
- [docs/FINDINGS.md](docs/FINDINGS.md): results from 88 analyses, case selection, and the Delhi audit
- [docs/TECHNICAL.md](docs/TECHNICAL.md): architecture and technical decisions
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): software licences and data credits

## Known limitations

- The live engine uses reanalysis and satellite-derived records, not station observations. Reanalysis trends can differ from measured trends. An unexpected Delhi temperature result is audited in the findings document but has not yet been checked against an independent dataset.
- The Earth imagery came through the `three-globe` npm package because NASA's image server was unreachable from the build environment. The images match NASA Blue Marble and Earth at Night composites, but the exact files have not been compared with NASA's originals.
- A NASA POWER point represents a grid cell roughly 50 km across, not a city-wide measurement.
- Statistical calibration uses linear trends and AR(1) noise. Records with different noise patterns or non-linear changes may behave differently.
- No user testing has been carried out, so no user-testing results are claimed.
- The interface has been tested in Chromium at desktop and phone widths, but not in other browsers or with a screen reader.

## Licence and credits

The code is licensed under MIT. Data sources are NASA POWER (NASA Langley Research Center), MERRA-2 (NASA GMAO), CERES (NASA Langley), and OMI/Aura OMNO2d (NASA GES DISC) via Giovanni. The globe uses NASA Blue Marble and Earth at Night imagery (NASA Earth Observatory), with borders from Natural Earth. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details. The Long Watch is not affiliated with or endorsed by NASA.
