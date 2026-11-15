from __future__ import annotations

import numpy as np

from .series import MonthlySeries


def climatology(series: MonthlySeries) -> np.ndarray:
    clim = np.full(12, np.nan)
    for m in range(1, 13):
        chunk = series.values[(series.months == m) & series.valid]
        if len(chunk):
            clim[m - 1] = chunk.mean()
    return clim


def anomalies(series: MonthlySeries, clim: np.ndarray | None = None) -> np.ndarray:
    if clim is None:
        clim = climatology(series)
    return series.values - clim[series.months - 1]
