#!/usr/bin/env python3
"""Generate theme/tokens.css from theme/_palette.scss.

The iframe applets (illustration/**/models/*.html) are separate documents
that never load the site's compiled stylesheet, so they need the palette
as plain CSS. Rather than paste the colors into each applet, this script
writes them once to theme/tokens.css, which the applets link with

    <link rel="stylesheet" href="/theme/tokens.css">

Run it after editing the maps in _palette.scss (the homepage's pre-render
hook does this on every render):

    python3 _extensions/cjgg/tokens-to-css.py theme/tokens.css
"""
import re
import sys
from pathlib import Path

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


css = "\n\n".join([
    "/* tokens.css — GENERATED from theme/_palette.scss by theme/tokens-to-css.py.\n"
    "   Do not edit by hand; edit the maps in _palette.scss and re-run the script. */",
    block(":root", "latte", "site-light"),
    block("body.quarto-dark, html.quarto-dark", "macchiato", "site-dark"),
]) + "\n"

OUT.write_text(css)
print(f"wrote {OUT} ({len(css.splitlines())} lines)")
