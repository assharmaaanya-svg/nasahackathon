import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from longwatch.analysis import SCHEMA, analyse, compare_results, series_from_record
from longwatch.api import check_snapshot

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python scripts/rerun.py exported-record.json")
    record = json.loads(Path(sys.argv[1]).read_text())
    if record.get("schema") != SCHEMA:
        sys.exit(f"Not a {SCHEMA} record.")
    check_snapshot(record)
    fresh = analyse(series_from_record(record), record["case"], record["provenance"])
    differences = compare_results(record, fresh)
    result = fresh["result"]
    print(f"record          {record['id']}")
    print(f"series sha256   {fresh['provenance']['series_sha256']}")
    print(f"stored sha256   {record['provenance'].get('series_sha256')}")
    if result:
        rank = result["rank"]
        print(f"verdict         {result['verdict']}")
        print(f"rate / decade   {rank['slope']:.6f}  ({rank['ci_low']:.6f} to {rank['ci_high']:.6f})")
        print(f"sustained from  {result['detection']['detection_year']}")
    print(f"replay frames   {len(fresh['replay']['frames'])}")
    if differences:
        print(f"DIFFERS in {len(differences)} value(s): {', '.join(differences[:10])}")
        sys.exit(1)
    print("REPRODUCED: every result and replay value matches the stored record to 1e-9.")
