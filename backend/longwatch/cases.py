from __future__ import annotations

from functools import lru_cache

from . import giovanni, power
from .analysis import analyse, clean
from .catalog import PLACES, REGIONS, VARIABLES, grid_cell


def _place_name(latitude: float, longitude: float, name: str | None) -> str:
    if name:
        return name
    for place in PLACES:
        if abs(place.lat - latitude) < 0.005 and abs(place.lon - longitude) < 0.005:
            return place.name
    ns = "N" if latitude >= 0 else "S"
    ew = "E" if longitude >= 0 else "W"
    return f"{abs(latitude):.2f}°{ns}, {abs(longitude):.2f}°{ew}"


def power_case(latitude: float, longitude: float, variable_id: str, name: str | None = None) -> dict:
    variable = VARIABLES[variable_id]
    if not variable.live:
        raise KeyError(variable_id)
    payload = power.fetch_point(latitude, longitude)
    record = _power_record(payload.latitude, payload.longitude, variable_id, payload.retrieved_at)
    record = {**record, "case": {**record["case"], "place": {**record["case"]["place"], "name": _place_name(payload.latitude, payload.longitude, name)}}}
    record["provenance"] = {**record["provenance"], "served_from": payload.served_from}
    from . import wording

    record["text"] = wording.compose(record["case"], record["coverage"], record["result"])
    return record


@lru_cache(maxsize=256)
def _power_record(latitude: float, longitude: float, variable_id: str, retrieved_at: str) -> dict:
    variable = VARIABLES[variable_id]
    payload = power.read_cache(latitude, longitude)
    series, fills = payload.series(variable.parameter)
    before = len(series.values)
    series = series.between(variable.first_year, series.last_year) if before else series
    cell = grid_cell(latitude, longitude, variable.grid)
    case = {
        "kind": "power",
        "place": {
            "name": _place_name(latitude, longitude, None),
            "latitude": latitude,
            "longitude": longitude,
            "footprint": cell,
            "footprint_note": (
                f"One {variable.grid[0]}° × {variable.grid[1]}° grid cell containing this point, "
                "not the city alone."
            ),
        },
        "variable": variable.as_dict(),
    }
    steps = [
        f"Monthly values requested from NASA POWER for {power.FIRST_YEAR} onward; annual-mean entries (month code 13) discarded.",
        f"{fills} value(s) equal to the fill value {payload.fill_value:g} treated as missing; nothing interpolated.",
    ]
    if variable.first_year > power.FIRST_YEAR:
        steps.append(f"Record restricted to {variable.first_year} onward so that a single source is analysed.")
    steps.append("First and last calendar years kept only if at least 9 of their 12 months are present.")
    provenance = {
        "source": variable.source_label,
        "source_kind": variable.source_kind,
        "product": f"NASA POWER Monthly API {payload.api_version}; sources reported by the API: {', '.join(payload.sources)}",
        "parameter": variable.parameter,
        "units_reported": payload.units(variable.parameter),
        "request_url": payload.request_url,
        "retrieved_at": payload.retrieved_at,
        "served_from": payload.served_from,
        "fill_value": payload.fill_value,
        "fill_values_dropped": fills,
        "preprocessing": steps,
    }
    return analyse(series, case, provenance)


@lru_cache(maxsize=8)
def region_case(region_id: str) -> dict:
    region = next(r for r in REGIONS if r.id == region_id)
    export = giovanni.load_region(region)
    variable = VARIABLES["no2"]
    series, counts = export.monthly(variable.scale)
    case = {
        "kind": "giovanni",
        "place": {
            "name": region.name,
            "latitude": (region.south + region.north) / 2,
            "longitude": (region.west + region.east) / 2,
            "footprint": {"west": region.west, "south": region.south, "east": region.east, "north": region.north},
            "footprint_note": "Area average over the stated box, computed by NASA Giovanni from 0.25° cells.",
        },
        "variable": variable.as_dict(),
    }
    provenance = {
        "source": variable.source_label,
        "source_kind": variable.source_kind,
        "product": f"{export.product} version {export.version}, field {export.field} (daily Level 3, 0.25°)",
        "parameter": export.field,
        "units_reported": "molecules/cm² (displayed as 10¹⁵ molecules/cm²)",
        "request_url": export.reproduce_url,
        "retrieved_at": None,
        "served_from": "bundled export",
        "fill_value": export.fill_value,
        "fill_values_dropped": counts["daily_fill_values_dropped"],
        "valid_days_by_month": counts["valid_days_by_month"],
        "preprocessing": [
            f"{counts['daily_rows']} daily area-averaged values read from the Giovanni export for {export.start[:10]} to {export.end[:10]}.",
            f"{counts['daily_fill_values_dropped']} daily fill values dropped; nothing interpolated.",
            f"Monthly mean taken over valid days; months with fewer than {counts['minimum_valid_days_per_month']} valid days left missing ({counts['months_below_minimum_days']} month(s)).",
            "Small negative daily retrievals are kept: they are valid noisy measurements and removing them would bias the mean upward.",
        ],
    }
    return analyse(series, case, provenance)


def catalogue() -> dict:
    cached = set(power.cached_points())
    return clean(
        {
            "variables": [v.as_dict() for v in VARIABLES.values()],
            "places": [
                {**p.as_dict(), "cached": power.normalise(p.lat, p.lon) in cached} for p in PLACES
            ],
            "regions": giovanni.region_status(),
            "last_complete_year": power.last_complete_year(),
        }
    )
