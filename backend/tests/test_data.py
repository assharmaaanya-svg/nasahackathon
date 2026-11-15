import json

import numpy as np
import pytest

from longwatch import giovanni, power
from longwatch.catalog import REGIONS, VARIABLES, grid_cell
from longwatch.stats import quality, seasonal
from longwatch.stats.series import MonthlySeries, from_mapping, trim_to_usable_years

from .conftest import make_series


def payload(parameter_values: dict) -> power.PowerPayload:
    body = {
        "header": {"fill_value": -999.0, "api": {"version": "test"}, "sources": ["MERRA2"], "end": "20251231"},
        "parameters": {"T2M": {"units": "C"}},
        "properties": {"parameter": {"T2M": parameter_values}},
    }
    return power.PowerPayload(0.0, 0.0, "https://example.invalid", "2026-01-01T00:00:00+00:00", "cache", body)


def test_power_annual_entries_are_excluded():
    values = {f"2020{m:02d}": float(m) for m in range(1, 13)}
    values["202013"] = 99.0
    series, fills = payload(values).series("T2M")
    assert len(series.values) == 12
    assert 99.0 not in series.values
    assert fills == 0


def test_power_fill_values_become_missing():
    values = {f"2020{m:02d}": float(m) for m in range(1, 13)}
    values["202003"] = -999.0
    series, fills = payload(values).series("T2M")
    assert fills == 1
    assert np.isnan(series.values[2])
    assert np.isfinite(series.values).sum() == 11


def test_cached_power_response_is_authentic_shape():
    cached = power.read_cache(40.42, -3.7)
    assert cached is not None
    assert cached.request_url.startswith("https://power.larc.nasa.gov/api/temporal/monthly/point")
    series, _ = cached.series("T2M")
    assert series.first_year == 1981
    assert len(series.values) % 12 == 0


def test_sunlight_is_restricted_to_one_source():
    assert VARIABLES["sunlight"].first_year == 2001


def test_coordinates_are_validated():
    with pytest.raises(ValueError):
        power.normalise(95.0, 0.0)
    with pytest.raises(ValueError):
        power.normalise(0.0, 200.0)


def test_offline_mode_refuses_unknown_points():
    with pytest.raises(power.PowerUnavailable):
        power.fetch_point(-77.77, 11.11)


def test_grid_cell_contains_point():
    cell = grid_cell(40.42, -3.70, (0.5, 0.625))
    assert cell["west"] <= -3.70 <= cell["east"]
    assert cell["south"] <= 40.42 <= cell["north"]
    assert cell["east"] - cell["west"] == pytest.approx(0.625)
    one_degree = grid_cell(-33.87, 151.21, (1.0, 1.0))
    assert one_degree == {"west": 151.0, "south": -34.0, "east": 152.0, "north": -33.0}


def test_missing_months_stay_missing():
    series = from_mapping({(2000, 1): 1.0, (2000, 3): 3.0, (2001, 12): 5.0})
    assert len(series.values) == 24
    assert np.isfinite(series.values).sum() == 3


def test_partial_edge_years_are_trimmed():
    observations = {(y, m): 1.0 for y in range(2000, 2012) for m in range(1, 13)}
    for month in range(1, 10):
        del observations[(2000, month)]
    del observations[(2011, 12)]
    trimmed = trim_to_usable_years(from_mapping(observations))
    assert trimmed.first_year == 2001
    assert trimmed.last_year == 2011


def test_coverage_requires_ten_years():
    assert not quality.assess(make_series(9)).sufficient
    assert quality.assess(make_series(10)).sufficient
    assert quality.assess(make_series(10)).short_record
    assert not quality.assess(make_series(15)).short_record


def test_coverage_boundary_at_ninety_percent():
    series = make_series(10)
    values = series.values.copy()
    values[np.arange(0, 120, 10)] = np.nan
    exactly = MonthlySeries(series.years, series.months, values)
    assert quality.assess(exactly).fraction == pytest.approx(0.90)
    assert quality.assess(exactly).sufficient
    values[5] = np.nan
    below = quality.assess(MonthlySeries(series.years, series.months, values))
    assert not below.sufficient
    assert "missing" in below.reason


def test_empty_record_is_not_enough_data():
    empty = from_mapping({})
    assert not quality.assess(empty).sufficient


def test_anomalies_average_zero_for_each_calendar_month():
    series = make_series(30, slope_per_year=0.02, phi=0.4)
    anomaly = seasonal.anomalies(series)
    for month in range(1, 13):
        assert abs(anomaly[series.months == month].mean()) < 1e-9


def test_anomalies_do_not_fill_gaps():
    series = make_series(20)
    values = series.values.copy()
    values[[7, 100, 201]] = np.nan
    anomaly = seasonal.anomalies(MonthlySeries(series.years, series.months, values))
    assert np.isnan(anomaly[[7, 100, 201]]).all()
    assert np.isfinite(anomaly).sum() == 237


def test_giovanni_export_metadata_is_read_from_the_file():
    export = giovanni.load_region(REGIONS[0])
    assert export.product == "OMNO2d"
    assert export.version == "004"
    assert export.fill_value < -1e29
    assert "giovanni.gsfc.nasa.gov" in export.reproduce_url
    assert "utm_source" not in export.reproduce_url


def test_all_bundled_exports_share_product_version_and_differ_in_content():
    exports = [giovanni.load_region(region) for region in REGIONS]
    assert {(e.product, e.version, e.field, e.fill_value) for e in exports} == {
        ("OMNO2d", "004", "ColumnAmountNO2TropCloudScreened", exports[0].fill_value)
    }
    assert len({e.user_bounds for e in exports}) == 3
    assert not np.array_equal(exports[0].values, exports[1].values, equal_nan=True)
    assert not np.array_equal(exports[1].values, exports[2].values, equal_nan=True)


def test_giovanni_daily_values_become_monthly_means():
    export = giovanni.load_region(REGIONS[0])
    series, counts = export.monthly(1e-15)
    january = [v * 1e-15 for (y, m, _), v in zip(export.days, export.values) if (y, m) == (2005, 1) and np.isfinite(v)]
    assert series.values[0] == pytest.approx(np.mean(january))
    assert counts["daily_fill_values_dropped"] == int(np.isnan(export.values).sum())


def test_giovanni_rejects_export_for_the_wrong_box(tmp_path, monkeypatch):
    source = giovanni.DATA_DIR / "new_york_no2.csv"
    (tmp_path / "delhi_no2.csv").write_text(source.read_text())
    monkeypatch.setattr(giovanni, "DATA_DIR", tmp_path)
    delhi = next(r for r in REGIONS if r.id == "delhi-region")
    with pytest.raises(giovanni.GiovanniFileError, match="not the Delhi region box"):
        giovanni.load_region(delhi)


def test_cache_files_carry_provenance():
    for path in power.CACHE_DIR.glob("*.json"):
        stored = json.loads(path.read_text())
        assert stored["request_url"].startswith("https://power.larc.nasa.gov/")
        assert stored["retrieved_at"]
        assert stored["response"]["header"]["sources"]
