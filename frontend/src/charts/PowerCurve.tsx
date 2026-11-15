import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";

import type { DetectabilityStudy } from "../lib/api";
import { useWidth } from "../lib/useWidth";

const HEIGHT = 250;
const NAMES: Record<string, string> = { temperature: "Air temperature", precipitation: "Precipitation" };

export function PowerCurve({ studies }: { studies: DetectabilityStudy[] }) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const left = 44;
  const right = 16;
  const top = 18;
  const bottom = HEIGHT - 40;
  const last = Math.max(...studies.flatMap((study) => study.curve.map((point) => point.years)));
  const recordYears = studies[0]?.record_years ?? 0;
  const x = scaleLinear().domain([10, last]).range([left, width - right]);
  const y = scaleLinear().domain([0, 1]).range([bottom, top]);
  const path = line<{ years: number; detected_share: number }>()
    .x((point) => x(point.years))
    .y((point) => y(point.detected_share));
  const ticks: number[] = [];
  for (let year = 10; year <= last; year += 10) ticks.push(year);

  return (
    <figure className="power-figure">
      <div ref={ref} className="measure" style={{ height: HEIGHT }}>
        <svg width={width} height={HEIGHT} role="img" aria-labelledby="power-caption">
          {[0, 0.5, 0.9, 1].map((share) => (
            <g key={share}>
              <line x1={left} x2={width - right} y1={y(share)} y2={y(share)} className={share === 0.9 ? "power-target" : "ruler"} />
              <text x={left - 8} y={y(share) + 4} textAnchor="end" className="tick">
                {Math.round(share * 100)}%
              </text>
            </g>
          ))}
          {ticks.map((year) => (
            <text key={year} x={x(year)} y={bottom + 18} textAnchor="middle" className="tick">
              {year}
            </text>
          ))}
          <text x={(left + width - right) / 2} y={HEIGHT - 4} textAnchor="middle" className="tick">
            years of record
          </text>
          <line x1={x(recordYears)} x2={x(recordYears)} y1={top} y2={bottom} className="power-now" />
          <text x={x(recordYears) + 6} y={bottom - 6} className="tick">
            record today, {recordYears} yr
          </text>
          {studies.map((study, index) => {
            const end = study.curve[study.curve.length - 1];
            const nearTop = study.curve.find((point) => point.detected_share >= 0.6) ?? end;
            return (
              <g key={study.variable}>
                <path d={path(study.curve) ?? ""} className={index === 0 ? "power-line power-line-a" : "power-line power-line-b"} />
                <text x={x(nearTop.years) + 8} y={y(nearTop.detected_share) + 14} className="power-name">
                  {NAMES[study.variable] ?? study.variable}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption id="power-caption" className="methods-note">
        Share of {studies[0]?.runs} simulated records called Detected at each record length, if Madrid's fitted rate and
        noise held steady. The dashed line marks 90%.
      </figcaption>
    </figure>
  );
}
