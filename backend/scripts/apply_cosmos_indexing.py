"""Applies the indexing policies defined in app/core/cosmos.py to EXISTING containers.

New containers get their policy at creation (init_cosmos_db). Existing ones keep the default "index every property"
policy, which makes every write of a call transcript or an embedding vector more expensive. Changing a policy starts a
background re-index (reads keep working; it consumes spare RU), so run it off-peak.

  python scripts/apply_cosmos_indexing.py            # dry run: shows what would change
  python scripts/apply_cosmos_indexing.py --apply
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from azure.cosmos import PartitionKey  # noqa: E402

from app.core.cosmos import CONTAINER_SPECS, COSMOS_DATABASE, get_cosmos_client  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    client = get_cosmos_client()
    if not client:
        print("COSMOS_ENDPOINT / COSMOS_KEY are not configured")
        return 2
    db = client.get_database_client(COSMOS_DATABASE)

    for key, spec in CONTAINER_SPECS.items():
        wanted = spec.get("indexing_policy")
        if not wanted:
            continue
        container = db.get_container_client(spec["name"])
        props = container.read()
        current = props.get("indexingPolicy", {})
        current_excluded = sorted(p["path"] for p in current.get("excludedPaths", []))
        wanted_excluded = sorted(p["path"] for p in wanted["excludedPaths"])
        if current_excluded == wanted_excluded:
            print(f"[{spec['name']}] already up to date")
            continue
        print(f"[{spec['name']}] excluded paths\n  now : {json.dumps(current_excluded)}\n  new : {json.dumps(wanted_excluded)}")
        if args.apply:
            db.replace_container(container, partition_key=PartitionKey(path=props["partitionKey"]["paths"][0]), indexing_policy=wanted)
            print("  applied (re-indexing continues in the background)")
    if not args.apply:
        print("dry run only. Re-run with --apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
