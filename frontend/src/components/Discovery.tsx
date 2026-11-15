import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Globe, type Anchor, type GlobeView } from "../charts/Globe";
import { subsolarPoint } from "../lib/sun";
import { WatchStage, stageDomain, stageHeight } from "../charts/WatchStage";
import { buildModel, type TestedFrame } from "../charts/model";
import { ESTIMATE_NOTE, PREDICTION_NOTE, SUSTAINED_NOTE, coordinates, estimateRows, footprintSize, interval, isDetected, predictionResult, signed, stateLabel } from "../lib/format";
import { useSize } from "../lib/useSize";
import { useWatchClock } from "../lib/useWatchClock";
import type { ApiFailure, Bounds, CaseRecord, CaseRequest, Catalog, Place, Prediction, Region, Variable } from "../types";
import { merraCell, type PlaceChoice } from "./Steps";
import { Term } from "./Term";
import { VerdictMark } from "./VerdictMark";

export interface DiscoveryCase {
  key: string;
  request: CaseRequest;
  status: "loading" | "ready" | "error";
  record?: CaseRecord;
  failure?: ApiFailure;
  prediction?: Prediction;
  frame?: number;
  revealed: boolean;
}

interface Props {
  catalog: Catalog | null;
  place: PlaceChoice | null;
  active: DiscoveryCase | null;
  companion: DiscoveryCase | null;
  reducedMotion: boolean;
  onPlace: (choice: PlaceChoice | null) => void;
  onAsk: (request: CaseRequest, pair: boolean) => void;
  onCall: (key: string, prediction: Prediction) => void;
  onRevealed: (keys: string[]) => void;
  onFrame: (key: string, frame: number) => void;
  onObservatory: () => void;
  onRetry: (request: CaseRequest) => void;
}

const FLAGSHIP = { name: "Madrid", latitude: 40.42, longitude: -3.7 };
const HEADER = 52;
const CONTROLS = 58;
const TILT = 40;

const CALLS: { id: Prediction; title: string; verdict: "detected_rising" | "detected_falling" | "not_detectable_yet" }[] = [
  { id: "rising", title: "Rising", verdict: "detected_rising" },
  { id: "falling", title: "Falling", verdict: "detected_falling" },
  { id: "none", title: "No detectable change", verdict: "not_detectable_yet" },
];

function requestFor(choice: PlaceChoice, variableId: string): CaseRequest {
  if (choice.kind === "region" && choice.region) return { kind: "region", regionId: choice.region.id, variableId };
  return {
    kind: "power",
    latitude: choice.latitude,
    longitude: choice.longitude,
    name: choice.named ? choice.name : undefined,
    variableId,
  };
}

export function Discovery(props: Props) {
  const { catalog, place, active, companion, reducedMotion } = props;
  const [stageRef, size] = useSize<HTMLDivElement>();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [cursorX, setCursorX] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ latitude: number; longitude: number } | null>(null);
  const lastPlace = useRef<{ latitude: number; longitude: number } | null>(null);
  const [zoomStep, setZoomStep] = useState({ id: 0, factor: 1 });
  const narrow = size.width < 860;

  const rows = useMemo(() => {
    const list: DiscoveryCase[] = [];
    if (companion?.record && companion.prediction) list.push(companion);
    if (active?.record && active.prediction) list.push(active);
    return list;
  }, [active, companion]);

  const step: "globe" | "ask" | "call" | "watch" =
    active && active.prediction ? "watch" : active ? "call" : place ? "ask" : "globe";

  const shown: { name: string; latitude: number; longitude: number; footprint: Bounds; region: boolean } | null = useMemo(() => {
    const record = active?.record;
    if (record) {
      return {
        name: record.case.place.name,
        latitude: record.case.place.latitude,
        longitude: record.case.place.longitude,
        footprint: record.case.place.footprint,
        region: record.case.kind === "giovanni",
      };
    }
    if (place) {
      return {
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        footprint: place.region ?? merraCell(place.latitude, place.longitude),
        region: place.kind === "region",
      };
    }
    return null;
  }, [active, place]);

  const bandHeight = step === "watch" && rows.length ? stageHeight(rows.length, narrow) + CONTROLS : 0;
  const globeBlock = narrow ? (step === "globe" ? Math.min(size.width * 0.92, 400) : 250) : 0;
  const minHeight = narrow ? undefined : Math.max(window.innerHeight - HEADER, bandHeight + (rows.length > 1 ? 440 : 300), 600);
  const canvasHeight = narrow ? globeBlock : size.height;
  const upperHeight = narrow ? globeBlock : size.height - bandHeight;

  const startLon = useMemo(() => {
    const sun = subsolarPoint(new Date())[0];
    const turn = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
    return [-95, 12, 100].reduce((best, lon) => (turn(lon, sun) < turn(best, sun) ? lon : best), 12);
  }, []);
  if (shown) lastPlace.current = { latitude: shown.latitude, longitude: shown.longitude };
  const view: GlobeView = useMemo(() => {
    const w = size.width;
    if (!shown) {
      const lon = lastPlace.current?.longitude ?? startLon;
      const lat = lastPlace.current ? Math.max(-40, Math.min(40, lastPlace.current.latitude - 12)) : 18;
      return narrow
        ? { lon, lat, cx: w / 2, cy: globeBlock * 0.54, scale: globeBlock * 0.47 }
        : { lon, lat, cx: w * 0.64, cy: size.height * 0.53, scale: size.height * 0.5 };
    }
    const centreLat = Math.max(-55, Math.min(55, shown.latitude - TILT));
    const theta = ((shown.latitude - centreLat) * Math.PI) / 180;
    const limbY = narrow ? 18 : 34;
    const placeY = upperHeight * (narrow ? 0.6 : step === "watch" ? 0.64 : 0.6);
    const scale = Math.max(upperHeight * 0.62, Math.min((placeY - limbY) / (1 - Math.sin(theta)), upperHeight * 2.6));
    return {
      lon: shown.longitude,
      lat: centreLat,
      cx: narrow ? w / 2 : w * (step === "watch" ? 0.3 : 0.34),
      cy: placeY + scale * Math.sin(theta),
      scale,
    };
  }, [shown, step, size.width, size.height, narrow, globeBlock, upperHeight]);

  const pickPlace = (item: Place) =>
    props.onPlace({ kind: "point", name: item.name, latitude: item.lat, longitude: item.lon, named: true });
  const pickPoint = (latitude: number, longitude: number) => {
    const lat = Math.round(latitude * 100) / 100;
    const lon = Math.round(longitude * 100) / 100;
    props.onPlace({ kind: "point", name: coordinates(lat, lon), latitude: lat, longitude: lon, named: false });
  };
  const pickRegion = (region: Region) =>
    props.onPlace({
      kind: "region",
      name: region.name,
      latitude: (region.south + region.north) / 2,
      longitude: (region.west + region.east) / 2,
      region,
      named: true,
    });

  const choiceFor = (): PlaceChoice | null => {
    if (place) return place;
    const record = active?.record;
    if (!record) return null;
    const region = catalog?.regions.find((r) => r.id === active?.request.regionId);
    return {
      kind: region ? "region" : "point",
      name: record.case.place.name,
      latitude: record.case.place.latitude,
      longitude: record.case.place.longitude,
      region,
      named: true,
    };
  };

  const variables = catalog?.variables ?? [];
  const askable = place ? variables.filter((v) => (place.kind === "region" ? !v.live : v.live)) : [];
  const activeVariable: Variable | undefined = active ? variables.find((v) => v.id === active.request.variableId) ?? active.record?.case.variable : undefined;
  const showReticle = anchor !== null && anchor.visible && shown !== null && step !== "globe";

  return (
    <main className={`discovery discovery-${step} ${narrow ? "discovery-narrow" : ""}`} ref={stageRef} style={{ minHeight }}>
      <div className="earth-layer" style={narrow ? { height: globeBlock } : undefined}>
        <Globe
          width={size.width}
          height={canvasHeight}
          view={view}
          spin={step === "globe" && lastPlace.current === null}
          zoomable={step === "globe"}
          zoomStep={zoomStep}
          labels={step === "globe"}
          places={catalog?.places ?? []}
          regions={catalog?.regions ?? []}
          point={shown ? { latitude: shown.latitude, longitude: shown.longitude } : null}
          footprint={shown?.footprint ?? null}
          interactive={step === "globe" || step === "ask"}
          reducedMotion={reducedMotion}
          onPick={pickPoint}
          onPickPlace={pickPlace}
          onPickRegion={pickRegion}
          onAnchor={setAnchor}
          onCursor={setPointer}
        />
        {showReticle && anchor && shown && (
          <>
            <svg className="reticle" width={size.width} height={narrow ? globeBlock : size.height} aria-hidden="true">
              <g transform={`translate(${anchor.x},${anchor.y})`}>
                <path d="M-20,-12v-8h8M12,-20h8v8M20,12v8h-8M-12,20h-8v-8" className="reticle-shadow" />
                <path d="M-20,-12v-8h8M12,-20h8v8M20,12v8h-8M-12,20h-8v-8" className="reticle-corners" />
              </g>
              {!narrow && step === "watch" && cursorX !== null && (
                <>
                  <path d={`M${anchor.x},${anchor.y + 22}V${upperHeight - 16}H${cursorX}V${upperHeight + 26}`} className="leader-shadow" />
                  <path d={`M${anchor.x},${anchor.y + 22}V${upperHeight - 16}H${cursorX}V${upperHeight + 26}`} className="leader" />
                </>
              )}
            </svg>
            <div className="place-tag" style={{ left: anchor.x + 30, top: anchor.y - 24 }}>
              <strong>{shown.name}</strong>
              <span className="num">
                {shown.region
                  ? `${shown.footprint.west}° to ${shown.footprint.east}° · ${shown.footprint.south}° to ${shown.footprint.north}°`
                  : coordinates(shown.latitude, shown.longitude)}
              </span>
              <span>
                {shown.region ? "Box" : "Cell"} {footprintSize(shown.footprint).replace("about ", "")}
              </span>
            </div>
          </>
        )}
        {step === "globe" && (
          <div className="globe-zoom" role="group" aria-label="Zoom">
            <button onClick={() => setZoomStep((z) => ({ id: z.id + 1, factor: 1.5 }))} aria-label="Zoom in">
              +
            </button>
            <button onClick={() => setZoomStep((z) => ({ id: z.id + 1, factor: 1 / 1.5 }))} aria-label="Zoom out">
              −
            </button>
            <button onClick={() => setZoomStep((z) => ({ id: z.id + 1, factor: 0 }))} aria-label="Reset zoom">
              1:1
            </button>
          </div>
        )}
        <p className="globe-note">
          <span className="num">
            {pointer && (step === "globe" || step === "ask") ? coordinates(pointer.latitude, pointer.longitude) : `Sunlight ${new Date().toISOString().slice(11, 16)} UTC`}
          </span>
          <span>Imagery: NASA Blue Marble · Earth at Night</span>
        </p>
      </div>

      {step === "globe" && (
        <section className="intro">
          <h1>How long must we watch before we know?</h1>
          <p>Replay a NASA record year by year. See how the evidence for a trend builds, or fails to.</p>
          <div className="intro-actions">
            <button className="action" onClick={() => props.onPlace({ kind: "point", ...FLAGSHIP, named: true })}>
              Start: Madrid
            </button>
            <label className="place-select">
              <span className="sr-only">Other places</span>
              <select
                value=""
                onChange={(event) => {
                  const value = event.target.value;
                  const city = catalog?.places.find((p) => p.id === value);
                  const region = catalog?.regions.find((r) => r.id === value);
                  if (city) pickPlace(city);
                  else if (region) pickRegion(region);
                }}
              >
                <option value="" disabled>
                  Other places
                </option>
                <optgroup label="Cities · NASA POWER">
                  {catalog?.places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}, {p.country}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Regions · OMI NO₂">
                  {catalog?.regions
                    .filter((r) => r.available)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>
          </div>
          <p className="intro-hint">Drag to rotate · scroll to zoom · click any point</p>
        </section>
      )}

      {step === "ask" && place && (
        <section className="panel">
          <h1 className="panel-title">Records</h1>
          <ul className="ask-list">
            {askable.map((variable) => (
              <li key={variable.id}>
                <button onClick={() => props.onAsk(requestFor(place, variable.id), false)}>
                  <span className="ask-question">{variable.question}</span>
                  <span className="ask-meta">
                    {variable.name} · {variable.first_year}–{catalog?.last_complete_year} · {variable.source_kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button className="text-button panel-back" onClick={() => props.onPlace(null)}>
            Change place
          </button>
        </section>
      )}

      {step === "call" && active && activeVariable && (
        <section className="panel">
          <p className="panel-kicker">{activeVariable.name}</p>
          <h1 className="panel-title">{activeVariable.question}</h1>
          <p className="call-prompt">Your prediction</p>
          <div className="call-row" role="group" aria-label="Your prediction">
            {CALLS.map((call) => (
              <button key={call.id} onClick={() => props.onCall(active.key, call.id)}>
                <VerdictMark verdict={call.verdict} size={18} />
                {call.title}
              </button>
            ))}
          </div>
          <p className="panel-status num" aria-live="polite">
            {active.status === "loading" && (active.request.kind === "power" ? "Requesting NASA POWER…" : "Reading Giovanni export…")}
            {active.status === "ready" && active.record && `${active.record.series.raw.filter((v) => v !== null).length} months loaded`}
            {active.status === "error" && "Record not retrieved"}
          </p>
          <button className="text-button panel-back" onClick={() => props.onPlace(null)}>
            Change place
          </button>
        </section>
      )}

      {step === "watch" && active && rows.length === 0 && (
        <section className="panel">
          {active.status === "error" && active.failure ? (
            <div className="notice" role="alert">
              <p className="label">{active.failure.step}</p>
              <p>{active.failure.cause}</p>
              {active.failure.advice && <p>{active.failure.advice}</p>}
              <button className="action" style={{ marginTop: 16 }} onClick={() => props.onRetry(active.request)}>
                Retry
              </button>
            </div>
          ) : (
            <p className="panel-status num">Requesting record…</p>
          )}
        </section>
      )}

      {step === "watch" && rows.length > 0 && (
        <Watch
          key={rows.map((row) => row.key).join("+")}
          rows={rows}
          width={size.width}
          narrow={narrow}
          upperHeight={upperHeight}
          reducedMotion={reducedMotion}
          catalog={catalog}
          onCursorX={setCursorX}
          onRevealed={props.onRevealed}
          onFrame={props.onFrame}
          onObservatory={props.onObservatory}
          onAnother={() => props.onPlace(null)}
          onAdd={(variableId) => {
            const choice = choiceFor();
            if (choice) props.onAsk(requestFor(choice, variableId), true);
          }}
        />
      )}
    </main>
  );
}

interface ReadoutProps {
  record: CaseRecord;
  frame: TestedFrame | null;
  endYear: number;
  final: boolean;
  prediction: Prediction;
  titled: boolean;
}

function Readout({ record, frame, endYear, final, prediction, titled }: ReadoutProps) {
  const variable = record.case.variable;
  const result = record.result;
  const first = record.coverage.first_year ?? endYear;
  const detected = frame !== null && isDetected(frame.verdict);
  const detection = result?.detection;
  const needed = result?.years_needed;
  const lostRun = final && detection && detection.detection_year === null ? detection.runs[detection.runs.length - 1] : undefined;
  const oppositeRun =
    final && detection && detection.detection_year !== null && result
      ? detection.runs.find((run) => run.verdict !== result.verdict)
      : undefined;
  const span = (run: { from: number; to: number }) => (run.from === run.to ? `${run.from}` : `${run.from}–${run.to}`);

  return (
    <dl className="readout-list">
      {titled && <dt className="readout-title">{variable.name}</dt>}
      <div>
        <dt>Source</dt>
        <dd>{variable.source_kind}</dd>
      </div>
      <div className={detected ? "readout-state readout-state-on" : "readout-state"}>
        <dt>Evidence as of {endYear}</dt>
        <dd>{!result ? "Insufficient data" : frame ? stateLabel(frame.verdict, frame.years_watched) : endYear < first ? "Record not started" : "Below minimum record length"}</dd>
      </div>
      <div>
        <dt>Record length</dt>
        <dd className="num">{endYear < first ? "–" : `${endYear - first + 1} years`}</dd>
      </div>
      <div>
        <dt>Rate</dt>
        <dd className="num">{frame ? `${signed(frame.rank.slope, variable.decimals)} ${variable.units} / decade` : "–"}</dd>
      </div>
      <div>
        <dt>95% interval</dt>
        <dd className="num">{frame ? interval(frame.rank.ci_low, frame.rank.ci_high, variable.decimals) : "–"}</dd>
      </div>
      {final && detection?.detection_year != null && (
        <div className="readout-key">
          <dt>
            <Term note={SUSTAINED_NOTE}>Retrospective sustained detection</Term>
          </dt>
          <dd className="num">
            from {detection.at_first_endpoint ? "≤ " : ""}
            {detection.detection_year}
            <small>
              {detection.years_watched_at_detection} years of record ({detection.record_start_year}–{detection.detection_year})
              {detection.provisional ? " · provisional" : ""}
            </small>
          </dd>
        </div>
      )}
      {oppositeRun && (
        <div>
          <dt>Earlier</dt>
          <dd>
            {oppositeRun.verdict === "detected_rising" ? "Rising" : "Falling"}, {span(oppositeRun)}
          </dd>
        </div>
      )}
      {lostRun && (
        <div>
          <dt>Earlier</dt>
          <dd>
            Detected {lostRun.verdict === "detected_rising" ? "rising" : "falling"} {span(lostRun)}. Lapsed.
          </dd>
        </div>
      )}
      {final && needed && detection?.detection_year == null && (
        <div className="readout-key readout-estimate">
          <dt>
            <Term note={ESTIMATE_NOTE}>Record length for a 90% chance of detection</Term>
          </dt>
          {needed.available ? (
            <dd>
              {estimateRows(needed).map((row) => (
                <span key={row.label}>
                  {row.label}: <b className="num">{row.value}</b>
                </span>
              ))}
            </dd>
          ) : (
            <dd>No estimate: the rate is too close to zero.</dd>
          )}
        </div>
      )}
      {final && result && (
        <div>
          <dt>
            <Term note={PREDICTION_NOTE}>Prediction</Term>
          </dt>
          <dd>{predictionResult(prediction, result.verdict)}</dd>
        </div>
      )}
    </dl>
  );
}

interface WatchProps {
  rows: DiscoveryCase[];
  width: number;
  narrow: boolean;
  upperHeight: number;
  reducedMotion: boolean;
  catalog: Catalog | null;
  onCursorX: (x: number | null) => void;
  onRevealed: (keys: string[]) => void;
  onFrame: (key: string, frame: number) => void;
  onObservatory: () => void;
  onAnother: () => void;
  onAdd: (variableId: string) => void;
}

function Watch({ rows, width, narrow, upperHeight, reducedMotion, catalog, onCursorX, onRevealed, onFrame, onObservatory, onAnother, onAdd }: WatchProps) {
  const records = useMemo(() => rows.map((row) => row.record as CaseRecord), [rows]);
  const domain = useMemo(() => stageDomain(records), [records]);
  const holds = useMemo(() => {
    const times: number[] = [];
    records.forEach((record) => {
      const frames = buildModel(record).frames;
      frames.forEach((frame, index) => {
        if (isDetected(frame.verdict) && (index === 0 || frames[index - 1].verdict !== frame.verdict)) times.push(frame.end_year + 1);
      });
    });
    return [...new Set(times)].sort((p, q) => p - q);
  }, [records]);
  const alreadySeen = rows.every((row) => row.revealed);
  const resumeAt = useMemo(() => {
    const last = rows[rows.length - 1];
    const frames = buildModel(records[records.length - 1]).frames;
    if (last.frame === undefined || !frames[last.frame]) return domain.now;
    return frames[last.frame].end_year + 1;
  }, []);
  const clock = useWatchClock(domain.start, domain.now, holds, reducedMotion, alreadySeen ? resumeAt : reducedMotion ? domain.now : domain.start);
  const announced = useRef(alreadySeen);
  const primary = rows[rows.length - 1];
  const primaryRecord = records[records.length - 1];
  const { play } = clock;

  const { untouched } = clock;
  useEffect(() => {
    if (alreadySeen || reducedMotion) return;
    const timer = window.setTimeout(() => {
      if (untouched()) play();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [alreadySeen, reducedMotion, play, untouched]);

  useEffect(() => {
    if (clock.finished && !announced.current) {
      announced.current = true;
      onRevealed(rows.map((row) => row.key));
    }
  }, [clock.finished, rows, onRevealed]);

  useEffect(() => {
    if (reducedMotion && !announced.current) {
      announced.current = true;
      onRevealed(rows.map((row) => row.key));
    }
  }, [reducedMotion, rows, onRevealed]);

  const left = narrow ? 14 : 28;
  useEffect(() => {
    const span = domain.end - domain.start;
    const x = left + ((Math.min(clock.time, domain.now) - domain.start) / span) * (width - left * 2);
    onCursorX(x);
    return () => onCursorX(null);
  }, [clock.time, domain, width, left, onCursorX]);

  const frameIndex = useCallback(
    (record: CaseRecord, time: number) => {
      const frames = buildModel(record).frames;
      let index = -1;
      frames.forEach((frame, i) => {
        if (frame.end_year + 1 <= time + 1e-9) index = i;
      });
      return index;
    },
    [],
  );

  const reportFrame = useRef(onFrame);
  reportFrame.current = onFrame;
  const reported = useRef(-1);
  useEffect(() => {
    if (clock.playing) return;
    const index = frameIndex(primaryRecord, clock.time);
    if (index >= 0 && index !== reported.current) {
      reported.current = index;
      reportFrame.current(primary.key, index);
    }
  }, [clock.playing, clock.time, primary.key, primaryRecord, frameIndex]);

  const revealedOnce = clock.finished || alreadySeen || announced.current;
  const year = Math.min(Math.max(Math.floor(clock.time + 1e-9) - 1, domain.start), domain.now - 1);
  const single = records.length === 1;
  const frameSets = useMemo(() => records.map((record) => buildModel(record).frames), [records]);
  const framesNow = records.map((record, index) => {
    const at = frameIndex(record, clock.time);
    return at >= 0 ? frameSets[index][at] : null;
  });
  const emphasis = clock.holding || (single && framesNow[0] !== null && isDetected(framesNow[0].verdict));
  const tested = frameSets.filter((frames) => frames.length);
  const firstTest = tested.length ? Math.min(...tested.map((frames) => frames[0].end_year)) : null;
  const detectionYears = records.map((record) => record.result?.detection.detection_year).filter((value): value is number => value != null);
  let note = "";
  if (clock.holding) note = `${year}: detection criterion met.`;
  else if (clock.finished) {
    const parts: string[] = [];
    records.forEach((record) => {
      const detected = record.result?.detection.detection_year;
      if (detected != null) parts.push(`${records.length > 1 ? `${record.case.variable.name}: criterion` : "Criterion"} met in every year from ${detected}. Identified in hindsight.`);
    });
    note = parts.join(" ");
  }

  const sliderText = records
    .map((record, index) => {
      const frame = framesNow[index];
      if (!frame) return `${record.case.variable.name}: below minimum record length`;
      return `${record.case.variable.name}: ${stateLabel(frame.verdict)}, ${signed(frame.rank.slope, record.case.variable.decimals)} ${record.case.variable.units} per decade, interval ${interval(frame.rank.ci_low, frame.rank.ci_high, record.case.variable.decimals)}`;
    })
    .join(". ");

  const asked = new Set(records.map((record) => record.case.variable.id));
  const addable =
    single && primaryRecord.case.kind === "power" ? (catalog?.variables ?? []).filter((v) => v.live && !asked.has(v.id)) : [];

  return (
    <>
      <section className={single ? "readout-panel" : "readout-panel readout-panel-pair"} style={narrow ? undefined : { maxHeight: upperHeight - 16 }}>
        <h1 className="readout-question">{single ? primaryRecord.case.variable.question : "Comparison"}</h1>
        <div className="readout-columns">
          {records.map((record, index) => (
            <Readout
              key={record.id}
              record={record}
              frame={framesNow[index]}
              endYear={year}
              final={clock.finished}
              prediction={rows[index].prediction as Prediction}
              titled={!single}
            />
          ))}
        </div>
        <p className="readout-note" aria-live="polite">
          {note}
        </p>
        {revealedOnce && (
          <div className="readout-actions">
            <button className="action" onClick={onObservatory}>
              Observatory
            </button>
            {addable.length > 0 && (
              <label className="place-select">
                <span className="sr-only">Add a second record for this place</span>
                <select value="" onChange={(event) => event.target.value && onAdd(event.target.value)}>
                  <option value="" disabled>
                    Compare with
                  </option>
                  {addable.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="text-button" onClick={onAnother}>
              Change place
            </button>
          </div>
        )}
      </section>

      <section className="watch-band" aria-label="The record, year by year">
        <WatchStage records={records} cursor={clock.time} domain={domain} width={width} finished={clock.finished} emphasis={emphasis} onSeek={clock.seek} />
        <div className="watch-controls">
          <div className="deck" role="group" aria-label="Replay controls">
            <button onClick={() => clock.seek(Math.max(Math.ceil(clock.time) - 1, domain.start + 1))} aria-label="Back one year">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M11 1 L4 7 L11 13 Z M2 1h2v12H2z" fill="currentColor" />
              </svg>
            </button>
            <button className="deck-play" onClick={clock.finished ? clock.restart : clock.toggle} aria-label={clock.playing ? "Pause" : clock.finished ? "Replay" : "Play"}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                {clock.playing ? <path d="M2 1h3.5v12H2zM8.5 1H12v12H8.5z" fill="currentColor" /> : <path d="M2.5 1 L12.5 7 L2.5 13 Z" fill="currentColor" />}
              </svg>
            </button>
            <button onClick={() => clock.seek(Math.min(Math.floor(clock.time) + 1, domain.now))} aria-label="Forward one year">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3 1 L10 7 L3 13 Z M10 1h2v12h-2z" fill="currentColor" />
              </svg>
            </button>
            <span className="deck-jumps">
              {firstTest !== null && (
                <button onClick={() => clock.seek(firstTest + 1)}>
                  <span className="num">{firstTest}</span> first test
                </button>
              )}
              {revealedOnce &&
                detectionYears.map((value) => (
                  <button key={value} onClick={() => clock.seek(value + 1)}>
                    <span className="num">{value}</span> detection
                  </button>
                ))}
              <button onClick={() => clock.seek(domain.now)}>
                <span className="num">{domain.now - 1}</span> latest
              </button>
            </span>
          </div>
          <p className="watch-hint">Drag the chart or use the arrow keys.</p>
          <input
            type="range"
            className="watch-slider"
            min={domain.start + 1}
            max={domain.now}
            step={1}
            value={Math.max(Math.round(clock.time), domain.start + 1)}
            aria-label="Record end year"
            aria-valuetext={`Record ends ${year}. ${sliderText}`}
            onChange={(event) => clock.seek(Number(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === " ") {
                event.preventDefault();
                clock.toggle();
              }
            }}
          />
        </div>
      </section>
    </>
  );
}
