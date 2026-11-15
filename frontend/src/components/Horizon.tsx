import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { useState } from "react";

import { estimateRows, isDetected, signed } from "../lib/format";
import { useWidth } from "../lib/useWidth";
import type { CaseRecord } from "../types";

const HEIGHT = 230;

type Point = { years: number; value: number };

export function Horizon({ record }: { record: CaseRecord }) {
  const [clock, setClock] = useState<"evidence" | "power">("evidence");
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const result = record.result;
  const needed = result?.years_needed;
  if (!result || !needed) return null;
  const variable = record.case.variable;
  const detection = result.detection;
  const recordYears = record.coverage.span_years;
  const detected = isDetected(result.verdict);
  const curve = needed.available ? needed.curve : null;

  const left = 44;
  const right = 18;
  const top = 16;
  const bottom = HEIGHT - 38;
  const last = curve ? curve[curve.length - 1].years : 0;
  const x = scaleLinear().domain([5, last]).range([left, Math.max(width - right, left + 10)]);
  const y = scaleLinear().domain([0, 1]).range([bottom, top]);
  const path = line<Point>()
    .x((point) => x(point.years))
    .y((point) => y(point.value));
  const ticks: number[] = [];
  for (let year = 10; year <= last; year += last > 100 ? 20 : 10) ticks.push(year);
  const perDecade = (rate: number | null) => (rate === null ? "" : `${signed(rate * 10, variable.decimals)} ${variable.units} per decade`);

  return (
    <section className="horizon" aria-labelledby="horizon-title">
      <h3 className="label" id="horizon-title">
        Two questions
      </h3>
      <div className="clock-switch" role="tablist" aria-label="Evidence so far or power under an assumption">
        <button role="tab" aria-selected={clock === "evidence"} className={clock === "evidence" ? "clock-on" : ""} onClick={() => setClock("evidence")}>
          Evidence so far
        </button>
        <button role="tab" aria-selected={clock === "power"} className={clock === "power" ? "clock-on" : ""} onClick={() => setClock("power")}>
          Power under an assumption
        </button>
      </div>

      {clock === "evidence" && (
        <div role="tabpanel">
          <p className="clock-question">What has the real record supported, year by year?</p>
          <table className="horizon-table">
            <tbody>
              <tr>
                <th scope="row">Endpoints tested</th>
                <td className="num">
                  {detection.endpoints_tested}, from {record.replay.frames[0]?.end_year} to {record.coverage.last_year}
                </td>
              </tr>
              <tr>
                <th scope="row">First year the criterion was met</th>
                <td className="num">{detection.first_crossing_year ?? "never"}</td>
              </tr>
              <tr>
                <th scope="row">Times it lapsed afterwards</th>
                <td className="num">{detection.lapses}</td>
              </tr>
              <tr>
                <th scope="row">Retrospective sustained detection</th>
                <td className="num">
                  {detection.detection_year === null
                    ? "none"
                    : `from ${detection.at_first_endpoint ? "≤ " : ""}${detection.detection_year}, at ${detection.years_watched_at_detection} years of record${detection.provisional ? " (provisional)" : ""}`}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="horizon-note">
            This is history: each endpoint used only the data available by then. The year of sustained detection is identified
            afterwards from the whole replay. It is not a stopping rule and could not have been named at the time.
          </p>
        </div>
      )}

      {clock === "power" && (
        <div role="tabpanel">
          <p className="clock-question">
            If a steady trend of a given size were real, how likely would a record of each length be to detect it?
          </p>
          {curve ? (
            <>
              <div ref={ref} className="measure" style={{ height: HEIGHT }}>
                <svg width={width} height={HEIGHT} role="img" aria-label="Chance of detection against years of record, under three assumed rates">
                  {[0, 0.5, 0.9, 1].map((share) => (
                    <g key={share}>
                      <line x1={left} x2={width - right} y1={y(share)} y2={y(share)} className={share === 0.9 ? "power-target" : "ruler"} />
                      <text x={left - 8} y={y(share) + 4} textAnchor="end" className="tick">
                        {Math.round(share * 100)}%
                      </text>
                    </g>
                  ))}
                  {ticks.map((year) => (
                    <text key={year} x={x(year)} y={bottom + 17} textAnchor="middle" className="tick">
                      {year}
                    </text>
                  ))}
                  <text x={(left + width - right) / 2} y={HEIGHT - 3} textAnchor="middle" className="tick">
                    years of record
                  </text>
                  <line x1={x(recordYears)} x2={x(recordYears)} y1={top} y2={bottom} className="power-now" />
                  <text x={x(recordYears) + 6} y={bottom - 6} className="tick">
                    record today, {recordYears} yr
                  </text>
                  <path d={path(curve.map((p) => ({ years: p.years, value: p.at_strong_end }))) ?? ""} className="power-line power-line-side" />
                  {curve[0].at_weak_end !== null && (
                    <path d={path(curve.map((p) => ({ years: p.years, value: p.at_weak_end as number }))) ?? ""} className="power-line power-line-side" />
                  )}
                  <path d={path(curve.map((p) => ({ years: p.years, value: p.at_estimate }))) ?? ""} className="power-line power-line-a" />
                </svg>
              </div>
              <p className="horizon-note">
                Solid: the fitted least-squares rate, {perDecade(needed.rate_per_year)}. Dashed: {needed.weaker_end_includes_zero ? "the strong end" : "the ends"} of its 95% interval,{" "}
                {perDecade(needed.strong_rate_per_year)}
                {needed.weaker_end_includes_zero ? "" : ` and ${perDecade(needed.weak_rate_per_year)}`}. Noise s.d.{" "}
                {needed.noise_sd?.toFixed(2)} {variable.units}, lag-1 autocorrelation {needed.autocorrelation?.toFixed(2)}.
              </p>
              <table className="horizon-table">
                <thead>
                  <tr>
                    <th scope="col">If the true rate is at the</th>
                    <th scope="col">Record for a 90% chance</th>
                  </tr>
                </thead>
                <tbody>
                  {estimateRows(needed).map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td className="num">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {needed.weaker_end_includes_zero && (
                <p className="horizon-note">
                  The weak end of the interval is {perDecade(needed.weak_rate_per_year)}, at or beyond zero. A true rate of zero is
                  flagged only at the 5% false-alarm level however long the record, so no length gives a 90% chance.
                </p>
              )}
              <p className="horizon-note">
                This is a calculation, not history and not a forecast. It assumes a steady linear rate and unchanged AR(1) noise
                (Weatherhead et al., 1998), with a least-squares test at the 5% level. Real records need not behave this way
                {detected && detection.years_watched_at_detection !== null
                  ? `: this one reached sustained detection at ${detection.years_watched_at_detection} years.`
                  : "."}
              </p>
            </>
          ) : (
            <>
              <p className="horizon-lead">No calculation is offered for this record.</p>
              <p className="horizon-note">{needed.reason}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
