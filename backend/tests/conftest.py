import os

import numpy as np
import pytest

os.environ["LONGWATCH_OFFLINE"] = "1"

from longwatch.stats.series import MonthlySeries


def ar1_noise(n: int, phi: float, rng: np.random.Generator, sd: float = 1.0) -> np.ndarray:
    innovations = rng.standard_normal(n + 300) * sd * np.sqrt(1 - phi**2)
    x = np.zeros(n + 300)
    for i in range(1, n + 300):
        x[i] = phi * x[i - 1] + innovations[i]
    return x[300:]


def make_series(n_years: int, slope_per_year: float = 0.0, phi: float = 0.0, sd: float = 1.0, seed: int = 1, cycle: float = 6.0, start: int = 1981) -> MonthlySeries:
    rng = np.random.default_rng(seed)
    years = np.repeat(np.arange(start, start + n_years), 12)
    months = np.tile(np.arange(1, 13), n_years)
    t = years + (months - 0.5) / 12
    values = 12 + cycle * np.sin(2 * np.pi * (months - 1) / 12) + slope_per_year * (t - t[0]) + ar1_noise(len(t), phi, rng, sd)
    return MonthlySeries(years, months, values)


@pytest.fixture
def rng() -> np.random.Generator:
    return np.random.default_rng(20261114)
