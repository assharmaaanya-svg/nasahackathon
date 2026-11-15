from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import cases, giovanni, power
from .analysis import SCHEMA, analyse, compare_results, series_from_record
from .catalog import REGIONS, VARIABLES

ROOT = Path(__file__).resolve().parent.parent.parent
FRONTEND = Path(os.environ.get("LONGWATCH_FRONTEND", ROOT / "frontend" / "dist")).resolve()
VALIDATION = ROOT / "docs" / "validation_results.json"
DETECTABILITY = ROOT / "docs" / "detectability_curve.json"
CROSSCHECK = ROOT / "docs" / "madrid_crosscheck.json"

app = FastAPI(title="The Long Watch", version="1.0.0")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/catalog")
def catalog() -> dict:
    return cases.catalogue()


@app.get("/api/analyze")
def analyze(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    variable: str = Query(),
    name: str | None = Query(default=None, max_length=80),
) -> dict:
    if variable not in VARIABLES or not VARIABLES[variable].live:
        raise HTTPException(404, f"'{variable}' is not a live NASA POWER question.")
    try:
        return cases.power_case(latitude, longitude, variable, name)
    except power.PowerUnavailable as error:
        raise HTTPException(
            502,
            {
                "step": "Retrieving the monthly record from NASA POWER",
                "cause": str(error),
                "advice": "NASA POWER could not be reached and this location has not been retrieved before. The 22 cities in the index are stored with the application and still work.",
            },
        )


@app.get("/api/region/{region_id}")
def region(region_id: str) -> dict:
    if region_id not in {r.id for r in REGIONS}:
        raise HTTPException(404, "Unknown region.")
    try:
        return cases.region_case(region_id)
    except giovanni.GiovanniFileError as error:
        raise HTTPException(404, {"step": "Reading the Giovanni export", "cause": str(error), "advice": None})


MAX_SNAPSHOT_MONTHS = 1200


def check_snapshot(record: dict) -> None:
    snapshot = record["series"]
    years, months, raw = snapshot["years"], snapshot["months"], snapshot["raw"]
    if not (isinstance(years, list) and isinstance(months, list) and isinstance(raw, list)):
        raise ValueError("series must hold lists of years, months and values")
    if not (len(years) == len(months) == len(raw)) or len(years) > MAX_SNAPSHOT_MONTHS or len(years) % 12:
        raise ValueError("series must hold whole years of monthly values, at most 100 years")
    for index, (year, month) in enumerate(zip(years, months)):
        if not isinstance(year, int) or not isinstance(month, int):
            raise ValueError("years and months must be integers")
        if month != index % 12 + 1 or year != years[0] + index // 12 or not 1800 <= year <= 2200:
            raise ValueError("series must be a continuous monthly calendar starting in January")
    if any(value is not None and not isinstance(value, (int, float)) for value in raw):
        raise ValueError("values must be numbers or null")
    variable = record["case"]["variable"]
    if not isinstance(variable.get("decimals"), int) or not 0 <= variable["decimals"] <= 6:
        raise ValueError("variable.decimals must be between 0 and 6")
    if not isinstance(record.get("provenance"), dict):
        raise ValueError("provenance must be an object")


@app.post("/api/rerun")
def rerun(record: dict = Body(...)) -> dict:
    if record.get("schema") != SCHEMA:
        raise HTTPException(422, f"This file is not a {SCHEMA} record.")
    try:
        check_snapshot(record)
        series = series_from_record(record)
        provenance = {
            key: record["provenance"].get(key)
            for key in (
                "source",
                "source_kind",
                "product",
                "parameter",
                "units_reported",
                "request_url",
                "retrieved_at",
                "fill_value",
                "fill_values_dropped",
                "preprocessing",
                "valid_days_by_month",
            )
        }
        provenance["served_from"] = "record snapshot"
        fresh = analyse(series, record["case"], provenance)
    except (KeyError, TypeError, ValueError, AttributeError, IndexError) as error:
        raise HTTPException(422, f"The record could not be read: {error}")
    differences = compare_results(record, fresh)
    return {"record": fresh, "reproduced": not differences, "differences": differences[:20]}


@app.get("/api/validation")
def validation() -> dict:
    if not VALIDATION.exists():
        raise HTTPException(404, "The validation experiments have not been run in this build.")
    report = json.loads(VALIDATION.read_text())
    report["detectability"] = json.loads(DETECTABILITY.read_text()) if DETECTABILITY.exists() else None
    report["madrid_crosscheck"] = json.loads(CROSSCHECK.read_text()) if CROSSCHECK.exists() else None
    return report


@app.api_route("/api/{rest:path}", methods=["GET", "POST"], include_in_schema=False)
def unknown_api(rest: str) -> None:
    raise HTTPException(404, f"No such endpoint: /api/{rest}")


if (FRONTEND / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND / "assets"), name="assets")

if FRONTEND.exists():

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        candidate = (FRONTEND / path).resolve()
        if path and candidate.is_file() and FRONTEND in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(FRONTEND / "index.html")
