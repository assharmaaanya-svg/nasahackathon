from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pymannkendall as mk
from scipy import stats

ALPHA = 0.05
MIN_EFFECTIVE_N = 6.0


@dataclass(frozen=True)
class LeastSquaresFit:
    slope: float
    intercept: float
    n: int
    r1: float
    r1_corrected: float
    n_effective: float
    se_naive: float
    se_adjusted: float
    ci_low: float
    ci_high: float
    p_naive: float
    p_adjusted: float
    residual_sd: float

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class RankTrend:
    slope: float
    intercept: float
    ci_low: float
    ci_high: float
    tau: float
    s: float
    var_s_naive: float
    var_s_adjusted: float
    variance_inflation: float
    rank_r1: float
    p_naive: float
    p_adjusted: float

    def as_dict(self) -> dict:
        return asdict(self)


def lag1_autocorrelation(residuals_on_grid: np.ndarray) -> float:
    e = residuals_on_grid
    ok = np.isfinite(e)
    pairs = ok[:-1] & ok[1:]
    if pairs.sum() < 3:
        return 0.0
    centered = e - e[ok].mean()
    denominator = float((centered[ok] ** 2).mean())
    if denominator == 0:
        return 0.0
    return float((centered[:-1][pairs] * centered[1:][pairs]).mean() / denominator)


def effective_autocorrelation(r1: float, n: int) -> float:
    corrected = r1 + (1.0 + 4.0 * r1) / n
    return float(min(max(corrected, 0.0), 0.99))


def least_squares_ar1(t: np.ndarray, y: np.ndarray, alpha: float = ALPHA) -> LeastSquaresFit:
    ok = np.isfinite(y)
    tv, yv = t[ok], y[ok]
    n = int(ok.sum())
    t_mean = tv.mean()
    sxx = float(((tv - t_mean) ** 2).sum())
    slope = float(((tv - t_mean) * (yv - yv.mean())).sum() / sxx)
    intercept = float(yv.mean() - slope * t_mean)
    residuals = np.full_like(y, np.nan, dtype=float)
    residuals[ok] = yv - (intercept + slope * tv)
    sse = float(np.nansum(residuals**2))
    se_naive = float(np.sqrt(sse / (n - 2) / sxx))
    r1 = lag1_autocorrelation(residuals)
    r1_used = effective_autocorrelation(r1, n)
    n_eff = n * (1 - r1_used) / (1 + r1_used)
    if n_eff < MIN_EFFECTIVE_N:
        se_adj, ci_low, ci_high, p_adj = np.inf, -np.inf, np.inf, 1.0
    else:
        se_adj = float(np.sqrt(sse / (n_eff - 2) / sxx))
        crit = float(stats.t.ppf(1 - alpha / 2, n_eff - 2))
        ci_low, ci_high = slope - crit * se_adj, slope + crit * se_adj
        p_adj = float(2 * stats.t.sf(abs(slope) / se_adj, n_eff - 2)) if se_adj > 0 else 0.0
    p_naive = float(2 * stats.t.sf(abs(slope) / se_naive, n - 2)) if se_naive > 0 else 0.0
    return LeastSquaresFit(
        slope=slope,
        intercept=intercept,
        n=n,
        r1=r1,
        r1_corrected=r1_used,
        n_effective=float(n_eff),
        se_naive=se_naive,
        se_adjusted=float(se_adj),
        ci_low=float(ci_low),
        ci_high=float(ci_high),
        p_naive=p_naive,
        p_adjusted=p_adj,
        residual_sd=float(np.sqrt(sse / (n - 2))),
    )


def pairwise_slopes(t: np.ndarray, y: np.ndarray) -> np.ndarray:
    i, j = np.triu_indices(len(t), k=1)
    dt = t[j] - t[i]
    keep = dt != 0
    return np.sort((y[j][keep] - y[i][keep]) / dt[keep])


def sen_interval(sorted_slopes: np.ndarray, var_s: float, alpha: float = ALPHA) -> tuple[float, float]:
    count = len(sorted_slopes)
    c = stats.norm.ppf(1 - alpha / 2) * np.sqrt(var_s)
    lower_rank = int(round((count - c) / 2)) - 1
    upper_rank = int(round((count + c) / 2))
    if lower_rank < 0 or upper_rank > count - 1:
        return -np.inf, np.inf
    return float(sorted_slopes[lower_rank]), float(sorted_slopes[upper_rank])


def rank_variance_inflation(t: np.ndarray, y: np.ndarray, sen_slope: float) -> tuple[float, float]:
    ok = np.isfinite(y)
    detrended = y[ok] - sen_slope * t[ok]
    ranks = np.full_like(y, np.nan, dtype=float)
    ranks[ok] = stats.rankdata(detrended)
    r1 = lag1_autocorrelation(ranks)
    n = int(ok.sum())
    rho = effective_autocorrelation(r1, n)
    if rho == 0.0 or n < 4:
        return 1.0, r1
    k = np.arange(1, n - 1)
    weights = (n - k) * (n - k - 1.0) * (n - k - 2.0)
    factor = 1.0 + 2.0 / (n * (n - 1.0) * (n - 2.0)) * float((weights * rho**k).sum())
    return max(factor, 1.0), r1


def rank_trend(t: np.ndarray, y: np.ndarray, alpha: float = ALPHA) -> RankTrend:
    ok = np.isfinite(y)
    tv, yv = t[ok], y[ok]
    slopes = pairwise_slopes(tv, yv)
    slope = float(np.median(slopes))
    intercept = float(np.median(yv) - slope * np.median(tv))
    naive = mk.original_test(yv, alpha=alpha)
    inflation, rank_r1 = rank_variance_inflation(t, y, slope)
    var_adj = float(naive.var_s) * inflation
    z = _z_from_s(float(naive.s), var_adj)
    p_adj = float(2 * stats.norm.sf(abs(z)))
    ci_low, ci_high = sen_interval(slopes, var_adj, alpha)
    return RankTrend(
        slope=slope,
        intercept=intercept,
        ci_low=ci_low,
        ci_high=ci_high,
        tau=float(naive.Tau),
        s=float(naive.s),
        var_s_naive=float(naive.var_s),
        var_s_adjusted=var_adj,
        variance_inflation=float(inflation),
        rank_r1=float(rank_r1),
        p_naive=float(naive.p),
        p_adjusted=p_adj,
    )


def _z_from_s(s: float, var_s: float) -> float:
    if var_s <= 0 or s == 0:
        return 0.0
    return (s - np.sign(s)) / np.sqrt(var_s)
