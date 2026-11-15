from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
from scipy import stats

from .trend import LeastSquaresFit

DETECTION_FACTOR = 3.3
DETECTION_PROBABILITY = 0.9
TWO_SIDED_Z = 1.959964
MAX_TOTAL_YEARS = 200.0
MIN_SIGNAL_TO_ERROR = 1.0
MAX_AUTOCORRELATION = 0.95


@dataclass(frozen=True)
class YearsNeeded:
    available: bool
    reason: str | None
    total_years: float | None
    additional_years: float | None
    additional_years_if_stronger: float | None
    total_years_if_stronger: float | None
    total_years_if_weaker: float | None
    weaker_end_includes_zero: bool | None
    record_years: float | None
    detection_probability: float
    slope_per_year: float | None
    noise_sd: float | None
    autocorrelation: float | None
    rate_per_year: float | None = None
    strong_rate_per_year: float | None = None
    weak_rate_per_year: float | None = None
    curve: list | None = None

    def as_dict(self) -> dict:
        return asdict(self)


def weatherhead_years(slope_per_year: float, noise_sd: float, phi: float) -> float:
    phi = min(max(phi, 0.0), 0.99)
    ratio = DETECTION_FACTOR * noise_sd / abs(slope_per_year) * np.sqrt((1 + phi) / (1 - phi))
    return float(ratio ** (2.0 / 3.0))


def detection_probability(slope_per_year: float, noise_sd: float, phi: float, years: float) -> float:
    phi = min(max(phi, 0.0), 0.99)
    slope_se = noise_sd / years**1.5 * np.sqrt((1 + phi) / (1 - phi))
    ratio = abs(slope_per_year) / slope_se
    return float(stats.norm.cdf(ratio - TWO_SIDED_Z) + stats.norm.cdf(-ratio - TWO_SIDED_Z))


def years_needed(fit: LeastSquaresFit, record_years: float, rank_slope: float) -> YearsNeeded:
    def unavailable(reason: str) -> YearsNeeded:
        return YearsNeeded(
            False, reason, None, None, None, None, None, None, record_years, DETECTION_PROBABILITY,
            fit.slope, fit.residual_sd, fit.r1_corrected,
        )

    if not np.isfinite(fit.se_adjusted) or fit.se_adjusted <= 0:
        return unavailable("The record is too persistent to estimate its noise reliably.")
    if fit.slope == 0 or np.sign(fit.slope) != np.sign(rank_slope):
        return unavailable("The two trend estimators disagree on direction, so there is no stable rate to extrapolate.")
    if abs(fit.slope) / fit.se_adjusted < MIN_SIGNAL_TO_ERROR:
        return unavailable(
            "The estimated rate is within one standard error of zero, so even its direction is unresolved. "
            "Any number of years computed from it would be meaningless."
        )
    if fit.r1_corrected >= MAX_AUTOCORRELATION:
        return unavailable("Month-to-month persistence is too strong for the AR(1) noise model behind this estimate.")
    total = weatherhead_years(fit.slope, fit.residual_sd, fit.r1_corrected)
    if total > MAX_TOTAL_YEARS:
        return unavailable(
            f"At the current rate and noise the estimate exceeds {MAX_TOTAL_YEARS:.0f} years of record, "
            "which is too far to extrapolate responsibly."
        )
    stronger = max(abs(fit.ci_low), abs(fit.ci_high))
    total_stronger = weatherhead_years(stronger, fit.residual_sd, fit.r1_corrected)
    spans_zero = fit.ci_low * fit.ci_high <= 0
    weaker = min(abs(fit.ci_low), abs(fit.ci_high))
    total_weaker = None if spans_zero else weatherhead_years(weaker, fit.residual_sd, fit.r1_corrected)
    sign = 1.0 if fit.slope > 0 else -1.0
    weak_rate = sign * weaker if not spans_zero else (fit.ci_low if sign > 0 else fit.ci_high)
    horizon = int(min(max(np.ceil(total * 1.3 / 10) * 10, record_years + 20, 40), MAX_TOTAL_YEARS))
    curve = [
        {
            "years": years,
            "at_estimate": detection_probability(fit.slope, fit.residual_sd, fit.r1_corrected, years),
            "at_strong_end": detection_probability(stronger, fit.residual_sd, fit.r1_corrected, years),
            "at_weak_end": (
                None if spans_zero else detection_probability(weaker, fit.residual_sd, fit.r1_corrected, years)
            ),
        }
        for years in range(5, horizon + 1)
    ]
    return YearsNeeded(
        available=True,
        reason=None,
        total_years=total,
        additional_years=max(total - record_years, 0.0),
        additional_years_if_stronger=max(total_stronger - record_years, 0.0),
        total_years_if_stronger=total_stronger,
        total_years_if_weaker=total_weaker,
        weaker_end_includes_zero=spans_zero,
        record_years=record_years,
        detection_probability=DETECTION_PROBABILITY,
        rate_per_year=fit.slope,
        strong_rate_per_year=sign * stronger,
        weak_rate_per_year=weak_rate,
        curve=curve,
        slope_per_year=fit.slope,
        noise_sd=fit.residual_sd,
        autocorrelation=fit.r1_corrected,
    )
