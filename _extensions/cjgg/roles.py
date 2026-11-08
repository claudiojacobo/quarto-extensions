"""roles.py — read _palette.scss: the palette maps, and $roles.

Shared by tokens-to-css.py and mermaid-classes.py (both run by
tools/check-generated.sh). The shared stylesheets and blocks.tex ask for
colors by role (var(--mk-block-info), mkBlockInfo); $roles in _palette.scss
says which palette color plays each role. This module resolves a role to its
value in light mode, and checks that every role the shared files use exists.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PALETTE = HERE / "_palette.scss"

# The maps holding each mode's values: (palette map, site map).
LIGHT = ("latte", "site-light")
DARK = ("macchiato", "site-dark")


def read_map(name: str) -> list[tuple[str, str]]:
    """The (key, value) pairs of the Sass map called $name, in order."""
    text = PALETTE.read_text()
    m = re.search(rf"\${name}:\s*\((.*?)\);", text, re.S)
    if not m:
        raise SystemExit(f"map ${name} not found in {PALETTE.name}")
    body = re.sub(r"//.*", "", m.group(1))  # strip // comments
    return [(k, v.strip('"')) for k, v in re.findall(r'"([\w-]+)":\s*([^,\s]+)', body)]


def roles() -> list[tuple[str, str]]:
    """The (role, palette key) pairs of $roles."""
    return read_map("roles")


def resolve(mode=LIGHT) -> dict[str, str]:
    """Each role's value in the given mode, e.g. {"block-info": "#04a5e5"}."""
    values = dict(read_map(mode[0])) | dict(read_map(mode[1]))
    out = {}
    for role, key in roles():
        if key not in values:
            raise SystemExit(f'$roles: "{role}" is "{key}", which is not in ${mode[0]} or ${mode[1]}')
        out[role] = values[key]
    return out


def camel(role: str) -> str:
    """block-info -> mkBlockInfo, the role's LaTeX color name."""
    return "mk" + "".join(w.capitalize() for w in role.split("-"))


def check_used() -> None:
    """Every --mk-<role> and mk<Role> in the shared files must be in $roles."""
    known = {r for r, _ in roles()}
    latex = {camel(r): r for r in known}
    missing = []
    for f in sorted(HERE.glob("_*.scss")) + sorted(HERE.glob("*.tex")):
        if f.name == "tokens.tex":
            continue
        text = f.read_text()
        # --mk-name, but not the start of an interpolated name (--mk-block-#{$name})
        for name in re.findall(r"--mk-([\w-]*\w)(?![\w#-])", text):
            if name not in known:
                missing.append(f"{f.name}: --mk-{name}")
        for name in re.findall(r"\b(mk[A-Z]\w*)", text):
            if name not in latex:
                missing.append(f"{f.name}: {name}")
    # The block loop in _blocks.scss builds --mk-block-<name> from $block-icons.
    blocks = re.search(r"\$block-icons:\s*\((.*?)\);", (HERE / "_blocks.scss").read_text(), re.S)
    if blocks:
        for name in re.findall(r'"([\w-]+)":', blocks.group(1)):
            if f"block-{name}" not in known:
                missing.append(f"_blocks.scss: block {name} (--mk-block-{name})")
    if missing:
        raise SystemExit("roles used but not defined in $roles (_palette.scss):\n  " + "\n  ".join(missing))
