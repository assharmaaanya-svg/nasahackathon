import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from longwatch.cases import power_case
from longwatch.catalog import PLACES, POWER_VARIABLES

rows = []
for place in PLACES:
    for variable in POWER_VARIABLES:
        started = time.time()
        record = power_case(place.lat, place.lon, variable.id, place.name)
        result = record["result"]
        row = {
            "place": place.name,
            "latitude": place.lat,
            "longitude": place.lon,
            "variable": variable.id,
            "units": variable.units,
            "window": record["provenance"]["analysis_window"],
            "coverage": record["coverage"]["fraction"],
            "served_from": record["provenance"]["served_from"],
        }
        if result:
            needed = result["years_needed"]
            row.update(
                verdict=result["verdict"],
                theil_sen_per_decade=result["rank"]["slope"],
                ci_low=result["rank"]["ci_low"],
                ci_high=result["rank"]["ci_high"],
                p_rank=result["rank"]["p_adjusted"],
                ols_per_decade=result["least_squares"]["slope"],
                p_least_squares=result["least_squares"]["p_adjusted"],
                r1=result["least_squares"]["r1"],
                detection_year=result["detection"]["detection_year"],
                first_crossing_year=result["detection"]["first_crossing_year"],
                lapses=result["detection"]["lapses"],
                additional_years=needed["additional_years"] if needed and needed["available"] else None,
                reverses=result["shape"]["reverses"],
                seconds=round(time.time() - started, 2),
            )
        else:
            row.update(verdict="not_enough_data")
        rows.append(row)
        print(
            f"{row['place']:<12} {row['variable']:<13} {row['verdict']:<19} "
            f"{row.get('theil_sen_per_decade', float('nan')):+8.3f} [{row.get('ci_low') or float('nan'):+7.3f},{row.get('ci_high') or float('nan'):+7.3f}] "
            f"p_mk={row.get('p_rank', float('nan')):.3f} p_ls={row.get('p_least_squares', float('nan')):.3f} r1={row.get('r1', float('nan')):.2f} "
            f"det={row.get('detection_year')} first={row.get('first_crossing_year')} lapses={row.get('lapses')} more={row.get('additional_years') and round(row['additional_years'])} "
            f"bend={row.get('reverses')} {row.get('seconds')}s {row['served_from']}",
            flush=True,
        )
    if rows[-1]["served_from"] == "live":
        time.sleep(1.0)

out = Path(__file__).resolve().parent.parent.parent / "docs" / "screening_results.json"
out.write_text(json.dumps(rows, indent=1))
print("wrote", out)
