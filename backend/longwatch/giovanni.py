from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .catalog import REGIONS, Region
from .stats.series import MonthlySeries, from_mapping

DATA_DIR = Path(os.environ.get("LONGWATCH_GIOVANNI", Path(__file__).resolve().parent.parent / "data" / "giovanni"))
MIN_VALID_DAYS_PER_MONTH = 5
BOUNDS_TOLERANCE = 0.01


class GiovanniFileError(Exception):
    pass


@dataclass(frozen=True)
class GiovanniExport:
    title: str
    product: str
    version: str
    field: str
    user_bounds: tuple[float, float, float, float]
    data_bounds: tuple[float, float, float, float] | None
    reproduce_url: str
    fill_value: float
    start: str
    end: str
    days: list[tuple[int, int, int]]
    values: np.ndarray

    def monthly(self, scale: float) -> tuple[MonthlySeries, dict]:
        buckets: dict[tuple[int, int], list[float]] = {}
        fills = 0
        for (year, month, _), value in zip(self.days, self.values):
            if not np.isfinite(value):
                fills += 1
                continue
            buckets.setdefault((year, month), []).append(value * scale)
        observations = {
            key: float(np.mean(vals)) for key, vals in buckets.items() if len(vals) >= MIN_VALID_DAYS_PER_MONTH
        }
        thin = sum(1 for vals in buckets.values() if len(vals) < MIN_VALID_DAYS_PER_MONTH)
        counts = {
            "daily_rows": len(self.days),
            "daily_fill_values_dropped": fills,
            "months_below_minimum_days": thin,
            "minimum_valid_days_per_month": MIN_VALID_DAYS_PER_MONTH,
            "valid_days_by_month": {f"{year}-{month:02d}": len(vals) for (year, month), vals in sorted(buckets.items())},
        }
        return from_mapping(observations), counts


def parse(path: Path) -> GiovanniExport:
    header: dict[str, str] = {}
    column = None
    days: list[tuple[int, int, int]] = []
    values: list[float] = []
    fill = None
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        if column is None:
            if line.lower().startswith("time,"):
                column = line.split(",", 1)[1].strip()
                continue
            key, _, value = line.partition(":,")
            header[key.strip()] = value.strip().strip('"')
            if key.startswith("Fill Value"):
                fill = float(value)
            continue
        stamp, _, value = line.partition(",")
        match = re.match(r"(\d{4})-(\d{2})-(\d{2})", stamp)
        if not match:
            raise GiovanniFileError(f"Unreadable date '{stamp}' in {path.name}.")
        number = float(value)
        days.append((int(match[1]), int(match[2]), int(match[3])))
        values.append(np.nan if fill is not None and np.isclose(number, fill, rtol=1e-6) else number)
    if column is None or not days:
        raise GiovanniFileError(f"{path.name} is not a Giovanni time-series export.")
    product = re.match(r"mean_([A-Za-z0-9]+)_(\d+)_(.+)", column)
    if not product:
        raise GiovanniFileError(f"Cannot read the product name from column '{column}'.")
    if fill is None:
        raise GiovanniFileError(f"{path.name} does not declare a fill value.")
    return GiovanniExport(
        title=header.get("Title", ""),
        product=product[1],
        version=product[2],
        field=product[3],
        user_bounds=_bounds(header.get("User Bounding Box", "")),
        data_bounds=_bounds(header["Data Bounding Box"]) if "Data Bounding Box" in header else None,
        reproduce_url=re.sub(r"\?utm_source=[^#&]*", "", header.get("URL to Reproduce Results", "")),
        fill_value=fill,
        start=header.get("User Start Date", ""),
        end=header.get("User End Date", ""),
        days=days,
        values=np.array(values, dtype=float),
    )


def _bounds(text: str) -> tuple[float, float, float, float]:
    parts = [float(p) for p in text.split(",")]
    if len(parts) != 4:
        raise GiovanniFileError("The export has no readable bounding box.")
    return parts[0], parts[1], parts[2], parts[3]


def load_region(region: Region) -> GiovanniExport:
    path = DATA_DIR / region.filename
    if not path.exists():
        raise GiovanniFileError(f"No Giovanni export has been supplied for {region.name}.")
    export = parse(path)
    expected = (region.west, region.south, region.east, region.north)
    if any(abs(a - b) > BOUNDS_TOLERANCE for a, b in zip(export.user_bounds, expected)):
        raise GiovanniFileError(
            f"{region.filename} was exported for the box {export.user_bounds}, not the {region.name} box {expected}."
        )
    return export


def region_status() -> list[dict]:
    status = []
    versions = set()
    for region in REGIONS:
        entry = region.as_dict()
        try:
            export = load_region(region)
            entry.update(available=True, product=export.product, version=export.version, reason=None)
            versions.add((export.product, export.version))
        except GiovanniFileError as error:
            entry.update(available=False, product=None, version=None, reason=str(error))
        status.append(entry)
    if len(versions) > 1:
        for entry in status:
            if entry["available"]:
                entry.update(available=False, reason="The supplied exports mix product versions and cannot be compared.")
    return status
