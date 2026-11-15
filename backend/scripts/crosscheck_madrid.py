import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from longwatch import cases
from longwatch.stats import replay, seasonal
from longwatch.stats.series import from_mapping
from longwatch.stats.trend import least_squares_ar1, rank_trend

SOURCE_URL = "https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/SP000003195.csv"
STATION = {"id": "SP000003195", "name": "MADRID RETIRO, SP", "latitude": 40.4117, "longitude": -3.6781, "elevation_m": 667.0}
FIRST_YEAR, LAST_YEAR = 1981, 2025
MIN_DAYS = 20
ROOT = Path(__file__).resolve().parent.parent
MONTHLY = ROOT / "data" / "independent" / "madrid_retiro_monthly.csv"
OUT = ROOT.parent / "docs" / "madrid_crosscheck.json"


def monthly_from_daily(path: Path) -> list[dict]:
    buckets = defaultdict(lambda: {"tmax": [], "tmin": [], "mean": []})
    with path.open() as handle:
        for row in csv.DictReader(handle):
            year, month = int(row["DATE"][:4]), int(row["DATE"][5:7])
            if not FIRST_YEAR <= year <= LAST_YEAR:
                continue
            tmax, tmin = row["TMAX"].strip(), row["TMIN"].strip()
            if not tmax or not tmin:
                continue
            if row["TMAX_ATTRIBUTES"].split(",")[1] or row["TMIN_ATTRIBUTES"].split(",")[1]:
                continue
            high, low = int(tmax) / 10.0, int(tmin) / 10.0
            bucket = buckets[(year, month)]
            bucket["tmax"].append(high)
            bucket["tmin"].append(low)
            bucket["mean"].append((high + low) / 2.0)
    rows = []
    for year in range(FIRST_YEAR, LAST_YEAR + 1):
        for month in range(1, 13):
            bucket = buckets.get((year, month), {"tmax": [], "tmin": [], "mean": []})
            days = len(bucket["mean"])
            enough = days >= MIN_DAYS
            rows.append(
                {
                    "year": year,
                    "month": month,
                    "valid_days": days,
                    "tmean_c": round(float(np.mean(bucket["mean"])), 3) if enough else "",
                    "tmax_c": round(float(np.mean(bucket["tmax"])), 3) if enough else "",
                    "tmin_c": round(float(np.mean(bucket["tmin"])), 3) if enough else "",
                }
            )
    return rows


def write_monthly(rows: list[dict]) -> None:
    MONTHLY.parent.mkdir(parents=True, exist_ok=True)
    with MONTHLY.open("w", newline="") as handle:
        handle.write(f"# Madrid Retiro {STATION['id']}, monthly means derived from NOAA GHCN-Daily (station data supplied to GHCN-D by ECA&D)\n")
        handle.write(f"# source: {SOURCE_URL}\n")
        handle.write(f"# daily mean = (TMAX + TMIN) / 2; months with fewer than {MIN_DAYS} valid days left empty; days failing a GHCN-D quality check dropped\n")
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def read_monthly() -> list[dict]:
    with MONTHLY.open() as handle:
        return list(csv.DictReader(line for line in handle if not line.startswith("#")))


def series_of(rows: list[dict], column: str):
    return from_mapping({(int(r["year"]), int(r["month"])): float(r[column]) for r in rows if r[column] != ""})


def summarise(series) -> dict:
    frames = replay.expanding_frames(series)
    final = frames[-1]
    detection = replay.detection_summary(frames)
    rank, ls = final["rank"], final["least_squares"]
    return {
        "first_year": series.first_year,
        "last_year": series.last_year,
        "valid_months": int(final["valid_months"]),
        "verdict": final["verdict"],
        "rate_per_decade": rank.slope * 10,
        "interval_per_decade": [rank.ci_low * 10, rank.ci_high * 10],
        "p_mann_kendall": rank.p_adjusted,
        "p_least_squares": ls.p_adjusted,
        "least_squares_rate_per_decade": ls.slope * 10,
        "lag1_autocorrelation": ls.r1,
        "sustained_detection_from": detection["detection_year"],
        "years_of_record_at_sustained_detection": detection["years_watched_at_detection"],
        "start_year_sensitivity": replay.start_year_sensitivity(series),
    }


if __name__ == "__main__":
    if len(sys.argv) > 1:
        write_monthly(monthly_from_daily(Path(sys.argv[1])))
    rows = read_monthly()
    station = series_of(rows, "tmean_c")
    record = cases.power_case(40.42, -3.70, "temperature", "Madrid")
    snapshot = record["series"]
    merra = from_mapping(
        {(y, m): v for y, m, v in zip(snapshot["years"], snapshot["months"], snapshot["raw"]) if v is not None}
    )
    station_anomaly = seasonal.anomalies(station, seasonal.climatology(station))
    merra_anomaly = seasonal.anomalies(merra, seasonal.climatology(merra))
    lookup = {(int(y), int(m)): a for y, m, a in zip(merra.years, merra.months, merra_anomaly)}
    pairs = [
        (t, a, lookup[(int(y), int(m))])
        for t, y, m, a in zip(station.time, station.years, station.months, station_anomaly)
        if np.isfinite(a) and (int(y), int(m)) in lookup and np.isfinite(lookup[(int(y), int(m))])
    ]
    time = np.array([p[0] for p in pairs])
    difference = np.array([p[1] - p[2] for p in pairs])
    diff_rank = rank_trend(time, difference)
    diff_ls = least_squares_ar1(time, difference)
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "station": STATION,
        "source": "NOAA GHCN-Daily; the Madrid Retiro series is supplied to GHCN-D by the European Climate Assessment & Dataset (source flag E)",
        "source_url": SOURCE_URL,
        "observation_type": "ground station, daily maximum and minimum air temperature",
        "processing": [
            "Daily mean taken as (TMAX + TMIN) / 2, in °C (GHCN-D stores tenths of a degree).",
            "Days failing a GHCN-D quality check dropped.",
            f"Monthly mean over valid days; months with fewer than {MIN_DAYS} valid days left missing.",
            "Then the same pipeline as the application: calendar-month anomalies, Theil–Sen rate, both autocorrelation-aware tests, expanding-record replay.",
        ],
        "window": f"{FIRST_YEAR}-01 to {LAST_YEAR}-12",
        "months_expected": len(rows),
        "station_months_missing": sum(1 for r in rows if r["tmean_c"] == ""),
        "missing_months": [f"{r['year']}-{int(r['month']):02d}" for r in rows if r["tmean_c"] == ""],
        "station_mean": summarise(station),
        "station_daily_maximum": summarise(series_of(rows, "tmax_c")),
        "station_daily_minimum": summarise(series_of(rows, "tmin_c")),
        "merra2_cell": summarise(merra),
        "monthly_anomaly_correlation": float(np.corrcoef([p[1] for p in pairs], [p[2] for p in pairs])[0, 1]),
        "paired_months": len(pairs),
        "station_minus_merra2": {
            "rate_per_decade": diff_rank.slope * 10,
            "interval_per_decade": [diff_rank.ci_low * 10, diff_rank.ci_high * 10],
            "p_mann_kendall": diff_rank.p_adjusted,
            "p_least_squares": diff_ls.p_adjusted,
        },
    }
    OUT.write_text(json.dumps(output, indent=1, default=float))
    brief = {k: v for k, v in output.items() if k not in ("processing",)}
    for key in ("station_mean", "station_daily_maximum", "station_daily_minimum", "merra2_cell"):
        brief[key] = {k: v for k, v in output[key].items() if k != "start_year_sensitivity"}
    print(json.dumps(brief, indent=1, default=float))
    for row in output["station_mean"]["start_year_sensitivity"]:
        print(row["start_year"], round(row["slope"], 2), round(row["ci_low"], 2), round(row["ci_high"], 2), row["verdict"])
