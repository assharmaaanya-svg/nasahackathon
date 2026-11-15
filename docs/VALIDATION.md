# Scientific validation report

This report uses the results in `docs/validation_results.json`, generated on 14 November 2026 at 09:15:50 UTC. The run used `backend/scripts/validate.py 1000`, with random seed 20261114. The software versions were NumPy 2.5.4, SciPy 1.18.1, pymannkendall 1.4.3 and pandas 3.1.1. The figures below come from that run. To reproduce them, run the validation script with the same settings.

## 1. Summary

On simulated records with no trend and AR(1) autocorrelation, the adopted least-squares test gave false positives in 3.2% to 6.0% of runs. The adopted Mann–Kendall test gave 3.9% to 7.4%, and the combined Detected verdict gave 3.2% to 5.4%. These ranges cover 12 combinations of record length and persistence, against a nominal significance level of 5%.

Without an autocorrelation correction, false-positive rates reached 14.2% to 52.3% when the records were persistent. The proposed `pymannkendall` Hamed–Rao test gave 8.6% to 27.7%, so it was not used in the final method.

For simulations with a known trend, 95% interval coverage was 94.2% to 95.6% for least squares and 93.2% to 95.1% for Theil–Sen. The formula for record length needed to reach 90% detection agreed with simulation to within 1.5%.

The concept document set an acceptable false-positive range of 4% to 7%. Both adopted tests fell inside that range in 9 of the 12 settings. The other three are reported below.

## 2. False positives on records with no trend

For each combination of record length and persistence, 1,000 monthly AR(1) records were simulated without a trend. The percentages below are the share of runs flagged at p < 0.05. At 1,000 runs, a test whose true false-positive rate is 5% would produce a measured rate between roughly 3.6% and 6.4% in 95% of experiments.

### 10-year records

At φ = 0.0, uncorrected least squares flagged 5.0% and uncorrected Mann–Kendall flagged 5.1%. The `pymannkendall` Hamed–Rao test flagged 9.1%. With the adopted corrections, least squares flagged 4.4%, Mann–Kendall 3.9%, and the combined Detected verdict 3.3%.

At φ = 0.3, uncorrected least squares flagged 14.2% and uncorrected Mann–Kendall flagged 13.5%. The `pymannkendall` Hamed–Rao test flagged 11.8%. With the adopted corrections, least squares flagged 4.3%, Mann–Kendall 4.8%, and the combined Detected verdict 3.7%.

At φ = 0.6, uncorrected least squares flagged 30.5% and uncorrected Mann–Kendall flagged 30.0%. The `pymannkendall` Hamed–Rao test flagged 16.8%. With the adopted corrections, least squares flagged 4.5%, Mann–Kendall 6.1%, and the combined Detected verdict 4.2%.

At φ = 0.8, uncorrected least squares flagged 52.3% and uncorrected Mann–Kendall flagged 50.7%. The `pymannkendall` Hamed–Rao test flagged 27.7%. With the adopted corrections, least squares flagged 5.5%, Mann–Kendall 7.4%, and the combined Detected verdict 5.3%.

### 21-year records

At φ = 0.0, uncorrected least squares flagged 5.3% and uncorrected Mann–Kendall flagged 5.3%. The `pymannkendall` Hamed–Rao test flagged 8.6%. With the adopted corrections, least squares flagged 4.4%, Mann–Kendall 4.4%, and the combined Detected verdict 3.5%.

At φ = 0.3, uncorrected least squares flagged 15.8% and uncorrected Mann–Kendall flagged 14.6%. The `pymannkendall` Hamed–Rao test flagged 12.5%. With the adopted corrections, least squares flagged 5.4%, Mann–Kendall 6.1%, and the combined Detected verdict 4.5%.

At φ = 0.6, uncorrected least squares flagged 33.7% and uncorrected Mann–Kendall flagged 33.6%. The `pymannkendall` Hamed–Rao test flagged 18.0%. With the adopted corrections, least squares flagged 5.1%, Mann–Kendall 6.1%, and the combined Detected verdict 4.9%.

At φ = 0.8, uncorrected least squares flagged 51.7% and uncorrected Mann–Kendall flagged 49.3%. The `pymannkendall` Hamed–Rao test flagged 22.2%. With the adopted corrections, least squares flagged 3.2%, Mann–Kendall 4.9%, and the combined Detected verdict 3.2%.

### 45-year records

At φ = 0.0, uncorrected least squares flagged 6.2% and uncorrected Mann–Kendall flagged 6.5%. The `pymannkendall` Hamed–Rao test flagged 11.5%. With the adopted corrections, least squares flagged 5.9%, Mann–Kendall 6.1%, and the combined Detected verdict 5.1%.

At φ = 0.3, uncorrected least squares flagged 18.1% and uncorrected Mann–Kendall flagged 16.5%. The `pymannkendall` Hamed–Rao test flagged 11.8%. With the adopted corrections, least squares flagged 6.0%, Mann–Kendall 6.4%, and the combined Detected verdict 5.0%.

At φ = 0.6, uncorrected least squares flagged 34.7% and uncorrected Mann–Kendall flagged 33.3%. The `pymannkendall` Hamed–Rao test flagged 15.5%. With the adopted corrections, least squares flagged 5.6%, Mann–Kendall 6.4%, and the combined Detected verdict 5.4%.

At φ = 0.8, uncorrected least squares flagged 51.8% and uncorrected Mann–Kendall flagged 51.0%. The `pymannkendall` Hamed–Rao test flagged 21.7%. With the adopted corrections, least squares flagged 4.9%, Mann–Kendall 6.1%, and the combined Detected verdict 4.7%.

Three settings were outside the concept document's 4% to 7% acceptance range. With 10 years and φ = 0.0, least squares gave 4.4% and Mann–Kendall 3.9%, making the latter slightly conservative. With 10 years and φ = 0.8, the rates were 5.5% and 7.4%, making the rank test slightly liberal. With 21 years and φ = 0.8, they were 3.2% and 4.9%, making least squares slightly conservative.

The main remaining concern is the Mann–Kendall test on short records with strong persistence, particularly 10 years at φ = 0.8. The application only reports Detected when both tests agree, and records shorter than 15 years are flagged as short.

### Changes made after calibration

The first problem was the proposed library test. `pymannkendall.hamed_rao_modification_test` uses sample autocorrelations that happen to be individually significant across the available lags to calculate its variance correction. In the AR(1) simulations, the correction was too small. The adopted method still uses the Hamed–Rao (1998) variance formula, but applies an AR(1) model to rank autocorrelation: ρ(k) = r₁ᵏ. Here, r₁ is estimated from the ranks after removing the Theil–Sen trend. A preliminary test of the library's Yue–Wang variant also rejected around half of pure white-noise records, so that method was set aside.

The second problem was the downward bias in lag-1 autocorrelation estimated from detrended residuals, especially in shorter records. Before correction, least squares flagged 7.4% of 10-year records with φ = 0.8. A separate 4,000-run check confirmed the excess. For a true φ of 0.8, the mean estimated r₁ was only 0.753. Both adopted tests now apply the small-sample correction r₁ + (1 + 4r₁)/n.

The change in false-positive rates before and after this correction was as follows. Both values are reported for each test.

### Correction results for 10-year records

At φ = 0.0, least squares went from 4.5% before correction to 4.4% after correction. Mann–Kendall went from 3.9% to 3.9%.

At φ = 0.3, least squares went from 5.0% before correction to 4.3% after correction. Mann–Kendall went from 5.4% to 4.8%.

At φ = 0.6, least squares went from 5.5% before correction to 4.5% after correction. Mann–Kendall went from 6.8% to 6.1%.

At φ = 0.8, least squares went from 7.4% before correction to 5.5% after correction. Mann–Kendall went from 10.0% to 7.4%.

### Correction results for 21-year records

At φ = 0.0, least squares went from 4.7% before correction to 4.4% after correction. Mann–Kendall went from 4.5% to 4.4%.

At φ = 0.3, least squares went from 5.7% before correction to 5.4% after correction. Mann–Kendall went from 6.5% to 6.1%.

At φ = 0.6, least squares went from 5.5% before correction to 5.1% after correction. Mann–Kendall went from 6.7% to 6.1%.

At φ = 0.8, least squares went from 4.1% before correction to 3.2% after correction. Mann–Kendall went from 5.6% to 4.9%.

### Correction results for 45-year records

At φ = 0.0, least squares went from 5.9% before correction to 5.9% after correction. Mann–Kendall went from 6.1% to 6.1%.

At φ = 0.3, least squares went from 6.2% before correction to 6.0% after correction. Mann–Kendall went from 6.5% to 6.4%.

At φ = 0.6, least squares went from 6.0% before correction to 5.6% after correction. Mann–Kendall went from 6.6% to 6.4%.

At φ = 0.8, least squares went from 5.3% before correction to 4.9% after correction. Mann–Kendall went from 6.7% to 6.1%.

## 3. Recovery of a known trend

Each setting used 1,000 simulated 40-year records with a known trend, a seasonal cycle of amplitude 8 and AR(1) noise. Some runs had months deleted at random. The analysis used the same deseasonalised anomalies as the application.

With a true rate of +0.30 per decade, noise standard deviation 1.0, φ = 0.0 and 0.0% of months missing, the mean fitted rates were +0.299 for least squares and +0.299 for Theil–Sen. Coverage of the 95% intervals was 95.0% and 94.7%, respectively.

With a true rate of +0.30 per decade, noise standard deviation 1.0, φ = 0.3 and 0.0% of months missing, the mean fitted rates were +0.301 for least squares and +0.301 for Theil–Sen. Coverage of the 95% intervals was 95.2% and 95.1%, respectively.

With a true rate of +0.30 per decade, noise standard deviation 1.0, φ = 0.6 and 0.0% of months missing, the mean fitted rates were +0.302 for least squares and +0.301 for Theil–Sen. Coverage of the 95% intervals was 95.1% and 94.8%, respectively.

With a true rate of +0.30 per decade, noise standard deviation 1.0, φ = 0.3 and 8.0% of months missing, the mean fitted rates were +0.299 for least squares and +0.300 for Theil–Sen. Coverage of the 95% intervals was 95.0% and 94.1%, respectively.

With a true rate of +0.30 per decade, noise standard deviation 1.0, φ = 0.6 and 8.0% of months missing, the mean fitted rates were +0.299 for least squares and +0.299 for Theil–Sen. Coverage of the 95% intervals was 95.6% and 94.8%, respectively.

With a true rate of +0.30 per decade, noise standard deviation 1.0, φ = 0.8 and 0.0% of months missing, the mean fitted rates were +0.293 for least squares and +0.293 for Theil–Sen. Coverage of the 95% intervals was 94.2% and 93.2%, respectively.

Across these settings, both mean estimates were within 0.01 per decade of the true rate. Interval coverage was close to 95% within simulation error, apart from the φ = 0.8 setting, where the Theil–Sen interval was slightly narrow.

## 4. Estimated record length against simulation

The record-length calculation uses Weatherhead et al. (1998):

`n* = [(3.3 σ_N / |ω|) √((1 + φ) / (1 − φ))]^(2/3)` years.

Here, n* is the estimated record length needed for a 90% chance of detecting a trend ω at the 95% significance level. The calculation was tested by simulating records of length n* and applying the application's least-squares test. A separate bisection search found the record length at which simulated detection reached 90%.

For a rate of 0.3 per decade, noise standard deviation 1.0 and φ = 0.0, the formula gave 23.0 years. Detection at that length was 90.2%; simulation put the 90% threshold at 22.8 years. The formula-to-simulation ratio was 1.006.

For a rate of 0.3 per decade, noise standard deviation 1.0 and φ = 0.3, the formula gave 28.2 years. Detection at that length was 91.9%; simulation put the 90% threshold at 28.1 years. The formula-to-simulation ratio was 1.006.

For a rate of 0.3 per decade, noise standard deviation 1.0 and φ = 0.6, the formula gave 36.4 years. Detection at that length was 90.2%; simulation put the 90% threshold at 36.5 years. The formula-to-simulation ratio was 0.997.

For a rate of 0.5 per decade, noise standard deviation 1.0 and φ = 0.3, the formula gave 20.1 years. Detection at that length was 89.6%; simulation put the 90% threshold at 19.8 years. The formula-to-simulation ratio was 1.015.

For a rate of 0.2 per decade, noise standard deviation 0.5 and φ = 0.5, the formula gave 27.3 years. Detection at that length was 90.9%; simulation put the 90% threshold at 27.2 years. The formula-to-simulation ratio was 1.006.

For a rate of 0.3 per decade, noise standard deviation 1.0 and φ = 0.8, the formula gave 47.8 years. Detection at that length was 89.7%; simulation put the 90% threshold at 47.5 years. The formula-to-simulation ratio was 1.006.

The concept document allowed an error of 20% in this comparison. The formula met that target in every tested setting when the true trend and noise were supplied.

### Record-length estimates from an undetected series

In a real analysis the trend rate has to be estimated from the record itself. To test that case, the simulations used records only 60% as long as their true n*. The application returned an estimate when the fitted rate was more than one standard error from zero. Otherwise it withheld the estimate. Some of these records were already detected.

For a true rate of 0.3 per decade and φ = 0.0, the record had 13 years, against a true n* of 23.0 years. A trend was already detected in 23.2% of runs. The estimate was withheld in 32.0% and given in 44.8%. Among estimates given, the median estimate-to-truth ratio was 0.96, the 10th–90th percentile range was 0.81–1.17, and 83.5% were within 20% of the true value.

For a true rate of 0.3 per decade and φ = 0.3, the record had 16 years, against a true n* of 28.2 years. A trend was already detected in 28.8% of runs. The estimate was withheld in 33.3% and given in 37.9%. Among estimates given, the median estimate-to-truth ratio was 0.96, the 10th–90th percentile range was 0.81–1.16, and 85.8% were within 20% of the true value.

For a true rate of 0.3 per decade and φ = 0.6, the record had 21 years, against a true n* of 36.4 years. A trend was already detected in 27.3% of runs. The estimate was withheld in 31.4% and given in 41.3%. Among estimates given, the median estimate-to-truth ratio was 0.99, the 10th–90th percentile range was 0.82–1.21, and 84.5% were within 20% of the true value.

For a true rate of 0.5 per decade and φ = 0.3, the record had 12 years, against a true n* of 20.1 years. A trend was already detected in 29.5% of runs. The estimate was withheld in 31.6% and given in 38.9%. Among estimates given, the median estimate-to-truth ratio was 1.01, the 10th–90th percentile range was 0.85–1.23, and 82.5% were within 20% of the true value.

For a true rate of 0.2 per decade and φ = 0.5, the record had 16 years, against a true n* of 27.3 years. A trend was already detected in 27.3% of runs. The estimate was withheld in 32.3% and given in 40.4%. Among estimates given, the median estimate-to-truth ratio was 0.97, the 10th–90th percentile range was 0.83–1.20, and 87.9% were within 20% of the true value.

For a true rate of 0.3 per decade and φ = 0.8, the record had 28 years, against a true n* of 47.8 years. A trend was already detected in 28.9% of runs. The estimate was withheld in 31.4% and given in 39.7%. Among estimates given, the median estimate-to-truth ratio was 0.97, the 10th–90th percentile range was 0.83–1.18, and 90.7% were within 20% of the true value.

Most estimates that were returned fell within 20% of the true record length. Around a third of runs returned no estimate because the fitted trend was too close to zero to support one. These results apply to steady linear trends with AR(1) noise. They do not establish the accuracy of the estimate for other kinds of environmental records.

## 5. Replay and sustained detection

Each setting used 500 simulated 45-year records. Every record went through the full expanding-record replay, with 36 yearly endpoints.

### Records without a trend

At φ = 0.0, 30.6% of replays crossed the Detected threshold at least once, but only 4.0% were assigned a year of sustained detection.

At φ = 0.3, 35.0% of replays crossed the Detected threshold at least once, but only 6.0% were assigned a year of sustained detection.

At φ = 0.6, 31.2% of replays crossed the Detected threshold at least once, but only 5.2% were assigned a year of sustained detection.

Repeatedly testing noise creates temporary detections in roughly one-third of replays. The sustained-detection rule requires the criterion to remain satisfied through the final year, so a sustained detection can occur only when the full-record verdict is Detected. The resulting false-detection rate is therefore close to that of the full-record test. This does not give a controlled error rate for the particular year reported.

### Records with a trend

With a true rate of 0.3 per decade and φ = 0.3, Weatherhead n* was 28.2 years. Detection occurred within 45 years in 100.0% of runs. Median time to detection was 22 years, with a 10th–90th percentile range of 15–29. By n*, 87.2% of records had been detected; 21.2% were detected within three years on either side of n*.

With a true rate of 0.5 per decade and φ = 0.3, Weatherhead n* was 20.1 years. Detection occurred within 45 years in 100.0% of runs. Median time to detection was 16 years, with a 10th–90th percentile range of 10–21. By n*, 89.4% of records had been detected; 32.4% were detected within three years on either side of n*.

With a true rate of 0.3 per decade and φ = 0.6, Weatherhead n* was 36.4 years. Detection occurred within 45 years in 99.6% of runs. Median time to detection was 29 years, with a 10th–90th percentile range of 19–37. By n*, 88.0% of records had been detected; 19.4% were detected within three years on either side of n*.

The concept document proposed that the year of sustained detection should fall within three years of the theoretical record length in 80% of runs. This target was not met. It is also not the right test of the formula: n* is the length at which detection has a 90% chance of occurring, so many individual records will cross the threshold earlier. The relevant comparison is the share detected by n*, which was 87% to 89% here. The wide detection-year ranges, spanning 10 to 15 years from the 10th to the 90th percentile, show why a single detection year is uncertain.

### Detection probability for Madrid

A separate run simulated 500 records for each Madrid variable using the rate, noise and autocorrelation fitted to its real record. Each simulation used a seasonal cycle, a constant linear trend and AR(1) noise, and was analysed with the application's pipeline. The script was `backend/scripts/detectability_curve.py`, with seed 20261115. The figures give the shortest record length at which the specified share of simulations was Detected. Precipitation lengths were checked in five-year increments.

For temperature, the assumed rate was +0.348 °C per decade, noise standard deviation 1.41 and φ = 0.23. Detection reached 50% by 23 years, 80% by 28 years and 90% by 31 years. Weatherhead n* was 30.5 years.

For precipitation, the assumed rate was +0.051 mm/day per decade, noise standard deviation 0.90 and φ = 0.15. Detection reached 50% by 55 years, 80% by 75 years and 90% by 80 years. Weatherhead n* was 77.3 years.

The real Madrid temperature record reached sustained detection after 36 years. In simulated 45-year records with a constant trend equal to the full-record estimate, the median was 24 years, with a 10th–90th percentile range of 16–31 years. By year 36, 98.0% of simulations had reached sustained detection. The observed result was therefore unusually late under the constant-trend model.

The rate changes when the analysis starts later: +0.33 °C per decade from 1981, +0.49 from 1991 and +0.60 from 2001. The early part of the record carried less signal than the steady-rate simulation assumed. This limits how literally the conditional record-length estimates can be applied to Madrid. The Methods panel notes this limitation.

## 6. Independent check of Madrid temperature

For a check outside the reanalysis, the project used NOAA GHCN-Daily data for the Madrid Retiro station, supplied by the European Climate Assessment & Dataset (source flag E). The station identifier is SP000003195 (MADRID RETIRO, SP), at 40.4117°N, 3.6781°W and 667 m elevation. The daily maximum and minimum temperatures came from <https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/SP000003195.csv>.

The station sits within the MERRA-2 cell used by the application (40.25–40.75°N, 4.06–3.44°W), about 2 km from the point requested in the interface.

Daily mean temperature was calculated as (TMAX + TMIN) / 2 in °C; GHCN-D stores temperatures in tenths of a degree. Days failing a GHCN-D quality check were excluded. Monthly means used valid days, and months with fewer than 20 valid days were left missing. The resulting series then went through the same calendar-month anomaly calculation, Theil–Sen fit, two autocorrelation-aware tests and expanding-record replay as the application.

The period was January 1981 to December 2025. Of 540 months, 537 were usable; October, November and December 2025 were missing.

For the MERRA-2 grid cell (application result), the rate was +0.33 °C per decade, with a 95% interval of +0.21 to +0.45. Mann–Kendall p was < 0.001, least-squares p was < 0.001, and 540 months were used. Retrospective sustained detection was from 2016, at 36 years.

For the Retiro station, (max + min) / 2, the rate was +0.39 °C per decade, with a 95% interval of +0.27 to +0.50. Mann–Kendall p was < 0.001, least-squares p was < 0.001, and 537 months were used. Retrospective sustained detection was from 2011, at 31 years.

For the Retiro station, daily maximum, the rate was +0.41 °C per decade, with a 95% interval of +0.27 to +0.54. Mann–Kendall p was < 0.001, least-squares p was < 0.001, and 537 months were used. Retrospective sustained detection was from 2014, at 34 years.

For the Retiro station, daily minimum, the rate was +0.38 °C per decade, with a 95% interval of +0.27 to +0.49. Mann–Kendall p was < 0.001, least-squares p was < 0.001, and 537 months were used. Retrospective sustained detection was from 1995, at 15 years.

Both the MERRA-2 cell and the Retiro station show a detected rise. Their confidence intervals overlap, and their monthly anomalies have a correlation of 0.96 across 537 paired months. The station also has a stronger trend when the analysis starts later: +0.39 °C per decade from 1981, +0.49 from 1991 and +0.64 from 2001.

The station warms faster than the MERRA-2 cell. The trend in the monthly station-minus-cell difference is +0.06 °C per decade, with a 95% interval of +0.02 to +0.10 and adjusted p-values of 0.005 and 0.002. That difference is itself detected. Sustained detection starts in 2011 for the station mean and 2016 for the MERRA-2 cell.

The independent station record supports the warming found in the Madrid reanalysis series. The exact rate and detection year differ between the two records. Retiro measures temperature at a specific site in a city park, while MERRA-2 averages a cell of roughly 53 × 55 km. The area around Retiro has urbanised, which could contribute warming at the station beyond what appears in the grid-cell average. Retiro's mean is calculated from daily maxima and minima, while MERRA-2 averages temperatures over all hours. MERRA-2 also does not assimilate the station's 2 m temperature directly. This comparison cannot separate those effects. No independent equivalent was carried out for precipitation or the satellite series.

## 7. Comparison with reference libraries

The tests in `backend/tests/test_statistics.py` check agreement to at least three significant figures. Theil–Sen slopes are compared with `scipy.stats.theilslopes`. Least-squares slopes, standard errors and p-values are compared with `scipy.stats.linregress`. Mann–Kendall S, its variance and the uncorrected p-value are compared with `pymannkendall.original_test`. Kendall's tau is compared with `scipy.stats.kendalltau`.

## 8. Other tests

The tests change observations after a replay endpoint and confirm that earlier replay frames remain bit-for-bit unchanged. Each frame also agrees with a direct analysis of the record cut off at that endpoint. This checks for future-data leakage.

Seasonal anomalies have a mean of zero for each calendar month, and missing months remain missing. Coverage tests check the boundary between 9 and 10 usable years and between exactly 90% monthly coverage and one fewer month.

NASA POWER annual entries with month code 13 are excluded, and fill values are treated as missing. Records that rise and then fall trigger the straight-line warning; steady-trend records do not. Exported records reproduce the same numerical results when rerun, while modified records are reported as different. The wording tests also check that results contain neither the word "proves" nor a causal claim.

## 9. Limits

The simulations use AR(1) noise. Real environmental records can have longer memory, changes in variance or abrupt shifts. The false-positive rates measured here may not apply under those conditions.

The tests were calibrated for linear trends. The straight-line check warns about nonlinearity but does not correct it.

Monthly precipitation is skewed and bounded below by zero. The rank-based test handles this better than least squares. The application requires both tests to agree before reporting detection.

The year of sustained detection is calculated retrospectively using the full record. It is not a stopping rule; no sequential-testing correction is applied, and the reported year depends on when the record begins.

The Weatherhead formula was implemented from its published expression. The build environment could not open the paper itself. The direct check provided here is therefore the simulation in section 4.

## References

Weatherhead, E. C., et al. (1998). Factors affecting the detection of trends: Statistical considerations and applications to environmental data. *Journal of Geophysical Research*, 103(D14), 17149–17161.

Hamed, K. H., & Rao, A. R. (1998). A modified Mann–Kendall trend test for autocorrelated data. *Journal of Hydrology*, 204, 182–196.

Santer, B. D., et al. (2008). Consistency of modelled and observed temperature trends in the tropical troposphere. *International Journal of Climatology*, 28, 1703–1722.

Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. *Journal of the American Statistical Association*, 63, 1379–1389.
