import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useId, useMemo, useRef } from "react";

import { isDetected, stateLabel } from "../lib/format";
import type { CaseRecord } from "../types";
import { buildModel, type SeriesModel, type TestedFrame } from "./model";

export interface StageDomain {
  start: number;
  now: number;
  end: number;
}

export function stageDomain(records: CaseRecord[]): StageDomain {
  const start = Math.min(...records.map((r) => r.coverage.first_year ?? 9999));
  const now = Math.max(...records.map((r) => (r.coverage.last_year ?? 0) + 1));
  return { start, now, end: now };
}

export function stageHeight(rowCount: number, narrow: boolean): number {
  const row = rowGeometry(rowCount, narrow);
  return TOP + rowCount * row.total + 46;
}

const TOP = 38;

function rowGeometry(rowCount: number, narrow: boolean) {
  const header = 34;
  const trace = rowCount > 1 ? 26 : 46;
  const ribbon = rowCount > 1 ? 108 : narrow ? 170 : 204;
  return { header, trace, ribbon, total: header + trace + ribbon + 14 };
}

function frameAt(model: SeriesModel, cursor: number): TestedFrame | null {
  let found: TestedFrame | null = null;
  for (const frame of model.frames) {
    if (frame.end_year + 1 <= cursor + 1e-9) found = frame;
    else break;
  }
  return found;
}

interface Props {
  records: CaseRecord[];
  cursor: number;
  domain: StageDomain;
  width: number;
  finished: boolean;
  emphasis: boolean;
  onSeek: (time: number) => void;
}

export function WatchStage({ records, cursor, domain, width, finished, emphasis, onSeek }: Props) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);
  const narrow = width < 700;
  const left = narrow ? 14 : 28;
  const right = narrow ? 14 : 28;
  const geometry = rowGeometry(records.length, narrow);
  const height = stageHeight(records.length, narrow);
  const models = useMemo(() => records.map(buildModel), [records]);
  const x = useMemo(() => scaleLinear().domain([domain.start, domain.end]).range([left, width - right]), [domain, left, right, width]);
  const axisY = TOP + records.length * geometry.total + 4;
  const flagYear = Math.min(Math.max(Math.floor(cursor + 1e-9) - 1, domain.start), domain.now - 1);
  const flagX = Math.min(Math.max(x(Math.min(cursor, domain.now)), left + 30), width - right - 30);
  const hasFuture = domain.end > domain.now;
  const tickStep = (domain.end - domain.start > 60 || narrow) ? 10 : 5;
  const tickYears: number[] = [];
  for (let year = Math.ceil(domain.start / tickStep) * tickStep; year <= domain.end; year += tickStep) tickYears.push(year);

  const toTime = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    return Math.min(Math.max(x.invert(clientX - (box?.left ?? 0)), domain.start + 0.05), domain.now);
  };

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="watch-svg"
      aria-hidden="true"
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSeek(toTime(event.clientX));
      }}
      onPointerMove={(event) => {
        if (dragging.current) onSeek(toTime(event.clientX));
      }}
      onPointerUp={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        onSeek(Math.max(Math.round(toTime(event.clientX)), domain.start + 1));
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <defs>
        <pattern id={`${uid}-young`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" className="hatch-line" />
        </pattern>
        <pattern id={`${uid}-future`} width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" className="future-dot" />
        </pattern>
        <clipPath id={`${uid}-seen`}>
          <rect x={left} y={0} width={Math.max(x(Math.min(cursor, domain.now)) - left, 0)} height={height} />
        </clipPath>
        <clipPath id={`${uid}-tested`}>
          <rect x={left} y={0} width={Math.max(x(Math.min(Math.floor(cursor + 1e-9), domain.now)) - left, 0)} height={height} />
        </clipPath>
      </defs>

      {records.map((record, index) => (
        <Row
          key={record.id}
          uid={`${uid}-${index}`}
          record={record}
          model={models[index]}
          top={TOP + index * geometry.total}
          geometry={geometry}
          x={x}
          left={left}
          right={width - right}
          cursor={cursor}
          domain={domain}
          finished={finished}
          seenClip={`url(#${uid}-seen)`}
          testedClip={`url(#${uid}-tested)`}
          youngFill={`url(#${uid}-young)`}
          futureFill={`url(#${uid}-future)`}
        />
      ))}

      <line x1={left} x2={width - right} y1={axisY} y2={axisY} className="axis" />
      {tickYears.map((year) => (
        <g key={year}>
          <line x1={x(year)} x2={x(year)} y1={axisY} y2={axisY + 6} className="ruler" />
          <text x={x(year)} y={axisY + 21} textAnchor="middle" className={year > domain.now ? "tick tick-future" : "tick"}>
            {year}
          </text>
        </g>
      ))}
      {hasFuture && (
        <g>
          <line x1={x(domain.now)} x2={x(domain.now)} y1={TOP} y2={axisY + 30} className="now-line" />
          <text x={x(domain.now) + 8} y={axisY + 38} className="now-label">
            record ends
          </text>
        </g>
      )}

      <g transform={`translate(${x(Math.min(cursor, domain.now))},0)`} className="watch-cursor">
        <line y1={26} y2={axisY + 8} className="cursor-line" />
        <path d={`M-6,${axisY + 8}h12v8l-6,6l-6,-6z`} className="cursor-handle" />
      </g>
      <g transform={`translate(${flagX},0)`} className={emphasis ? "year-flag year-flag-on" : "year-flag"}>
        <rect x={-30} y={2} width={60} height={25} />
        <text y={20} textAnchor="middle">
          {flagYear}
        </text>
      </g>
    </svg>
  );
}

interface RowProps {
  uid: string;
  record: CaseRecord;
  model: SeriesModel;
  top: number;
  geometry: ReturnType<typeof rowGeometry>;
  x: (value: number) => number;
  left: number;
  right: number;
  cursor: number;
  domain: StageDomain;
  finished: boolean;
  seenClip: string;
  testedClip: string;
  youngFill: string;
  futureFill: string;
}

function Row({ uid, record, model, top, geometry, x, left, right, cursor, domain, finished, seenClip, testedClip, youngFill, futureFill }: RowProps) {
  const variable = record.case.variable;
  const result = record.result;
  const frame = frameAt(model, cursor);
  const climatologyFrame = frame ?? model.frames[0] ?? null;
  const traceTop = top + geometry.header;
  const traceMid = traceTop + geometry.trace / 2;
  const ribbonTop = traceTop + geometry.trace + 6;
  const ribbonBottom = ribbonTop + geometry.ribbon;
  const rate = useMemo(() => scaleLinear().domain(model.rateDomain).range([ribbonBottom, ribbonTop]), [model, ribbonBottom, ribbonTop]);
  const firstTest = model.frames.length ? model.frames[0].end_year + 1 : domain.now;
  const recordEnd = (record.coverage.last_year ?? 0) + 1;

  const trace = useMemo(() => {
    if (!climatologyFrame) return "";
    const reach = model.anomalyDomain[1];
    const half = geometry.trace / 2 - 2;
    let d = "";
    model.raw.forEach((value, index) => {
      const usual = climatologyFrame.climatology[model.months[index] - 1];
      if (value === null || usual === null) return;
      const offset = Math.max(Math.min((value - usual) / reach, 1), -1) * half;
      const px = x(model.time[index]).toFixed(1);
      d += `M${px},${traceMid}V${(traceMid - offset).toFixed(1)}`;
    });
    return d;
  }, [model, climatologyFrame, geometry.trace, traceMid, x]);

  const paths = useMemo(() => {
    const [low, high] = model.rateDomain;
    const reach = (high - low) * 4;
    const band = area<TestedFrame>()
      .x((f) => x(f.end_year + 1))
      .y0((f) => rate(f.rank.ci_low ?? low - reach))
      .y1((f) => rate(f.rank.ci_high ?? high + reach));
    const centre = line<TestedFrame>()
      .x((f) => x(f.end_year + 1))
      .y((f) => rate(f.rank.slope));
    return { band: band(model.frames) ?? "", centre: centre(model.frames) ?? "" };
  }, [model, x, rate]);

  const detection = result?.detection;
  const detectionTime = detection?.detection_year != null ? detection.detection_year + 1 : null;
  const reached = finished && detectionTime !== null;
  const yearsSoFar = Math.max(Math.floor(cursor + 1e-9) - model.firstYear, 0);
  const detectedNow = frame !== null && isDetected(frame.verdict);

  const cursorX = x(Math.min(Math.max(Math.floor(cursor + 1e-9), model.firstYear), recordEnd));
  const gauge = (() => {
    if (!frame || frame.rank.ci_low === null || frame.rank.ci_high === null) return null;
    const top = Math.max(rate(frame.rank.ci_high), ribbonTop);
    const bottom = Math.min(rate(frame.rank.ci_low), ribbonBottom);
    const side = cursorX > right - 150 ? -1 : 1;
    return {
      x: cursorX + side * 9,
      top,
      bottom,
      side,
      textY: Math.max(Math.min((top + bottom) / 2, ribbonBottom - 18), ribbonTop + 14),
      spansZero: frame.rank.ci_low <= 0 && frame.rank.ci_high >= 0,
    };
  })();

  let standing: string;
  if (!result || !model.frames.length) standing = "Insufficient data";
  else if (cursor < model.firstYear + 1) standing = "Record not started";
  else if (!frame) standing = `Below minimum record · ${Math.min(yearsSoFar, 10)} of 10 years`;
  else standing = stateLabel(frame.verdict, frame.years_watched);

  return (
    <g>
      <text x={left} y={top + 22} className="row-name">
        {variable.name}
      </text>
      <text x={right} y={top + 22} textAnchor="end" className={detectedNow ? "row-standing row-standing-on" : "row-standing"}>
        {standing}
      </text>

      <line x1={left} x2={x(recordEnd)} y1={traceMid} y2={traceMid} className="trace-base" />
      <path d={trace} className="trace" clipPath={seenClip} />

      <rect x={x(model.firstYear)} y={ribbonTop} width={Math.max(x(firstTest) - x(model.firstYear), 0)} height={geometry.ribbon} fill={youngFill} />
      {x(firstTest) - x(model.firstYear) > 96 && (
        <text x={x(model.firstYear) + 8} y={ribbonBottom - 9} className="zone-label">
          under 10 years
        </text>
      )}
      {domain.end > recordEnd && (
        <>
          <rect x={x(recordEnd)} y={ribbonTop} width={x(domain.end) - x(recordEnd)} height={geometry.ribbon} fill={futureFill} />
          <text x={x(domain.end) - 6} y={ribbonBottom - 9} textAnchor="end" className="zone-label">
            not yet observed
          </text>
        </>
      )}

      <clipPath id={`${uid}-box`}>
        <rect x={left} y={ribbonTop} width={right - left} height={geometry.ribbon} />
      </clipPath>
      <clipPath id={`${uid}-detected`}>
        {model.detectedRuns.map(([from, to]) => {
          const start = x(model.frames[from].end_year + 1);
          const end = x(model.frames[to].end_year + 1) + 1;
          return <rect key={from} x={start} y={ribbonTop} width={end - start} height={geometry.ribbon} />;
        })}
      </clipPath>
      <g clipPath={`url(#${uid}-box)`}>
        <g clipPath={testedClip}>
          <path d={paths.band} className="band band-quiet" />
          <g clipPath={`url(#${uid}-detected)`}>
            <path d={paths.band} className="band-mask" />
            <path d={paths.band} className="band band-signal" />
          </g>
          <path d={paths.centre} className="band-centre" />
        </g>
      </g>
      <line x1={left} x2={right} y1={rate(0)} y2={rate(0)} className="zero-line" />
      <text x={left + 4} y={rate(0) - 6} className="zero-label">
        no change
      </text>

      {gauge && (
        <g className={detectedNow ? "gauge gauge-on" : "gauge"}>
          <line x1={gauge.x} x2={gauge.x} y1={gauge.top} y2={gauge.bottom} className="gauge-bar" />
          <line x1={gauge.x - 4} x2={gauge.x + 4} y1={gauge.top} y2={gauge.top} className="gauge-bar" />
          <line x1={gauge.x - 4} x2={gauge.x + 4} y1={gauge.bottom} y2={gauge.bottom} className="gauge-bar" />
          <text x={gauge.x + gauge.side * 10} y={gauge.textY - 3} textAnchor={gauge.side > 0 ? "start" : "end"} className="gauge-label">
            95% interval
          </text>
          <text x={gauge.x + gauge.side * 10} y={gauge.textY + 13} textAnchor={gauge.side > 0 ? "start" : "end"} className="gauge-reading">
            {gauge.spansZero ? "includes zero" : "excludes zero"}
          </text>
        </g>
      )}

      {detectionTime !== null && (
        <g className={`milestone ${reached ? "milestone-on" : ""}`}>
          <line x1={x(detectionTime)} x2={x(detectionTime)} y1={traceTop} y2={ribbonBottom} className="stamp-rule" />
          <text x={x(detectionTime) - 8} y={ribbonTop + 16} textAnchor="end" className="milestone-label">
            sustained from
          </text>
          <text x={x(detectionTime) - 8} y={ribbonTop + 36} textAnchor="end" className="milestone-year">
            {detection?.at_first_endpoint ? "≤ " : ""}
            {detection?.detection_year}
          </text>
        </g>
      )}

    </g>
  );
}
