import copy
import json

import pytest
from fastapi.testclient import TestClient

from longwatch.api import app

client = TestClient(app)
MADRID = {"latitude": 40.42, "longitude": -3.7, "name": "Madrid"}


@pytest.fixture(scope="module")
def temperature() -> dict:
    response = client.get("/api/analyze", params={**MADRID, "variable": "temperature"})
    assert response.status_code == 200
    return response.json()


def test_catalog_lists_questions_places_and_regions():
    body = client.get("/api/catalog").json()
    assert {v["id"] for v in body["variables"]} == {"temperature", "precipitation", "soil_wetness", "sunlight", "no2"}
    assert len(body["places"]) >= 10
    available = [r for r in body["regions"] if r["available"]]
    assert [r["id"] for r in available] == ["new-york-region", "north-china-plain", "delhi-region"]
    assert {(r["product"], r["version"]) for r in available} == {("OMNO2d", "004")}


def test_record_structure_and_provenance(temperature):
    assert temperature["schema"] == "longwatch.record/2"
    provenance = temperature["provenance"]
    assert provenance["request_url"].startswith("https://power.larc.nasa.gov/")
    assert provenance["served_from"] == "cache"
    assert provenance["months_used"] == temperature["coverage"]["valid_months"]
    assert provenance["source_kind"] == "reanalysis"
    assert len(temperature["series"]["raw"]) == temperature["coverage"]["expected_months"]
    assert all(m <= 12 for m in temperature["series"]["months"])


def test_displayed_numbers_are_consistent(temperature):
    result = temperature["result"]
    final = temperature["replay"]["frames"][-1]
    assert final["rank"]["slope"] == result["rank"]["slope"]
    assert final["verdict"] == result["verdict"]
    assert result["rank"]["slope"] == pytest.approx(result["rank"]["slope_per_year"] * 10)
    assert result["rank"]["ci_low"] <= result["rank"]["slope"] <= result["rank"]["ci_high"]
    if result["detection"]["detection_year"] is not None:
        year = result["detection"]["detection_year"]
        later = [f for f in temperature["replay"]["frames"] if f["end_year"] >= year]
        assert all(f["verdict"] == result["verdict"] for f in later)


def test_json_is_strictly_valid(temperature):
    text = json.dumps(temperature, allow_nan=False)
    assert "NaN" not in text


def test_wording_never_overclaims():
    banned = ["proves", "proof that", "caused by", "because of climate change", "no change is happening", "is not changing"]
    for variable in ("temperature", "precipitation", "soil_wetness", "sunlight"):
        record = client.get("/api/analyze", params={**MADRID, "variable": variable}).json()
        text = json.dumps(record["text"]).lower()
        for phrase in banned:
            assert phrase not in text, (variable, phrase)


def test_sunlight_uses_only_the_ceres_period():
    record = client.get("/api/analyze", params={**MADRID, "variable": "sunlight"}).json()
    assert record["coverage"]["first_year"] == 2001
    assert min(record["series"]["years"]) == 2001


def test_same_request_gives_the_same_verdict(temperature):
    again = client.get("/api/analyze", params={**MADRID, "variable": "temperature"}).json()
    assert again["id"] == temperature["id"]
    assert again["result"] == temperature["result"]


def test_exported_record_reruns_to_identical_numbers(temperature):
    response = client.post("/api/rerun", json=temperature)
    assert response.status_code == 200
    body = response.json()
    assert body["reproduced"] is True
    assert body["differences"] == []
    assert body["record"]["result"] == temperature["result"]


def test_rerun_detects_a_tampered_record(temperature):
    tampered = copy.deepcopy(temperature)
    tampered["result"]["rank"]["slope"] += 0.5
    body = client.post("/api/rerun", json=tampered).json()
    assert body["reproduced"] is False
    assert "result.rank.slope" in body["differences"]


def test_rerun_rejects_foreign_files():
    assert client.post("/api/rerun", json={"hello": "world"}).status_code == 422


def test_unknown_variable_and_bad_coordinates_are_rejected():
    assert client.get("/api/analyze", params={**MADRID, "variable": "wind"}).status_code == 404
    assert client.get("/api/analyze", params={"latitude": 120, "longitude": 0, "variable": "temperature"}).status_code == 422
    assert client.get("/api/analyze", params={**MADRID, "variable": "no2"}).status_code == 404


def test_unreachable_point_reports_the_failed_step():
    response = client.get("/api/analyze", params={"latitude": -77.77, "longitude": 11.11, "variable": "temperature"})
    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["step"] and detail["cause"]


def test_satellite_region_record():
    record = client.get("/api/region/new-york-region").json()
    assert record["case"]["kind"] == "giovanni"
    assert "OMNO2d version 004" in record["provenance"]["product"]
    assert record["case"]["variable"]["source_kind"] == "satellite retrieval"
    assert "not the concentration people breathe" in record["case"]["variable"]["caveat"]
    assert record["coverage"]["first_year"] == 2005


def test_three_regions_are_distinct_records():
    records = [client.get(f"/api/region/{name}").json() for name in ("new-york-region", "north-china-plain", "delhi-region")]
    assert len({r["id"] for r in records}) == 3
    assert len({tuple(r["series"]["raw"][:24]) for r in records}) == 3
    for record in records:
        box = record["case"]["place"]["footprint"]
        assert f"bbox={box['west']:g},{box['south']:g},{box['east']:g},{box['north']:g}" in record["provenance"]["request_url"]
        assert "OMNO2d version 004" in record["provenance"]["product"]


def test_detection_history_is_described_in_words():
    china = client.get("/api/region/north-china-plain").json()
    assert china["result"]["shape"]["reverses"]
    runs = china["result"]["detection"]["runs"]
    assert {run["verdict"] for run in runs} == {"detected_rising", "detected_falling"}
    assert "changed direction" in china["text"]["detection"]
    assert china["text"]["detection"].startswith("Retrospective sustained detection from 2021, at 17 years of record (2005–2021)")
    delhi = client.get("/api/region/delhi-region").json()
    assert delhi["result"]["detection"]["detection_year"] is None
    assert delhi["result"]["detection"]["runs"]
    assert "has since fallen back" in delhi["text"]["detection"]


def test_missing_region_export_is_reported(tmp_path, monkeypatch):
    from longwatch import cases, giovanni

    monkeypatch.setattr(giovanni, "DATA_DIR", tmp_path)
    cases.region_case.cache_clear()
    response = client.get("/api/region/delhi-region")
    cases.region_case.cache_clear()
    assert response.status_code == 404
    assert "No Giovanni export" in response.json()["detail"]["cause"]


def test_static_files_are_served_as_files_not_the_app_shell():
    from longwatch import api

    if not (api.FRONTEND / "mark.svg").exists():
        pytest.skip("frontend build not present")
    icon = client.get("/mark.svg")
    assert icon.status_code == 200
    assert icon.headers["content-type"].startswith("image/svg")
    shell = client.get("/some/app/route")
    assert shell.headers["content-type"].startswith("text/html")
    assert client.get("/../backend/requirements.txt").headers["content-type"].startswith("text/html")


def test_madrid_replay_milestones_match_the_full_record(temperature):
    frames = temperature["replay"]["frames"]
    detection = temperature["result"]["detection"]
    assert frames[0]["end_year"] == 1990
    assert frames[0]["years_watched"] == 10
    assert frames[-1]["end_year"] == temperature["coverage"]["last_year"]
    year = detection["detection_year"]
    assert year == 2016
    assert all(f["verdict"] != "detected_rising" for f in frames if f["end_year"] < year)
    assert all(f["verdict"] == "detected_rising" for f in frames if f["end_year"] >= year)
    assert detection["runs"] == [{"from": year, "to": frames[-1]["end_year"], "verdict": "detected_rising"}]
    at_detection = next(f for f in frames if f["end_year"] == year)
    assert at_detection["rank"]["ci_low"] > 0
    before = next(f for f in frames if f["end_year"] == year - 1)
    assert before["rank"]["ci_low"] <= 0 or before["least_squares"]["p_adjusted"] >= 0.05


def test_each_replay_frame_carries_what_the_interface_displays(temperature):
    for frame in temperature["replay"]["frames"]:
        rank = frame["rank"]
        assert rank["ci_low"] <= rank["slope"] <= rank["ci_high"]
        assert len(frame["climatology"]) == 12
        assert frame["valid_months"] == frame["years_watched"] * 12


def test_madrid_precipitation_is_not_detected_and_has_a_conditional_estimate():
    record = client.get("/api/analyze", params={**MADRID, "variable": "precipitation"}).json()
    result = record["result"]
    assert result["verdict"] == "not_detectable_yet"
    assert result["rank"]["ci_low"] < 0 < result["rank"]["ci_high"]
    assert result["detection"]["detection_year"] is None
    needed = result["years_needed"]
    assert needed["available"] and 25 < needed["additional_years"] < 40
    assert [f["end_year"] for f in record["replay"]["frames"]] == [f["end_year"] for f in client.get("/api/analyze", params={**MADRID, "variable": "temperature"}).json()["replay"]["frames"]]


def test_rerun_rejects_malformed_or_oversized_snapshots(temperature):
    def altered(change) -> int:
        record = copy.deepcopy(temperature)
        change(record)
        return client.post("/api/rerun", json=record).status_code

    assert altered(lambda r: r["series"].__setitem__("years", [y * 1000 for y in r["series"]["years"]])) == 422
    assert altered(lambda r: r["series"].__setitem__("months", [13] * len(r["series"]["months"]))) == 422
    assert altered(lambda r: r["series"].__setitem__("months", [0] * len(r["series"]["months"]))) == 422
    assert altered(lambda r: r["series"].__setitem__("years", list(reversed(r["series"]["years"])))) == 422
    assert altered(lambda r: r["case"]["variable"].__setitem__("decimals", 100000000)) == 422
    assert altered(lambda r: r.__setitem__("provenance", [])) == 422
    assert altered(lambda r: r["series"].__setitem__("raw", ["x"] * len(r["series"]["raw"]))) == 422
    long = copy.deepcopy(temperature)
    extra = 2400
    long["series"]["years"] = [1800 + i // 12 for i in range(extra)]
    long["series"]["months"] = [i % 12 + 1 for i in range(extra)]
    long["series"]["raw"] = [1.0] * extra
    assert client.post("/api/rerun", json=long).status_code == 422


def test_unknown_api_paths_are_not_found():
    assert client.get("/api/nothing-here").status_code == 404


def test_command_line_rerun_reproduces_an_exported_record(temperature, tmp_path):
    import subprocess
    import sys
    from pathlib import Path

    exported = tmp_path / "madrid.json"
    exported.write_text(json.dumps(temperature))
    script = Path(__file__).resolve().parent.parent / "scripts" / "rerun.py"
    done = subprocess.run([sys.executable, str(script), str(exported)], capture_output=True, text=True)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "REPRODUCED" in done.stdout
    tampered = json.loads(json.dumps(temperature))
    tampered["result"]["rank"]["slope"] += 0.01
    exported.write_text(json.dumps(tampered))
    assert subprocess.run([sys.executable, str(script), str(exported)], capture_output=True, text=True).returncode == 1


def test_satellite_record_carries_valid_day_counts_and_series_hash():
    record = client.get("/api/region/new-york-region").json()
    days = record["provenance"]["valid_days_by_month"]
    assert len(record["provenance"]["series_sha256"]) == 64
    assert all(1 <= count <= 31 for count in days.values())
    assert len(days) >= record["provenance"]["months_used"]


def test_start_year_sensitivity_is_reported_for_madrid(temperature):
    rows = temperature["result"]["start_year_sensitivity"]
    assert rows[0]["start_year"] == 1981 and rows[0]["slope"] == temperature["result"]["rank"]["slope"]
    assert all(row["verdict"] == "detected_rising" for row in rows)
