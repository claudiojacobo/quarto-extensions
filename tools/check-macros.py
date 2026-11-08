#!/usr/bin/env python3
"""Ask LaTeX which macro names in macros.tex already exist.

    python3 tools/check-macros.py

Loads the cjgg-pdf packages (packages.tex), then checks every name that
macros.tex defines. A name that already exists means \\providecommand will
silently keep the existing definition in PDF, while HTML (MathJax) uses
ours, so the two outputs disagree: a clash. The exception is a line in
macros.tex ending in a package name comment such as "% diffcoeff", which
says "PDF should use that package's command; this is the HTML fallback."
Needs lualatex (TeX Live).
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

EXT = Path(__file__).resolve().parent.parent / "mathkit" / "_extensions" / "mathkit"


def deferred_names(source: str) -> dict[str, str]:
    """Macros marked with a trailing '% <package>' comment, e.g. '% diffcoeff':
    defined in macros.tex only as the HTML fallback for that package's command."""
    found = {}
    for line in source.splitlines():
        m = re.match(r"\\providecommand\{\\([A-Za-z]+)\}.*%\s*([A-Za-z-]+)\s*$", line)
        if m:
            found[m.group(1)] = m.group(2)
    return found


def main() -> None:
    if not shutil.which("lualatex"):
        sys.exit("lualatex not found; install TeX Live")
    source = (EXT / "macros.tex").read_text()
    deferred = deferred_names(source)
    names = re.findall(r"\\(?:provide|new|renew)command\{\\([A-Za-z]+)\}",
                       re.sub(r"(?<!\\)%.*", "", source))
    checks = "\n".join(f"\\cjggcheck{{{n}}}" for n in names)
    tex = rf"""\documentclass{{article}}
\input{{{EXT / 'packages.tex'}}}
\makeatletter
\newcommand\cjggcheck[1]{{\@ifundefined{{#1}}{{}}{{\typeout{{CJGG-EXISTS:#1}}}}}}
{checks}
\makeatother
\begin{{document}}x\end{{document}}
"""
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / "check.tex").write_text(tex)
        run = subprocess.run(["lualatex", "-interaction=nonstopmode", "-halt-on-error", "check.tex"],
                             cwd=tmp, capture_output=True, text=True)
        log = (Path(tmp) / "check.log").read_text(errors="replace") if (Path(tmp) / "check.log").exists() else run.stdout
    if run.returncode != 0:
        print(log[-2000:])
        sys.exit("LaTeX failed; see the log above")
    exists = re.findall(r"CJGG-EXISTS:([A-Za-z]+)", log)
    clashes = [n for n in exists if n not in deferred]
    print(f"checked {len(names)} macros")
    for n in exists:
        if n in deferred:
            print(f"  \\{n:<16} already defined  (marked '% {deferred[n]}': PDF uses the package's version)")
        else:
            print(f"  \\{n:<16} already defined  <- CLASH: PDF keeps LaTeX's version, HTML uses ours")
    if not exists:
        print("  no name is already defined")
    sys.exit(1 if clashes else 0)


if __name__ == "__main__":
    main()
