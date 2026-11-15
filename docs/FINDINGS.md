# Findings from NASA records

All figures in this document were calculated from NASA data using `backend/scripts/screen_cities.py` (output in `docs/screening_results.json`), `backend/scripts/audit_delhi.py` (output in `docs/delhi_audit.json`), and the Giovanni export included in the repository. Trend rates use Theil–Sen slopes and autocorrelation-adjusted 95% intervals.

## 1. Case selection

We selected 22 cities for geographic spread before retrieving the data, then analysed four variables for each city, giving 88 analyses. We chose the flagship example after reviewing these results. The demonstration cases were selected after exploratory screening. Each analysis uses the full available record and the same fixed rules; we did not adjust start years, end years or test settings to obtain the selected result.

We picked the examples because they make the method easy to inspect, so they should not be treated as a representative sample. Of the 88 analyses, 38 were detected rising, 34 were not detectable yet, 10 were suggestive and 6 were detected falling. At a 5% test level, roughly 4 of 88 tests would be expected to give false detections if no trends existed.

The original concept called for a city with a detected temperature trend and an undetected rainfall trend. We found that contrast, although it is not typical of every city: 11 of the 22 have a detected precipitation trend in MERRA-2, while 3 have no detected temperature trend.

## 2. Flagship candidates

### Madrid

Temperature (°C): detected rising. Rate +0.33 per decade (95% interval +0.21 to +0.45). Mann–Kendall p < 0.001; least-squares p < 0.001. Sustained detection from 2016 (first crossing 2016, 0 lapses).

Precipitation (mm/day): not detectable yet. Rate +0.035 per decade (95% interval -0.026 to +0.098). Mann–Kendall p = 0.278; least-squares p = 0.143. No sustained detection year. At the estimated rate, about 32 more years for a 90% chance of detection.

Madrid was selected as the flagship. The temperature trend first meets the detection rule in 2016, the 36th year of the record, and stays detected at every later endpoint. It does not meet the rule at any earlier endpoint. Precipitation in the same MERRA-2 grid cell is not detectable, and the conditional record-length estimate is well defined. The interface flags curvature in the temperature series: the rate changes over time, so the reported linear rate is an average.

### Sydney

Temperature (°C): detected rising. Rate +0.31 per decade (95% interval +0.23 to +0.39). Mann–Kendall p < 0.001; least-squares p < 0.001. Sustained detection from 2001 (first crossing 2001, 0 lapses).

Precipitation (mm/day): not detectable yet. Rate -0.095 per decade (95% interval -0.205 to +0.017). Mann–Kendall p = 0.094; least-squares p = 0.100. No sustained detection year. At the estimated rate, about 27 more years for a 90% chance of detection.

Sydney has the cleanest statistical example of the pair. Temperature is detected from 2001, with no later lapses and no curvature warning; precipitation is not detectable. We used Madrid for the demonstration because Sydney reaches detection in 21 years, leaving less history to show in the replay.

### Nairobi

Temperature (°C): detected rising. Rate +0.26 per decade (95% interval +0.19 to +0.33). Mann–Kendall p < 0.001; least-squares p < 0.001. Sustained detection from 2008 (first crossing 2008, 0 lapses).

Precipitation (mm/day): suggestive. Rate -0.063 per decade (95% interval -0.130 to +0.001). Mann–Kendall p = 0.054; least-squares p = 0.086. No sustained detection year. At the estimated rate, about 24 more years for a 90% chance of detection.

Nairobi's temperature trend is detected from 2008, despite relatively high persistence in the series (r₁ = 0.56). Its precipitation result is suggestive, so it also provides an example of the middle verdict category.

## 3. Three satellite regions: OMI tropospheric NO₂ (OMNO2d v004), 2005–2025

These results come from satellite retrievals, not reanalysis. Rates are measured in 10¹⁵ molecules/cm² per decade. The three exports use the same product, version, field, fill value and date range. No two exports share a single daily value.

New York region: detected falling. Rate -2.83 per decade, 95% interval -3.36 to -2.31. Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.53. 251 of 252 months used. Detection history: detectable by 2014. Shape: curved.

North China Plain: detected falling. Rate -2.66 per decade, 95% interval -3.77 to -1.61. Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.59. 252 of 252 months used. Detection history: detectable since 2021. Shape: reverses (peak near 2012).

Delhi region: suggestive. Rate +0.10 per decade, 95% interval -0.00 to +0.20. Mann–Kendall p = 0.051; least-squares p = 0.085; r₁ = 0.28. 252 of 252 months used. Detection history: met the rule 2014–2020, then lost it. Shape: curved.

The concept document expected NO₂ to fall over the United States and eastern China and rise over India. The retrieved series do not show a simple version of that pattern.

In the New York region, NO₂ falls sharply relative to its noise and the decline is detectable within the first ten years. The decline slows over time, which triggers the curvature warning.

In the North China Plain, the series rises and then falls. The 2014 and 2015 endpoints show a detectable rise, followed by a lapse in detection. From 2021 onward, the result is a detectable fall. The straight-line warning identifies a reversal, with a peak near 2012. One linear rate is a poor fit for this history, and the application flags that limitation. The broad pattern agrees with published literature, although no expected pattern was built into the analysis.

The Delhi region meets the rule for a rise at endpoints from 2014 through 2020, but the current verdict is suggestive. Adding observations can weaken a detection as well as strengthen it. This case shows why the reported detection year must be checked against every later endpoint.

NO₂ here is measured as a column amount through the lower atmosphere, not a ground-level concentration. OMI has also had a row anomaly that reduced coverage from 2007 onward. The analysis does not assign a cause to the changes in any region.

## 4. Delhi temperature audit

The Delhi grid cell has no detectable temperature trend in MERRA-2. The estimated rate is -0.13 °C per decade, with a 95% interval from -0.29 to +0.03. Mann–Kendall p = 0.110 and least-squares p = 0.131. We checked the inputs and processing because this result was unexpected.

### Processing checks

The API reports temperature in C. The period is 1981-01 through 2025-12, with 540 months used, no missing months and no fill values.

Lag-1 autocorrelation is 0.47. After accounting for persistence, the 540 months carry about as much information as 194 independent months.

Without the autocorrelation correction, Mann–Kendall p = 0.008 and least-squares p = 0.011. An uncorrected spreadsheet test would call this significant cooling. The corrected tests do not detect a trend.

The neighbouring grid cells give similar rates: north -0.14, south -0.12, east -0.13 and west -0.14 °C per decade. None has a detected trend.

### Other results from the same reanalysis

Mean temperature (T2M): -0.13 °C per decade (95% interval -0.29 to +0.03). Adjusted p-values (Mann–Kendall / least squares): 0.110 / 0.131.

Daily maximum (T2M_MAX): -0.25 °C per decade (95% interval -0.46 to -0.04). Adjusted p-values (Mann–Kendall / least squares): 0.020 / 0.010.

Daily minimum (T2M_MIN): +0.11 °C per decade (95% interval -0.01 to +0.24). Adjusted p-values (Mann–Kendall / least squares): 0.079 / 0.028.

Mean temperature, 1981-2002: +0.34 °C per decade (95% interval -0.10 to +0.78). Adjusted p-values (Mann–Kendall / least squares): 0.127 / 0.121.

Mean temperature, 2003-2025: -0.24 °C per decade (95% interval -0.66 to +0.18). Adjusted p-values (Mann–Kendall / least squares): 0.278 / 0.193.

Mean temperature, winter (DJF): -0.19 °C per decade (95% interval -0.45 to +0.08). Adjusted p-values (Mann–Kendall / least squares): – / 0.154.

Mean temperature, pre-monsoon (MAM): +0.12 °C per decade (95% interval -0.19 to +0.43). Adjusted p-values (Mann–Kendall / least squares): – / 0.437.

Mean temperature, monsoon (JJAS): -0.27 °C per decade (95% interval -0.51 to -0.03). Adjusted p-values (Mann–Kendall / least squares): – / 0.028.

Mean temperature, post-monsoon (ON): -0.07 °C per decade (95% interval -0.39 to +0.25). Adjusted p-values (Mann–Kendall / least squares): – / 0.650.

The checks indicate that this is what the MERRA-2 series contains, rather than an error in processing. Daily maximum temperature falls while daily minimum temperature rises. The 1981–2002 part of the record has a positive rate, and the 2003–2025 part has a negative rate, but neither half-record trend is detected. This is an apparent nonlinear pattern within a reanalysis, not a verified physical reversal from warming to cooling. Such patterns can come from changes in assimilated observations, the land-surface model or atmospheric conditions. A single straight-line rate gives an incomplete account of this record; a weak overall linear trend does not mean that nothing changed.

We have not compared this series with an independent temperature dataset. The build environment can reach only `power.larc.nasa.gov`, where all available temperature parameters come from MERRA-2. A station-based comparison with GISTEMP or Berkeley Earth is still needed. Until that check is done, we make no claim about Delhi's actual temperature history and do not use this case in the demonstration.

## 5. All city screening results

### Air temperature at 2 m (°C per decade), MERRA-2, 1981–2025

Delhi (28.61, 77.21): not detectable yet. Rate -0.128 °C per decade (95% interval -0.285 to +0.028). Mann–Kendall p = 0.110; least-squares p = 0.131; r₁ = 0.47. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 30.

New York (40.71, -74.01): detected rising. Rate +0.348 °C per decade (95% interval +0.246 to +0.453). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.28. Sustained detection from 2006. Lapses: 2.

London (51.51, -0.13): detected rising. Rate +0.341 °C per decade (95% interval +0.239 to +0.446). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.21. Sustained detection from 1999. Lapses: 0.

Tokyo (35.68, 139.69): detected rising. Rate +0.314 °C per decade (95% interval +0.222 to +0.402). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.34. Sustained detection from 1998. Lapses: 1.

Nairobi (-1.29, 36.82): detected rising. Rate +0.258 °C per decade (95% interval +0.186 to +0.330). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.56. Sustained detection from 2008. Lapses: 0.

São Paulo (-23.55, -46.63): detected rising. Rate +0.394 °C per decade (95% interval +0.298 to +0.491). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.32. Sustained detection from 2002. Lapses: 0.

Sydney (-33.87, 151.21): detected rising. Rate +0.308 °C per decade (95% interval +0.231 to +0.387). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.39. Sustained detection from 2001. Lapses: 0.

Cairo (30.04, 31.24): detected rising. Rate +0.318 °C per decade (95% interval +0.226 to +0.414). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.29. Sustained detection from 1998. Lapses: 0.

Moscow (55.76, 37.62): detected rising. Rate +0.361 °C per decade (95% interval +0.177 to +0.545). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.23. Sustained detection from 2015. Lapses: 0.

Mexico City (19.43, -99.13): detected rising. Rate +0.371 °C per decade (95% interval +0.293 to +0.448). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.41. Sustained detection from 2000. Lapses: 1.

Lagos (6.52, 3.38): detected rising. Rate +0.169 °C per decade (95% interval +0.129 to +0.209). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.41. Sustained detection from 1996. Lapses: 0.

Jakarta (-6.21, 106.85): detected rising. Rate +0.171 °C per decade (95% interval +0.112 to +0.230). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.69. Sustained detection from 2003. Lapses: 0.

Cape Town (-33.92, 18.42): not detectable yet. Rate +0.009 °C per decade (95% interval -0.059 to +0.079). Mann–Kendall p = 0.803; least-squares p = 0.726; r₁ = 0.49. No sustained detection year reported. Lapses: 2.

Reykjavík (64.15, -21.94): detected rising. Rate +0.224 °C per decade (95% interval +0.124 to +0.322). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.21. Sustained detection from 1997. Lapses: 1.

Phoenix (33.45, -112.07): detected rising. Rate +0.468 °C per decade (95% interval +0.349 to +0.589). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.19. Sustained detection from 2002. Lapses: 0.

Mumbai (19.08, 72.88): detected rising. Rate +0.136 °C per decade (95% interval +0.072 to +0.200). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.34. Sustained detection from 2009. Lapses: 0.

Beijing (39.90, 116.41): detected rising. Rate +0.249 °C per decade (95% interval +0.137 to +0.364). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.30. Sustained detection from 2017. Lapses: 1.

Lima (-12.05, -77.04): suggestive. Rate +0.158 °C per decade (95% interval +0.058 to +0.256). Mann–Kendall p = 0.003; least-squares p = 0.082; r₁ = 0.83. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 22.

Anchorage (61.22, -149.90): detected rising. Rate +0.379 °C per decade (95% interval +0.217 to +0.542). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.19. Sustained detection from 2014. Lapses: 1.

Madrid (40.42, -3.70): detected rising. Rate +0.332 °C per decade (95% interval +0.212 to +0.453). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.23. Sustained detection from 2016. Lapses: 0.

Tehran (35.69, 51.39): detected rising. Rate +0.493 °C per decade (95% interval +0.363 to +0.621). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.30. Sustained detection from 1994. Lapses: 1.

Singapore (1.35, 103.82): detected rising. Rate +0.184 °C per decade (95% interval +0.127 to +0.241). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.71. Sustained detection from 2014. Lapses: 0.

### Precipitation (mm/day per decade), MERRA-2 bias-corrected, 1981–2025

Delhi (28.61, 77.21): not detectable yet. Rate +0.037 mm/day per decade (95% interval -0.019 to +0.103). Mann–Kendall p = 0.209; least-squares p = 0.188; r₁ = 0.11. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 38.

New York (40.71, -74.01): detected rising. Rate +0.158 mm/day per decade (95% interval +0.051 to +0.265). Mann–Kendall p = 0.004; least-squares p = 0.001; r₁ = 0.06. Sustained detection from 2018. Lapses: 0.

London (51.51, -0.13): not detectable yet. Rate +0.021 mm/day per decade (95% interval -0.042 to +0.083). Mann–Kendall p = 0.531; least-squares p = 0.601; r₁ = 0.06. No sustained detection year reported. Lapses: 1.

Tokyo (35.68, 139.69): detected rising. Rate +0.238 mm/day per decade (95% interval +0.115 to +0.366). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = -0.01. Sustained detection from 2006. Lapses: 0.

Nairobi (-1.29, 36.82): suggestive. Rate -0.063 mm/day per decade (95% interval -0.130 to +0.001). Mann–Kendall p = 0.054; least-squares p = 0.086; r₁ = 0.20. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 24.

São Paulo (-23.55, -46.63): detected falling. Rate -0.397 mm/day per decade (95% interval -0.520 to -0.279). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.08. Sustained detection from 2013. Lapses: 1.

Sydney (-33.87, 151.21): not detectable yet. Rate -0.095 mm/day per decade (95% interval -0.205 to +0.017). Mann–Kendall p = 0.094; least-squares p = 0.100; r₁ = 0.00. No sustained detection year reported. Lapses: 1. Further years for a 90% chance at the estimated rate: 27.

Cairo (30.04, 31.24): suggestive. Rate +0.001 mm/day per decade (95% interval -0.002 to +0.008). Mann–Kendall p = 0.438; least-squares p = 0.015; r₁ = 0.21. No sustained detection year reported. Lapses: 3. Further years for a 90% chance at the estimated rate: 10.

Moscow (55.76, 37.62): not detectable yet. Rate +0.033 mm/day per decade (95% interval -0.023 to +0.091). Mann–Kendall p = 0.255; least-squares p = 0.226; r₁ = 0.05. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 43.

Mexico City (19.43, -99.13): not detectable yet. Rate +0.008 mm/day per decade (95% interval -0.040 to +0.057). Mann–Kendall p = 0.751; least-squares p = 0.695; r₁ = 0.14. No sustained detection year reported. Lapses: 0.

Lagos (6.52, 3.38): detected rising. Rate +0.203 mm/day per decade (95% interval +0.067 to +0.337). Mann–Kendall p = 0.003; least-squares p = 0.028; r₁ = 0.17. Sustained detection from 2021. Lapses: 0.

Jakarta (-6.21, 106.85): detected rising. Rate +0.320 mm/day per decade (95% interval +0.117 to +0.525). Mann–Kendall p = 0.002; least-squares p < 0.001; r₁ = 0.27. Sustained detection from 2021. Lapses: 0.

Cape Town (-33.92, 18.42): detected rising. Rate +0.058 mm/day per decade (95% interval +0.012 to +0.106). Mann–Kendall p = 0.013; least-squares p < 0.001; r₁ = 0.07. Sustained detection from 2023. Lapses: 2.

Reykjavík (64.15, -21.94): not detectable yet. Rate +0.008 mm/day per decade (95% interval -0.109 to +0.126). Mann–Kendall p = 0.894; least-squares p = 0.878; r₁ = 0.17. No sustained detection year reported. Lapses: 0.

Phoenix (33.45, -112.07): detected falling. Rate -0.075 mm/day per decade (95% interval -0.119 to -0.032). Mann–Kendall p < 0.001; least-squares p = 0.006; r₁ = 0.18. Sustained detection from 2002. Lapses: 0.

Mumbai (19.08, 72.88): detected rising. Rate +0.106 mm/day per decade (95% interval +0.043 to +0.204). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = -0.01. Sustained detection from 2017. Lapses: 0.

Beijing (39.90, 116.41): detected rising. Rate +0.071 mm/day per decade (95% interval +0.034 to +0.111). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.07. Sustained detection from 2021. Lapses: 2.

Lima (-12.05, -77.04): suggestive. Rate +0.005 mm/day per decade (95% interval +0.000 to +0.010). Mann–Kendall p = 0.039; least-squares p = 0.071; r₁ = 0.36. No sustained detection year reported. Lapses: 1. Further years for a 90% chance at the estimated rate: 22.

Anchorage (61.22, -149.90): suggestive. Rate +0.060 mm/day per decade (95% interval -0.003 to +0.124). Mann–Kendall p = 0.064; least-squares p = 0.031; r₁ = 0.03. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 15.

Madrid (40.42, -3.70): not detectable yet. Rate +0.035 mm/day per decade (95% interval -0.026 to +0.098). Mann–Kendall p = 0.278; least-squares p = 0.143; r₁ = 0.15. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 32.

Tehran (35.69, 51.39): detected rising. Rate +0.080 mm/day per decade (95% interval +0.045 to +0.115). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.21. Sustained detection from 2015. Lapses: 4.

Singapore (1.35, 103.82): detected rising. Rate +0.852 mm/day per decade (95% interval +0.609 to +1.099). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.22. Sustained detection from 2006. Lapses: 0.

### Root-zone soil wetness (fraction per decade), MERRA-2 land model, 1981–2025

Delhi (28.61, 77.21): suggestive. Rate +0.007 fraction per decade (95% interval -0.001 to +0.016). Mann–Kendall p = 0.093; least-squares p = 0.077; r₁ = 0.69. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 22.

New York (40.71, -74.01): not detectable yet. Rate +0.017 fraction per decade (95% interval -0.002 to +0.035). Mann–Kendall p = 0.084; least-squares p = 0.143; r₁ = 0.84. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 30.

London (51.51, -0.13): not detectable yet. Rate -0.006 fraction per decade (95% interval -0.025 to +0.013). Mann–Kendall p = 0.499; least-squares p = 0.597; r₁ = 0.93. No sustained detection year reported. Lapses: 0.

Tokyo (35.68, 139.69): suggestive. Rate +0.012 fraction per decade (95% interval -0.000 to +0.025). Mann–Kendall p = 0.060; least-squares p = 0.060; r₁ = 0.79. No sustained detection year reported. Lapses: 3. Further years for a 90% chance at the estimated rate: 19.

Nairobi (-1.29, 36.82): not detectable yet. Rate -0.002 fraction per decade (95% interval -0.005 to +0.001). Mann–Kendall p = 0.180; least-squares p = 0.404; r₁ = 0.63. No sustained detection year reported. Lapses: 0.

São Paulo (-23.55, -46.63): detected falling. Rate -0.037 fraction per decade (95% interval -0.052 to -0.022). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.87. Sustained detection from 2014. Lapses: 1.

Sydney (-33.87, 151.21): not detectable yet. Rate -0.008 fraction per decade (95% interval -0.018 to +0.002). Mann–Kendall p = 0.114; least-squares p = 0.185; r₁ = 0.73. No sustained detection year reported. Lapses: 2. Further years for a 90% chance at the estimated rate: 37.

Cairo (30.04, 31.24): suggestive. Rate +0.000 fraction per decade (95% interval +0.000 to +0.001). Mann–Kendall p = 0.218; least-squares p = 0.047; r₁ = 0.72. No sustained detection year reported. Lapses: 1.

Moscow (55.76, 37.62): not detectable yet. Rate -0.013 fraction per decade (95% interval -0.042 to +0.014). Mann–Kendall p = 0.321; least-squares p = 0.365; r₁ = 0.92. No sustained detection year reported. Lapses: 0.

Mexico City (19.43, -99.13): not detectable yet. Rate +0.000 fraction per decade (95% interval -0.008 to +0.008). Mann–Kendall p = 0.981; least-squares p = 0.942; r₁ = 0.79. No sustained detection year reported. Lapses: 0.

Lagos (6.52, 3.38): detected rising. Rate +0.036 fraction per decade (95% interval +0.021 to +0.051). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.85. Sustained detection from 2008. Lapses: 0.

Jakarta (-6.21, 106.85): suggestive. Rate +0.026 fraction per decade (95% interval -0.002 to +0.052). Mann–Kendall p = 0.068; least-squares p = 0.090; r₁ = 0.92. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 21.

Cape Town (-33.92, 18.42): detected rising. Rate +0.015 fraction per decade (95% interval +0.004 to +0.028). Mann–Kendall p = 0.006; least-squares p = 0.004; r₁ = 0.80. Sustained detection from 2021. Lapses: 1.

Reykjavík (64.15, -21.94): not detectable yet. Rate +0.001 fraction per decade (95% interval -0.005 to +0.006). Mann–Kendall p = 0.793; least-squares p = 0.659; r₁ = 0.70. No sustained detection year reported. Lapses: 0.

Phoenix (33.45, -112.07): not detectable yet. Rate -0.003 fraction per decade (95% interval -0.007 to +0.000). Mann–Kendall p = 0.087; least-squares p = 0.157; r₁ = 0.79. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 33.

Mumbai (19.08, 72.88): detected rising. Rate +0.007 fraction per decade (95% interval +0.002 to +0.012). Mann–Kendall p < 0.001; least-squares p = 0.002; r₁ = 0.60. Sustained detection from 2021. Lapses: 0.

Beijing (39.90, 116.41): detected rising. Rate +0.010 fraction per decade (95% interval +0.004 to +0.016). Mann–Kendall p = 0.001; least-squares p = 0.002; r₁ = 0.73. Sustained detection from 2021. Lapses: 2.

Lima (-12.05, -77.04): suggestive. Rate +0.000 fraction per decade (95% interval +0.000 to +0.001). Mann–Kendall p = 0.059; least-squares p = 0.059; r₁ = 0.67. No sustained detection year reported. Lapses: 1. Further years for a 90% chance at the estimated rate: 19.

Anchorage (61.22, -149.90): not detectable yet. Rate +0.004 fraction per decade (95% interval -0.002 to +0.010). Mann–Kendall p = 0.217; least-squares p = 0.278; r₁ = 0.80. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 48.

Madrid (40.42, -3.70): not detectable yet. Rate +0.004 fraction per decade (95% interval -0.003 to +0.012). Mann–Kendall p = 0.272; least-squares p = 0.263; r₁ = 0.78. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 46.

Tehran (35.69, 51.39): detected rising. Rate +0.003 fraction per decade (95% interval +0.001 to +0.006). Mann–Kendall p = 0.007; least-squares p = 0.031; r₁ = 0.79. Sustained detection from 2019. Lapses: 2.

Singapore (1.35, 103.82): detected rising. Rate +0.039 fraction per decade (95% interval +0.019 to +0.059). Mann–Kendall p < 0.001; least-squares p = 0.007; r₁ = 0.88. Sustained detection from 2022. Lapses: 2.

### All-sky surface solar irradiance (MJ/m²/day per decade), CERES SYN1deg, 2001–2025

Delhi (28.61, 77.21): detected falling. Rate -0.532 MJ/m²/day per decade (95% interval -0.746 to -0.330). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.14. Sustained detection from 2018. Lapses: 0.

New York (40.71, -74.01): not detectable yet. Rate +0.010 MJ/m²/day per decade (95% interval -0.181 to +0.200). Mann–Kendall p = 0.909; least-squares p = 0.687; r₁ = 0.11. No sustained detection year reported. Lapses: 0.

London (51.51, -0.13): detected rising. Rate +0.245 MJ/m²/day per decade (95% interval +0.082 to +0.414). Mann–Kendall p = 0.004; least-squares p = 0.007; r₁ = 0.21. Sustained detection from 2022. Lapses: 1.

Tokyo (35.68, 139.69): detected rising. Rate +0.277 MJ/m²/day per decade (95% interval +0.048 to +0.501). Mann–Kendall p = 0.019; least-squares p = 0.035; r₁ = 0.03. Sustained detection from 2025. Lapses: 0.

Nairobi (-1.29, 36.82): not detectable yet. Rate -0.129 MJ/m²/day per decade (95% interval -0.342 to +0.082). Mann–Kendall p = 0.217; least-squares p = 0.227; r₁ = 0.04. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 24.

São Paulo (-23.55, -46.63): not detectable yet. Rate +0.133 MJ/m²/day per decade (95% interval -0.102 to +0.355). Mann–Kendall p = 0.240; least-squares p = 0.386; r₁ = -0.00. No sustained detection year reported. Lapses: 1.

Sydney (-33.87, 151.21): not detectable yet. Rate +0.023 MJ/m²/day per decade (95% interval -0.194 to +0.237). Mann–Kendall p = 0.837; least-squares p = 0.936; r₁ = 0.00. No sustained detection year reported. Lapses: 1.

Cairo (30.04, 31.24): not detectable yet. Rate +0.024 MJ/m²/day per decade (95% interval -0.067 to +0.109). Mann–Kendall p = 0.601; least-squares p = 0.564; r₁ = 0.13. No sustained detection year reported. Lapses: 1.

Moscow (55.76, 37.62): not detectable yet. Rate -0.094 MJ/m²/day per decade (95% interval -0.259 to +0.063). Mann–Kendall p = 0.236; least-squares p = 0.557; r₁ = -0.01. No sustained detection year reported. Lapses: 0.

Mexico City (19.43, -99.13): not detectable yet. Rate +0.056 MJ/m²/day per decade (95% interval -0.189 to +0.306). Mann–Kendall p = 0.678; least-squares p = 0.425; r₁ = 0.10. No sustained detection year reported. Lapses: 1.

Lagos (6.52, 3.38): not detectable yet. Rate +0.003 MJ/m²/day per decade (95% interval -0.135 to +0.140). Mann–Kendall p = 0.971; least-squares p = 0.957; r₁ = 0.02. No sustained detection year reported. Lapses: 0.

Jakarta (-6.21, 106.85): detected falling. Rate -0.427 MJ/m²/day per decade (95% interval -0.678 to -0.180). Mann–Kendall p < 0.001; least-squares p = 0.002; r₁ = 0.31. Sustained detection from 2022. Lapses: 0.

Cape Town (-33.92, 18.42): detected rising. Rate +0.176 MJ/m²/day per decade (95% interval +0.058 to +0.301). Mann–Kendall p = 0.003; least-squares p = 0.004; r₁ = 0.07. Sustained detection from 2010. Lapses: 0.

Reykjavík (64.15, -21.94): not detectable yet. Rate +0.013 MJ/m²/day per decade (95% interval -0.075 to +0.099). Mann–Kendall p = 0.698; least-squares p = 0.621; r₁ = 0.15. No sustained detection year reported. Lapses: 0.

Phoenix (33.45, -112.07): not detectable yet. Rate -0.028 MJ/m²/day per decade (95% interval -0.181 to +0.125). Mann–Kendall p = 0.730; least-squares p = 0.459; r₁ = 0.14. No sustained detection year reported. Lapses: 0.

Mumbai (19.08, 72.88): detected falling. Rate -0.580 MJ/m²/day per decade (95% interval -0.750 to -0.412). Mann–Kendall p < 0.001; least-squares p < 0.001; r₁ = 0.02. Sustained detection from 2010. Lapses: 0.

Beijing (39.90, 116.41): detected rising. Rate +0.250 MJ/m²/day per decade (95% interval +0.035 to +0.474). Mann–Kendall p = 0.023; least-squares p = 0.009; r₁ = 0.07. Sustained detection from 2025. Lapses: 0.

Lima (-12.05, -77.04): not detectable yet. Rate +0.182 MJ/m²/day per decade (95% interval -0.049 to +0.413). Mann–Kendall p = 0.119; least-squares p = 0.308; r₁ = 0.24. No sustained detection year reported. Lapses: 0. Further years for a 90% chance at the estimated rate: 29.

Anchorage (61.22, -149.90): not detectable yet. Rate -0.029 MJ/m²/day per decade (95% interval -0.125 to +0.060). Mann–Kendall p = 0.507; least-squares p = 0.413; r₁ = 0.03. No sustained detection year reported. Lapses: 0.

Madrid (40.42, -3.70): not detectable yet. Rate +0.052 MJ/m²/day per decade (95% interval -0.148 to +0.250). Mann–Kendall p = 0.594; least-squares p = 0.725; r₁ = 0.03. No sustained detection year reported. Lapses: 1.

Tehran (35.69, 51.39): not detectable yet. Rate -0.075 MJ/m²/day per decade (95% interval -0.256 to +0.107). Mann–Kendall p = 0.419; least-squares p = 0.578; r₁ = 0.18. No sustained detection year reported. Lapses: 0.

Singapore (1.35, 103.82): not detectable yet. Rate +0.020 MJ/m²/day per decade (95% interval -0.174 to +0.206). Mann–Kendall p = 0.850; least-squares p = 0.978; r₁ = 0.07. No sustained detection year reported. Lapses: 0.
