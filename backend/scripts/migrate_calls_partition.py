"""Copies the calls container into a new container partitioned by /organization_id.

Why: the calls container was partitioned by /user_id while nearly every read is "all calls of an organization", so each
of those reads fanned out across every partition. A partition key cannot be changed in place, so the data has to move.

This script NEVER deletes or modifies the source container. It is idempotent (upsert) and can be re-run to pick up calls
written while a previous run was in progress.

Cut-over procedure
  1. python scripts/migrate_calls_partition.py --target calls_by_org              (dry run: counts only)
  2. python scripts/migrate_calls_partition.py --target calls_by_org --apply      (initial copy)
  3. Set  COSMOS_CONTAINER_CALLS=calls_by_org  and  COSMOS_CALLS_PARTITION_FIELD=organization_id  and restart the API.
  4. python scripts/migrate_calls_partition.py --target calls_by_org --apply      (catch-up: calls saved during step 3)
  5. Keep the old container for a few days as a rollback, then delete it from the Azure portal.
Rollback: restore the two environment variables to their previous values and restart.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from azure.cosmos import PartitionKey  # noqa: E402

from app.core.cosmos import CONTAINER_SPECS, COSMOS_DATABASE, get_cosmos_client  # noqa: E402

_SYSTEM_PROPS = ("_rid", "_self", "_etag", "_attachments", "_ts")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", default=os.getenv("COSMOS_CONTAINER_CALLS", "calls"), help="existing container (default: current calls container)")
    parser.add_argument("--target", required=True, help="new container name, e.g. calls_by_org")
    parser.add_argument("--apply", action="store_true", help="actually copy (default is a dry run)")
    args = parser.parse_args()

    if args.source == args.target:
        print("source and target must differ")
        return 2

    client = get_cosmos_client()
    if not client:
        print("COSMOS_ENDPOINT / COSMOS_KEY are not configured")
        return 2
    db = client.get_database_client(COSMOS_DATABASE)
    source = db.get_container_client(args.source)

    total = list(source.query_items("SELECT VALUE COUNT(1) FROM c", enable_cross_partition_query=True))[0]
    print(f"source '{args.source}': {total} documents")
    if not args.apply:
        print(f"dry run: would create '{args.target}' (partition key /organization_id) and copy {total} documents. Re-run with --apply.")
        return 0

    policy = CONTAINER_SPECS["calls"].get("indexing_policy")
    kwargs = {"indexing_policy": policy} if policy else {}
    target = db.create_container_if_not_exists(id=args.target, partition_key=PartitionKey(path="/organization_id"), **kwargs)

    copied = skipped = failed = 0
    for item in source.query_items("SELECT * FROM c", enable_cross_partition_query=True):
        if not item.get("organization_id"):
            skipped += 1
            print(f"  skipped (no organization_id): {item.get('id')}")
            continue
        doc = {k: v for k, v in item.items() if k not in _SYSTEM_PROPS}
        try:
            target.upsert_item(doc)
            copied += 1
        except Exception as e:  # keep going: the run is resumable, report at the end
            failed += 1
            print(f"  FAILED {item.get('id')}: {e}")
        if copied and copied % 500 == 0:
            print(f"  copied {copied}/{total} ...")

    target_total = list(target.query_items("SELECT VALUE COUNT(1) FROM c", enable_cross_partition_query=True))[0]
    print(f"done: copied={copied} skipped={skipped} failed={failed}; target now holds {target_total} documents (source {total})")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
