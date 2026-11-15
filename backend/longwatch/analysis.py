from __future__ import annotations

import hashlib
import json
import math
from importlib import metadata

import numpy as np

from . import wording
from .stats import quality, replay, seasonal, verdict as verdicts
from .stats.detectability import years_needed
from .stats.series import MonthlySeries, trim_to_usable_years
from .stats.shape import curvature_check

SCHEMA = "longwatch.record/2"
DECADE = 10.0

METHODS = {
    "seasonal_adjustment": "Each calendar month's mean over the analysed record is subtracted to form anomalies. Replay frames use only the months available by that frame's end year.",
    "robust_rate": "Theil–Sen median of pairwise slopes, with Sen's rank-based 95% interval widened for autocorrelation.",
    "rank_test": "Mann–Kendall test with the Hamed–Rao (1998) variance correction, using an AR(1) model of the rank autocorrelation of the detrended series.",
    "least_squares_test": "Ordinary least-squares slope with standard error and t-test based on the effective sample size n(1−r₁)/(1+r₁), after Santer et al. (2008). r₁ is the lag-1 autocorrelation of the residuals with the small-sample bias correction r₁ + (1 + 4r₁)/n.",
    "verdict_rule": "Detected: both tests p < 0.05 with the same sign. Suggestive: one test p < 0.05, or both p < 0.10. Otherwise not detectable yet. Not enough data: fewer than 10 usable years or under 90% of months.",
    "null_hypothesis": "No linear trend in the deseasonalised record; departures from the seasonal cycle follow an AR(1) process. The alternative is a non-zero linear trend, with direction reported separately.",
    "detection_year": "Retrospective sustained detection. Earliest record endpoint from which the Detected rule holds at that endpoint and every later one. Identified in hindsight from the full record; not a prospective stopping rule. It exists only when the full-record test is itself Detected, so the yearly looks do not add false detections. A date held for fewer than 5 years is marked provisional. It depends on the year the record starts.",
    "start_year_sensitivity": "The full analysis repeated on the same record with the start moved forward in 5-year steps, down to 15 years. Each window uses its own seasonal means.",
    "power_under_assumption": "Chance that a least-squares trend test at the 5% level detects a steady linear rate ω in n years of monthly data with AR(1) noise: Φ(|ω|/σ_ω − 1.96) + Φ(−|ω|/σ_ω − 1.96), with σ_ω = (σ_N / n^1.5) √((1+φ)/(1−φ)). Evaluated at the least-squares rate and at both ends of its 95% interval. When that interval includes zero, the weak end is a true rate of zero or of the opposite sign, for which the chance of detecting the fitted direction never rises above the false-alarm level, so no record length is given.",
    "years_needed": "A conditional planning figure, not a forecast. Weatherhead et al. (1998): n* = [(3.3 σ_N / |ω|) √((1+φ)/(1−φ))]^(2/3) years for a 90% chance of detection at the 95% level, with σ_N the monthly noise standard deviation, ω the least-squares rate per year and φ the lag-1 autocorrelation.",
    "significance_level": 0.05,
}


def software_versions() -> dict:
    return {name: metadata.version(name) for name in ("numpy", "scipy", "pymannkendall")}


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, np.ndarray):
        return [clean(v) for v in value.tolist()]
    if isinstance(value, (np.floating, float)):
        number = float(value)
        return number if math.isfinite(number) else None
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.bool_):
        return bool(value)
    return value


def _rank_block(rank) -> dict:
    return {
        "slope": rank.slope * DECADE,
        "ci_low": rank.ci_low * DECADE,
        "ci_high": rank.ci_high * DECADE,
        "slope_per_year": rank.slope,
        "intercept": rank.intercept,
        "tau": rank.tau,
        "p_naive": rank.p_naive,
        "p_adjusted": rank.p_adjusted,
        "variance_inflation": rank.variance_inflation,
    }


def _ls_block(ls) -> dict:
    return {
        "slope": ls.slope * DECADE,
        "ci_low": ls.ci_low * DECADE,
        "ci_high": ls.ci_high * DECADE,
        "slope_per_year": ls.slope,
        "intercept": ls.intercept,
        "p_naive": ls.p_naive,
        "p_adjusted": ls.p_adjusted,
        "r1": ls.r1,
        "r1_corrected": ls.r1_corrected,
        "n": ls.n,
        "n_effective": ls.n_effective,
        "residual_sd": ls.residual_sd,
    }


def _frame_block(frame: dict) -> dict:
    block = {
        "end_year": frame["end_year"],
        "years_watched": frame["years_watched"],
        "valid_months": frame["valid_months"],
        "sufficient": frame["sufficient"],
        "verdict": frame["verdict"],
    }
    if frame["sufficient"]:
        block.update(
            climatology=frame["climatology"],
            rank=_rank_block(frame["rank"]),
            least_squares=_ls_block(frame["least_squares"]),
        )
    else:
        block["reason"] = frame["reason"]
    return block


def analyse(series: MonthlySeries, case: dict, provenance: dict) -> dict:
    series = trim_to_usable_years(series)
    coverage = quality.assess(series)
    record: dict = {
        "schema": SCHEMA,
        "case": case,
        "coverage": coverage.as_dict(),
        "series": {"years": series.years, "months": series.months, "raw": series.values},
    }
    result = None
    if coverage.sufficient:
        frames = replay.expanding_frames(series)
        final = frames[-1]
        ls, rank = final["least_squares"], final["rank"]
        detection = replay.detection_summary(frames)
        verdict = final["verdict"]
        needed = years_needed(ls, coverage.span_years, rank.slope).as_dict()
        result = {
            "verdict": verdict,
            "rank": _rank_block(rank),
            "least_squares": _ls_block(ls),
            "shape": curvature_check(series.time, final["anomalies"]),
            "detection": detection,
            "years_needed": needed,
            "start_year_sensitivity": replay.start_year_sensitivity(series),
        }
        record["series"]["climatology"] = final["climatology"]
        record["series"]["anomalies"] = final["anomalies"]
        record["replay"] = {"frames": [_frame_block(f) for f in frames]}
    else:
        clim = seasonal.climatology(series) if len(series.values) else np.full(12, np.nan)
        record["series"]["climatology"] = clim
        record["series"]["anomalies"] = seasonal.anomalies(series, clim) if len(series.values) else []
        record["replay"] = {"frames": []}
    record["result"] = result
    record["provenance"] = {
        **provenance,
        "analysis_window": (
            f"{coverage.first_year}-01 to {coverage.last_year}-12" if coverage.first_year is not None else None
        ),
        "months_expected": coverage.expected_months,
        "months_used": coverage.valid_months,
        "months_missing": coverage.missing_months,
        "series_sha256": hashlib.sha256(
            json.dumps(
                [series.years.tolist(), series.months.tolist(), [None if not math.isfinite(v) else float(v) for v in series.values]]
            ).encode()
        ).hexdigest(),
        "methods": METHODS,
        "software": software_versions(),
    }
    record = clean(record)
    record["text"] = wording.compose(record["case"], record["coverage"], record["result"])
    digest = hashlib.sha256(
        json.dumps([record["case"], record["series"]["raw"], record["result"]], sort_keys=True).encode()
    ).hexdigest()
    record["id"] = digest[:12]
    return record


def series_from_record(record: dict) -> MonthlySeries:
    snapshot = record["series"]
    values = np.array([np.nan if v is None else float(v) for v in snapshot["raw"]], dtype=float)
    return MonthlySeries(np.array(snapshot["years"], int), np.array(snapshot["months"], int), values)


def compare_results(original: dict, rerun: dict, tolerance: float = 1e-9) -> list[str]:
    differences: list[str] = []

    def walk(a, b, path: str) -> None:
        if isinstance(a, dict) and isinstance(b, dict):
            for key in sorted(set(a) | set(b)):
                walk(a.get(key), b.get(key), f"{path}.{key}" if path else key)
        elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
            for index, (x, y) in enumerate(zip(a, b)):
                walk(x, y, f"{path}[{index}]")
        elif isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
            if abs(a - b) > tolerance * max(1.0, abs(a), abs(b)):
                differences.append(path)
        elif a != b:
            differences.append(path)

    walk(original.get("result"), rerun.get("result"), "result")
    walk(original.get("replay"), rerun.get("replay"), "replay")
    return differences
