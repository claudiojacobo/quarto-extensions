#!/bin/sh
# Fail if the extensions are out of step. Run by the pre-commit hook
# (tools/hooks/pre-commit) and by GitHub Actions on every push.
#
# 1. Shared files (tools/shared-files.txt) must be identical in every
#    extension to mathkit's, their source of truth. Nothing is copied here:
#    a difference may be an edit made in the wrong place, so it is reported
#    and left for you (edit mathkit, then run tools/sync-shared.sh).
# 2. Each extension's generated files must be current with their sources:
#      macros.tex                    -> mathjax-config.html   (macros-to-mathjax.py)
#      _palette.scss ($roles)        -> tokens.tex            (roles.py, which also
#                                       checks that every role used exists)
#      _cells.scss + _palette.scss   -> mermaid-classes.mmd   (mermaid-classes.py)
#    They are regenerated; if one changed, it was out of date.
set -e
cd "$(git rev-parse --show-toplevel)"
SRC=_extensions/mathkit
status=0

files=$(grep -v '^#' tools/shared-files.txt | grep .)
for E in _extensions/*/; do
  E=${E%/}
  [ "$E" = "$SRC" ] && continue
  for f in $files; do
    if ! cmp -s "$SRC/$f" "$E/$f"; then
      echo "Shared file differs from mathkit's: $E/$f" >&2
      status=1
    fi
  done
done
if [ $status -ne 0 ]; then
  echo "Edit shared files in $SRC/ only, then run tools/sync-shared.sh." >&2
  echo "(If the change was made in a copy, move it to $SRC/ first.)" >&2
  exit 1
fi

generated=""
for E in _extensions/*/; do
  E=${E%/}
  python3 "$E/macros-to-mathjax.py" > /dev/null
  python3 "$E/roles.py" > /dev/null
  python3 "$E/mermaid-classes.py" > /dev/null
  generated="$generated $E/mathjax-config.html $E/tokens.tex $E/mermaid-classes.mmd"
done
if ! git diff --quiet -- $generated; then
  echo "Generated files were out of date with their sources:" >&2
  git diff --stat -- $generated >&2
  echo "They have been regenerated. Review them, git add them, and commit again." >&2
  exit 1
fi
