from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MIN_VALID_MONTHS_IN_EDGE_YEAR = 9


@dataclass(frozen=True)
class MonthlySeries:
    years: np.ndarray
    months: np.ndarray
    values: np.ndarray

    def __post_init__(self) -> None:
        if not (len(self.years) == len(self.months) == len(self.values)):
            raise ValueError("years, months and values must have equal length")

    @property
    def time(self) -> np.ndarray:
        return self.years + (self.months - 0.5) / 12.0

    @property
    def valid(self) -> np.ndarray:
        return np.isfinite(self.values)

    @property
    def first_year(self) -> int:
        return int(self.years[0])

    @property
    def last_year(self) -> int:
        return int(self.years[-1])

    def through(self, end_year: int) -> "MonthlySeries":
        keep = self.years <= end_year
        return MonthlySeries(self.years[keep], self.months[keep], self.values[keep])

    def between(self, start_year: int, end_year: int) -> "MonthlySeries":
        keep = (self.years >= start_year) & (self.years <= end_year)
        return MonthlySeries(self.years[keep], self.months[keep], self.values[keep])


def from_mapping(observations: dict[tuple[int, int], float]) -> MonthlySeries:
    if not observations:
        return MonthlySeries(np.array([], int), np.array([], int), np.array([], float))
    first = min(y for y, _ in observations)
    last = max(y for y, _ in observations)
    years = np.repeat(np.arange(first, last + 1), 12)
    months = np.tile(np.arange(1, 13), last - first + 1)
    values = np.array(
        [observations.get((int(y), int(m)), np.nan) for y, m in zip(years, months)],
        dtype=float,
    )
    return MonthlySeries(years, months, values)


def trim_to_usable_years(series: MonthlySeries) -> MonthlySeries:
    if len(series.values) == 0:
        return series
    counts = {
        int(y): int(np.isfinite(series.values[series.years == y]).sum())
        for y in np.unique(series.years)
    }
    usable = [y for y, c in counts.items() if c >= MIN_VALID_MONTHS_IN_EDGE_YEAR]
    if not usable:
        return MonthlySeries(np.array([], int), np.array([], int), np.array([], float))
    return series.between(min(usable), max(usable))
