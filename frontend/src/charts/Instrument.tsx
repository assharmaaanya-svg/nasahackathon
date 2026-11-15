import { ticks } from "d3-array";
import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useId, useMemo, useRef, useState } from "react";

import { plain, signed } from "../lib/format";
import { useWidth } from "../lib/useWidth";
import type { CaseRecord } from "../types";
import { buildModel, fitAt, lerp, runningMean } from "./model";

export type InstrumentMode = "measured" | "adjusted" | "replay";

interface Props {
  chartHeight: number;
  revealed: boolean;
  record: CaseRecord;
  mode: InstrumentMode;
  seasonalBlend: number;
  position: number;
  onSeek: (position: number) => void;
  onStep: (delta: number) => void;
  onTogglePlay: () => void;
  sliderLabel: string;
}

export function Instrument({ chartHeight, revealed, record, mode, seasonalBlend, position, onSeek, onStep, onTogglePlay, sliderLabel }: Props) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [focused, setFocused] = useState(false);
  const uid = useId().replace(/:/g, "");
  const model = useMemo(() => buildModel(record), [record]);
  const variable = record.case.variable;
  const narrow = width < 640;
  const replaying = mode === "replay" && model.frames.length > 0;

  const left = narrow ? 46 : 62;
  const right = narrow ? 10 : 16;
  const seriesTop = 50;
  const seriesHeight = narrow ? 190 : mode === "replay" ? Math.round(chartHeight * 0.52) : Math.round(chartHeight * 0.9);
  const funnelTop = seriesTop + seriesHeight + 46;
  const funnelHeight = narrow ? 170 : Math.round(chartHeight * 0.48);
  const timelineTop = funnelTop + funnelHeight;
  const timelineHeight = 54;
  const height = replaying ? timelineTop + timelineHeight + 4 : seriesTop + seriesHeight + 30;

  const x = useMemo(
    () => scaleLinear().domain([model.firstYear, model.lastYear + 1]).range([left, width - right]),
    [model, left, right, width],
  );

  const frameIndex = Math.min(Math.floor(position), Math.max(model.frames.length - 1, 0));
  const frame = model.frames[frameIndex];
  const fraction = position - frameIndex;
  const firstEndpoint = model.frames.length ? model.frames[0].end_year + 1 : model.lastYear + 1;
  const cursorTime = replaying ? frame.end_year + 1 + fraction : model.lastYear + 1;

  const climatology = replaying ? frame.climatology : record.series.climatology;
  const blend = replaying ? 1 : seasonalBlend;
  const values = useMemo(
    () =>
      model.raw.map((value, index) => {
        const usual = climatology[model.months[index] - 1];
        if (value === null || usual === null) return null;
        return value - blend * usual;
      }),
    [model, climatology, blend],
  );
  const smooth = useMemo(() => (blend > 0 ? runningMean(values) : []), [values, blend]);

  const yDomain: [number, number] = [
    lerp(model.rawDomain[0], model.anomalyDomain[0], blend),
    lerp(model.rawDomain[1], model.anomalyDomain[1], blend),
  ];
  const y = scaleLinear().domain(yDomain).range([seriesTop + seriesHeight, seriesTop]);
  const rate = scaleLinear().domain(model.rateDomain).range([funnelTop + funnelHeight, funnelTop]);

  const monthly = line<number | null>()
    .defined((value) => value !== null)
    .x((_, index) => x(model.time[index]))
    .y((value) => y(value as number));
  const monthlyPath = monthly(values) ?? "";
  const smoothPath = blend > 0 ? (monthly(smooth) ?? "") : "";

  const usualCycle = useMemo(() => {
    if (blend >= 1) return "";
    const cycle = line<number>()
      .x((_, index) => x(model.time[index]))
      .y((_, index) => {
        const usual = record.series.climatology[model.months[index] - 1] ?? 0;
        return y(usual * (1 - blend));
      });
    return cycle(model.time) ?? "";
  }, [blend, model, record, x, y]);

  const yearTicks = ticks(model.firstYear, model.lastYear + 1, narrow ? 5 : 9).filter(Number.isInteger);
  const everyYear = Array.from({ length: model.lastYear - model.firstYear + 2 }, (_, i) => model.firstYear + i);
  const yTicks = y.ticks(5);
  const rateTicks = rate.ticks(5);

  const fit = replaying ? fitAt(model.frames, frameIndex) : null;
  const trend = useMemo(() => {
    if (!fit) return null;
    const t0 = model.firstYear;
    const t1 = cursorTime;
    const pivot = (t0 + t1) / 2;
    const pivotValue = fit.intercept + fit.slopePerYear * pivot;
    const at = (slope: number, t: number) => y(pivotValue + slope * (t - pivot));
    const linePath = `M${x(t0)},${at(fit.slopePerYear, t0)}L${x(t1)},${at(fit.slopePerYear, t1)}`;
    let wedge = "";
    if (fit.lowPerYear !== null && fit.highPerYear !== null) {
      wedge =
        `M${x(t0)},${at(fit.lowPerYear, t0)}L${x(pivot)},${y(pivotValue)}L${x(t0)},${at(fit.highPerYear, t0)}Z` +
        `M${x(t1)},${at(fit.lowPerYear, t1)}L${x(pivot)},${y(pivotValue)}L${x(t1)},${at(fit.highPerYear, t1)}Z`;
    }
    return { linePath, wedge };
  }, [fit, model, cursorTime, x, y]);

  const funnel = useMemo(() => {
    if (!model.frames.length) return null;
    const [low, high] = model.rateDomain;
    const reach = (high - low) * 4;
    const band = area<(typeof model.frames)[number]>()
      .x((f) => x(f.end_year + 1))
      .y0((f) => rate(f.rank.ci_low ?? low - reach))
      .y1((f) => rate(f.rank.ci_high ?? high + reach));
    const centre = line<(typeof model.frames)[number]>()
      .x((f) => x(f.end_year + 1))
      .y((f) => rate(f.rank.slope));
    return { band: band(model.frames) ?? "", centre: centre(model.frames) ?? "" };
  }, [model, x, rate]);

  const detection = record.result?.detection;
  const detectionTime = detection?.detection_year != null ? detection.detection_year + 1 : null;
  const detectionReached = replaying && revealed && detectionTime !== null;
  const stampOnLeft = detectionTime !== null && x(detectionTime) > width * 0.62;

  const pointerToPosition = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return 0;
    const time = x.invert(clientX - box.left);
    const last = model.frames.length - 1;
    let index = 0;
    model.frames.forEach((candidate, i) => {
      if (candidate.end_year + 1 <= time) index = i;
    });
    if (index >= last) return last;
    const from = model.frames[index].end_year + 1;
    const to = model.frames[index + 1].end_year + 1;
    return index + Math.min(Math.max((time - from) / (to - from), 0), 1);
  };
  const dragging = useRef(false);
  const onPointerDown = (event: React.PointerEvent<SVGRectElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSeek(pointerToPosition(event.clientX));
  };
  const onPointerMove = (event: React.PointerEvent<SVGRectElement>) => {
    if (dragging.current) onSeek(pointerToPosition(event.clientX));
  };
  const onPointerUp = (event: React.PointerEvent<SVGRectElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    onSeek(Math.round(pointerToPosition(event.clientX)));
  };

  const gaugeSide = x(cursorTime) > width - right - 150 ? -1 : 1;
  const seriesUnit = blend > 0.5 ? `${variable.units} · ${narrow ? "departure" : "departure from the usual month"}` : variable.units;
  const plotWidth = width - left - right;

  return (
    <div className="instrument measure" ref={wrapRef} style={{ height }}>
      <svg ref={svgRef} width={width} height={height} aria-hidden="true" className="instrument-svg">
        <defs>
          <clipPath id={`${uid}-series`}>
            <rect x={left} y={seriesTop - 6} width={Math.max(x(cursorTime) - left, 0)} height={seriesHeight + 12} />
          </clipPath>
          <clipPath id={`${uid}-funnel`}>
            <rect x={left} y={funnelTop} width={Math.max(x(replaying ? frame.end_year + 1 : cursorTime) - left, 0)} height={funnelHeight} />
          </clipPath>
          <clipPath id={`${uid}-detected`}>
            {model.detectedRuns.map(([from, to]) => {
              const start = x(model.frames[from].end_year + 1);
              const end = x(model.frames[to].end_year + 1) + 1;
              return <rect key={from} x={start} y={funnelTop} width={end - start} height={funnelHeight} />;
            })}
          </clipPath>
          <pattern id={`${uid}-unseen`} width="5" height="5" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" className="future-dot" />
          </pattern>
          <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" />
          </pattern>
        </defs>

        <text x={left} y={14} className="plot-label">
          Observations
        </text>
        <text x={left + 112} y={14} className="plot-unit">
          {seriesUnit}
        </text>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className={tick === 0 && blend > 0.5 ? "grid-zero" : "grid"} />
            <text x={left - 10} y={y(tick)} dy="0.32em" textAnchor="end" className="tick">
              {blend > 0.5 ? signed(tick, tickDecimals(yTicks)) : plain(tick, tickDecimals(yTicks))}
            </text>
          </g>
        ))}
        {yearTicks.map((year) => (
          <line key={year} x1={x(year)} x2={x(year)} y1={seriesTop} y2={seriesTop + seriesHeight} className="grid-year" />
        ))}
        {replaying && x(cursorTime) < width - right - 2 && (
          <>
            <rect x={x(cursorTime)} y={seriesTop} width={width - right - x(cursorTime)} height={seriesHeight} fill={`url(#${uid}-unseen)`} />
            <rect x={x(cursorTime)} y={funnelTop} width={width - right - x(cursorTime)} height={funnelHeight} fill={`url(#${uid}-unseen)`} />
            {width - right - x(cursorTime) > 190 && (
              <text x={width - right - 8} y={seriesTop + seriesHeight - 10} textAnchor="end" className="zone-label">
                not yet observed in {frame.end_year}
              </text>
            )}
          </>
        )}
        {usualCycle && <path d={usualCycle} className="usual-cycle" style={{ opacity: (1 - blend) * 0.55 }} />}
        <g clipPath={`url(#${uid}-series)`}>
          {trend?.wedge && <path d={trend.wedge} className="trend-wedge" />}
          <path d={monthlyPath} className="monthly" style={{ opacity: lerp(0.95, 0.5, blend) }} />
          {smoothPath && <path d={smoothPath} className="smooth" style={{ opacity: blend }} />}
          {trend && <path d={trend.linePath} className="trend-line" />}
        </g>
        {!replaying &&
          yearTicks.map((year) => (
            <text key={year} x={x(year)} y={seriesTop + seriesHeight + 18} textAnchor="middle" className="tick">
              {year}
            </text>
          ))}

        {replaying && funnel && (
          <>
            <text x={left} y={funnelTop - 16} className="plot-label">
              Evidence
            </text>
            <text x={left + 78} y={funnelTop - 16} className="plot-sub">
              {narrow ? "rate if the record ended here" : "rate of change, with its 95% interval, if the record had ended in each year"}
            </text>
            <text x={width - right} y={funnelTop - 16} className="plot-unit" textAnchor="end">
              {variable.units} per decade
            </text>
            {rateTicks.map((tick) => (
              <g key={tick}>
                {tick !== 0 && <line x1={left} x2={width - right} y1={rate(tick)} y2={rate(tick)} className="grid" />}
                <text x={left - 10} y={rate(tick)} dy="0.32em" textAnchor="end" className="tick">
                  {signed(tick, tickDecimals(rateTicks))}
                </text>
              </g>
            ))}
            {yearTicks.map((year) => (
              <line key={year} x1={x(year)} x2={x(year)} y1={funnelTop} y2={funnelTop + funnelHeight} className="grid-year" />
            ))}
            <rect x={left} y={funnelTop} width={x(firstEndpoint) - left} height={funnelHeight} fill={`url(#${uid}-hatch)`} />
            {!narrow && (
              <text x={left + 8} y={funnelTop + funnelHeight - 10} className="zone-label">
                under 10 years · not tested
              </text>
            )}
            <g clipPath={`url(#${uid}-funnel)`}>
              <path d={funnel.band} className="band band-quiet" />
              <g clipPath={`url(#${uid}-detected)`}>
                <path d={funnel.band} className="band-mask" />
                <path d={funnel.band} className="band band-signal" />
              </g>
              <path d={funnel.centre} className="band-centre" />
            </g>
            <line x1={left} x2={width - right} y1={rate(0)} y2={rate(0)} className="zero-line" />
            {frame.rank.ci_low !== null && frame.rank.ci_high !== null && fraction === 0 && (
              <g className={frame.verdict.startsWith("detected") ? "gauge gauge-on" : "gauge"}>
                <line
                  x1={x(cursorTime) + gaugeSide * 9}
                  x2={x(cursorTime) + gaugeSide * 9}
                  y1={Math.max(rate(frame.rank.ci_high), funnelTop)}
                  y2={Math.min(rate(frame.rank.ci_low), funnelTop + funnelHeight)}
                  className="gauge-bar"
                />
                <text x={x(cursorTime) + gaugeSide * 18} y={funnelTop + funnelHeight - 30} textAnchor={gaugeSide > 0 ? "start" : "end"} className="gauge-label">
                  95% interval
                </text>
                <text x={x(cursorTime) + gaugeSide * 18} y={funnelTop + funnelHeight - 14} textAnchor={gaugeSide > 0 ? "start" : "end"} className="gauge-reading">
                  {frame.rank.ci_low <= 0 && frame.rank.ci_high >= 0 ? "includes zero" : "excludes zero"}
                </text>
              </g>
            )}
            <text x={width - right - 4} y={rate(0) - 6} textAnchor="end" className="zero-label">
              no change
            </text>

            {detectionTime !== null && (
              <g className={`stamp ${detectionReached ? "stamp-on" : ""}`}>
                <line x1={x(detectionTime)} x2={x(detectionTime)} y1={seriesTop} y2={timelineTop} className="stamp-rule" />
                <circle cx={x(detectionTime)} cy={rate(0)} r={4} className="stamp-dot" />
                <text
                  x={x(detectionTime) + (stampOnLeft ? -12 : 12)}
                  y={funnelTop + 12}
                  textAnchor={stampOnLeft ? "end" : "start"}
                  className="stamp-title"
                >
                  sustained from{detection?.at_first_endpoint ? " (or earlier)" : ""}
                </text>
                <text
                  x={x(detectionTime) + (stampOnLeft ? -12 : 12)}
                  y={funnelTop + 33}
                  textAnchor={stampOnLeft ? "end" : "start"}
                  className="stamp-year"
                >
                  {detection?.detection_year}
                </text>
              </g>
            )}

            <line x1={left} x2={width - right} y1={timelineTop} y2={timelineTop} className="axis" />
            {everyYear.map((year) => (
              <line
                key={year}
                x1={x(year)}
                x2={x(year)}
                y1={timelineTop}
                y2={timelineTop + (year % 5 === 0 ? 10 : 5)}
                className={year + 0 <= cursorTime ? "ruler ruler-seen" : "ruler"}
              />
            ))}
            {yearTicks.map((year) => (
              <text key={year} x={x(year)} y={timelineTop + 25} textAnchor="middle" className="tick">
                {year}
              </text>
            ))}
            <rect x={left} y={timelineTop + 34} width={plotWidth} height={3} className="track" />
            <rect x={left} y={timelineTop + 34} width={Math.max(x(firstEndpoint) - left, 0)} height={3} fill={`url(#${uid}-hatch)`} />
            <rect
              x={x(firstEndpoint)}
              y={timelineTop + 34}
              width={Math.max(x(cursorTime) - x(firstEndpoint), 0)}
              height={3}
              className="track-seen"
            />

            <g className={`cursor ${focused ? "cursor-focused" : ""} ${frame.verdict.startsWith("detected") ? "cursor-detected" : ""}`} transform={`translate(${x(cursorTime)},0)`}>
              <line y1={seriesTop - 8} y2={timelineTop + 46} className="cursor-line" />
              <path d={`M-6,${timelineTop + 28}h12v10l-6,7l-6,-7z`} className="cursor-handle" />
              <rect x={-28} y={seriesTop - 32} width={56} height={24} className="cursor-flag" />
              <text y={seriesTop - 14} textAnchor="middle" className="cursor-year">
                {frame.end_year}
              </text>
            </g>

            <rect
              x={left - 8}
              y={funnelTop}
              width={plotWidth + 16}
              height={funnelHeight + timelineHeight}
              className="scrub-surface"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </>
        )}
      </svg>
      {replaying && (
        <input
          type="range"
          className="sr-slider"
          min={0}
          max={model.frames.length - 1}
          step={1}
          value={Math.round(position)}
          aria-label="Record end year"
          aria-valuetext={sliderLabel}
          onChange={(event) => onSeek(Number(event.target.value))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === " ") {
              event.preventDefault();
              onTogglePlay();
            } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
              event.preventDefault();
              onStep(1);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
              event.preventDefault();
              onStep(-1);
            }
          }}
        />
      )}
    </div>
  );
}

function tickDecimals(values: number[]): number {
  if (values.length < 2) return 0;
  const step = Math.abs(values[1] - values[0]);
  if (step >= 1) return 0;
  return Math.min(Math.max(Math.ceil(-Math.log10(step) - 1e-9), 0), 4);
}
