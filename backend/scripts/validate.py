import json
import sys
import time
from datetime import datetime, timezone
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pymannkendall as mk

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from longwatch.analysis import software_versions
from longwatch.stats import replay, seasonal
from longwatch.stats.detectability import detection_probability, weatherhead_years, years_needed
from longwatch.stats.shape import curvature_check
from longwatch.stats.series import MonthlySeries
from longwatch.stats.trend import least_squares_ar1, rank_trend
from longwatch.stats.verdict import classify, is_detected

SEED = 20261114
RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
REPLAY_RUNS = max(RUNS // 2, 50)


def ar1(n, phi, rng, sd=1.0):
    innovations = rng.standard_normal(n + 300) * sd * np.sqrt(1 - phi**2)
    x = np.zeros(n + 300)
    for i in range(1, n + 300):
        x[i] = phi * x[i - 1] + innovations[i]
    return x[300:]


def monthly_time(n, start=1981):
    return start + (np.arange(n) + 0.5) / 12


def false_positive(args):
    n, phi, index = args
    rng = np.random.default_rng([SEED, 1, index])
    t = monthly_time(n)
    hits = dict.fromkeys(
        ["least_squares_naive", "mann_kendall_naive", "hamed_rao_library", "least_squares_ar1", "mann_kendall_ar1", "detected_verdict"], 0
    )
    for _ in range(RUNS):
        y = ar1(n, phi, rng)
        ls = least_squares_ar1(t, y)
        rank = rank_trend(t, y)
        hits["least_squares_naive"] += ls.p_naive < 0.05
        hits["mann_kendall_naive"] += rank.p_naive < 0.05
        hits["hamed_rao_library"] += mk.hamed_rao_modification_test(y).p < 0.05
        hits["least_squares_ar1"] += ls.p_adjusted < 0.05
        hits["mann_kendall_ar1"] += rank.p_adjusted < 0.05
        hits["detected_verdict"] += is_detected(classify(rank.p_adjusted, ls.p_adjusted, rank.slope, ls.slope))
    return {"months": n, "phi": phi, "runs": RUNS, **{k: v / RUNS for k, v in hits.items()}}


def recovery(args):
    phi, missing, truth, sd, index = args
    rng = np.random.default_rng([SEED, 2, index])
    n = 480
    years = np.repeat(np.arange(1981, 2021), 12)
    months = np.tile(np.arange(1, 13), 40)
    t = monthly_time(n)
    true_slope = truth
    cycle = 8.0 * np.sin(2 * np.pi * (months - 1) / 12)
    ls_est, ts_est, ls_cover, ts_cover = [], [], 0, 0
    for _ in range(RUNS):
        y = 15 + cycle + true_slope * (t - t[0]) + ar1(n, phi, rng, sd)
        if missing:
            y[rng.choice(n, int(n * missing), replace=False)] = np.nan
        series = MonthlySeries(years, months, y)
        anomaly = seasonal.anomalies(series)
        ls = least_squares_ar1(t, anomaly)
        rank = rank_trend(t, anomaly)
        ls_est.append(ls.slope)
        ts_est.append(rank.slope)
        ls_cover += ls.ci_low <= true_slope <= ls.ci_high
        ts_cover += rank.ci_low <= true_slope <= rank.ci_high
    return {
        "phi": phi,
        "missing_fraction": missing,
        "noise_sd": sd,
        "runs": RUNS,
        "true_slope_per_decade": true_slope * 10,
        "least_squares_mean_per_decade": float(np.mean(ls_est) * 10),
        "theil_sen_mean_per_decade": float(np.mean(ts_est) * 10),
        "least_squares_interval_coverage": ls_cover / RUNS,
        "theil_sen_interval_coverage": ts_cover / RUNS,
    }


def detection_rate(years, slope, sd, phi, rng, runs):
    n = int(round(years * 12))
    t = monthly_time(n)
    hits = 0
    for _ in range(runs):
        y = slope * (t - t[0]) + ar1(n, phi, rng, sd)
        hits += least_squares_ar1(t, y).p_adjusted < 0.05
    return hits / runs


def weatherhead_check(args):
    slope, sd, phi, index = args
    rng = np.random.default_rng([SEED, 3, index])
    formula = weatherhead_years(slope, sd, phi)
    at_formula = detection_rate(formula, slope, sd, phi, rng, RUNS)
    lo, hi = formula * 0.5, formula * 1.6
    for _ in range(7):
        mid = (lo + hi) / 2
        if detection_rate(mid, slope, sd, phi, rng, max(RUNS // 2, 100)) >= 0.90:
            hi = mid
        else:
            lo = mid
    simulated = (lo + hi) / 2
    return {
        "slope_per_decade": slope * 10,
        "noise_sd": sd,
        "phi": phi,
        "runs": RUNS,
        "formula_years": formula,
        "detection_probability_at_formula_years": at_formula,
        "simulated_years_for_90_percent": simulated,
        "formula_over_simulated": formula / simulated,
    }


def power_by_length(args):
    slope, sd, phi, index = args
    rng = np.random.default_rng([SEED, 7, index])
    rows = []
    for years in (15, 25, 35, 45, 60):
        n = years * 12
        t = monthly_time(n)
        hits = 0
        for _ in range(RUNS):
            y = slope * (t - t[0]) + ar1(n, phi, rng, sd)
            ls = least_squares_ar1(t, y)
            rank = rank_trend(t, y)
            hits += is_detected(classify(rank.p_adjusted, ls.p_adjusted, rank.slope, ls.slope))
        rows.append(
            {
                "years": years,
                "detected_share": hits / RUNS,
                "formula_probability": detection_probability(slope, sd, phi, years),
            }
        )
    return {"slope_per_decade": slope * 10, "noise_sd": sd, "phi": phi, "runs": RUNS, "by_length": rows}


def stress(args):
    name, index = args
    rng = np.random.default_rng([SEED, 8, index])
    n = 540
    t = monthly_time(n)
    months = np.tile(np.arange(1, 13), n // 12)
    detected = rising = falling = curved = reverses = 0
    for _ in range(RUNS):
        if name == "ar2_null":
            e = rng.standard_normal(n + 50)
            y = np.zeros(n + 50)
            for i in range(2, n + 50):
                y[i] = 0.5 * y[i - 1] + 0.25 * y[i - 2] + e[i]
            y = y[50:]
        elif name == "arma11_null":
            e = rng.standard_normal(n + 50)
            y = np.zeros(n + 50)
            for i in range(1, n + 50):
                y[i] = 0.6 * y[i - 1] + e[i] + 0.4 * e[i - 1]
            y = y[50:]
        elif name == "variance_doubles_null":
            y = ar1(n, 0.3, rng) * np.linspace(1.0, 2.0, n)
        elif name == "seasonal_variance_null":
            y = ar1(n, 0.3, rng) * (1.0 + 0.6 * np.cos(2 * np.pi * (months - 1) / 12))
        elif name == "three_year_gap_null":
            y = ar1(n, 0.3, rng)
            y[240:276] = np.nan
        elif name == "skewed_null":
            y = np.exp(0.8 * ar1(n, 0.3, rng))
        elif name == "step_up_midway":
            y = ar1(n, 0.3, rng)
            y[n // 2 :] += 0.5
        elif name == "rise_then_fall":
            y = ar1(n, 0.3, rng) + 1.2 * (1 - np.abs(np.linspace(-1, 1, n)))
        elif name == "rise_then_flat":
            y = ar1(n, 0.3, rng) + np.minimum(np.linspace(0, 2, n), 1.0)
        else:
            raise ValueError(name)
        ls = least_squares_ar1(t, y)
        rank = rank_trend(t, y)
        verdict = classify(rank.p_adjusted, ls.p_adjusted, rank.slope, ls.slope)
        hit = is_detected(verdict)
        detected += hit
        rising += hit and rank.slope > 0
        falling += hit and rank.slope < 0
        shape = curvature_check(t, y)
        curved += shape["curved"]
        reverses += shape["reverses"]
    return {
        "case": name,
        "runs": RUNS,
        "months": n,
        "detected_share": detected / RUNS,
        "detected_rising_share": rising / RUNS,
        "detected_falling_share": falling / RUNS,
        "straight_line_note_share": curved / RUNS,
        "reversal_warning_share": reverses / RUNS,
    }


def synthetic_series(n_years, slope, sd, phi, rng):
    n = n_years * 12
    years = np.repeat(np.arange(1981, 1981 + n_years), 12)
    months = np.tile(np.arange(1, 13), n_years)
    t = monthly_time(n)
    cycle = 5.0 * np.cos(2 * np.pi * (months - 1) / 12)
    return MonthlySeries(years, months, cycle + slope * (t - t[0]) + ar1(n, phi, rng, sd))


def replay_null(args):
    phi, index = args
    rng = np.random.default_rng([SEED, 4, index])
    persistent = any_crossing = 0
    for _ in range(REPLAY_RUNS):
        frames = replay.expanding_frames(synthetic_series(45, 0.0, 1.0, phi, rng))
        summary = replay.detection_summary(frames)
        persistent += summary["detection_year"] is not None
        any_crossing += summary["first_crossing_year"] is not None
    return {
        "phi": phi,
        "record_years": 45,
        "endpoints_per_run": 36,
        "runs": REPLAY_RUNS,
        "false_detection_year_rate": persistent / REPLAY_RUNS,
        "any_endpoint_crossing_rate": any_crossing / REPLAY_RUNS,
    }


def replay_trend(args):
    slope, sd, phi, index = args
    rng = np.random.default_rng([SEED, 5, index])
    formula = weatherhead_years(slope, sd, phi)
    watched = []
    undetected = 0
    for _ in range(REPLAY_RUNS):
        frames = replay.expanding_frames(synthetic_series(45, slope, sd, phi, rng))
        summary = replay.detection_summary(frames)
        if summary["detection_year"] is None:
            undetected += 1
        else:
            watched.append(summary["years_watched_at_detection"])
    watched = np.array(watched, dtype=float)
    return {
        "slope_per_decade": slope * 10,
        "noise_sd": sd,
        "phi": phi,
        "runs": REPLAY_RUNS,
        "weatherhead_years_90_percent": formula,
        "detected_within_45_years": 1 - undetected / REPLAY_RUNS,
        "median_years_watched_at_detection": float(np.median(watched)) if len(watched) else None,
        "p10_years_watched": float(np.percentile(watched, 10)) if len(watched) else None,
        "p90_years_watched": float(np.percentile(watched, 90)) if len(watched) else None,
        "share_detected_by_weatherhead_years": float((watched <= formula).sum() / REPLAY_RUNS),
        "share_within_3_years_of_weatherhead": float((np.abs(watched - formula) <= 3).sum() / REPLAY_RUNS),
    }


def estimate_from_partial(args):
    slope, sd, phi, index = args
    rng = np.random.default_rng([SEED, 6, index])
    truth = weatherhead_years(slope, sd, phi)
    record_years = max(int(truth * 0.6), 10)
    n = record_years * 12
    t = monthly_time(n)
    ratios = []
    refused = already = 0
    for _ in range(RUNS):
        y = slope * (t - t[0]) + ar1(n, phi, rng, sd)
        ls = least_squares_ar1(t, y)
        rank = rank_trend(t, y)
        if is_detected(classify(rank.p_adjusted, ls.p_adjusted, rank.slope, ls.slope)):
            already += 1
            continue
        estimate = years_needed(ls, record_years, rank.slope)
        if not estimate.available:
            refused += 1
            continue
        ratios.append(estimate.total_years / truth)
    ratios = np.array(ratios)
    return {
        "slope_per_decade": slope * 10,
        "noise_sd": sd,
        "phi": phi,
        "runs": RUNS,
        "record_years": record_years,
        "true_weatherhead_years": truth,
        "already_detected_share": already / RUNS,
        "estimate_refused_share": refused / RUNS,
        "estimate_given_share": len(ratios) / RUNS,
        "median_estimate_over_truth": float(np.median(ratios)) if len(ratios) else None,
        "p10_estimate_over_truth": float(np.percentile(ratios, 10)) if len(ratios) else None,
        "p90_estimate_over_truth": float(np.percentile(ratios, 90)) if len(ratios) else None,
        "share_within_20_percent": float((np.abs(ratios - 1) <= 0.2).mean()) if len(ratios) else None,
    }


if __name__ == "__main__":
    started = time.time()
    fp_jobs = [(n, phi, i) for i, (n, phi) in enumerate((n, phi) for n in (120, 252, 540) for phi in (0.0, 0.3, 0.6, 0.8))]
    rec_cases = [
        (0.0, 0.0, 0.03, 1.0), (0.3, 0.0, 0.03, 1.0), (0.6, 0.0, 0.03, 1.0), (0.3, 0.08, 0.03, 1.0), (0.6, 0.08, 0.03, 1.0), (0.8, 0.0, 0.03, 1.0),
        (0.3, 0.0, -0.03, 1.0), (0.6, 0.0, -0.03, 1.0), (0.3, 0.0, 0.03, 0.3), (0.3, 0.0, 0.03, 3.0), (0.3, 0.0, 0.002, 1.0), (0.3, 0.2, 0.03, 1.0),
    ]
    rec_jobs = [(*case, i) for i, case in enumerate(rec_cases)]
    power_jobs = [(*case, i) for i, case in enumerate([(0.03, 1.0, 0.0), (0.03, 1.0, 0.3), (0.03, 1.0, 0.6), (-0.03, 1.0, 0.3), (0.05, 1.0, 0.3), (0.02, 0.5, 0.5), (0.03, 2.0, 0.3)])]
    stress_names = ["ar2_null", "arma11_null", "variance_doubles_null", "seasonal_variance_null", "three_year_gap_null", "skewed_null", "step_up_midway", "rise_then_fall", "rise_then_flat"]
    stress_jobs = [(name, i) for i, name in enumerate(stress_names)]
    wh_cases = [(0.03, 1.0, 0.0), (0.03, 1.0, 0.3), (0.03, 1.0, 0.6), (0.05, 1.0, 0.3), (0.02, 0.5, 0.5), (0.03, 1.0, 0.8)]
    wh_jobs = [(*case, i) for i, case in enumerate(wh_cases)]
    null_jobs = [(phi, i) for i, phi in enumerate((0.0, 0.3, 0.6, 0.8))]
    trend_jobs = [(*case, i) for i, case in enumerate([(0.03, 1.0, 0.3), (0.05, 1.0, 0.3), (0.03, 1.0, 0.6)])]
    with Pool() as pool:
        async_results = {
            "false_positive_rates": pool.map_async(false_positive, fp_jobs),
            "trend_recovery": pool.map_async(recovery, rec_jobs),
            "years_needed_formula": pool.map_async(weatherhead_check, wh_jobs),
            "replay_under_no_trend": pool.map_async(replay_null, null_jobs),
            "replay_with_trend": pool.map_async(replay_trend, trend_jobs),
            "years_needed_from_partial_records": pool.map_async(estimate_from_partial, wh_jobs),
            "power_by_record_length": pool.map_async(power_by_length, power_jobs),
            "stress_tests": pool.map_async(stress, stress_jobs),
        }
        results = {name: handle.get() for name, handle in async_results.items()}
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED,
        "runs_per_configuration": RUNS,
        "replay_runs_per_configuration": REPLAY_RUNS,
        "software": software_versions(),
        "runtime_seconds": round(time.time() - started),
        **results,
    }
    out = Path(__file__).resolve().parent.parent.parent / "docs" / (sys.argv[2] if len(sys.argv) > 2 else "validation_results.json")
    out.write_text(json.dumps(output, indent=1))
    print(f"wrote {out} in {output['runtime_seconds']} s")
