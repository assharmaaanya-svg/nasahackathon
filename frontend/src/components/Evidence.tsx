import { useEffect, useMemo, useState } from "react";

import { Instrument } from "../charts/Instrument";
import { buildModel } from "../charts/model";
import { ESTIMATE_NOTE, PREDICTION_NOTE, SUSTAINED_NOTE, coordinates, footprintSize, interval, isDetected, pValue, predictionResult, signed, stateLabel, sustainedValue } from "../lib/format";
import { useReplay } from "../lib/useReplay";
import type { CaseRecord, Prediction } from "../types";
import { Horizon } from "./Horizon";
import { RecordSheet } from "./RecordSheet";
import { Term } from "./Term";

export type Phase = "measured" | "adjusted" | "replay" | "result";
type View = "measured" | "adjusted" | "replay";

interface Props {
  record: CaseRecord;
  prediction: Prediction;
  phase: Phase;
  initialFrame?: number;
  onFrame: (frame: number) => void;
  onPhase: (phase: Phase) => void;
  onLoaded: (record: CaseRecord) => void;
  onChangeRecord: () => void;
  reducedMotion: boolean;
}

const BLEND_MS = 1800;

const STAGES: { id: View; name: string; caption: string }[] = [
  { id: "measured", name: "As measured", caption: "Monthly values, as retrieved." },
  { id: "adjusted", name: "Seasons removed", caption: "Departure from the seasonal mean. Bold line: 12-month mean." },
  { id: "replay", name: "Watch Replay", caption: "Rate and 95% interval for a record ending at the cursor." },
];

export function Evidence({ record, prediction, phase, initialFrame, onFrame, onPhase, onLoaded, onChangeRecord, reducedMotion }: Props) {
  const model = useMemo(() => buildModel(record), [record]);
  const variable = record.case.variable;
  const place = record.case.place;
  const result = record.result;
  const testable = result !== null && model.frames.length > 0;
  const [view, setView] = useState<View>(phase === "measured" ? "measured" : phase === "adjusted" ? "adjusted" : "replay");
  const [blend, setBlend] = useState(view === "measured" ? 0 : 1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const revealed = phase === "result";
  const [chartHeight, setChartHeight] = useState(() => Math.max(window.innerHeight - 400, 400));
  useEffect(() => {
    const onResize = () => setChartHeight(Math.max(window.innerHeight - 400, 400));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const replay = useReplay(model.frames.length, reducedMotion, () => onPhase("result"));

  useEffect(() => {
    const target = view === "measured" ? 0 : 1;
    if (reducedMotion || view === "replay") {
      setBlend(target);
      return;
    }
    let handle = 0;
    const started = performance.now();
    const from = blend;
    const tick = (now: number) => {
      const progress = Math.min((now - started) / BLEND_MS, 1);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      setBlend(from + (target - from) * eased);
      if (progress < 1) handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [view, reducedMotion]);

  useEffect(() => {
    if (revealed && replay.position === 0 && model.frames.length > 1 && !replay.playing) {
      replay.seek(initialFrame ?? model.frames.length - 1);
    }
  }, [revealed]);

  const settledFrame = replay.playing ? null : Math.round(replay.position);
  useEffect(() => {
    if (settledFrame !== null && revealed) onFrame(settledFrame);
    if (settledFrame !== null && !revealed && phase === "replay" && model.frames.length > 0 && settledFrame >= model.frames.length - 1) onPhase("result");
  }, [settledFrame, revealed, phase]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const choose = (next: View) => {
    if (next === "replay" && !testable) {
      onPhase("result");
      return;
    }
    replay.pause();
    setView(next);
    if (next === "adjusted" && phase === "measured") onPhase("adjusted");
    if (next === "replay" && !revealed) {
      onPhase("replay");
      replay.seek(0);
      window.setTimeout(replay.play, reducedMotion ? 0 : 400);
    }
  };
  const skipToEnd = () => {
    replay.seek(model.frames.length - 1);
    onPhase("result");
  };

  const frameIndex = Math.min(Math.floor(replay.position + 1e-9), Math.max(model.frames.length - 1, 0));
  const frame = model.frames[frameIndex];
  const rawValues = record.series.raw.filter((v): v is number => v !== null);
  const usual = record.series.climatology.filter((v): v is number => v !== null);
  const seasonalSwing = usual.length ? Math.max(...usual) - Math.min(...usual) : 0;
  const inReplay = view === "replay" && testable;
  const detectedNow = inReplay && frame !== undefined && isDetected(frame.verdict);
  const sliderLabel = frame
    ? `Record ends ${frame.end_year}, ${frame.years_watched} years. ${stateLabel(frame.verdict, frame.years_watched)}. Rate ${signed(frame.rank.slope, variable.decimals)} ${variable.units} per decade, 95% interval ${interval(frame.rank.ci_low, frame.rank.ci_high, variable.decimals)}.`
    : "";
  const firstFrame = model.frames[0];
  const lastFrame = model.frames[model.frames.length - 1];
  const halfWidth = (f: typeof firstFrame) => (f.rank.ci_low !== null && f.rank.ci_high !== null ? (f.rank.ci_high - f.rank.ci_low) / 2 : null);
  const detection = result?.detection;

  return (
    <div className="station">
      <header className="casebar">
        <div className="casebar-id">
          <h1>{variable.question}</h1>
          <p>
            <strong>{place.name}</strong>
            <span className="num">
              {record.case.kind === "power" ? coordinates(place.latitude, place.longitude) : `${place.footprint.west}° to ${place.footprint.east}°, ${place.footprint.south}° to ${place.footprint.north}°`}
            </span>
            <span>{footprintSize(place.footprint).replace("about ", "")} {record.case.kind === "power" ? "cell" : "box"}</span>
            <span>
              {variable.name} <span className="num">({variable.units})</span>
            </span>
            <span className="casebar-kind">{record.provenance.source_kind}</span>
            <span className="num">
              {record.coverage.first_year}–{record.coverage.last_year} · {record.coverage.valid_months}/{record.coverage.expected_months} mo
            </span>
          </p>
        </div>
        <div className="casebar-actions">
          <button className="text-button" onClick={onChangeRecord}>
            Change record
          </button>
          <button className="action action-quiet" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
            Provenance
          </button>
        </div>
      </header>

      <div className="bench">
        <div className="bench-main">
          <div className="workflow">
            <ol className="chain" aria-label="Analysis stages">
              {STAGES.map((stage, index) => {
                const reached = STAGES.findIndex((s) => s.id === view) >= index;
                return (
                  <li key={stage.id} className={reached ? "chain-reached" : ""}>
                    <button aria-current={view === stage.id ? "step" : undefined} onClick={() => choose(stage.id)}>
                      <span className="chain-node" aria-hidden="true" />
                      {stage.name}
                    </button>
                  </li>
                );
              })}
            </ol>
            {inReplay && (
              <div className="deck" role="group" aria-label="Replay controls">
                <button onClick={() => replay.step(-1)} aria-label="Back one year">
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M11 1 L4 7 L11 13 Z M2 1h2v12H2z" fill="currentColor" />
                  </svg>
                </button>
                <button className="deck-play" onClick={replay.toggle} aria-label={replay.playing ? "Pause" : "Play"}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    {replay.playing ? <path d="M2 1h3.5v12H2zM8.5 1H12v12H8.5z" fill="currentColor" /> : <path d="M2.5 1 L12.5 7 L2.5 13 Z" fill="currentColor" />}
                  </svg>
                </button>
                <button onClick={() => replay.step(1)} aria-label="Forward one year">
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M3 1 L10 7 L3 13 Z M10 1h2v12h-2z" fill="currentColor" />
                  </svg>
                </button>
                <span className="deck-jumps">
                  <button onClick={() => replay.seek(0)}>
                    <span className="num">{firstFrame.end_year}</span> first test
                  </button>
                  {detection && detection.detection_year !== null && revealed && (
                    <button onClick={() => replay.seek(model.frames.findIndex((f) => f.end_year === detection.detection_year))}>
                      <span className="num">{detection.detection_year}</span> detection
                    </button>
                  )}
                  <button onClick={skipToEnd}>
                    <span className="num">{lastFrame.end_year}</span> latest
                  </button>
                </span>
              </div>
            )}
          </div>
          <p className="workflow-caption">
            {STAGES.find((s) => s.id === view)?.caption}
            {view === "measured" && ` ${rawValues.length} months. Seasonal range ${seasonalSwing.toFixed(Math.max(variable.decimals - 1, 0))} ${variable.units}.`}
          </p>

          <figure className="evidence-figure">
            <Instrument
              chartHeight={chartHeight}
              revealed={revealed}
              record={record}
              mode={inReplay ? "replay" : view === "measured" ? "measured" : "adjusted"}
              seasonalBlend={blend}
              position={replay.position}
              onSeek={replay.seek}
              onStep={replay.step}
              onTogglePlay={replay.toggle}
              sliderLabel={sliderLabel}
            />
            <figcaption className="sr-only">
              {revealed
                ? record.text.chart_summary
                : `${variable.name} for ${place.name}, monthly, ${record.coverage.first_year} to ${record.coverage.last_year}. The result is shown after the replay.`}
            </figcaption>
          </figure>
        </div>

        <aside className="rail" aria-label="Current state">
          {inReplay && frame ? (
            <>
              <p className="rail-label">Evidence as of {frame.end_year}</p>
              <p className={detectedNow ? "rail-state rail-state-on" : "rail-state"}>{stateLabel(frame.verdict, frame.years_watched)}</p>
              <dl className="rail-list">
                <div>
                  <dt>Record length</dt>
                  <dd className="num">{frame.years_watched} years</dd>
                </div>
                <div>
                  <dt>
                    <Term note="Theil–Sen estimate: the median of the slopes between every pair of months. Robust to extreme months.">Rate</Term>
                  </dt>
                  <dd className="num rail-big">
                    {signed(frame.rank.slope, variable.decimals)}
                    <small> {variable.units} / decade</small>
                  </dd>
                </div>
                <div>
                  <dt>
                    <Term note="Range of rates consistent with the record, allowing for month-to-month persistence. If it excludes zero, chance alone is an unlikely explanation.">
                      95% interval
                    </Term>
                  </dt>
                  <dd className="num">{interval(frame.rank.ci_low, frame.rank.ci_high, variable.decimals)}</dd>
                </div>
                <div>
                  <dt>
                    <Term note="Mann–Kendall test, corrected for autocorrelation. The p-value is the chance of an ordering this lopsided if there were no trend. It is not the chance that the trend is real.">
                      Mann–Kendall p
                    </Term>
                  </dt>
                  <dd className="num">{pValue(frame.rank.p_adjusted)}</dd>
                </div>
                <div>
                  <dt>
                    <Term note="Second test: a straight-line fit with uncertainty widened for autocorrelation. Both tests must agree before a trend is called detected.">
                      Least-squares p
                    </Term>
                  </dt>
                  <dd className="num">{pValue(frame.least_squares.p_adjusted)}</dd>
                </div>
                <div>
                  <dt>
                    <Term note="How strongly one month resembles the previous one, from 0 to 1. Persistent records hold less independent information than their length suggests.">
                      Lag-1 autocorrelation
                    </Term>
                  </dt>
                  <dd className="num">
                    {frame.least_squares.r1.toFixed(2)}
                    <small>
                      {" "}
                      · {Math.round(frame.least_squares.n_effective)} of {frame.least_squares.n} mo effective
                    </small>
                  </dd>
                </div>
              </dl>
              {revealed && result && (
                <div className="rail-final">
                  <p className="rail-label">Full record</p>
                  <dl className="rail-list">
                    {detection && detection.detection_year !== null ? (
                      <div className="rail-key">
                        <dt>
                          <Term note={SUSTAINED_NOTE}>Retrospective sustained detection from</Term>
                        </dt>
                        <dd className="num">{sustainedValue(detection)}</dd>
                      </div>
                    ) : (
                      <div className="rail-key">
                        <dt>
                          <Term note={ESTIMATE_NOTE}>Length for a 90% chance, at the estimated rate</Term>
                        </dt>
                        <dd className="num">
                          {result.years_needed?.available && result.years_needed.total_years !== null ? `about ${Math.round(result.years_needed.total_years)} years` : "no estimate"}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>First test year</dt>
                      <dd className="num">{firstFrame.end_year}</dd>
                    </div>
                    <div>
                      <dt>
                        <Term note={PREDICTION_NOTE}>Prediction</Term>
                      </dt>
                      <dd>{predictionResult(prediction, result.verdict)}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="rail-label">Record</p>
              <p className="rail-state rail-state-plain">{testable ? "Not analysed" : "Insufficient data"}</p>
              <dl className="rail-list">
                <div>
                  <dt>Window</dt>
                  <dd className="num">{record.provenance.analysis_window ?? "none usable"}</dd>
                </div>
                <div>
                  <dt>Months</dt>
                  <dd className="num">
                    {record.coverage.valid_months} of {record.coverage.expected_months}
                  </dd>
                </div>
                <div>
                  <dt>Range</dt>
                  <dd className="num">
                    {rawValues.length ? `${Math.min(...rawValues).toFixed(variable.decimals)} to ${Math.max(...rawValues).toFixed(variable.decimals)}` : "–"}
                    <small> {variable.units}</small>
                  </dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{record.provenance.source}</dd>
                </div>
              </dl>
              {!testable && <p className="rail-note">{record.coverage.reason}</p>}
              {testable && (
                <button className="action" onClick={() => choose(view === "measured" ? "adjusted" : "replay")}>
                  {view === "measured" ? "Remove seasons" : "Run replay"}
                </button>
              )}
            </>
          )}
        </aside>
      </div>

      {revealed && result && (
        <section className="finding" aria-labelledby="finding-title">
          <div className="finding-lead">
            <h2 id="finding-title" className={isDetected(result.verdict) ? "finding-verdict finding-verdict-on" : "finding-verdict"}>
              {stateLabel(result.verdict, record.coverage.span_years)}
            </h2>
            <p className="finding-rate num">
              {signed(result.rank.slope, variable.decimals)} {variable.units} per decade · 95% interval {interval(result.rank.ci_low, result.rank.ci_high, variable.decimals)}
            </p>
            {record.text.detection && <p className="finding-detection">{record.text.detection}</p>}
          </div>

          <div className="two-readings">
            <div>
              <h3>Observed</h3>
              <p>
                Best-fit line {result.rank.slope >= 0 ? "rises" : "falls"}{" "}
                <span className="num">
                  {Math.abs(result.rank.slope).toFixed(variable.decimals)} {variable.units}
                </span>{" "}
                per decade:{" "}
                <span className="num">
                  {signed((result.rank.slope * record.coverage.span_years) / 10, variable.decimals)} {variable.units}
                </span>{" "}
                over {record.coverage.span_years} years.
              </p>
            </div>
            <div>
              <h3>Concluded</h3>
              <p>{record.text.summary}</p>
            </div>
          </div>

          {result.years_needed && <Horizon record={record} />}

          {record.text.shape && (
            <div className="notice">
              <p className="label">Shape of the record</p>
              <p>{record.text.shape}</p>
            </div>
          )}

          <section className="reading" aria-labelledby="reading-title">
            <h3 id="reading-title">Notes</h3>
            {isDetected(result.verdict) && !isDetected(firstFrame.verdict) && halfWidth(firstFrame) !== null && (
              <details>
                <summary>Why was this not known sooner?</summary>
                <p>
                  In {firstFrame.end_year}, with {firstFrame.years_watched} years of data, the interval was{" "}
                  {interval(firstFrame.rank.ci_low, firstFrame.rank.ci_high, variable.decimals)} {variable.units} per decade. Too wide to
                  rule out zero. The record was too short.
                </p>
              </details>
            )}
            {detection?.at_first_endpoint && (
              <details>
                <summary>Why was this detectable so early?</summary>
                <p>
                  The change is large compared with the month-to-month scatter, so ten years were enough. The replay starts at
                  ten years and cannot say how much earlier the evidence was sufficient.
                </p>
              </details>
            )}
            {!isDetected(result.verdict) && (
              <details>
                <summary>Does no detection mean no change?</summary>
                <p>
                  No. The interval {interval(result.rank.ci_low, result.rank.ci_high, variable.decimals)} {variable.units} per decade includes
                  zero and also includes real changes. The record cannot yet separate them.
                </p>
              </details>
            )}
            {halfWidth(firstFrame) !== null && halfWidth(lastFrame) !== null && (
              <details>
                <summary>What did the extra years buy?</summary>
                <p>
                  Interval half-width: ±{(halfWidth(firstFrame) as number).toFixed(variable.decimals)} in {firstFrame.end_year}, ±
                  {(halfWidth(lastFrame) as number).toFixed(variable.decimals)} {variable.units} per decade in {lastFrame.end_year}. A gap in
                  observations stops that narrowing.
                </p>
              </details>
            )}
            <details>
              <summary>Could the year of detection have been known at the time?</summary>
              <p>
                No. The replay tests the record {result.detection.endpoints_tested} times, and a year counts only if the criterion
                holds at every later endpoint, which needs the later years. It is a description of the finished record, not a
                stopping rule, and it would differ for a record starting in another year. The full-record test is the formal result.
              </p>
            </details>
            <details>
              <summary>What is the source?</summary>
              <p>
                {variable.source_detail} {variable.caveat}
              </p>
            </details>
            <details>
              <summary>Does detection identify a cause?</summary>
              <p>No. Detection shows a change beyond the record's own noise. Attribution needs other evidence.</p>
            </details>
          </section>
        </section>
      )}

      {sheetOpen && (
        <div className="methods-veil" onClick={() => setSheetOpen(false)}>
          <div className="sheet-drawer" role="dialog" aria-modal="true" aria-label="Provenance" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>
                Provenance <span className="num">{record.id}</span>
              </h2>
              <button className="text-button" onClick={() => setSheetOpen(false)} autoFocus>
                Close
              </button>
            </header>
            <RecordSheet record={record} revealed={revealed} onLoaded={onLoaded} />
          </div>
        </div>
      )}
    </div>
  );
}
