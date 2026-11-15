from __future__ import annotations

import numpy as np
from scipy import stats

from .trend import MIN_EFFECTIVE_N, effective_autocorrelation, lag1_autocorrelation, least_squares_ar1

MIN_SEGMENT_POINTS = 60


def curvature_check(t: np.ndarray, y: np.ndarray, alpha: float = 0.05) -> dict:
    ok = np.isfinite(y)
    n = int(ok.sum())
    centre = (t[ok].min() + t[ok].max()) / 2
    half_span = (t[ok].max() - t[ok].min()) / 2
    u = (t - centre) / half_span
    design = np.column_stack([np.ones(n), u[ok], u[ok] ** 2])
    coef, *_ = np.linalg.lstsq(design, y[ok], rcond=None)
    residuals = np.full_like(y, np.nan, dtype=float)
    residuals[ok] = y[ok] - design @ coef
    r1 = effective_autocorrelation(lag1_autocorrelation(residuals), n)
    n_eff = n * (1 - r1) / (1 + r1)
    p = 1.0
    if n_eff >= MIN_EFFECTIVE_N + 1:
        sse = float(np.nansum(residuals**2))
        cov = np.linalg.inv(design.T @ design) * sse / (n_eff - 3)
        se = float(np.sqrt(cov[2, 2]))
        if se > 0:
            p = float(2 * stats.t.sf(abs(coef[2]) / se, n_eff - 3))
    turning = float(-coef[1] / (2 * coef[2])) if coef[2] != 0 else np.inf
    curved = p < alpha
    reverses = False
    if curved and abs(turning) < 0.7:
        turn_time = centre + turning * half_span
        before = ok & (t < turn_time)
        after = ok & (t >= turn_time)
        if before.sum() >= MIN_SEGMENT_POINTS and after.sum() >= MIN_SEGMENT_POINTS:
            first = least_squares_ar1(t[before], y[before])
            second = least_squares_ar1(t[after], y[after])
            reverses = (
                first.slope * second.slope < 0 and first.p_adjusted < alpha and second.p_adjusted < alpha
            )
    return {
        "curved": bool(curved),
        "reverses": bool(reverses),
        "p_value": p,
        "turning_point_year": float(centre + turning * half_span) if reverses else None,
        "turning_point_kind": ("peak" if coef[2] < 0 else "trough") if reverses else None,
    }
