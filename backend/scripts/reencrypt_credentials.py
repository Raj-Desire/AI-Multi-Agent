"""Re-encrypts stored third-party credentials with the dedicated ENCRYPTION_KEY.

Needed once, before rotating JWT_SECRET: credentials written by older versions were encrypted with a key derived from
JWT_SECRET, so rotating that secret would make them undecryptable. This script reads each stored credential (using
either key, or treating an old un-encrypted value as plaintext) and writes it back encrypted with ENCRYPTION_KEY.

  1. python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"   -> set as ENCRYPTION_KEY
  2. python scripts/reencrypt_credentials.py            # dry run
  3. python scripts/reencrypt_credentials.py --apply
  4. Only now rotate JWT_SECRET (this signs everybody out once).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.cosmos import get_twilio_container  # noqa: E402
from app.core.security import decrypt_token, encrypt_token  # noqa: E402

_FIELDS = ("encrypted_auth_token", "encrypted_api_key_secret")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    if not os.getenv("ENCRYPTION_KEY"):
        print("ENCRYPTION_KEY is not set: there is nothing new to re-encrypt with.")
        return 2
    container = get_twilio_container()
    if not container:
        print("Cosmos is not configured")
        return 2

    changed = errors = 0
    for item in container.query_items("SELECT * FROM c", enable_cross_partition_query=True):
        updated = dict(item)
        for field in _FIELDS:
            value = item.get(field)
            if not value:
                continue
            try:
                updated[field] = encrypt_token(decrypt_token(value))
            except ValueError as e:
                errors += 1
                print(f"  ERROR {item.get('id')}.{field}: {e}")
        if updated != item:
            changed += 1
            print(f"  {'re-encrypting' if args.apply else 'would re-encrypt'} {item.get('id')}")
            if args.apply:
                container.upsert_item(updated)
    print(f"{'updated' if args.apply else 'would update'} {changed} document(s), {errors} error(s)")
    if not args.apply:
        print("dry run only. Re-run with --apply.")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
