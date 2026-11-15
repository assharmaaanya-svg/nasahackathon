import { useEffect, useRef, useState } from "react";

import { PowerCurve } from "../charts/PowerCurve";
import { fetchValidation, type ValidationReport } from "../lib/api";

interface Props {
  onClose: () => void;
}

const STRESS_NAMES: Record<string, string> = {
  ar2_null: "No trend, AR(2) noise",
  arma11_null: "No trend, ARMA(1,1) noise",
  variance_doubles_null: "No trend, noise doubling over the record",
  seasonal_variance_null: "No trend, noisier winters",
  three_year_gap_null: "No trend, three-year gap",
  skewed_null: "No trend, skewed values",
  step_up_midway: "Step up at mid-record, no trend either side",
  rise_then_fall: "Rise then equal fall",
  rise_then_flat: "Rise then flat",
};

const fixed = (value: number) => (value > 0 ? "+" : "−") + Math.abs(value).toFixed(2);

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function Methods({ onClose }: Props) {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [missing, setMissing] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchValidation().then(setReport, () => setMissing(true));
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="methods-veil" onClick={onClose}>
      <div className="methods" role="dialog" aria-modal="true" aria-labelledby="methods-title" tabIndex={-1} ref={panel} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="methods-title">Methods and validation</h2>
          <button className="text-button" onClick={onClose}>
            Close
          </button>
        </header>

        <section>
          <h3 className="label">What is tested</h3>
          <p>
            Null hypothesis: no linear trend; departures from the seasonal cycle follow an AR(1) process. Alternative: a
            non-zero linear trend, with direction reported separately. The replay asks how the evidence against the null
            changes as the record lengthens. Monthly values come from NASA; anomalies, rates, intervals, verdicts and
            record lengths are computed here.
          </p>
        </section>

        <section>
          <h3 className="label">The pipeline</h3>
          <ol className="methods-steps">
            <li>
              <strong>Coverage.</strong> At least 10 usable years and 90% of months. Fill values are dropped; nothing is
              interpolated. Annual-mean entries in NASA POWER responses are discarded.
            </li>
            <li>
              <strong>Seasonal cycle.</strong> Each calendar month's mean is subtracted to form anomalies. Every replay
              frame recomputes this using only the months available by that frame's end year, so no future data leaks
              into the past.
            </li>
            <li>
              <strong>Rate.</strong> Theil–Sen slope per decade with Sen's rank-based 95% interval, widened for
              autocorrelation.
            </li>
            <li>
              <strong>Two tests.</strong> Mann–Kendall with the Hamed–Rao variance formula driven by an AR(1) model of
              rank autocorrelation; and a least-squares t-test on the effective sample size n(1−r₁)/(1+r₁). Both use a
              small-sample bias correction for r₁.
            </li>
            <li>
              <strong>Verdict.</strong> Detected only when both tests give p &lt; 0.05 and agree on direction.
            </li>
            <li>
              <strong>Sustained detection.</strong> The earliest endpoint from which the Detected rule holds in every
              later year. It is found in hindsight from the full record and is not a stopping rule: nobody could have
              named it in that year. It exists only if the full-record test is Detected, so the yearly looks cannot add
              false detections; they only make the year uncertain. Held for under 5 years, it is marked provisional. It
              depends on the year the record starts.
            </li>
            <li>
              <strong>Record length for a 90% chance of detection.</strong> Weatherhead et al. (1998), given at the
              estimated rate and at both ends of its 95% interval. Conditional on a steady linear rate and unchanged
              noise. Shown only when the estimated rate is at least one standard error from zero and the answer is under
              200 years. No calendar year is given.
            </li>
          </ol>
        </section>

        {report && (
          <>
            <section>
              <h3 className="label">False alarms on trendless noise</h3>
              <p>
                Share of {report.runs_per_configuration.toLocaleString()} simulated records with no trend that each test
                wrongly flags at the 5% level. A sound test stays near 5%. Uncorrected tests, the kind a spreadsheet
                runs, do not.
              </p>
              <div className="methods-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Years</th>
                      <th>Persistence φ</th>
                      <th>Least squares, uncorrected</th>
                      <th>Mann–Kendall, uncorrected</th>
                      <th>Library Hamed–Rao</th>
                      <th className="methods-ours">Least squares, ours</th>
                      <th className="methods-ours">Mann–Kendall, ours</th>
                      <th className="methods-ours">Detected verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.false_positive_rates.map((row) => (
                      <tr key={`${row.months}-${row.phi}`}>
                        <td>{row.months / 12}</td>
                        <td>{row.phi.toFixed(1)}</td>
                        <td>{percent(row.least_squares_naive)}</td>
                        <td>{percent(row.mann_kendall_naive)}</td>
                        <td>{percent(row.hamed_rao_library)}</td>
                        <td className="methods-ours">{percent(row.least_squares_ar1)}</td>
                        <td className="methods-ours">{percent(row.mann_kendall_ar1)}</td>
                        <td className="methods-ours">{percent(row.detected_verdict)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="methods-note">
                With {report.runs_per_configuration.toLocaleString()} runs, a true 5% rate lands between about 3.6% and
                6.4% nineteen times in twenty. Seed {report.seed}.
              </p>
            </section>

            <section>
              <h3 className="label">Years-needed formula against simulation</h3>
              <div className="methods-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Rate per decade</th>
                      <th>Noise s.d.</th>
                      <th>φ</th>
                      <th>Formula (years)</th>
                      <th>Simulated years for 90% detection</th>
                      <th>Detection rate at formula length</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.years_needed_formula.map((row, index) => (
                      <tr key={index}>
                        <td>{row.slope_per_decade.toFixed(1)}</td>
                        <td>{row.noise_sd.toFixed(1)}</td>
                        <td>{row.phi.toFixed(1)}</td>
                        <td>{row.formula_years.toFixed(1)}</td>
                        <td>{row.simulated_years_for_90_percent.toFixed(1)}</td>
                        <td>{percent(row.detection_probability_at_formula_years)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className="label">The replay rule on trendless noise</h3>
              <div className="methods-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>φ</th>
                      <th>Trendless replays crossing the line at least once</th>
                      <th>Trendless replays given a year of sustained detection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.replay_under_no_trend.map((row) => (
                      <tr key={row.phi}>
                        <td>{row.phi.toFixed(1)}</td>
                        <td>{percent(row.any_endpoint_crossing_rate)}</td>
                        <td>{percent(row.false_detection_year_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="methods-note">
                {report.replay_under_no_trend[0]?.runs} simulated 45-year records per row, each tested at 36 yearly
                endpoints.
              </p>
            </section>
          </>
        )}
        {report?.stress_tests && (
          <section>
            <h3 className="label">Where the assumptions are broken</h3>
            <p>
              45-year simulated records that violate the AR(1), linear-trend model. The first six have no trend, so every
              detection is a false alarm. The last three have real change that is not a steady line.
            </p>
            <div className="methods-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Simulated record</th>
                    <th>Called Detected</th>
                    <th>Straight-line note shown</th>
                    <th>Reversal warning shown</th>
                  </tr>
                </thead>
                <tbody>
                  {report.stress_tests.map((row) => (
                    <tr key={row.case}>
                      <td>{STRESS_NAMES[row.case] ?? row.case}</td>
                      <td>{percent(row.detected_share)}</td>
                      <td>{percent(row.straight_line_note_share)}</td>
                      <td>{percent(row.reversal_warning_share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="methods-note">
              {report.runs_per_configuration.toLocaleString()} runs per row. A step change is reported as a trend; the
              straight-line note is the only defence, and it does not always fire.
            </p>
          </section>
        )}

        {report?.madrid_crosscheck && (
          <section>
            <h3 className="label">Madrid against an independent station</h3>
            <p>
              The MERRA-2 cell compared with the Madrid Retiro ground station ({report.madrid_crosscheck.station.id},{" "}
              {report.madrid_crosscheck.station.latitude.toFixed(2)}°N {Math.abs(report.madrid_crosscheck.station.longitude).toFixed(2)}°W,{" "}
              {report.madrid_crosscheck.station.elevation_m.toFixed(0)} m), daily maximum and minimum from NOAA GHCN-Daily, run
              through the same pipeline over 1981–2025.
            </p>
            <div className="methods-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Series</th>
                    <th>Rate per decade (°C)</th>
                    <th>95% interval</th>
                    <th>Months</th>
                    <th>Retrospective sustained detection</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["MERRA-2 grid cell, 53 × 55 km", report.madrid_crosscheck.merra2_cell],
                      ["Retiro station, mean of max and min", report.madrid_crosscheck.station_mean],
                      ["Retiro station, daily maximum", report.madrid_crosscheck.station_daily_maximum],
                      ["Retiro station, daily minimum", report.madrid_crosscheck.station_daily_minimum],
                    ] as const
                  ).map(([name, row]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{fixed(row.rate_per_decade)}</td>
                      <td>
                        {fixed(row.interval_per_decade[0])} to {fixed(row.interval_per_decade[1])}
                      </td>
                      <td>{row.valid_months}</td>
                      <td>
                        {row.sustained_detection_from === null
                          ? "none"
                          : `from ${row.sustained_detection_from}, at ${row.years_of_record_at_sustained_detection} years`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Both records warm, at overlapping rates, and their monthly anomalies correlate at{" "}
              {report.madrid_crosscheck.monthly_anomaly_correlation.toFixed(2)}. They are not the same: the station warms
              faster than the cell by {fixed(report.madrid_crosscheck.station_minus_merra2.rate_per_decade)} °C per decade (
              {fixed(report.madrid_crosscheck.station_minus_merra2.interval_per_decade[0])} to{" "}
              {fixed(report.madrid_crosscheck.station_minus_merra2.interval_per_decade[1])}), and its year of sustained
              detection is earlier. A thermometer in a city park and the average of a 53 × 55 km model cell measure
              different things, and the station's surroundings have urbanised. The station supports the warming seen in the
              reanalysis; it does not validate the cell's exact rate or its year.
            </p>
          </section>
        )}

        {report?.detectability && (
          <section>
            <h3 className="label">Detection probability against record length</h3>
            <p>
              A different question from the replay. The replay shows what the real record supported at each year. This
              asks: if the rate and noise fitted to Madrid's full record had held steady from the start, how often would
              a record of each length be called Detected?
            </p>
            <PowerCurve studies={report.detectability.studies} />
            <div className="methods-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Madrid record</th>
                    <th>Assumed rate per decade</th>
                    <th>50% detected by</th>
                    <th>80%</th>
                    <th>90%</th>
                    <th>Formula, 90%</th>
                  </tr>
                </thead>
                <tbody>
                  {report.detectability.studies.map((study) => (
                    <tr key={study.variable}>
                      <td>{study.variable}</td>
                      <td>
                        {study.assumed_rate_per_decade.toFixed(2)} {study.units}
                      </td>
                      <td>{study.years_for_50_percent ?? "–"} yr</td>
                      <td>{study.years_for_80_percent ?? "–"} yr</td>
                      <td>{study.years_for_90_percent ?? "–"} yr</td>
                      <td>{study.weatherhead_years_90_percent.toFixed(0)} yr</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.detectability.studies
              .filter((study) => study.simulated_records_of_same_length && study.observed_sustained_detection_at_years !== null)
              .map((study) => {
                const same = study.simulated_records_of_same_length;
                if (!same) return null;
                return (
                  <p key={study.variable}>
                    The real Madrid temperature record reached sustained detection at {study.observed_sustained_detection_at_years}{" "}
                    years. Under a steady trend of the full-record size, half the simulated records got there by{" "}
                    {same.median_years?.toFixed(0)} years and {percent(same.share_sustained_by_observed_length ?? 0)} by{" "}
                    {study.observed_sustained_detection_at_years}. The real record was slow. The likely reason is that its
                    rate was not steady: the start-year table in Provenance shows a weaker rate over the early decades.
                    A steady-trend model therefore describes this record imperfectly, and the same caution applies to
                    the record lengths quoted for precipitation.
                  </p>
                );
              })}
            <p className="methods-note">
              Precipitation is tested every 5 years of length, temperature every year. Seed {report.detectability.seed}.
            </p>
          </section>
        )}
        {missing && <p className="methods-note">The validation experiments are not bundled with this build. See docs/VALIDATION.md.</p>}

        <section>
          <h3 className="label">What this instrument does not claim</h3>
          <ul className="methods-limits">
            <li>That a detected trend has any particular cause.</li>
            <li>That “not detectable yet” means no change is happening.</li>
            <li>That the year of sustained detection was knowable at the time, or is a property of the place rather than of this record.</li>
            <li>That detection will occur in any particular year. Record lengths are conditional on a rate and noise that may not continue.</li>
            <li>That a satellite NO₂ column is surface air quality.</li>
            <li>That a reanalysis or model record is a direct measurement.</li>
            <li>That a straight line is the right shape for every record.</li>
            <li>That it is the first tool of its kind. We found no public tool offering this for NASA records; that is not proof none exists.</li>
          </ul>
        </section>

        <section>
          <h3 className="label">References</h3>
          <ul className="methods-refs">
            <li>Weatherhead, E. C. et al. (1998). Factors affecting the detection of trends. J. Geophys. Res. 103(D14).</li>
            <li>Hamed, K. H. and Rao, A. R. (1998). A modified Mann–Kendall trend test for autocorrelated data. J. Hydrol. 204.</li>
            <li>Santer, B. D. et al. (2008). Consistency of modelled and observed temperature trends. Int. J. Climatol. 28.</li>
            <li>Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. J. Am. Stat. Assoc. 63.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
