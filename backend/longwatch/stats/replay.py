from __future__ import annotations

import numpy as np

from . import quality, seasonal, verdict as verdicts
from .series import MonthlySeries
from .trend import least_squares_ar1, rank_trend

FIRST_ENDPOINT_AFTER_YEARS = quality.MIN_YEARS
PROVISIONAL_BELOW_YEARS = 5


def frame_for(series: MonthlySeries) -> dict:
    coverage = quality.assess(series)
    base = {
        "end_year": series.last_year,
        "years_watched": coverage.span_years,
        "valid_months": coverage.valid_months,
        "sufficient": coverage.sufficient,
    }
    if not coverage.sufficient:
        return {**base, "verdict": verdicts.NOT_ENOUGH_DATA, "reason": coverage.reason}
    clim = seasonal.climatology(series)
    anomaly = seasonal.anomalies(series, clim)
    t = series.time
    ls = least_squares_ar1(t, anomaly)
    rank = rank_trend(t, anomaly)
    verdict = verdicts.classify(rank.p_adjusted, ls.p_adjusted, rank.slope, ls.slope)
    return {
        **base,
        "climatology": clim,
        "anomalies": anomaly,
        "least_squares": ls,
        "rank": rank,
        "verdict": verdict,
    }


def expanding_frames(series: MonthlySeries) -> list[dict]:
    first_end = series.first_year + FIRST_ENDPOINT_AFTER_YEARS - 1
    return [frame_for(series.through(end)) for end in range(first_end, series.last_year + 1)]


SENSITIVITY_STEP_YEARS = 5
SENSITIVITY_MIN_YEARS = 15


def start_year_sensitivity(series: MonthlySeries) -> list[dict]:
    rows = []
    start = series.first_year
    while series.last_year - start + 1 >= SENSITIVITY_MIN_YEARS:
        frame = frame_for(series.between(start, series.last_year))
        if frame["sufficient"]:
            rows.append(
                {
                    "start_year": start,
                    "years": frame["years_watched"],
                    "slope": frame["rank"].slope * 10.0,
                    "ci_low": frame["rank"].ci_low * 10.0,
                    "ci_high": frame["rank"].ci_high * 10.0,
                    "verdict": frame["verdict"],
                }
            )
        start += SENSITIVITY_STEP_YEARS
    return rows


def detection_summary(frames: list[dict]) -> dict:
    states = [f["verdict"] if verdicts.is_detected(f["verdict"]) else None for f in frames]
    first_crossing = next((f["end_year"] for f, s in zip(frames, states) if s), None)
    lapses = sum(1 for a, b in zip(states, states[1:]) if a and not b)
    runs: list[dict] = []
    for frame, state in zip(frames, states):
        if state is None:
            continue
        if runs and runs[-1]["verdict"] == state and runs[-1]["to"] == frame["end_year"] - 1:
            runs[-1]["to"] = frame["end_year"]
        else:
            runs.append({"from": frame["end_year"], "to": frame["end_year"], "verdict": state})
    final = states[-1] if states else None
    detection_year = None
    if final:
        index = len(states) - 1
        while index > 0 and states[index - 1] == final:
            index -= 1
        detection_year = frames[index]["end_year"]
    held = frames[-1]["end_year"] - detection_year + 1 if detection_year is not None else None
    return {
        "detection_year": detection_year,
        "years_held": held,
        "provisional": held is not None and held < PROVISIONAL_BELOW_YEARS,
        "record_start_year": frames[0]["end_year"] - frames[0]["years_watched"] + 1 if frames else None,
        "years_watched_at_detection": (
            next(f["years_watched"] for f in frames if f["end_year"] == detection_year)
            if detection_year is not None
            else None
        ),
        "at_first_endpoint": detection_year is not None and detection_year == frames[0]["end_year"],
        "first_crossing_year": first_crossing,
        "lapses": lapses,
        "runs": runs,
        "endpoints_tested": len(frames),
        "rule": (
            "Sustained detection is dated to the earliest record endpoint from which both autocorrelation-aware "
            "tests reject no-trend at the 5% level, in the same direction, at that endpoint and every later one. "
            "It is identified in hindsight from the full record and is not a prospective stopping rule."
        ),
    }
