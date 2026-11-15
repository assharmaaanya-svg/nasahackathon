import type { ApiFailure, CaseRecord, CaseRequest, Catalog } from "../types";

export class RequestFailed extends Error {
  failure: ApiFailure;

  constructor(failure: ApiFailure) {
    super(failure.cause);
    this.failure = failure;
  }
}

async function read<T>(response: Response, step: string): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let failure: ApiFailure = { step, cause: `The server answered ${response.status}.`, advice: null };
  try {
    const body = await response.json();
    if (body.detail && typeof body.detail === "object" && "cause" in body.detail) failure = body.detail;
    else if (typeof body.detail === "string") failure = { step, cause: body.detail, advice: null };
  } catch {
    failure = { step, cause: `The server answered ${response.status}.`, advice: null };
  }
  throw new RequestFailed(failure);
}

async function send<T>(url: string, step: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new RequestFailed({
      step,
      cause: "The Long Watch analysis service could not be reached.",
      advice: "Check that the service is running, then try again.",
    });
  }
  return read<T>(response, step);
}

export function fetchCatalog(): Promise<Catalog> {
  return send<Catalog>("/api/catalog", "Loading the catalogue of places and questions");
}

export function fetchCase(request: CaseRequest): Promise<CaseRecord> {
  if (request.kind === "region") {
    return send<CaseRecord>(`/api/region/${request.regionId}`, "Reading the Giovanni satellite export");
  }
  const query = new URLSearchParams({
    latitude: String(request.latitude),
    longitude: String(request.longitude),
    variable: request.variableId,
  });
  if (request.name) query.set("name", request.name);
  return send<CaseRecord>(`/api/analyze?${query}`, "Retrieving the monthly record from NASA POWER");
}

export interface RerunResponse {
  record: CaseRecord;
  reproduced: boolean;
  differences: string[];
}

export function rerunRecord(record: unknown): Promise<RerunResponse> {
  return send<RerunResponse>("/api/rerun", "Re-running the analysis from the record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
}

export interface DetectabilityStudy {
  variable: string;
  place: string;
  assumed_rate_per_decade: number;
  assumed_noise_sd: number;
  assumed_autocorrelation: number;
  units: string;
  record_years: number;
  runs: number;
  curve: { years: number; detected_share: number }[];
  years_for_50_percent: number | null;
  years_for_80_percent: number | null;
  years_for_90_percent: number | null;
  weatherhead_years_90_percent: number;
  observed_sustained_detection_at_years: number | null;
  simulated_records_of_same_length?: {
    share_with_sustained_detection: number;
    median_years: number | null;
    p10_years: number | null;
    p90_years: number | null;
    share_sustained_by_observed_length: number | null;
  };
}

export interface CrosscheckSeries {
  verdict: string;
  rate_per_decade: number;
  interval_per_decade: [number, number];
  valid_months: number;
  sustained_detection_from: number | null;
  years_of_record_at_sustained_detection: number | null;
}

export interface Crosscheck {
  station: { id: string; name: string; latitude: number; longitude: number; elevation_m: number };
  source: string;
  source_url: string;
  window: string;
  station_months_missing: number;
  station_mean: CrosscheckSeries;
  station_daily_maximum: CrosscheckSeries;
  station_daily_minimum: CrosscheckSeries;
  merra2_cell: CrosscheckSeries;
  monthly_anomaly_correlation: number;
  station_minus_merra2: { rate_per_decade: number; interval_per_decade: [number, number] };
}

export interface ValidationReport {
  generated_at: string;
  seed: number;
  runs_per_configuration: number;
  replay_runs_per_configuration: number;
  false_positive_rates: {
    months: number;
    phi: number;
    least_squares_naive: number;
    mann_kendall_naive: number;
    hamed_rao_library: number;
    least_squares_ar1: number;
    mann_kendall_ar1: number;
    detected_verdict: number;
  }[];
  years_needed_formula: {
    slope_per_decade: number;
    noise_sd: number;
    phi: number;
    formula_years: number;
    detection_probability_at_formula_years: number;
    simulated_years_for_90_percent: number;
    formula_over_simulated: number;
  }[];
  madrid_crosscheck: Crosscheck | null;
  power_by_record_length?: {
    slope_per_decade: number;
    noise_sd: number;
    phi: number;
    by_length: { years: number; detected_share: number; formula_probability: number }[];
  }[];
  stress_tests?: {
    case: string;
    detected_share: number;
    straight_line_note_share: number;
    reversal_warning_share: number;
  }[];
  detectability: {
    generated_at: string;
    seed: number;
    studies: DetectabilityStudy[];
  } | null;
  replay_under_no_trend: {
    phi: number;
    runs: number;
    false_detection_year_rate: number;
    any_endpoint_crossing_rate: number;
  }[];
}

export function fetchValidation(): Promise<ValidationReport> {
  return send<ValidationReport>("/api/validation", "Loading the validation experiments");
}
