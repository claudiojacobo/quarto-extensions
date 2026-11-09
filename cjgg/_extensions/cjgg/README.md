# cjgg — the look of cjgg.me, on mathkit's machinery

This folder provides the formats `cjgg-html` and `cjgg-pdf`, used by
https://cjgg.me, its course sites and talks:

```yaml
format:
  cjgg-html:
    toc: true          # any normal html option still works here
```

They do everything [`mathkit`](../../../mathkit/_extensions/mathkit/) does (macros, blocks, theorem
styling, course machinery, code-cell filters, diagrams, the concept map, accessible PDF; see
its README), with this look instead of stock Quarto's:

- Catppuccin colors (Latte in light mode, Macchiato in dark) and Carleton's school colors, on Flatly and Darkly.
- Montserrat headings; links, navbar, blockquotes, code, selection and scrollbars styled to match (`_global.scss`).
- The homepage's gallery and card styles (`_gallery.scss`).
- In PDF: Pagella for text and math, Plex Mono for code (`fonts.tex`; override with `mainfont`/`mathfont`/`monofont`), and colored links.

## Shared files are copies

Every file listed in `tools/shared-files.txt` is a copy of mathkit's. **Edit
those in `mathkit/_extensions/mathkit/`**, then run `tools/sync-shared.sh`; the
pre-commit hook refuses a commit where a copy differs. This folder's own files:

```
_extension.yml        formats, Bootstrap themes, fonts, link colors
_palette.scss         Catppuccin + site maps, and $roles                   ← edit
_light.scss _dark.scss   Bootstrap settings read from the maps
_tokens.scss          publishes the maps as --ctp-* custom properties (for this
                      theme's own SCSS, the sites, and their applets)
custom.scss           the stylesheet: imports the theme's and the shared partials
_global.scss          links, navbar, blockquotes, code, selection, TOC
_gallery.scss         homepage galleries and cards
fonts.tex             PDF typefaces
tokens-to-css.py      _palette.scss → a site's tokens.css, for iframe applets
```

## Colors

`_palette.scss` holds the Catppuccin maps (`$latte`, `$macchiato`), the site
maps (`$site-light`, `$site-dark`) and `$roles`, which says which of them
plays each role the shared stylesheets use (`"block-info": "sky"`); see
*Colors: roles* in mathkit's README. The `--ctp-*` properties are published
too, for `_global.scss`, `_gallery.scss`, the sites' own pages and their applets.

Iframe applets are separate documents that never load the site's stylesheet,
so a site that serves them generates the palette as plain CSS, e.g. in its
`_quarto.yml`:

```yaml
project:
  pre-render:
    - python3 _extensions/claudiojacobo/cjgg/tokens-to-css.py theme/tokens.css
```

## Diagrams

In a cjgg site, a mermaid diagram that uses the node classes ends with

```
{{< include /_extensions/claudiojacobo/cjgg/mermaid-classes.mmd >}}
```

(cjgg's copy carries this theme's colors as fallbacks for PDF.)
