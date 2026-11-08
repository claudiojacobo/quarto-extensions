#!/usr/bin/env python3
"""Generate tokens.css (or tokens.tex) from _palette.scss.

The iframe applets (illustration/**/models/*.html) are separate documents
that never load the site's compiled stylesheet, so they need the palette
as plain CSS. Rather than paste the colors into each applet, this script
writes them once to theme/tokens.css, which the applets link with

    <link rel="stylesheet" href="/theme/tokens.css">

Run it after editing the maps in _palette.scss (the homepage's pre-render
hook does this on every render):

    python3 _extensions/cjgg/tokens-to-css.py theme/tokens.css

With a .tex output path it writes LaTeX \definecolor lines instead: the
palette (ctpSky, ctpText, schoolPrimary, …) for anyone's LaTeX, and the roles
(mkBlockInfo, mkText, …; see $roles in _palette.scss), which blocks.tex uses:

    python3 _extensions/cjgg/tokens-to-css.py _extensions/cjgg/tokens.tex
"""
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True        # no __pycache__ in the extension folder
sys.path.insert(0, str(Path(__file__).resolve().parent))
import roles  # noqa: E402  (roles.py, next to this script)

HERE = Path(__file__).resolve().parent
SRC = HERE / "_palette.scss"
# Output path is the first argument (the site decides where it serves the
# file from); default: next to this script.
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "tokens.css"

text = SRC.read_text()


def read_map(name: str) -> list[tuple[str, str]]:
    """Return the (key, value) pairs of the Sass map called $name."""
    m = re.search(rf"\${name}:\s*\((.*?)\);", text, re.S)
    if not m:
        raise SystemExit(f"map ${name} not found in {SRC.name}")
    body = re.sub(r"//.*", "", m.group(1))  # strip // comments
    return re.findall(r'"([\w-]+)":\s*([^,\s]+)', body)


def block(selector: str, ctp: str, site: str) -> str:
    lines = [f"{selector} {{"]
    lines += [f"  --ctp-{k}: {v};" for k, v in read_map(ctp)]
    lines += [f"  --{k}: {v};" for k, v in read_map(site)]
    lines.append("}")
    return "\n".join(lines)


def latex() -> str:
    """\definecolor lines: ctp-sky → ctpSky, school-primary → schoolPrimary."""
    def camel(k: str) -> str:
        head, *rest = k.split("-")
        return head + "".join(w.capitalize() for w in rest)
    lines = ["% tokens.tex — GENERATED from _palette.scss by tokens-to-css.py. Do not edit.",
             "% Light (Latte) palette: PDF has no dark mode."]
    for k, v in read_map("latte"):
        lines.append(f"\\definecolor{{ctp{k.capitalize()}}}{{HTML}}{{{v.lstrip('#').upper()}}}")
    for k, v in read_map("site-light"):
        if v.startswith("#"):
            lines.append(f"\\definecolor{{{camel(k)}}}{{HTML}}{{{v.lstrip('#').upper()}}}")
    lines.append("% Roles ($roles in _palette.scss): the colors the shared environments use.")
    for role, v in roles.resolve().items():
        if v.startswith("#"):
            lines.append(f"\\definecolor{{{roles.camel(role)}}}{{HTML}}{{{v.lstrip('#').upper()}}}")
    return "\n".join(lines) + "\n"


roles.check_used()
if OUT.suffix == ".tex":
    out_text = latex()
else:
    out_text = "\n\n".join([
        "/* tokens.css — GENERATED from theme/_palette.scss by theme/tokens-to-css.py.\n"
        "   Do not edit by hand; edit the maps in _palette.scss and re-run the script. */",
        block(":root", "latte", "site-light"),
        block("body.quarto-dark, html.quarto-dark", "macchiato", "site-dark"),
    ]) + "\n"

OUT.write_text(out_text)
print(f"wrote {OUT} ({len(out_text.splitlines())} lines)")
