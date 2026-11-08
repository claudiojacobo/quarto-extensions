#!/bin/sh
# Copy the shared files (tools/shared-files.txt) from mathkit, their source
# of truth, into every other extension in this repo. Run after editing one of
# them in _extensions/mathkit/, then tools/check-generated.sh (or commit;
# the pre-commit hook runs it) to regenerate each extension's own files.
set -e
cd "$(git rev-parse --show-toplevel)"
SRC=_extensions/mathkit
for dest in _extensions/*/; do
  dest=${dest%/}
  [ "$dest" = "$SRC" ] && continue
  grep -v '^#' tools/shared-files.txt | grep . | while read -r f; do
    cp "$SRC/$f" "$dest/$f"
  done
  echo "synced $SRC -> $dest"
done
