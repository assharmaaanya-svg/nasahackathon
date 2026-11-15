export type VerdictId =
  | "detected_rising"
  | "detected_falling"
  | "suggestive"
  | "not_detectable_yet"
  | "not_enough_data";

export type Prediction = "rising" | "falling" | "none";

export interface Variable {
  id: string;
  question: string;
  name: string;
  parameter: string;
  units: string;
  decimals: number;
  definition: string;
  source_kind: string;
  source_label: string;
  source_detail: string;
  caveat: string;
  first_year: number;
  grid: [number, number] | null;
  live: boolean;
}

export interface Place {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  cached: boolean;
}

export interface Region {
  id: string;
  name: string;
  west: number;
  south: number;
  east: number;
  north: number;
  available: boolean;
  product: string | null;
  version: string | null;
  reason: string | null;
}

export interface Catalog {
  variables: Variable[];
  places: Place[];
  regions: Region[];
  last_complete_year: number;
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface RankBlock {
  slope: number;
  ci_low: number | null;
  ci_high: number | null;
  slope_per_year: number;
  intercept: number;
  tau: number;
  p_naive: number;
  p_adjusted: number;
  variance_inflation: number;
}

export interface LeastSquaresBlock {
  slope: number;
  ci_low: number | null;
  ci_high: number | null;
  slope_per_year: number;
  intercept: number;
  p_naive: number;
  p_adjusted: number;
  r1: number;
  n: number;
  n_effective: number;
  residual_sd: number;
}

export interface Frame {
  end_year: number;
  years_watched: number;
  valid_months: number;
  sufficient: boolean;
  verdict: VerdictId;
  reason?: string;
  climatology?: (number | null)[];
  rank?: RankBlock;
  least_squares?: LeastSquaresBlock;
}

export interface Detection {
  detection_year: number | null;
  years_watched_at_detection: number | null;
  at_first_endpoint: boolean;
  years_held: number | null;
  provisional: boolean;
  record_start_year: number | null;
  first_crossing_year: number | null;
  lapses: number;
  runs: { from: number; to: number; verdict: VerdictId }[];
  endpoints_tested: number;
  rule: string;
}

export interface YearsNeeded {
  available: boolean;
  reason: string | null;
  total_years: number | null;
  additional_years: number | null;
  additional_years_if_stronger: number | null;
  total_years_if_stronger: number | null;
  total_years_if_weaker: number | null;
  weaker_end_includes_zero: boolean | null;
  record_years: number | null;
  detection_probability: number;
  rate_per_year: number | null;
  noise_sd: number | null;
  autocorrelation: number | null;
  strong_rate_per_year: number | null;
  weak_rate_per_year: number | null;
  curve: { years: number; at_estimate: number; at_strong_end: number; at_weak_end: number | null }[] | null;
}

export interface SensitivityRow {
  start_year: number;
  years: number;
  slope: number;
  ci_low: number | null;
  ci_high: number | null;
  verdict: VerdictId;
}

export interface Shape {
  curved: boolean;
  reverses: boolean;
  p_value: number;
  turning_point_year: number | null;
  turning_point_kind: string | null;
}

export interface Result {
  verdict: VerdictId;
  rank: RankBlock;
  least_squares: LeastSquaresBlock;
  shape: Shape;
  detection: Detection;
  years_needed: YearsNeeded | null;
  start_year_sensitivity: SensitivityRow[];
}

export interface Coverage {
  first_year: number | null;
  last_year: number | null;
  span_years: number;
  expected_months: number;
  valid_months: number;
  missing_months: number;
  fraction: number;
  sufficient: boolean;
  short_record: boolean;
  reason: string | null;
}

export interface CaseRecord {
  schema: string;
  id: string;
  case: {
    kind: "power" | "giovanni";
    place: {
      name: string;
      latitude: number;
      longitude: number;
      footprint: Bounds;
      footprint_note: string;
    };
    variable: Variable;
  };
  coverage: Coverage;
  series: {
    years: number[];
    months: number[];
    raw: (number | null)[];
    climatology: (number | null)[];
    anomalies: (number | null)[];
  };
  replay: { frames: Frame[] };
  result: Result | null;
  provenance: {
    source: string;
    source_kind: string;
    product: string;
    parameter: string;
    units_reported: string;
    request_url: string;
    retrieved_at: string | null;
    served_from: string;
    fill_value: number;
    fill_values_dropped: number;
    preprocessing: string[];
    analysis_window: string | null;
    months_expected: number;
    months_used: number;
    series_sha256?: string;
    valid_days_by_month?: Record<string, number>;
    months_missing: number;
    methods: Record<string, string | number>;
    software: Record<string, string>;
  };
  text: {
    label: string;
    headline: string;
    summary: string;
    detection: string | null;
    years_needed: string | null;
    shape: string | null;
    chart_summary: string;
    caveats: string[];
  };
}

export interface CaseRequest {
  kind: "power" | "region";
  latitude?: number;
  longitude?: number;
  name?: string;
  variableId: string;
  regionId?: string;
}

export interface ApiFailure {
  step: string;
  cause: string;
  advice: string | null;
}
