import type { Bounds, VerdictId } from "../types";

const MINUS = "−";

export function signed(value: number, decimals: number): string {
  const text = Math.abs(value).toFixed(decimals);
  if (Number(text) === 0) return text;
  return (value > 0 ? "+" : MINUS) + text;
}

export function plain(value: number, decimals: number): string {
  const text = Math.abs(value).toFixed(decimals);
  return value < 0 && Number(text) !== 0 ? MINUS + text : text;
}

export function interval(low: number | null, high: number | null, decimals: number): string {
  if (low === null || high === null) return "too wide to state";
  return `${signed(low, decimals)} to ${signed(high, decimals)}`;
}

export function pValue(p: number): string {
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

export function latitude(value: number): string {
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? "N" : "S"}`;
}

export function longitude(value: number): string {
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? "E" : "W"}`;
}

export function coordinates(lat: number, lon: number): string {
  return `${latitude(lat)} ${longitude(lon)}`;
}

export function footprintSize(bounds: Bounds): string {
  const midLat = ((bounds.south + bounds.north) / 2) * (Math.PI / 180);
  const width = (bounds.east - bounds.west) * 111.32 * Math.cos(midLat);
  const height = (bounds.north - bounds.south) * 110.57;
  return `about ${Math.round(width)} × ${Math.round(height)} km`;
}

export const VERDICT_LABEL: Record<VerdictId, string> = {
  detected_rising: "Detected rising",
  detected_falling: "Detected falling",
  suggestive: "Suggestive",
  not_detectable_yet: "Not detectable yet",
  not_enough_data: "Not enough data",
};

export function isDetected(verdict: VerdictId): boolean {
  return verdict === "detected_rising" || verdict === "detected_falling";
}

export function timestamp(iso: string | null): string {
  if (!iso) return "date not recorded in export";
  return iso.slice(0, 16).replace("T", " ") + " UTC";
}

export function stateLabel(verdict: VerdictId, years?: number): string {
  if (verdict === "detected_rising") return "Trend detected: rising";
  if (verdict === "detected_falling") return "Trend detected: falling";
  if (verdict === "suggestive") return "Suggestive: below detection threshold";
  if (verdict === "not_detectable_yet") return years ? `No detection in ${years} years of record` : "No detection";
  return "Insufficient data";
}

export function predictionResult(prediction: "rising" | "falling" | "none", verdict: VerdictId): string {
  const outcome = verdict === "detected_rising" ? "rising" : verdict === "detected_falling" ? "falling" : "none";
  if (prediction === "none") return outcome === "none" ? "No detection: matched" : "No detection: did not match";
  const word = prediction === "rising" ? "Rising" : "Falling";
  if (outcome === prediction) return `${word}: supported`;
  if (outcome === "none") return `${word}: undetermined`;
  return `${word}: contradicted`;
}

export const PREDICTION_NOTE =
  "A prediction of rising or falling is supported or contradicted only when a trend is detected. If the interval includes zero, the record cannot say either way.";

export const ESTIMATE_NOTE =
  "Total record length for a 90% chance of detection at the 5% level, after Weatherhead et al. (1998). Conditional on the true rate and on the noise staying as it is. Not a forecast and not a date.";

export const SUSTAINED_NOTE =
  "Earliest end year from which the detection criterion is met in every later year of the record so far. Identified from the full replay history, in hindsight. It is not a stopping rule: nobody in that year could have known the detection would hold. It depends on when the record starts.";

export function sustainedValue(detection: {
  detection_year: number | null;
  years_watched_at_detection: number | null;
  at_first_endpoint: boolean;
  provisional: boolean;
  record_start_year: number | null;
}): string {
  const lead = detection.at_first_endpoint ? "≤ " : "";
  const length = `${detection.years_watched_at_detection} years of record (${detection.record_start_year}–${detection.detection_year})`;
  return `${lead}${detection.detection_year} · ${length}${detection.provisional ? " · provisional" : ""}`;
}

export function estimateRows(needed: {
  record_years: number | null;
  total_years: number | null;
  total_years_if_stronger: number | null;
  total_years_if_weaker: number | null;
}): { label: string; value: string }[] {
  const have = needed.record_years ?? 0;
  const years = (total: number | null) =>
    total === null ? "no length is enough" : total <= have ? `about ${Math.round(total)} years (reached)` : `about ${Math.round(total)} years`;
  return [
    { label: "Weak end of the interval", value: years(needed.total_years_if_weaker) },
    { label: "At the estimated rate", value: years(needed.total_years) },
    { label: "Strong end of the interval", value: years(needed.total_years_if_stronger) },
  ];
}
