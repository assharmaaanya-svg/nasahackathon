import json
import sys
from pathlib import Path

import httpx
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from longwatch.cases import power_case
from longwatch.stats import seasonal
from longwatch.stats.series import from_mapping
from longwatch.stats.trend import least_squares_ar1, rank_trend

LAT, LON = 28.61, 77.21
SEASONS = {"winter (DJF)": (12, 1, 2), "pre-monsoon (MAM)": (3, 4, 5), "monsoon (JJAS)": (6, 7, 8, 9), "post-monsoon (ON)": (10, 11)}


def summarise(series):
    anomaly = seasonal.anomalies(series)
    ls = least_squares_ar1(series.time, anomaly)
    rank = rank_trend(series.time, anomaly)
    return {
        "theil_sen_per_decade": rank.slope * 10,
        "interval_per_decade": [rank.ci_low * 10, rank.ci_high * 10],
        "p_rank_adjusted": rank.p_adjusted,
        "p_rank_naive": rank.p_naive,
        "least_squares_per_decade": ls.slope * 10,
        "p_least_squares_adjusted": ls.p_adjusted,
        "p_least_squares_naive": ls.p_naive,
        "lag1_autocorrelation": ls.r1,
        "effective_months": ls.n_effective,
        "months": ls.n,
    }


def fetch(parameters, lat, lon):
    url = (
        "https://power.larc.nasa.gov/api/temporal/monthly/point"
        f"?parameters={parameters}&community=AG&longitude={lon}&latitude={lat}&format=JSON&start=1981&end=2025"
    )
    body = httpx.get(url, timeout=40).json()
    out = {}
    for name, raw in body["properties"]["parameter"].items():
        obs = {(int(k[:4]), int(k[4:])): float(v) for k, v in raw.items() if int(k[4:]) <= 12 and float(v) != -999.0}
        out[name] = from_mapping(obs)
    return url, out


record = power_case(LAT, LON, "temperature", "Delhi")
report = {
    "question": "Is the non-detection of a temperature trend at Delhi in MERRA-2 (via NASA POWER) a processing error?",
    "primary": {
        "request_url": record["provenance"]["request_url"],
        "units": record["provenance"]["units_reported"],
        "window": record["provenance"]["analysis_window"],
        "months_used": record["provenance"]["months_used"],
        "months_missing": record["provenance"]["months_missing"],
        "fill_values_dropped": record["provenance"]["fill_values_dropped"],
        "verdict": record["result"]["verdict"],
        "rank": record["result"]["rank"],
        "least_squares": record["result"]["least_squares"],
        "shape": record["result"]["shape"],
    },
}

url, related = fetch("T2M,T2M_MAX,T2M_MIN,TS", LAT, LON)
report["related_parameters_same_cell"] = {"request_url": url, **{name: summarise(series) for name, series in related.items()}}

t2m = related["T2M"]
report["by_season"] = {}
for name, months in SEASONS.items():
    by_year = {}
    for year in np.unique(t2m.years):
        chunk = t2m.values[(t2m.years == year) & np.isin(t2m.months, months)]
        by_year[int(year)] = float(chunk.mean())
    years = np.array(sorted(by_year), dtype=float)
    values = np.array([by_year[int(y)] for y in years])
    ls = least_squares_ar1(years, values)
    report["by_season"][name] = {"least_squares_per_decade": ls.slope * 10, "p_adjusted": ls.p_adjusted, "interval_per_decade": [ls.ci_low * 10, ls.ci_high * 10]}

report["by_period"] = {}
for start, end in ((1981, 2002), (2003, 2025)):
    report["by_period"][f"{start}-{end}"] = summarise(t2m.between(start, end))

report["neighbouring_cells"] = {}
for dlat, dlon, label in ((0.5, 0, "north"), (-0.5, 0, "south"), (0, 0.625, "east"), (0, -0.625, "west")):
    _, cell = fetch("T2M", LAT + dlat, LON + dlon)
    report["neighbouring_cells"][label] = summarise(cell["T2M"])

report["independent_dataset"] = (
    "Not compared. This build environment can reach only power.larc.nasa.gov, and every temperature parameter served "
    "there comes from MERRA-2. A check against a station-based product such as GISTEMP or Berkeley Earth remains to be done."
)
out = Path(__file__).resolve().parent.parent.parent / "docs" / "delhi_audit.json"
out.write_text(json.dumps(report, indent=1))
print(json.dumps({k: v for k, v in report.items() if k != "primary"}, indent=1))
print(json.dumps(report["primary"]["rank"]), json.dumps(report["primary"]["least_squares"]))
