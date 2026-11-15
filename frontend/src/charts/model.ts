import { extent } from "d3-array";

import { isDetected } from "../lib/format";
import type { CaseRecord, Frame } from "../types";

export interface TestedFrame extends Frame {
  rank: NonNullable<Frame["rank"]>;
  least_squares: NonNullable<Frame["least_squares"]>;
  climatology: (number | null)[];
}

export interface SeriesModel {
  time: number[];
  months: number[];
  raw: (number | null)[];
  firstYear: number;
  lastYear: number;
  frames: TestedFrame[];
  allFrames: Frame[];
  rawDomain: [number, number];
  anomalyDomain: [number, number];
  rateDomain: [number, number];
  detectedRuns: [number, number][];
}

function padded(low: number, high: number, fraction: number): [number, number] {
  const pad = (high - low || 1) * fraction;
  return [low - pad, high + pad];
}

export function isTested(frame: Frame): frame is TestedFrame {
  return frame.sufficient && frame.rank !== undefined && frame.least_squares !== undefined;
}

export function buildModel(record: CaseRecord): SeriesModel {
  const { years, months, raw, anomalies } = record.series;
  const time = years.map((year, index) => year + (months[index] - 0.5) / 12);
  const frames = record.replay.frames.filter(isTested);
  const rawValues = raw.filter((v): v is number => v !== null);
  const anomalyValues = anomalies.filter((v): v is number => v !== null);
  const [rawLow, rawHigh] = extent(rawValues) as [number, number];
  const anomalyReach = Math.max(...anomalyValues.map(Math.abs), 1e-9);

  const settled = frames.slice(Math.min(4, Math.max(frames.length - 1, 0)));
  const bounds = settled.flatMap((f) => [f.rank.ci_low ?? f.rank.slope, f.rank.ci_high ?? f.rank.slope, f.rank.slope]);
  const [rateLow, rateHigh] = extent([...bounds, 0]) as [number, number];

  const detectedRuns: [number, number][] = [];
  frames.forEach((frame, index) => {
    if (!isDetected(frame.verdict)) return;
    const previous = detectedRuns[detectedRuns.length - 1];
    if (previous && previous[1] === index - 1) previous[1] = index;
    else detectedRuns.push([index, index]);
  });

  return {
    time,
    months,
    raw,
    firstYear: years[0],
    lastYear: years[years.length - 1],
    frames,
    allFrames: record.replay.frames,
    rawDomain: padded(rawLow, rawHigh, 0.08),
    anomalyDomain: [-anomalyReach * 1.1, anomalyReach * 1.1],
    rateDomain: padded(rateLow, rateHigh, 0.18),
    detectedRuns,
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function runningMean(values: (number | null)[], window = 12, minimum = 9): (number | null)[] {
  return values.map((_, index) => {
    if (index < window - 1) return null;
    let sum = 0;
    let count = 0;
    for (let k = index - window + 1; k <= index; k += 1) {
      const value = values[k];
      if (value !== null && value !== undefined) {
        sum += value;
        count += 1;
      }
    }
    return count >= minimum ? sum / count : null;
  });
}

export interface FitAtCursor {
  slopePerYear: number;
  intercept: number;
  lowPerYear: number | null;
  highPerYear: number | null;
}

export function fitAt(frames: TestedFrame[], position: number): FitAtCursor {
  const lower = frames[Math.floor(position)];
  const upper = frames[Math.min(Math.ceil(position), frames.length - 1)];
  const f = position - Math.floor(position);
  const blend = (a: number | null, b: number | null) => (a === null || b === null ? null : lerp(a, b, f) / 10);
  return {
    slopePerYear: lerp(lower.rank.slope_per_year, upper.rank.slope_per_year, f),
    intercept: lerp(lower.rank.intercept, upper.rank.intercept, f),
    lowPerYear: blend(lower.rank.ci_low, upper.rank.ci_low),
    highPerYear: blend(lower.rank.ci_high, upper.rank.ci_high),
  };
}
