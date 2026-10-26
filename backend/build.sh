#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -o errexit

echo "--- Starting Render Backend Build ---"

# Render stores persistent build caches across deployments in /opt/render/project/.cache/
CACHE_DIR="/opt/render/project/.cache"
mkdir -p "$CACHE_DIR"

REQ_HASH_FILE="$CACHE_DIR/requirements.hash"
CURRENT_HASH=$(sha256sum requirements.txt | awk '{print $1}')

if [ -f "$REQ_HASH_FILE" ] && [ "$(cat "$REQ_HASH_FILE")" = "$CURRENT_HASH" ]; then
    echo "⚡ requirements.txt is unchanged since last build."
    echo "⚡ Skipping pip install! Backend build completed in seconds."
else
    echo "📦 requirements.txt changed or initial build. Installing dependencies..."
    python -m pip install --upgrade pip
    pip install --cache-dir "$CACHE_DIR/pip" -r requirements.txt
    echo "$CURRENT_HASH" > "$REQ_HASH_FILE"
    echo "✅ Dependencies installed and cached successfully."
fi

echo "--- Render Backend Build Finished ---"
