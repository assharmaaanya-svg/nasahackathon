import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useId, useMemo } from "react";

import { useWidth } from "../lib/useWidth";
import type { CaseRecord } from "../types";
import { buildModel } from "./model";

interface Props {
  record: CaseRecord;
  height: number;
  position?: number;
  years?: [number, number];
  showYears?: boolean;
  showStamp?: boolean;
}

export function FunnelStrip({ record, height, position, years, showYears = false, showStamp = false }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(600);
  const uid = useId().replace(/:/g, "");
  const model = useMemo(() => buildModel(record), [record]);
  const axisHeight = showYears ? 26 : 0;
  const plotHeight = height - axisHeight;
  const domain = years ?? [model.firstYear, model.lastYear + 1];
  const x = scaleLinear().domain(domain).range([0, width]);
  const rate = scaleLinear().domain(model.rateDomain).range([plotHeight, 0]);

  const paths = useMemo(() => {
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

  if (!model.frames.length) return <div ref={ref} className="measure" style={{ height }} />;

  const last = model.frames.length - 1;
  const at = position === undefined ? last : Math.min(position, last);
  const index = Math.floor(at);
  const cursor = model.frames[index].end_year + 1 + (at - index);
  const detectionYear = record.result?.detection.detection_year ?? null;
  const stamped = showStamp && detectionYear !== null && cursor >= detectionYear + 1;
  const tickYears: number[] = [];
  for (let year = Math.ceil(domain[0] / 5) * 5; year <= domain[1]; year += 5) tickYears.push(year);

  return (
    <div ref={ref} className="measure" style={{ height }}>
      <svg width={width} height={height} className="strip" aria-hidden="true">
        <defs>
          <clipPath id={`${uid}-seen`}>
            <rect x={0} y={0} width={Math.max(x(cursor), 0)} height={plotHeight} />
          </clipPath>
          <clipPath id={`${uid}-detected`}>
            {model.detectedRuns.map(([from, to]) => {
              const start = x(model.frames[from].end_year + 1);
              const end = x(model.frames[to].end_year + 1) + 1;
              return <rect key={from} x={start} y={0} width={end - start} height={plotHeight} />;
            })}
          </clipPath>
          <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" />
          </pattern>
        </defs>
        <rect
          x={x(model.firstYear)}
          y={0}
          width={Math.max(x(model.frames[0].end_year + 1) - x(model.firstYear), 0)}
          height={plotHeight}
          fill={`url(#${uid}-hatch)`}
        />
        <g clipPath={`url(#${uid}-seen)`}>
          <path d={paths.band} className="band band-quiet" />
          <g clipPath={`url(#${uid}-detected)`}>
            <path d={paths.band} className="band-mask" />
            <path d={paths.band} className="band band-signal" />
          </g>
          <path d={paths.centre} className="band-centre" />
        </g>
        <line x1={0} x2={width} y1={rate(0)} y2={rate(0)} className="zero-line" />
        {showStamp && detectionYear !== null && (
          <g className={`stamp ${stamped ? "stamp-on" : ""}`}>
            <line x1={x(detectionYear + 1)} x2={x(detectionYear + 1)} y1={0} y2={plotHeight} className="stamp-rule" />
            <circle cx={x(detectionYear + 1)} cy={rate(0)} r={3.5} className="stamp-dot" />
          </g>
        )}
        {position !== undefined && at < last && (
          <line x1={x(cursor)} x2={x(cursor)} y1={0} y2={plotHeight} className="cursor-line" />
        )}
        {showYears && (
          <>
            <line x1={0} x2={width} y1={plotHeight} y2={plotHeight} className="axis" />
            {tickYears.map((year) => (
              <g key={year}>
                <line x1={x(year)} x2={x(year)} y1={plotHeight} y2={plotHeight + 6} className="ruler" />
                <text x={x(year)} y={plotHeight + 20} textAnchor="middle" className="tick">
                  {year}
                </text>
              </g>
            ))}
          </>
        )}
      </svg>
    </div>
  );
}
