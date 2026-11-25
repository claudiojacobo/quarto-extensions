# cjgg — the look of cjgg.me, on mathkit's machinery

This folder provides the formats `cjgg-html`, `cjgg-pdf` and `cjgg-revealjs`
(slides), used by https://cjgg.me, its course sites and talks:

```yaml
format:
  cjgg-html:
    toc: true          # any normal html option still works here
```

They need Quarto 1.8 or newer, and do everything [`mathkit`](../../../mathkit/_extensions/mathkit/) does (macros, blocks, theorem
styling, course machinery, code-cell filters, diagrams, the concept map, accessible PDF; see
its README), with this look instead of stock Quarto's:

- Catppuccin colors (Latte in light mode, Macchiato in dark) and Carleton's school colors, on Flatly and Darkly.
- Montserrat headings; links, navbar, blockquotes, code, selection and scrollbars styled to match (`_global.scss`).
- The homepage's gallery and card styles (`_gallery.scss`).
- In PDF: Pagella for text and math, Plex Mono for code (`fonts.tex`; override with `mainfont`/`mathfont`/`monofont`), and colored links.
- In slides: the talks' look (below).

## Shared files are copies

Every file listed in `tools/shared-files.txt` is a copy of mathkit's. **Edit
those in `mathkit/_extensions/mathkit/`**, then run `tools/sync-shared.sh`; the
pre-commit hook refuses a commit where a copy differs. This folder's own files:

```
_extension.yml            formats, Bootstrap themes, fonts, link colors
_palette.scss             Catppuccin + site maps, and $roles                   ← edit
_light.scss _dark.scss    Bootstrap settings read from the maps
_tokens.scss              publishes the maps as --ctp-* custom properties (for this theme's own SCSS, the sites, and their applets)
custom.scss               the stylesheet: imports the theme's and the shared partials
_global.scss              links, navbar, blockquotes, code, selection, TOC
_gallery.scss             homepage galleries and cards
fonts.tex                 PDF typefaces
tokens-to-css.py          _palette.scss → a site's tokens.css, and the applet kit copied beside it
applet.css applet.js      the applet kit: the look and code a site's iframe applets share (below)
genealogy.lua .js .css    the {{< genealogy >}} shortcode, on the map viewer (below)
curriculum.lua .js .css   the {{< curriculum >}} shortcode, on the map viewer (below)
revealjs.scss             the slides' stylesheet: the talks' house look (below)
school-slides.lua         the title slide and .part-slide slides in the school blue, from the palette
```

## Slides

`format: cjgg-revealjs` is mathkit's slide format (its README, "Slides": the same math, blocks and theorems, 1280×720, reduced motion, applets) with the look of the 2026 talks, rebuilt from math-talks' `theme/custom-reveal.scss`: Montserrat text at 32px, Playfair Display headings in the school's blue, a school-blue title slide with the title in gold over a gold rule, blocks with a bar on the left, a gold progress bar, and these classes of its own:

- `# Part 1 {.part-slide}`: a part slide, school blue like the title slide (`school-slides.lua` sets both backgrounds, reading the color from `_palette.scss`). The gold and white are for a dark background: a deck that gives either slide a light background of its own gets the ordinary colors.
- `[(in radicals)]{.expert-inline}` and `::: {.expert-block}`: the expert's aside.
- `::: {.citation-block}`: a source, set small to the right.
- On a dark slide (mathkit's "Dark slides"), the quotation and the citation are light panels too, and the expert's words outside a panel take the palette's dark-theme red (8.5:1 on black, 5.3:1 on the school blue).
- `::: {.media-grid}` (mathkit's collage) with framed images.
- Quotations with a pink bar.

What differs from the 2026 decks, for accessibility (measured on them in November 2026; the decks themselves are unchanged):

| | 2026 decks | cjgg-revealjs |
| --- | --- | --- |
| Text that steps back | half opacity, 2.4:1 | a lighter text color, 5.5:1 (4.8:1 on a tint) |
| `.expert-inline` | maroon, 3.9:1 | Latte red, 5.4:1 |
| Links in quotations and citations | Latte blue on a tint, 4.5:1 | darkened |
| `.citation-block` | 0.4em (12.8px) | 0.6em (19.2px) |
| Code blocks | 0.55em (17.6px) | 0.7em (22.4px) |
| Quotation text | reveal's muted grey on the pink tint, 2.5:1 | the subtle text color, above 4.5:1 |
| Title and part slides | the title slide's color written in each deck | from the palette (`school-slides.lua`) |
| Slide size | 1050×700 | 1280×720 (16:9; text the same size on a 16:9 screen) |
| Block icons | missing (no icon font) | shown |
| Media grid height | 65% of the window: on a screen larger than the slide it runs past the slide's bottom (to 775px of 720 at 1920×1080) | 65% of the slide |
| Dark slides | blocks, quotations, citations unreadable (1.2–3.9:1 on black) | light panels, every text 4.5:1 or more |
| Links in running text | told by color alone (1.6:1 against the text) | underlined |
| Motion | always | none under reduced motion |

## Colors

`_palette.scss` holds the Catppuccin maps (`$latte`, `$macchiato`), the site
maps (`$site-light`, `$site-dark`) and `$roles`, which says which of them
plays each role the shared stylesheets use (`"block-idea": "sky"`); see
*Colors: roles* in mathkit's README. The `--ctp-*` properties are published
too, for `_global.scss`, `_gallery.scss`, the sites' own pages and their applets.

Iframe applets are separate documents that never load the site's stylesheet,
so a site that serves them generates the palette as plain CSS, and gets the
applet kit (below) with it, from one line in its `_quarto.yml`:

```yaml
project:
  pre-render:
    - python3 _extensions/claudiojacobo/cjgg/tokens-to-css.py theme/tokens.css
  resources:
    - theme/tokens.css
    - theme/applet.css
    - theme/applet.js
```

## The applet kit

An applet is an HTML page of its own, shown in an iframe on one of the site's
pages or in a slide. It sees none of the site's stylesheets or scripts, so it
links what the applets share, which `tokens-to-css.py` puts in the site's
`theme/` on every render: the palette (`tokens.css`), and this extension's
`applet.css` and `applet.js`, copied. **Edit those two here**, not the copies;
a copy is rewritten only when it differs, so a site that commits `theme/`
sees an update's changes in its diff.

```html
<link rel="stylesheet" href="/theme/tokens.css">   <!-- the palette -->
<link rel="stylesheet" href="/theme/applet.css">   <!-- the shared look -->
<script type="module">
  import { theme, rgb, drag, fullscreen, onDemand } from "/theme/applet.js";
</script>
```

The comment at the top of each file is the reference. In short:

| `applet.js` | What it does |
| --- | --- |
| `theme.dark`, `theme.on(fn)`, `theme.fix(…)` | follows the page's light or dark (below) |
| `color(name)`, `rgb(name)`, `rgba(name, a)` | a palette token's value, for canvas styles or shader uniforms |
| `drag(element, { down, move, up })` | dragging by mouse, finger or pen, one pointer at a time |
| `fullscreen(button, element)` | fullscreen; on an iPhone, the applet on a page of its own |
| `visible()`, `visible.on(fn)` | whether the applet is on screen |
| `onDemand(draw)` | draws at most once a frame, when asked, and never off screen |

`applet.css` gives the frame (`.applet`), a header bar, panels side by side
that stack when the applet is taller than it is wide, labels, buttons,
legends, `.applet-math` for symbols written in HTML (applets don't load
MathJax), and `.applet-mouse-only` / `.applet-touch-only`.

**Light and dark.** An applet takes its theme from, in order: `theme.fix()`;
`?theme=dark` or `?theme=light` in its address; the last
`{ type: "theme", dark }` message from the page it is shown in; that page's
`quarto-dark` or `quarto-light` class, when the page is on the same site; else
the system's setting. A page on another site sends
`iframe.contentWindow.postMessage({ type: "theme", dark: true }, "*")`; a deck
(mathkit's and this extension's slide formats) sends `dark: true` to an
applet on a dark slide and `dark: false` on the others. The
applet puts `quarto-dark` on its own `<html>`, where `tokens.css` switches
the palette. Gotcha: a custom property that refers to another
(`--x: var(--ctp-base)`) is resolved on the element that *declares* it, so
an applet declares its own variables on `:root`.

**In a deck.** A click into an applet gives it the keyboard; the deck keeps
its keys anyway by listening in the applet itself (mathkit's README,
"Slides"), which needs the applet on the deck's site. So a talks site serves
its own copies of the applets it shows (the homepage forbids framing by other
sites), and a deck with kit applets must be served, by `quarto preview` or
the site: the kit loads as modules from `/theme/`, which a page opened as a
file can't do.

**Nothing from other sites.** The kit loads nothing from another site; an
applet that needs a library should serve it from the site too (the homepage
keeps three.js in `vendor/`), so a strict security policy and a deck with no
network both work.

## Diagrams

In a cjgg site, a mermaid diagram that uses the node classes ends with

```
{{< include /_extensions/claudiojacobo/cjgg/mermaid-classes.mmd >}}
```

(cjgg's copy carries this theme's colors as fallbacks for PDF.)

## Genealogy

`{{< genealogy >}}` draws an academic genealogy (advisors and students) with
mathkit's map viewer (`graph-view.js`, as the concept map does), from the
`genealogy.json` that department-genealogy's `build.py` writes:

```markdown
{{< genealogy data="genealogy.json" layout="generations" >}}
```

Sizes can be tuned on the page: `member-size` (members' radius, 12),
`ancestor-size` (7), `min-scale` (zoomed out, shapes are drawn at least this
fraction of their size, 0.4) and `edge-width` (arrows, in pixels on screen,
1.5): `{{< genealogy member-size="14" edge-width="2" >}}`. So can the motion:
`drag-heat` (how much dragging a person stirs the rest of the map, from 0 to
1; 0.3) and `settle-time` (seconds the map takes to come to rest once let go;
4).

`data` is relative to the page (`genealogy.json` by default); `layout` is what
a reader first sees: `generations` (the default: department members along the
bottom, a row per group, most recent lowest; ancestors above), `timeline`
(height is the year of the degree) or `free`. In every layout, members with
no advisor on record (and no students in the data) are set apart on the
right, in a grid that stays put: a block per group, most recent lowest,
oldest degree first, so it's clear who is connected to the rest and who
isn't. Each reader's own choices are remembered. The page needs `format: cjgg-html: page-layout: full`.

- Hover a person to light up their advisors and students; click for their
  whole lineage; shift-click a second person, or "Compare with…" on the card,
  to see both lineages and their nearest common ancestors (hovering a second
  person previews this). Esc undoes, in turn.
- Search finds names (accents optional: "Gauss" finds Gauß), schools, years
  and Carleton titles. The List view lists the members by group, with their
  advisors back three generations: it's what a screen reader reads and what's
  there without JavaScript.
- Shift-drag moves a whole connected piece; `#267780` (an MGP id, or a
  member's key in config.yaml for someone not in MGP) opens the map focused on
  that person.
- Colors: the groups take `--ctp-red`, `peach`, `yellow`, `green` (then
  `sapphire`); ancestors shade from `teal` to `blue` by generations from the
  nearest member; nearest common ancestors are ringed in `pink`.

How the layouts are computed is described at the top of `genealogy.js`.
`quarto preview` doesn't notice a changed data file: save the page too, or
render.

## Course map

`{{< curriculum >}}` draws the math courses and their prerequisites with the
same map viewer, from the `curriculum.json` that curriculum-map's
`python visualize.py --export PATH` writes (the current track's courses and
catalog prerequisites; never its notes or anything about concepts):

```markdown
{{< curriculum data="curriculum.json" layout="area"
               catalog="https://www.carleton.edu/math-stats/courses/" >}}
```

`data` is relative to the page (`curriculum.json` by default); `layout` is
what a reader first sees: `area` (the default: each area a cluster),
`sequence` (a column per step, the courses in bands by area) or `free`. With
`catalog`, each course's card links to its heading on that page with a text
fragment (`#:~:text=MATH%20236%3A`): the page must list each course under a
heading that starts "MATH 236:". `drag-heat` (0 to 1; 0.05, calm) and
`settle-time` (seconds; 2) tune how a drag moves the rest of the map, as for
the genealogy. The page needs `format: cjgg-html: page-layout: full`.

- Courses are circles in their area's color (a fainter tint is earlier in
  the area's sequence; a course in several areas is cut into wedges); a
  topics course has a dashed ring. An arrow is a required prerequisite. A
  "one of" group is a small diamond: the alternatives run into it without
  arrowheads, and one arrow leaves it for each course that lists the group.
  So every arrowhead at a course is something a student needs.
- Hover or click a course: everything it needs, all the way back (every
  alternative included), and what it leads to directly light up. The card
  has its areas as badges (icon and name), its prerequisites as buttons (to
  move to that course), what it leads to, and the catalog link.
- "Highlight areas" outlines the major's elective areas (the export's
  buckets), each with its name; it's on by default in *By area*. The legend
  shows each area's color as a dot, with its icon (if it has one) cut out of it.
- Colors are the export's palette names as cjgg's `--ctp-*`, so they follow
  light and dark mode; icons are Bootstrap Icons, which Quarto loads on
  every page.
- The List view lists the courses by area, with their prerequisites in
  words ("MATH 236 and (MATH 210 or MATH 211)"), what they lead to, and the
  catalog link.

How the layouts are computed, and what's left for later (statistics
courses, the concept graph, …), is at the top of `curriculum.js`.
`quarto preview` doesn't notice a changed data file: save the page too, or
render.
