#!/usr/bin/env python3
"""Apply the macro renames in macro-renames.tsv to a project's source files.

    python3 rename-macros.py ~/Git/math-120            # dry run: show what would change
    python3 rename-macros.py ~/Git/math-120 --write    # make the changes

Only whole macro names change: \\norm becomes \\Norm, but \\normalsize is
left alone. Looks at .qmd, .md and .tex files and skips build output
(_site, _freeze, .quarto, .git) and __old. Review with `git diff` afterwards.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKIP = {"_site", "_freeze", ".quarto", ".git", "__old", "_instructor", "_accessible", "_extensions"}
SUFFIXES = {".qmd", ".md", ".tex"}


def load_renames() -> list[tuple[str, str]]:
    pairs = []
    for line in (HERE / "macro-renames.tsv").read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            old, new = line.split("\t")
            pairs.append((old, new))
    return pairs


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    write = "--write" in sys.argv
    if len(args) != 1:
        sys.exit(__doc__)
    root = Path(args[0]).expanduser().resolve()
    renames = [(re.compile(r"\\%s(?![A-Za-z])" % re.escape(old)), "\\" + new, old, new)
               for old, new in load_renames()]
    total = 0
    for path in sorted(root.rglob("*")):
        if path.suffix not in SUFFIXES or SKIP & set(path.relative_to(root).parts):
            continue
        text = path.read_text(encoding="utf-8")
        new_text, hits = text, []
        for pattern, repl, old, new in renames:
            new_text, n = pattern.subn(lambda m: repl, new_text)
            if n:
                hits.append(f"\\{old}→\\{new} ×{n}")
        if hits:
            total += 1
            print(f"{path.relative_to(root)}: {', '.join(hits)}")
            if write:
                path.write_text(new_text, encoding="utf-8")
    # Removed macros whose arguments changed shape: report, don't rewrite.
    removed = re.compile(r"\\(diffn|diffpn|dln|dlp)(?![A-Za-z])")
    for path in sorted(root.rglob("*")):
        if path.suffix in SUFFIXES and not SKIP & set(path.relative_to(root).parts):
            for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if removed.search(line):
                    print(f"  needs a hand edit (see macro-renames.tsv): {path.relative_to(root)}:{n}")
    verb = "changed" if write else "would change (dry run; add --write)"
    print(f"\n{total} file(s) {verb}")


if __name__ == "__main__":
    main()
