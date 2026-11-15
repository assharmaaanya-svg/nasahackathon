from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from .series import MonthlySeries

MIN_YEARS = 10
MIN_FRACTION = 0.90
SHORT_RECORD_YEARS = 15
MIN_PER_CALENDAR_MONTH = 5


@dataclass(frozen=True)
class Coverage:
    first_year: int | None
    last_year: int | None
    span_years: int
    expected_months: int
    valid_months: int
    missing_months: int
    fraction: float
    sufficient: bool
    short_record: bool
    reason: str | None

    def as_dict(self) -> dict:
        return asdict(self)


def assess(series: MonthlySeries) -> Coverage:
    expected = len(series.values)
    if expected == 0:
        return Coverage(None, None, 0, 0, 0, 0, 0.0, False, False, "The record contains no usable years.")
    valid = int(series.valid.sum())
    span = series.last_year - series.first_year + 1
    fraction = valid / expected
    per_month = [int(series.valid[series.months == m].sum()) for m in range(1, 13)]
    reason = None
    if span < MIN_YEARS:
        reason = f"Only {span} usable years of record; at least {MIN_YEARS} are required."
    elif fraction < MIN_FRACTION:
        reason = (
            f"{expected - valid} of {expected} expected months are missing "
            f"({fraction:.0%} present); at least {MIN_FRACTION:.0%} is required."
        )
    elif min(per_month) < MIN_PER_CALENDAR_MONTH:
        reason = "At least one calendar month has too few observations to define a seasonal cycle."
    return Coverage(
        first_year=series.first_year,
        last_year=series.last_year,
        span_years=span,
        expected_months=expected,
        valid_months=valid,
        missing_months=expected - valid,
        fraction=float(fraction),
        sufficient=reason is None,
        short_record=reason is None and span < SHORT_RECORD_YEARS,
        reason=reason,
    )
