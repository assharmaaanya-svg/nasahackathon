import json
import sys
from datetime import datetime, timezone
from multiprocessing import Pool
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from longwatch import cases
from longwatch.analysis import software_versions
from longwatch.stats import replay
from longwatch.stats.detectability import weatherhead_years
from longwatch.stats.series import MonthlySeries
from longwatch.stats.verdict import is_detected

SEED = 20261115
RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 500
MADRID = (40.42, -3.70)
PLANS = {"temperature": (60, 1), "precipitation": (100, 5)}
CHUNKS = 20


def simulate(args):
    variable, slope, sd, phi, horizon, step, record_years, chunk = args
    rng = np.random.default_rng([SEED, sorted(PLANS).index(variable), chunk])
    lengths = list(range(10, horizon + 1, step))
    hits = np.zeros(len(lengths), dtype=int)
    sustained = []
    n = horizon * 12
    years = np.repeat(np.arange(1981, 1981 + horizon), 12)
    months = np.tile(np.arange(1, 13), horizon)
    t = years + (months - 0.5) / 12
    cycle = 5.0 * np.cos(2 * np.pi * (months - 1) / 12)
    runs = RUNS // CHUNKS
    for _ in range(runs):
        noise = np.empty(n)
        shocks = rng.standard_normal(n) * sd * np.sqrt(1 - phi**2)
        noise[0] = rng.standard_normal() * sd
        for i in range(1, n):
            noise[i] = phi * noise[i - 1] + shocks[i]
        series = MonthlySeries(years, months, cycle + slope * (t - t[0]) + noise)
        frames = [replay.frame_for(series.through(1980 + length)) for length in lengths]
        hits += np.array([is_detected(f["verdict"]) for f in frames])
        if step == 1:
            within = [f for f in frames if f["years_watched"] <= record_years]
            sustained.append(replay.detection_summary(within)["years_watched_at_detection"])
    return {"lengths": lengths, "hits": hits.tolist(), "sustained": sustained, "runs": runs}


def first_length(lengths, shares, target):
    return next((length for length, share in zip(lengths, shares) if share >= target), None)


def study(pool, variable):
    record = cases.power_case(*MADRID, variable, "Madrid")
    fit = record["result"]["least_squares"]
    slope, sd, phi = fit["slope_per_year"], fit["residual_sd"], fit["r1_corrected"]
    record_years = record["coverage"]["span_years"]
    horizon, step = PLANS[variable]
    parts = pool.map(simulate, [(variable, slope, sd, phi, horizon, step, record_years, chunk) for chunk in range(CHUNKS)])
    runs = sum(part["runs"] for part in parts)
    lengths = parts[0]["lengths"]
    shares = (np.sum([part["hits"] for part in parts], axis=0) / runs).tolist()
    out = {
        "variable": variable,
        "place": "Madrid",
        "assumed_rate_per_decade": slope * 10,
        "assumed_noise_sd": sd,
        "assumed_autocorrelation": phi,
        "units": record["case"]["variable"]["units"],
        "record_years": record_years,
        "runs": runs,
        "endpoint_step_years": step,
        "curve": [{"years": length, "detected_share": share} for length, share in zip(lengths, shares)],
        "years_for_50_percent": first_length(lengths, shares, 0.5),
        "years_for_80_percent": first_length(lengths, shares, 0.8),
        "years_for_90_percent": first_length(lengths, shares, 0.9),
        "weatherhead_years_90_percent": weatherhead_years(slope, sd, phi),
        "observed_verdict": record["result"]["verdict"],
        "observed_sustained_detection_at_years": record["result"]["detection"]["years_watched_at_detection"],
    }
    sustained = [value for part in parts for value in part["sustained"]]
    if sustained:
        found = np.array([value for value in sustained if value is not None], dtype=float)
        observed = out["observed_sustained_detection_at_years"]
        out["simulated_records_of_same_length"] = {
            "share_with_sustained_detection": len(found) / len(sustained),
            "median_years": float(np.median(found)) if len(found) else None,
            "p10_years": float(np.percentile(found, 10)) if len(found) else None,
            "p90_years": float(np.percentile(found, 90)) if len(found) else None,
            "share_sustained_by_observed_length": (
                float((found <= observed).sum() / len(sustained)) if observed is not None else None
            ),
        }
    return out


if __name__ == "__main__":
    with Pool() as pool:
        studies = [study(pool, variable) for variable in PLANS]
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED,
        "software": software_versions(),
        "note": (
            "Simulated monthly records with a seasonal cycle, a steady linear trend and AR(1) noise, using the rate, "
            "noise and autocorrelation fitted to the real Madrid record. Each is run through the same pipeline as the app."
        ),
        "studies": studies,
    }
    out = Path(__file__).resolve().parent.parent.parent / "docs" / "detectability_curve.json"
    out.write_text(json.dumps(output, indent=1))
    print(json.dumps({k: v for k, v in output.items() if k != "studies"}, indent=1))
    for item in studies:
        print(json.dumps({k: v for k, v in item.items() if k != "curve"}, indent=1))
