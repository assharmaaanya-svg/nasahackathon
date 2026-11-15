from __future__ import annotations

DETECTED_RISING = "detected_rising"
DETECTED_FALLING = "detected_falling"
SUGGESTIVE = "suggestive"
NOT_DETECTABLE_YET = "not_detectable_yet"
NOT_ENOUGH_DATA = "not_enough_data"

STRICT = 0.05
LOOSE = 0.10


def classify(p_rank: float, p_least_squares: float, rank_slope: float, least_squares_slope: float) -> str:
    same_sign = rank_slope * least_squares_slope > 0
    if p_rank < STRICT and p_least_squares < STRICT and same_sign:
        return DETECTED_RISING if rank_slope > 0 else DETECTED_FALLING
    if p_rank < STRICT or p_least_squares < STRICT:
        return SUGGESTIVE
    if p_rank < LOOSE and p_least_squares < LOOSE:
        return SUGGESTIVE
    return NOT_DETECTABLE_YET


def is_detected(verdict: str) -> bool:
    return verdict in (DETECTED_RISING, DETECTED_FALLING)
