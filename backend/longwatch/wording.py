from __future__ import annotations

from .stats import verdict as verdicts

VERDICT_LABELS = {
    verdicts.DETECTED_RISING: "Detected rising",
    verdicts.DETECTED_FALLING: "Detected falling",
    verdicts.SUGGESTIVE: "Suggestive",
    verdicts.NOT_DETECTABLE_YET: "Not detectable yet",
    verdicts.NOT_ENOUGH_DATA: "Not enough data",
}

STANDING_CAVEATS = [
    "Detection is not attribution: a detectable trend says that a change is under way in this record, not what is causing it.",
    "The year of sustained detection is found in hindsight, with the full record in hand. Nobody could have named it in that year, and it depends on when the record starts. The full-record result is the formal test.",
    "A straight line is a summary. A record that rises and then falls can hide behind a flat or weak linear trend.",
    "A p-value is the chance of seeing data this extreme if there were no trend. It is not the chance that the trend is real.",
]


def signed(value: float, decimals: int) -> str:
    text = f"{abs(value):.{decimals}f}"
    if float(text) == 0:
        return text
    return ("+" if value > 0 else "−") + text


def interval(low: float | None, high: float | None, decimals: int) -> str:
    if low is None or high is None:
        return "interval too wide to state"
    return f"{signed(low, decimals)} to {signed(high, decimals)}"


def compose(case: dict, coverage: dict, result: dict | None) -> dict:
    variable = case["variable"]
    place = case["place"]["name"]
    units = variable["units"]
    decimals = variable["decimals"]
    noun = variable["name"].lower() if variable["id"] != "no2" else "the tropospheric NO₂ column"
    if result is None:
        return {
            "label": VERDICT_LABELS[verdicts.NOT_ENOUGH_DATA],
            "headline": "Not enough data to test for a trend.",
            "summary": coverage["reason"],
            "detection": None,
            "years_needed": None,
            "shape": None,
            "chart_summary": f"{variable['name']} for {place}: {coverage['reason']}",
            "caveats": [variable["caveat"]] + STANDING_CAVEATS,
        }
    verdict = result["verdict"]
    rank = result["rank"]
    span = f"{coverage['first_year']}–{coverage['last_year']}"
    rate = f"{signed(rank['slope'], decimals)} {units} per decade"
    band = interval(rank["ci_low"], rank["ci_high"], decimals)
    lean = rank["slope"] if rank["slope"] != 0 else result["least_squares"]["slope"]
    direction = "rising" if lean > 0 else "falling"
    if verdict in (verdicts.DETECTED_RISING, verdicts.DETECTED_FALLING):
        headline = f"Trend detected: {direction}, {rate}."
        summary = (
            f"{span}: {rate} (95% interval {band}). "
            "Both autocorrelation-aware tests reject no-trend at the 5% level and agree on direction."
        )
    elif verdict == verdicts.SUGGESTIVE:
        headline = f"Suggestive of a {direction} trend, below the detection threshold."
        summary = (
            f"{span}: best estimate {rate} (95% interval {band}). "
            "The two tests do not both reach the 5% level, so natural variability cannot be set aside."
        )
    else:
        headline = f"No detection in {coverage['span_years']} years of record."
        summary = (
            f"{span}: best estimate {rate}; the 95% interval ({band}) includes zero. "
            "This is not evidence of stability. A change of this size could be present and hidden in the noise."
        )
    detection = result["detection"]
    detection_text = None
    final_year = coverage["last_year"]

    def span_of(run: dict) -> str:
        return f"in {run['from']}" if run["from"] == run["to"] else f"from {run['from']} to {run['to']}"

    def word_of(run: dict) -> str:
        return "rise" if run["verdict"] == verdicts.DETECTED_RISING else "fall"

    earlier = [run for run in detection["runs"] if run["to"] != final_year or detection["detection_year"] is None]
    if detection["detection_year"] is not None:
        detection_text = (
            f"Retrospective sustained detection from {detection['detection_year']}, "
            f"at {detection['years_watched_at_detection']} years of record "
            f"({detection['record_start_year']}–{detection['detection_year']}). Found in hindsight from the full record."
        )
        if detection["provisional"]:
            held = detection["years_held"]
            detection_text += f" Provisional: held for {held} year{'s' if held != 1 else ''} so far."
        opposite = [run for run in earlier if run["verdict"] != verdict]
        same = [run for run in earlier if run["verdict"] == verdict]
        if detection["at_first_endpoint"]:
            detection_text = (
                f"Detected at the first endpoint tested, {detection['detection_year']} "
                f"({detection['years_watched_at_detection']} years of record). "
                "Shorter records are not tested, so detection may have been possible earlier."
            )
        if opposite:
            detection_text += (
                f" Earlier, {span_of(opposite[0])}, the same tests detected a {word_of(opposite[0])}. "
                "The record changed direction."
            )
        elif same:
            detection_text += (
                f" First met in {same[0]['from']}; lapsed {len(same)} time{'s' if len(same) > 1 else ''} before holding."
            )
    elif earlier:
        last_run = earlier[-1]
        detection_text = (
            f"Detection rule met {span_of(last_run)} ({word_of(last_run)}); the record has since fallen back below it. "
            "Later observations can weaken evidence as well as strengthen it."
        )
    needed = result["years_needed"]
    needed_text = None
    if needed is not None and not verdicts.is_detected(verdict):
        if needed["available"]:
            have = round(needed["record_years"])
            total = round(needed["total_years"])
            strong = round(needed["total_years_if_stronger"])
            weak = needed["total_years_if_weaker"]
            needed_text = (
                f"Record length for a 90% chance of detection, if the true rate equals the estimate "
                f"and the noise stays the same: about {total} years ({have} so far). "
                + (
                    f"At the strong end of the interval: about {strong} years. "
                    if strong > have
                    else "At the strong end of the interval: the record is already long enough. "
                )
                + (
                    "At the weak end the interval reaches zero, and a true rate of zero is never detected however long the record."
                    if weak is None
                    else f"At the weak end: about {round(weak)} years."
                )
            )
        else:
            needed_text = needed["reason"]
    shape = result["shape"]
    shape_text = None
    if shape["reverses"]:
        shape_text = (
            f"Straight-line warning: this record bends, with a {shape['turning_point_kind']} near "
            f"{round(shape['turning_point_year'])}. A single linear rate describes it poorly."
        )
    elif shape["curved"]:
        shape_text = "Straight-line note: the rate of change is not constant across this record, so the linear rate is an average."
    if shape_text and variable["source_kind"] in ("reanalysis", "model"):
        shape_text += (
            " In a reanalysis or model record, a bend can come from changes in the observations fed into it "
            "as well as from the environment itself, so the shape alone is not evidence of a physical reversal."
        )
    chart = (
        f"{variable['name']} for {place}, {span}, shown as monthly departures from the usual seasonal cycle. "
        f"{headline} Rate {rate}, 95% interval {band}. "
        + (detection_text or needed_text or "")
    )
    return {
        "label": VERDICT_LABELS[verdict],
        "headline": headline,
        "summary": summary,
        "detection": detection_text,
        "years_needed": needed_text,
        "shape": shape_text,
        "chart_summary": chart.strip(),
        "caveats": [variable["caveat"]] + STANDING_CAVEATS,
    }
