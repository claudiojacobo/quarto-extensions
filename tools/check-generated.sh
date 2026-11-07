#!/bin/sh
# Regenerate every generated file in the cjgg extension from its source and
# fail if any of them changed, i.e. was out of date. Run by the pre-commit hook
# (tools/hooks/pre-commit) and by GitHub Actions on every push.
#
#   macros.tex                    -> mathjax-config.html   (macros-to-mathjax.py)
#   _palette.scss                 -> tokens.tex            (tokens-to-css.py)
#   _cells.scss + _palette.scss   -> mermaid-classes.mmd   (mermaid-classes.py)
set -e
cd "$(git rev-parse --show-toplevel)"
E=_extensions/cjgg
python3 "$E/macros-to-mathjax.py" > /dev/null
python3 "$E/tokens-to-css.py" "$E/tokens.tex" > /dev/null
python3 "$E/mermaid-classes.py" > /dev/null
generated="$E/mathjax-config.html $E/tokens.tex $E/mermaid-classes.mmd"
if ! git diff --quiet -- $generated; then
  echo "Generated files were out of date with their sources:" >&2
  git diff --stat -- $generated >&2
  echo "They have been regenerated. Review them, git add them, and commit again." >&2
  exit 1
fi
