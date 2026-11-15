import numpy as np
import pymannkendall as mk
import pytest
from scipy import stats

from longwatch.stats import replay, seasonal, verdict as verdicts
from longwatch.stats.detectability import weatherhead_years, years_needed
from longwatch.stats.series import MonthlySeries
from longwatch.stats.shape import curvature_check
from longwatch.stats.trend import (
    effective_autocorrelation,
    lag1_autocorrelation,
    least_squares_ar1,
    rank_trend,
)

from .conftest import ar1_noise, make_series


def monthly_time(n: int) -> np.ndarray:
    return 1981 + (np.arange(n) + 0.5) / 12


def test_theil_sen_matches_scipy(rng):
    t = monthly_time(300)
    y = 0.02 * (t - t[0]) + rng.standard_normal(300)
    ours = rank_trend(t, y)
    reference = stats.theilslopes(y, t)
    assert ours.slope == pytest.approx(reference.slope, rel=1e-3)


def test_uncorrected_mann_kendall_matches_pymannkendall(rng):
    t = monthly_time(240)
    y = 0.01 * (t - t[0]) + rng.standard_normal(240)
    ours = rank_trend(t, y)
    reference = mk.original_test(y)
    assert ours.s == reference.s
    assert ours.var_s_naive == pytest.approx(reference.var_s, rel=1e-9)
    assert ours.p_naive == pytest.approx(reference.p, rel=1e-3)
    assert ours.tau == pytest.approx(stats.kendalltau(t, y).statistic, rel=1e-3)


def test_least_squares_matches_scipy(rng):
    t = monthly_time(360)
    y = -0.015 * (t - t[0]) + rng.standard_normal(360)
    ours = least_squares_ar1(t, y)
    reference = stats.linregress(t, y)
    assert ours.slope == pytest.approx(reference.slope, rel=1e-3)
    assert ours.se_naive == pytest.approx(reference.stderr, rel=1e-3)
    assert ours.p_naive == pytest.approx(reference.pvalue, rel=1e-3)


def test_white_noise_needs_no_correction(rng):
    t = monthly_time(600)
    y = rng.standard_normal(600)
    ours = rank_trend(t, y)
    assert ours.variance_inflation < 1.25
    fit = least_squares_ar1(t, y)
    assert fit.n_effective > 0.8 * fit.n


def test_persistence_widens_both_intervals(rng):
    t = monthly_time(480)
    y = ar1_noise(480, 0.7, rng)
    fit = least_squares_ar1(t, y)
    rank = rank_trend(t, y)
    assert fit.se_adjusted > 1.8 * fit.se_naive
    assert rank.variance_inflation > 3
    assert fit.p_adjusted > fit.p_naive
    assert rank.p_adjusted > rank.p_naive


def test_autocorrelation_estimate_and_bias_correction(rng):
    estimates = [lag1_autocorrelation(ar1_noise(2000, 0.6, rng)) for _ in range(20)]
    assert np.mean(estimates) == pytest.approx(0.6, abs=0.03)
    assert effective_autocorrelation(0.5, 120) == pytest.approx(0.5 + 3 / 120)
    assert effective_autocorrelation(-0.4, 120) == 0.0
    assert effective_autocorrelation(0.999, 120) == 0.99


@pytest.mark.parametrize("slope", [0.03, -0.03])
def test_known_trend_is_recovered_through_a_seasonal_cycle(slope):
    series = make_series(40, slope_per_year=slope, phi=0.3, seed=11)
    frame = replay.frame_for(series)
    assert frame["rank"].slope == pytest.approx(slope, abs=0.012)
    assert frame["least_squares"].slope == pytest.approx(slope, abs=0.012)
    expected = verdicts.DETECTED_RISING if slope > 0 else verdicts.DETECTED_FALLING
    assert frame["verdict"] == expected
    assert frame["rank"].ci_low <= slope <= frame["rank"].ci_high


def test_trendless_record_is_not_called_detected():
    detections = 0
    for seed in range(40):
        frame = replay.frame_for(make_series(30, phi=0.5, seed=100 + seed))
        detections += verdicts.is_detected(frame["verdict"])
    assert detections <= 6


def test_missing_months_are_tolerated():
    series = make_series(40, slope_per_year=0.03, phi=0.3, seed=5)
    values = series.values.copy()
    values[np.random.default_rng(3).choice(480, 40, replace=False)] = np.nan
    frame = replay.frame_for(MonthlySeries(series.years, series.months, values))
    assert frame["sufficient"]
    assert frame["valid_months"] == 440
    assert frame["rank"].slope == pytest.approx(0.03, abs=0.015)


def test_short_record_gives_not_enough_data():
    frame = replay.frame_for(make_series(8, slope_per_year=0.1))
    assert frame["verdict"] == verdicts.NOT_ENOUGH_DATA
    assert "8 usable years" in frame["reason"]


def test_extremely_persistent_noise_cannot_be_called():
    t = monthly_time(120)
    y = np.cumsum(np.random.default_rng(4).standard_normal(120))
    fit = least_squares_ar1(t, y)
    assert fit.r1 > 0.8
    assert fit.p_naive < 0.001
    assert fit.p_adjusted > 0.05
    assert fit.ci_low < 0 < fit.ci_high


def test_verdict_rules():
    assert verdicts.classify(0.01, 0.02, 1.0, 1.0) == verdicts.DETECTED_RISING
    assert verdicts.classify(0.01, 0.02, -1.0, -1.0) == verdicts.DETECTED_FALLING
    assert verdicts.classify(0.01, 0.02, 1.0, -1.0) == verdicts.SUGGESTIVE
    assert verdicts.classify(0.01, 0.30, 1.0, 1.0) == verdicts.SUGGESTIVE
    assert verdicts.classify(0.07, 0.09, 1.0, 1.0) == verdicts.SUGGESTIVE
    assert verdicts.classify(0.07, 0.11, 1.0, 1.0) == verdicts.NOT_DETECTABLE_YET
    assert verdicts.classify(0.50, 0.60, 1.0, 1.0) == verdicts.NOT_DETECTABLE_YET
    assert verdicts.classify(0.05, 0.05, 1.0, 1.0) == verdicts.SUGGESTIVE


def test_replay_frames_never_see_the_future():
    series = make_series(30, slope_per_year=0.02, phi=0.4, seed=21)
    frames = replay.expanding_frames(series)
    tampered_values = series.values.copy()
    tampered_values[series.years > 2000] += 25.0
    tampered = replay.expanding_frames(MonthlySeries(series.years, series.months, tampered_values))
    for original, changed in zip(frames, tampered):
        if original["end_year"] <= 2000:
            assert np.array_equal(original["climatology"], changed["climatology"])
            assert original["rank"].slope == changed["rank"].slope
            assert original["least_squares"].ci_low == changed["least_squares"].ci_low
            assert original["verdict"] == changed["verdict"]
    assert frames[-1]["rank"].slope != tampered[-1]["rank"].slope


def test_replay_frame_equals_analysis_of_truncated_record():
    series = make_series(25, slope_per_year=0.03, phi=0.2, seed=8)
    frames = replay.expanding_frames(series)
    direct = replay.frame_for(series.through(1995))
    matching = next(f for f in frames if f["end_year"] == 1995)
    assert matching["rank"].slope == direct["rank"].slope
    assert np.array_equal(matching["climatology"], seasonal.climatology(series.through(1995)))


def test_replay_starts_after_ten_years_and_ends_at_the_last_year():
    frames = replay.expanding_frames(make_series(22))
    assert frames[0]["end_year"] == 1990
    assert frames[0]["years_watched"] == 10
    assert frames[-1]["end_year"] == 2002
    assert len(frames) == 13


def frames_with(states: list[str]) -> list[dict]:
    return [{"end_year": 2000 + i, "years_watched": 10 + i, "verdict": s} for i, s in enumerate(states)]


def test_detection_year_requires_persistence():
    d, n, s = verdicts.DETECTED_RISING, verdicts.NOT_DETECTABLE_YET, verdicts.SUGGESTIVE
    summary = replay.detection_summary(frames_with([n, d, n, s, d, d, d]))
    assert summary["detection_year"] == 2004
    assert summary["first_crossing_year"] == 2001
    assert summary["lapses"] == 1
    assert summary["years_watched_at_detection"] == 14
    assert not summary["at_first_endpoint"]


def test_no_detection_year_when_the_final_frame_is_not_detected():
    d, n = verdicts.DETECTED_RISING, verdicts.NOT_DETECTABLE_YET
    summary = replay.detection_summary(frames_with([n, d, d, d, n]))
    assert summary["detection_year"] is None
    assert summary["first_crossing_year"] == 2001


def test_direction_flip_resets_the_detection_year():
    up, down = verdicts.DETECTED_RISING, verdicts.DETECTED_FALLING
    summary = replay.detection_summary(frames_with([up, up, down, down]))
    assert summary["detection_year"] == 2002


def test_detection_at_first_endpoint_is_flagged():
    summary = replay.detection_summary(frames_with([verdicts.DETECTED_FALLING] * 4))
    assert summary["detection_year"] == 2000
    assert summary["at_first_endpoint"]


def test_weatherhead_formula_value():
    assert weatherhead_years(0.03, 1.0, 0.0) == pytest.approx((3.3 / 0.03) ** (2 / 3))
    assert weatherhead_years(0.03, 1.0, 0.5) == pytest.approx((3.3 / 0.03 * np.sqrt(3)) ** (2 / 3))
    assert weatherhead_years(-0.03, 1.0, 0.5) == weatherhead_years(0.03, 1.0, 0.5)


def test_years_needed_is_withheld_when_the_rate_is_indistinguishable_from_zero(rng):
    t = monthly_time(360)
    y = ar1_noise(360, 0.3, rng)
    fit = least_squares_ar1(t, y - np.polyval(np.polyfit(t, y, 1), t) + 1e-5 * (t - t[0]))
    estimate = years_needed(fit, 30, fit.slope)
    assert not estimate.available
    assert estimate.additional_years is None
    assert "direction is unresolved" in estimate.reason


def test_years_needed_is_withheld_when_estimators_disagree(rng):
    t = monthly_time(360)
    fit = least_squares_ar1(t, 0.01 * (t - t[0]) + rng.standard_normal(360))
    estimate = years_needed(fit, 30, -fit.slope)
    assert not estimate.available


def test_years_needed_reports_additional_years(rng):
    t = monthly_time(180)
    fit = least_squares_ar1(t, 0.02 * (t - t[0]) + ar1_noise(180, 0.3, rng))
    estimate = years_needed(fit, 15, fit.slope)
    if estimate.available:
        assert estimate.total_years == pytest.approx(weatherhead_years(fit.slope, fit.residual_sd, fit.r1_corrected))
        assert estimate.additional_years == pytest.approx(max(estimate.total_years - 15, 0))
        assert estimate.additional_years_if_stronger <= estimate.additional_years


def test_rise_then_fall_is_flagged(rng):
    t = monthly_time(480)
    middle = t[240]
    y = -0.004 * (t - middle) ** 2 + ar1_noise(480, 0.3, rng, 0.4)
    shape = curvature_check(t, y)
    assert shape["curved"] and shape["reverses"]
    assert shape["turning_point_kind"] == "peak"
    assert abs(shape["turning_point_year"] - middle) < 4


def test_steady_trend_is_not_flagged_as_a_reversal(rng):
    t = monthly_time(480)
    flagged = sum(curvature_check(t, 0.03 * (t - t[0]) + ar1_noise(480, 0.4, rng))["reverses"] for _ in range(30))
    assert flagged <= 1


def test_step_change_is_detected_but_flagged_as_not_straight(rng):
    t = monthly_time(480)
    y = np.where(t > 2008, 1.5, 0.0) + ar1_noise(480, 0.2, rng, 0.5)
    fit = least_squares_ar1(t, y)
    assert fit.p_adjusted < 0.05
    quadratic = -0.002 * (t - t[0]) ** 2 + 0.1 * (t - t[0]) + ar1_noise(480, 0.2, rng, 0.3)
    assert curvature_check(t, quadratic)["curved"]


def test_small_monte_carlo_false_positive_rate():
    rng = np.random.default_rng(99)
    t = monthly_time(240)
    naive = corrected_ls = corrected_rank = 0
    runs = 300
    for _ in range(runs):
        y = ar1_noise(240, 0.6, rng)
        fit = least_squares_ar1(t, y)
        rank = rank_trend(t, y)
        naive += fit.p_naive < 0.05
        corrected_ls += fit.p_adjusted < 0.05
        corrected_rank += rank.p_adjusted < 0.05
    assert naive / runs > 0.2
    assert corrected_ls / runs < 0.09
    assert corrected_rank / runs < 0.10


def test_recent_sustained_detection_is_marked_provisional():
    recent = replay.detection_summary(frames_with([verdicts.NOT_DETECTABLE_YET] * 6 + [verdicts.DETECTED_RISING] * 3))
    assert recent["years_held"] == 3
    assert recent["provisional"]
    settled = replay.detection_summary(frames_with([verdicts.NOT_DETECTABLE_YET] * 2 + [verdicts.DETECTED_RISING] * 7))
    assert settled["years_held"] == 7
    assert not settled["provisional"]
    assert replay.detection_summary(frames_with([verdicts.NOT_DETECTABLE_YET] * 5))["years_held"] is None


def test_years_needed_gives_no_length_when_the_interval_includes_zero(rng):
    t = monthly_time(360)
    noise = ar1_noise(360, 0.3, rng)
    noise = noise - np.polyval(np.polyfit(t, noise, 1), t)
    fit = least_squares_ar1(t, noise + 1.5 * least_squares_ar1(t, noise).se_adjusted * (t - t[0]))
    assert fit.ci_low < 0 < fit.ci_high
    estimate = years_needed(fit, 30, fit.slope)
    assert estimate.available
    assert estimate.weaker_end_includes_zero
    assert estimate.total_years_if_weaker is None
    assert estimate.total_years_if_stronger < estimate.total_years
    assert estimate.detection_probability == 0.9


def test_start_year_sensitivity_refits_shorter_windows_of_the_same_record():
    series = make_series(40, 0.03)
    rows = replay.start_year_sensitivity(series)
    assert [row["start_year"] for row in rows] == [series.first_year + step for step in (0, 5, 10, 15, 20, 25)]
    assert rows[-1]["years"] == 15
    full = replay.frame_for(series)
    assert rows[0]["slope"] == pytest.approx(full["rank"].slope * 10)
    later = replay.frame_for(series.between(series.first_year + 10, series.last_year))
    assert rows[2]["ci_low"] == pytest.approx(later["rank"].ci_low * 10)


def test_detection_probability_matches_the_weatherhead_length_and_the_false_alarm_level():
    from longwatch.stats.detectability import detection_probability

    length = weatherhead_years(0.03, 1.0, 0.4)
    assert detection_probability(0.03, 1.0, 0.4, length) == pytest.approx(0.91, abs=0.005)
    assert detection_probability(0.0, 1.0, 0.4, 500) == pytest.approx(0.05, abs=1e-6)
    assert detection_probability(0.03, 1.0, 0.4, 20) < detection_probability(0.03, 1.0, 0.4, 40)
    assert detection_probability(-0.03, 1.0, 0.4, 30) == detection_probability(0.03, 1.0, 0.4, 30)


def test_power_curve_has_no_weak_end_when_the_interval_includes_zero(rng):
    t = monthly_time(360)
    noise = ar1_noise(360, 0.3, rng)
    noise = noise - np.polyval(np.polyfit(t, noise, 1), t)
    fit = least_squares_ar1(t, noise + 1.5 * least_squares_ar1(t, noise).se_adjusted * (t - t[0]))
    estimate = years_needed(fit, 30, fit.slope)
    assert all(point["at_weak_end"] is None for point in estimate.curve)
    assert estimate.weak_rate_per_year <= 0 < estimate.rate_per_year
    assert all(a["at_estimate"] <= b["at_estimate"] for a, b in zip(estimate.curve, estimate.curve[1:]))
    assert all(point["at_strong_end"] >= point["at_estimate"] for point in estimate.curve)


def test_madrid_style_frame_for_2007_ignores_everything_after_2007():
    series = make_series(45, 0.03, phi=0.3)
    cut = series.through(2007)
    altered = MonthlySeries(series.years, series.months, np.where(series.years > 2007, series.values * -3 + 40, series.values))
    longer = make_series(60, 0.03, phi=0.3)
    reference = replay.frame_for(cut)
    for other in (altered, longer):
        frame = next(f for f in replay.expanding_frames(other) if f["end_year"] == 2007)
        if other is longer:
            assert np.array_equal(other.through(2007).values, cut.values)
        assert np.array_equal(frame["climatology"], reference["climatology"])
        assert np.array_equal(frame["anomalies"], reference["anomalies"], equal_nan=True)
        for name in ("rank", "least_squares"):
            assert frame[name] == reference[name]
        assert frame["verdict"] == reference["verdict"]
