#!/usr/bin/env python3
"""Write a site's tokens.css from _palette.scss, and copy the applet kit
beside it (cjgg only).

The iframe applets (on the homepage, illustration/**/models/*.html) are
separate documents that never load the site's compiled stylesheet, so they
need the palette as plain CSS. Rather than paste the colors into each
applet, this script writes them once to theme/tokens.css. And it copies the
applet kit, applet.css and applet.js (this extension's; their header
comments and the README's "The applet kit" say what they do), into the same
folder. The applets link all three:

    <link rel="stylesheet" href="/theme/tokens.css">
    <link rel="stylesheet" href="/theme/applet.css">
    import { theme, drag, ... } from "/theme/applet.js";

A site runs it before every render, one line in its _quarto.yml:

    project:
      pre-render:
        - python3 _extensions/claudiojacobo/cjgg/tokens-to-css.py theme/tokens.css

A copy is written only when it differs from the extension's, so a site that
commits its theme/ folder sees in a diff when an update changed the kit.
(The PDF's colors, tokens.tex, are written by roles.py.)
"""
import re
import shutil
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


out_text = "\n\n".join([
    "/* tokens.css — GENERATED from the cjgg extension's _palette.scss by its\n"
    "   tokens-to-css.py. Do not edit by hand; edit the maps in _palette.scss. */",
    block(":root", "latte", "site-light"),
    block("body.quarto-dark, html.quarto-dark", "macchiato", "site-dark"),
]) + "\n"

OUT.write_text(out_text)
print(f"wrote {OUT} ({len(out_text.splitlines())} lines)")

# The applet kit, beside tokens.css
for name in ("applet.css", "applet.js"):
    src, dest = HERE / name, OUT.parent / name
    if dest.exists() and dest.read_bytes() == src.read_bytes():
        continue
    shutil.copyfile(src, dest)
    print(f"copied {name} to {dest}")
