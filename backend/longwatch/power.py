from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .catalog import POWER_VARIABLES
from .stats.series import MonthlySeries, from_mapping

BASE_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
COMMUNITY = "AG"
FIRST_YEAR = 1981
CACHE_DIR = Path(os.environ.get("LONGWATCH_CACHE", Path(__file__).resolve().parent.parent / "data" / "cache" / "power"))
TIMEOUT_SECONDS = 30.0
ATTEMPTS = 3


class PowerUnavailable(Exception):
    pass


@dataclass(frozen=True)
class PowerPayload:
    latitude: float
    longitude: float
    request_url: str
    retrieved_at: str
    served_from: str
    body: dict

    @property
    def fill_value(self) -> float:
        return float(self.body["header"]["fill_value"])

    @property
    def api_version(self) -> str:
        return str(self.body["header"]["api"]["version"])

    @property
    def sources(self) -> list[str]:
        return list(self.body["header"]["sources"])

    def units(self, parameter: str) -> str:
        return str(self.body["parameters"][parameter]["units"])

    def series(self, parameter: str) -> tuple[MonthlySeries, int]:
        raw = self.body["properties"]["parameter"][parameter]
        fill = self.fill_value
        observations: dict[tuple[int, int], float] = {}
        fills = 0
        for key, value in raw.items():
            year, month = int(key[:4]), int(key[4:6])
            if month < 1 or month > 12:
                continue
            if value is None or float(value) == fill:
                fills += 1
                continue
            observations[(year, month)] = float(value)
        return from_mapping(observations), fills


def last_complete_year() -> int:
    return datetime.now(timezone.utc).year - 1


def normalise(latitude: float, longitude: float) -> tuple[float, float]:
    if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
        raise ValueError("Latitude must be within ±90 and longitude within ±180.")
    return round(latitude, 2), round(longitude, 2)


def cache_path(latitude: float, longitude: float) -> Path:
    return CACHE_DIR / f"{latitude:+06.2f}_{longitude:+07.2f}.json"


def build_url(latitude: float, longitude: float, end_year: int) -> str:
    parameters = ",".join(v.parameter for v in POWER_VARIABLES)
    return (
        f"{BASE_URL}?parameters={parameters}&community={COMMUNITY}"
        f"&longitude={longitude}&latitude={latitude}&format=JSON&start={FIRST_YEAR}&end={end_year}"
    )


def read_cache(latitude: float, longitude: float) -> PowerPayload | None:
    path = cache_path(latitude, longitude)
    if not path.exists():
        return None
    stored = json.loads(path.read_text())
    return PowerPayload(latitude, longitude, stored["request_url"], stored["retrieved_at"], "cache", stored["response"])


def cached_points() -> list[tuple[float, float]]:
    points = []
    for path in sorted(CACHE_DIR.glob("*.json")):
        lat, lon = path.stem.split("_")
        points.append((float(lat), float(lon)))
    return points


def fetch_point(latitude: float, longitude: float) -> PowerPayload:
    latitude, longitude = normalise(latitude, longitude)
    cached = read_cache(latitude, longitude)
    wanted_end = last_complete_year()
    if cached and int(cached.body["header"]["end"][:4]) >= wanted_end:
        return cached
    if os.environ.get("LONGWATCH_OFFLINE") == "1":
        if cached:
            return cached
        raise PowerUnavailable("Offline mode is on and this location has not been retrieved before.")
    url = build_url(latitude, longitude, wanted_end)
    last_error = "no attempt made"
    for attempt in range(ATTEMPTS):
        try:
            response = httpx.get(url, timeout=TIMEOUT_SECONDS)
            if response.status_code == 200:
                body = response.json()
                validate(body)
                retrieved_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
                CACHE_DIR.mkdir(parents=True, exist_ok=True)
                cache_path(latitude, longitude).write_text(
                    json.dumps({"request_url": url, "retrieved_at": retrieved_at, "response": body})
                )
                return PowerPayload(latitude, longitude, url, retrieved_at, "live", body)
            last_error = f"NASA POWER answered HTTP {response.status_code}"
            if response.status_code in (400, 404, 422):
                break
        except (httpx.HTTPError, ValueError) as error:
            last_error = f"{type(error).__name__}: {error}"
        time.sleep(1.5 * (attempt + 1))
    if cached:
        return cached
    raise PowerUnavailable(last_error)


def validate(body: dict) -> None:
    parameters = body.get("properties", {}).get("parameter")
    if not isinstance(parameters, dict) or "fill_value" not in body.get("header", {}):
        raise ValueError("NASA POWER returned a response without parameter data.")
    for variable in POWER_VARIABLES:
        if variable.parameter not in parameters:
            raise ValueError(f"NASA POWER response is missing {variable.parameter}.")
