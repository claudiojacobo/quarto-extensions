# mathkit — math on the web and in print, from one source

This extension provides the formats `mathkit-html`, `mathkit-pdf` and
`mathkit-revealjs` (slides): the machinery behind a math course site (shared
macros, blocks, theorem styling, exams, Sage figures, an accessible PDF) with
the look of stock Quarto (Bootstrap's default theme, Darkly in dark mode,
Latin Modern in PDF, reveal.js's default for slides).

```bash
quarto add claudiojacobo/quarto-extensions/mathkit
```

It needs Quarto 1.8 or newer (the accessibility report, `axe`, is new in 1.8).

```yaml
format:
  mathkit-html:
    toc: true          # any normal html option still works here
  mathkit-pdf:
    documentclass: report
```

Options normally placed under `html:` or `pdf:` go under `mathkit-html:` or
`mathkit-pdf:`. Pages that set their own `format:` must use these names too.
The course template, [quarto-math-course-template](https://github.com/claudiojacobo/quarto-math-course-template),
shows all of it in use.

## What `mathkit-html` gives a page

- Light and dark mode, following the reader's system setting, with every color pair used by blocks, links, buttons and code cells checked against WCAG AA (4.5:1).
- Every math macro in `macros.tex`, on every page, with no per-page include.
- `.block-*` callouts and theorem styling (below).
- MathJax line breaking for long equations on narrow screens, and copy-as-TeX: selecting rendered math copies its TeX source.

## What `mathkit-pdf` gives a document

- The same macros, read straight from `macros.tex` as the preamble, after `diffcoeff` and the other math packages (`packages.tex`).
- The `.block-*` divs as `tcolorbox` environments (`blocks.lua` + `blocks.tex`) in the same colors (`tokens.tex`). Figures, tables and code listings inside a block stay in place.
- Images that fit their column, so side-by-side figures match (`images.tex`).
- Optionally, a tagged PDF/UA-2 document with MathML: see *Accessible PDF* below.

## Blocks and theorems

```markdown
::: {.block-idea}
::: {.block-header}
A title, which may contain $math$
:::
The content.
:::
```

The header can also be a heading, `## A title {.block-header}`: it looks the
same, and is then a real section heading (in the table of contents, with an
anchor link, announced as a heading by screen readers). Give it the level
that follows the section it sits in (`###` inside a `##` section): a level
skipped is an accessibility error (axe's heading-order), and the div form
avoids the question. Either way, no `.mt-0` is needed. Blocks side by side in a `.grid` keep the same spacing as
blocks one above the other.

Blocks are named for what they hold:

| Block | For | Icon |
| --- | --- | --- |
| `block-idea` | a key idea, the intuition, the goal | lightbulb |
| `block-tip` | advice: sketch it first, check your work, a rule of thumb | pin |
| `block-method` | a procedure, step by step | numbered list |
| `block-caution` | a pitfall; a hypothesis that matters | warning sign |
| `block-aside` | history, a connection, a look ahead | binoculars |
| `block-code` | software: computing, setting up | terminal |
| `block-reading` | a reading assignment | book |
| `block-personal`, `block-research`, `block-school`, `block-current` | about you, on a homepage or a syllabus (`school` is in the school's colors: set `navy` and `gold` in your palette) | person, notebook, backpack, clock |

Each shares a color with the theorem environment nearest it in spirit:
caution with counter-example (what goes wrong), tip with remark (side
comments), code with proof (the work). A statement — a definition, a
theorem — belongs in a theorem environment rather than a block: it is
numbered, can be cross-referenced, and appears on the concept map.

For a block that only needs a color (cards on a homepage, the panels of a
formula sheet), name the color: `block-blue`, `block-indigo`, `block-purple`,
`block-pink`, `block-red`, `block-orange`, `block-yellow`, `block-green`,
`block-teal`, `block-cyan`, `block-gray`, and `block-plain` (no color: the
page's surface). These have no icon.

The names before 0.16 (named for colors, like Quarto's callouts) were retired
in 0.17.0. A page that still uses one builds, drawn in the color it had, with
a warning naming the block to use instead:

| Retired | Use (or, for the color alone) |
| --- | --- |
| `block-info` | `block-idea` (`block-cyan`) |
| `block-success` | `block-method` (`block-green`) |
| `block-attention` | `block-yellow` |
| `block-warning` | `block-caution` (`block-orange`) |
| `block-danger` | `block-caution` (`block-red`) |
| `block-note` | `block-aside` (`block-purple`) |
| `block-scholar` | `block-research` |

Quarto's theorem-like environments (`#def-`, `#thm-`, `#prp-`,
`#lem-`, `#cor-`, `#exr-`, and `.proof`, `.remark`, `.solution`) each get a
block style of their own; `.question` and `.counter-example` divs too. A proof's
tombstone can be swapped for an icon: `::: {.proof .smile}` (see `_theorems.scss`).

A solution, or a remark, can stay closed until the reader asks for it:

```markdown
::: {.solution collapse="true"}
Differentiate the outer function, then …
:::
```

On web pages this is the browser's own disclosure (`<details>`), styled as a
solution: it opens with a click, or with Tab and then Enter or Space, and
screen readers announce it. (Quarto's collapsible callouts can't be reached
from the keyboard.) `collapse="false"` starts it open; `title="Hint"` changes
the word. A remark works the same way, for an aside a reader may skip:
`::: {.remark collapse="true" title="Abstract nonsense"}`. In the PDF either
is the ordinary environment, printed in full: wrap it in
`:::: {.content-visible when-format="html"}` to keep it out.

## Course machinery (both formats)

- `gradetable.lua`: `::: {.exam}` with `{.question}` and `{.part points=N}` divs becomes numbered problems with points and a grade table in place of a `[GRADETABLE]` paragraph; `@prb-…` citations link to problems. `{.exam total=28}` overrides the total (e.g. when students skip a question).
- `auto-numbering.lua`: an h1 "Homework 3" with `{.centered-title}` numbers that document's exercises 3.1, 3.2, … in PDF. Since 0.17.1 any numbered title does the same with a number or single capital letter that ends the title or comes just before a colon ("Problem Set 3" → 3.1, "Tarea B" → B.1, "Worksheet 2: Limits" → 2.1); `.unnumbered` titles (exams, quizzes) and titles with neither ("Syllabus", "What I Learned") are left alone.
- `centered-title.lua`: in PDF, an h1 with `{.centered-title}` starts a document of its own (a homework, an exam, a handout, the syllabus): a new page numbered 1, a centered title with a TOC entry and a bookmark, and a named destination `mathkit-doc.1`, `mathkit-doc.2`, … on that page. The destinations are how a splitter finds each document's first page without guessing from titles; the course template's `.scripts/chopper.py` reads them (since 0.17.1).
- `clean-tab-title.html` and `_courses.scss`: a page with `body-classes: hide-appendix` in its front matter (a syllabus, say) is titled "Syllabus" rather than Quarto's "Appendix C — Syllabus", and its sections lose their numbers. The script rewrites the heading's own text, so it stays the page's heading for screen readers. Every page's browser tab loses "Appendix C — " too. In the sidebar, the breadcrumbs and the links to the next and previous pages, the letter goes only for pages whose address contains `syllabus` or `character-hunt` (`_courses.scss`).

Project-level tooling (`build.sh`, profiles, splitting the PDF) stays in the course template, since it depends on the course's folder layout.

## Book numbering: chapter 0, parts without numbers

Quarto numbers a book's chapters from 1. For a chapter 0 before chapter 1, leave it unnumbered and mark it as the zeroth:

```markdown
# Binary Operations {#sec-binary-operations .unnumbered .chapter-zero}
```

The chapters after it are numbered 1, 2, … as usual, and the 0 goes back in: the PDF has a real Chapter 0 (in the table of contents too), and on the web its page title reads "0 Binary Operations" and its items "Definition 0.1", "Proposition 0.2". References to them anywhere in the book read the same (`@prp-…` → "Proposition 0.2", `@sec-binary-operations` → "Chapter 0", `-@sec-…` → "0"), and so does the concept map. Not covered: the sidebar and the previous/next links show the title without the 0, sections within the chapter aren't numbered on the web, and its figures, tables and equations keep Quarto's numbers on the web ("Figure 1"). `chapter-zero.lua` numbers the chapter; `chapter-zero-refs.lua` writes the references to it, before Quarto resolves them.

Web pages don't number a book's parts; the PDF does ("Part I"). To leave a part's number out, list it in `_quarto.yml`:

```yaml
unnumbered-parts: [Preliminaries]
```

Its part page then has just the title, and the parts after it are I, II, … (`unnumbered-parts.lua`).

## Concept map

For a book of notes: a map of every definition, theorem, proposition, lemma, corollary, conjecture and example (divs labelled `#def-…`, `#thm-…`, `#prp-…`, `#lem-…`, `#cor-…`, `#cnj-…`, `#exm-…`), and the exercises that matter (see below), with an arrow from A to B when B uses A. Readers hover an item to read it, click it to light up everything it rests on (and what uses it next), open it in the notes, drag, zoom, and switch layouts.

An item's dependencies are what you declare, on a line of its own, as cross-references:

```markdown
::: {#prp-inverse-unique}
#### Inverses are unique
[@def-associative @def-inverse]{.uses}
Let $\star$ be an associative binary operation …
:::
```

As @-references they autocomplete in VS Code and Quarto warns about typos; `uses.lua` removes the line from the page and the PDF. Nothing is inferred from proofs, so a forward reference in a proof makes no arrow. The map assumes there are no circular dependencies, and warns if it finds one. Arrows implied by others aren't drawn (if C uses A and B, and B uses A, then A → C is left out), but an item's card lists everything it uses.

The map reads the chapter files themselves (`{{< include >}}` lines expanded), not Quarto's output, so it resolves the references in statements on its own: another item becomes a chip (a link, in the List view); a chapter or section becomes a link with its title; a citation such as `[@DF2004, Prop. 1.1]` becomes "Dummit & Foote, Prop. 1.1", linked to the references page, using the project's `bibliography`. Numbers follow Quarto's (per kind, within the chapter; a chapter titled in YAML counts too).

An item's label on the map is its title, or its number if it has none. `label="…"` gives a shorter one, and may contain math:

```markdown
::: {#prp-ring-basics label="Arithmetic in a ring"}
```

**Exercises** (`#exr-…`) are on the map only when they're connected to something: an exercise with a `.uses` line of its own, or one that an item's `.uses` line lists. So a result students prove in the homework can be what a later theorem rests on, without stating it in the notes first:

```markdown
::: {#exr-hw3-socks-and-shoes}
[@def-group]{.uses}
Show that $(ab)^{-1} = b^{-1} a^{-1}$.
:::
```

and in a later chapter, `[@exr-hw3-socks-and-shoes]{.uses}`. Exercises that are only practice stay off the map with no extra markup. The appendices (homework, practice exams) are read for exercises only, and an exercise there is named after its assignment: "Homework 3, Exercise 2" (the second exercise in the file whose title is "Homework 3"); its card opens the assignment. An exercise in a chapter is "Exercise 2.3", like the other kinds. Exercises have their own shape and color and an **Exercises** toggle (shown only when there are some). `.no-map` leaves any item off the map, connected or not, without a warning for the `.uses` lines that list it. Solutions (`.solution`) and anything shown or hidden by profile (`when-profile="instructor"`) never reach the map.

The map goes on a page of its own, which has to be one of the book's chapters (a book renders only its chapters). `.web-only` (`web-only.lua`) leaves it out of the PDF:

```markdown
---
page-layout: full
toc: false
---

# Concept Map {.unnumbered .web-only}

An arrow from $A$ to $B$ means that $B$ uses $A$. …

{{< concept-map >}}
```

Keep some math on the page: Quarto loads MathJax only on pages with math, and the map typesets its labels and cards with it. Then, in `_quarto.yml`:

```yaml
book:
  chapters:
    - index.qmd
    - concepts.qmd
    # …
```

It appears in the sidebar's contents like any chapter. (A sidebar button works too, if you'd rather have the map out of the contents: `sidebar: tools: [{icon: diagram-3, href: concepts.html, text: "Concept map"}]`.)

Layouts: **Clusters** (the default: chapters attract each other in proportion to the arrows between them), **Dependencies** (a chapter sits one column right of the deepest chapter it uses), **Book order** (rows in reading order, a row per part) and **Free** (no chapters; the items find their own places, and chapter titles are hidden). **Show chapters** outlines each chapter, colored by part. `concepts.html#thm-lagrange` opens the map focused on that item. The layouts' tuning (spacing, how hard items are pulled to their chapter) is at the top of `concept-map.js`; the simulation's (forces, zoom limits) at the top of `graph-view.js`, the viewer underneath, which knows nothing about theorems (see *The map viewer* below).

The shortcode's options, all optional, set what a reader sees first and tune the look; each reader's own choices (layout, outlines, examples, exercises) are then remembered in their browser:

```markdown
{{< concept-map layout="book" examples="false" theorem-size="1.4" edge-width="1.8" >}}
```

| Option | What it does | Default |
| --- | --- | --- |
| `layout` | the first layout: `clusters`, `depth`, `book` or `free` | `clusters` |
| `outline` | chapter outlines (**Show chapters**) at first | `true` |
| `examples`, `exercises` | examples, exercises shown at first (`"false"`: hidden until the reader turns them on) | `true` |
| `definition-size`, `theorem-size`, `proposition-size`, `lemma-size`, `corollary-size`, `conjecture-size`, `example-size`, `exercise-size` | a factor on that kind's usual size, which grows with how many items use it (`1.4`: 40% bigger) | `1` |
| `edge-width` | the arrows' width in pixels (lit: 1.7 times it) | `1.3` |
| `drag-heat` | how much dragging an item stirs the rest of the map, from `0` (only it, and what it bumps into, moves) to `1` | `0.3` |
| `settle-time` | seconds the map takes to come to rest once a dragged item is let go; it then glides to a stop | `3` |

`drag-heat` and `settle-time` belong to the map viewer, so cjgg's genealogy and course map take them too (with their own defaults).

- **Search.** As you type, the items whose name, title, label or statement contain every word stay lit and the rest dim; Enter (Shift+Enter) steps through them in book order, showing each one's card.
- **List view.** The same information as text: a heading per chapter, and for each item a link into the notes, its title, what it uses and what uses it (as links within the list), and its statement. It is plain HTML in the page (`concept-map.lua` writes it), so it is what a screen reader reads, it works from the keyboard and without JavaScript, and search filters it too. The Map/List switch is the first control on the toolbar; "Show on the map" goes back to the map, focused on that item.
- **Full screen.** The toolbar's last button. Esc leaves; where a browser can't do full screen (an iPhone), the map fills the window instead.
- **Keyboard.** The map is one Tab stop; the arrow keys move through the items in book order (Home/End: first and last), the card following, and Enter or Space focuses one. `concepts.html#cm-item-thm-lagrange` opens the List view at an item.
- **The card** keeps clear of the item it's about and of the pointer: it moves to the other side (or, on a small map, becomes shorter, along the top or the bottom) rather than cover what you're pointing at.
- **Loading.** The map is drawn as soon as its part of the page has been read (it doesn't wait for MathJax or the rest of the page), already settled: the layout comes to rest before it's shown, so nothing moves or is redrawn until you do something. Until then its place on the page is kept, and the list waits out of sight. If a map is slow to appear, `GraphView.timings()` in the browser's console says where the time went (milliseconds since the page was asked for: `create`, `built`, `settled`, `shown`, `painted`, and `math` once its labels are typeset).
- **Esc** clears, in turn, the focused item, the search, and full screen. Each reader's view, layout and chapter outlines are remembered in their browser. Printing the page prints the list, statements open (their math is typeset first, which on a big map takes a moment before the print dialog appears).

The map is built when its page renders, from the chapter files listed in `_quarto.yml`. `quarto preview` re-renders only the page you edit, so render the whole book to update it.

### The map viewer

`graph-view.js` (with `graph-view.css`) is the concept map's viewer, and knows nothing about theorems: given nodes and arrows, it runs the force simulation and does the panning and zooming, dragging, highlighting, card, search, List view, full screen, keyboard and links. `concept-map.js` is what makes it a concept map: chapters and the four layouts, shapes by kind, the legend, chapter outlines, what lights up, what the card says, the Examples toggle. Another kind of map is another such script calling `GraphView.create(root, spec)` (cjgg has two: the genealogy and the course map); the comment at the top of `graph-view.js` lists what `spec` can say, including arrows without heads (`edge`) and waypoint nodes the keyboard and search skip (`passive`). Its classes all start with `cm-`. A page can hold maps of different kinds (cjgg's genealogy and course map, say): each draws its own arrowheads.

`tools/check-concept-map.mjs`, in the repository, checks that a change to either leaves the concept map exactly as it was (see its comment).

## Code cells (both formats)

- `hide-lines.lua`: a line of an executed cell ending in `#hide` runs but is removed from the displayed code (and from what the copy button copies). Hide only presentation (camera, size, seed), never math.
- `figure-links.lua`: code that displays an image and then a link marked `.figure-link` (a 3D plot's still and its interactive viewer, say), displayed as Markdown or printed on a line of its own, gets one output, not two, which keeps `layout-ncol` grids intact. Print it: Quarto hands a cell's `fig-cap` and `fig-alt` lists to displayed outputs one each, in order, so a displayed link would take the next image's caption. On web pages the image becomes the link, with the link text as a badge in its corner. In PDF, a captioned image gets the link in its caption; an uncaptioned one keeps the image as it is, with the link in a paragraph after the cell.
- `site-links.lua`: `[text](3d/a.html){.site-link site-path="hw/3d/a.html"}` stays relative on web pages and becomes `<site-url>/hw/3d/a.html` in PDF, where a relative link to a web file would lead nowhere. Needs `site-url` in the project (top level, `book:` or `website:`).

## Sage 3D plots

`show3d.py` makes 3D plots work on a course site: each `show()` of a 3D plot
becomes a ray-traced still (in the page and the PDF) that links to Sage's
interactive viewer. The project needs:

- Sage's Jupyter kernel, for `{sage}` cells.
- The Tachyon ray tracer, on `PATH` or in Sage's own program folder (`show3d.py` adds that folder to `PATH` when the setup cell runs, which also lets the page's 3D animations, `animate(...)` of 3D frames, find it). If neither has it, `brew install dimpase/tap/tachyon` on macOS; check with `which tachyon`.
- In `_quarto.yml`, the viewers published with the site, and the site's address (the PDF links to the published viewers):
  ```yaml
  project:
    resources:                 # one line per folder whose pages have 3D plots
      - "/notes/3d/*.html"
      - "/homework/3d/*.html"
  website:                     # or book:
    site-url: https://example.edu/course
  ```
  Viewers are written to `3d/` next to each page. Start each pattern with `/`, which anchors it at the project's folder: Quarto copies a resource from anywhere the pattern matches, including the output folders of other profiles, so `"**/3d/*.html"` (and a bare name such as `robots.txt`, which Quarto reads as `**/robots.txt`) copies the instructor build's files into the student site, and each build's into the next, nested deeper every time. Careful with instructor-only pages (exams): their viewers are written to the same `3d/` folders, so they are published too.
- The extension installed (or updated to 0.6.0 or later) *before* a page includes `sage-setup.qmd`: `quarto add` and `quarto update` read the project's pages first, and stop at an include whose file doesn't exist yet.

Pages with 3D plots include a hidden setup cell once, near the top (`cjgg` instead of `mathkit` in a cjgg site):

```markdown
{{< include /_extensions/claudiojacobo/mathkit/sage-setup.qmd >}}
```

After that, every `show(g)` or `g.show()` of a 3D plot on the page renders as a still image (ray-traced with Tachyon) that links to the interactive viewer. The code students see is unchanged: in their own Sage, `show(g)` opens the usual interactive viewer. Give each plot alt text and, if wanted, a caption with the usual cell options:

```{sage}
#| fig-alt: "Translucent saddle surface with its two critical points marked."
#| fig-cap: "The surface and its critical points."
surface = implicit_plot3d(z == f, (x,-2,1), (y,-2,1), (z,-1.5,1.5), opacity=0.7)
view3d(camera_position=(4.6, -4.8, 4.0), point_scale=2)   #hide
show(surface + pts)
```

Side by side works as for any figures: `#| layout-ncol: 2` with a list under `fig-cap` (and `fig-alt`), one entry per plot, in the order the plots are shown.

`view3d(...)` sets options for **the next 3D plot only**, so put it just before that plot's `show()`; plots without one use the defaults.

**Choosing a view.** Each still is taken from the camera the interactive viewer opens with, so the two match. For a different view, open the plot's *Explore in 3D* page (or run the cell in your own Sage), turn and zoom the plot, and click ⓘ in the bottom-right corner → **Get camera**. Paste what it copies into a `view3d` line, deleting the comma at its start (Sage adds it so the text can be pasted into a `show(...)` call):

```python
view3d(camera_position=[6.3422,4.6079,4.5261])   #hide
```

The still is then taken from that spot, and the viewer opens looking the same way (at its usual distance). Turn and zoom only: dragging with the right mouse button slides the plot sideways, which **Get camera** doesn't record. **Get viewpoint** also works, for the direction alone: `view3d(viewpoint=[[-0.2469,-0.4845,-0.8392],133.7])`.

| Option | Meaning | Default |
| --- | --- | --- |
| `camera_position` | Where the camera is, in plot coordinates (times `aspect_ratio`); paste from **Get camera** | the viewer's opening camera |
| `viewpoint` | The direction only, as `[[x, y, z], angle]`; paste from **Get viewpoint** | the viewer's opening direction |
| `zoom` | Lens zoom relative to the viewer: `1` frames the plot as the viewer does, `1.3` magnifies, `0.9` leaves more room | `1` |
| `light_position` | Where the light is, in plot coordinates | above and left of the camera, as in the viewer |
| `point_scale` | Point size relative to the viewer's opening view (1 = the same) | `1.5` |
| `aspect_ratio` | As in Sage; also applied to the viewer | the plot's own, else `1` |
| `shade` | `'full'` (with shadows), `'medium'` (no shadows), `'low'`, `'lowest'` | `'medium'` |
| `figsize` | Size of the square image before cropping, in hundreds of pixels | `12` |
| `antialiasing` | Smooth edges | `True` |

**In the PDF** a still prints 4 inches on its longest side (`PDF_INCHES` in `show3d.py`), and its "Explore in 3D ↗" link points at the published site: in the caption of a captioned figure, otherwise on its own line after the cell.

Not covered: a 3D plot left as the last line of a cell (no `show`) keeps Sage's interactive viewer, embedded in the page; end such cells with `show(...)`.

Tips: a still shows the mesh more than the interactive viewer does, so raise `plot_points` (e.g. 80) on surfaces that look faceted; translucent surfaces read lighter in a still, so `opacity` of 0.7–0.8 often works better than 0.5. After changing a `view3d` line, the page re-runs on its own (its source changed); after updating the extension, which can change `show3d.py`, clear the page's `_freeze/` folder (or render the page by itself), since freezing only notices changes to the page's own source.

## Diagrams

Mermaid node classes `solution`, `contradiction`, `engine`, `source`, `auxiliary`, `log` and `final` (`A["x = 1"]:::solution`) are styled by `_cells.scss` on web pages. For PDF, Quarto draws each diagram in a headless browser before any filter runs, on a page without the site's CSS, so a diagram that uses the classes must carry them itself. Make this the last line of such a diagram:

```
{{< include /_extensions/claudiojacobo/mathkit/mermaid-classes.mmd >}}
```

It adds a mermaid `init` directive whose `themeCSS` repeats the class rules with each color as `var(--mk-diagram-solution, #198754)`: on web pages the site's variables win, so light and dark mode work as before; in the PDF the light-mode fallbacks are used. (Mermaid's own `classDef` would also work in PDF, but mermaid writes it onto each shape as inline `!important` styles, which would override dark mode on the web.)

## Slides

`format: mathkit-revealjs` is a reveal.js deck on the same machinery as the pages:

- **The same math.** MathJax 4 with every macro in `macros.tex` and the project's own, as on web pages, with no include line in the deck. (Quarto's reveal.js loads MathJax 2 through reveal's math plugin, which knows none of this; the format sets `html-math-method: plain`, and `slides.lua` hands the formulas to MathJax 4 itself.) Numbered equations carry their number at the right, as on pages, and a formula in the title stays in the browser tab's title as TeX. A figure's image gets its caption as alt text, formulas as TeX, unless `fig-alt` gives one: Quarto gives it none, and on a slide where it is the only image, Quarto's auto-stretch moves it out of its figure, which would leave it unlabeled. `mathjax-url:` loads MathJax from elsewhere, such as a copy in the site; that a deck then runs with no network is not yet tested (MathJax 4 also loads its fonts and extensions from beside that file, and a path from the site's root fails for a deck opened as a file).
- **The same blocks and theorems,** sized for a slide, with their icons (the slides carry the few Bootstrap Icons they use, `_icons.scss`, since a deck has no Bootstrap). A header written as a heading (`#### Title {.block-header}`) is drawn as the header div and announced as a heading one level under the slide's. Any other div that opens with a heading below the slide's level keeps its heading but stays a div: pandoc would make it a section, which reveal.js takes for a slide of its own (the console warns of any section left inside a slide).
- **Defaults:** 1280×720 (16:9), slide numbers, a fade between slides, and no motion at all (no fades, no auto-animate) when the reader's system asks for reduced motion. The browser's Back button leaves the deck in one press (`history: false`; Quarto's default records every slide, so Back steps back through them), while the address still follows the slide, so a reload keeps the place.
- **Dark slides** (`## Title {background-color="#1e1e2e"}`): Quarto turns the text white, and blocks, theorems and quotations become light panels, so everything in them keeps the colors and contrast of a light slide; text that steps back is white at 75%, the focus ring white. reveal.js tells a dark slide by its `background-color`, so give one under a dark `background-image` too.
- **Links are underlined,** as on pages (their color alone is too close to the text's).
- **Text that steps back** (`.fragment .semi-fade-out`, `.fade-in-then-semi-out`) is drawn in a lighter text color rather than at half opacity, which would fall far below 4.5:1; pictures in it still fade.
- **A media grid,** `::: {.media-grid}`: a collage of up to nine images or videos, three by three, each filling its cell, 65% of the slide's height whatever the screen.
- **Applets in iframes** are told their slide's theme (`{ type: "theme", dark, deck: true }`, the applet kit's message: `dark` is true on a dark slide and false on the others; `deck: true` says it comes from a deck) and how much reveal.js enlarges the slides (`{ type: "scale", value }`, at load and on every resize: the surface viewer draws at that resolution, so it stays sharp on a projector larger than the slide) and preloaded for `?print-pdf` and the speaker view. After a click into an applet from the same site, Space, Page Up/Down (a clicker's keys) and the arrows still move the deck, unless the applet uses the key itself or it belongs to what has the focus there (a text field or slider keeps every key; a button, link or checkbox keeps Space, which presses it); Escape gives the keyboard back to the deck. The deck can't listen inside an applet from another site, nor inside any applet when the deck is opened as a file (`file://`, a double-click in Finder): there the applet passes the keys on itself once a message has said `deck: true`, `parent.postMessage({ type: "key", key: e.key, shiftKey: e.shiftKey }, "*")` (see `tools/sample/applet.html`). Give every iframe a `title` and every image alt text: the browser's console lists any that lack them, and any slide without a heading.
- **Long slides:** a `.scrollable` slide can take the keyboard's focus, but reveal.js keeps the arrow keys and Space for moving between slides, so it scrolls only with a trackpad or wheel: better split it.
- Keyboard focus is visible. The slide number is in the subtle text color (Quarto's is 2.7:1 on white), and it and the menu button turn white on a dark slide.

```yaml
format:
  mathkit-revealjs:
    mathjax-url: /vendor/mathjax/tex-chtml.js   # optional: MathJax 4 from the site (see above)
```

The [cjgg extension](../../../cjgg/_extensions/cjgg/) adds the house look of Claudio's talks (`cjgg-revealjs`). `tools/sample/slides.qmd` and `slides-mathkit.qmd` use every piece.

## Math macros

mathkit's own macros (about 110: `\Rb`, `\Abs`, `\Norm`, …) live in its `macros.tex`. PDF reads it as-is; for the web, `macros-to-mathjax.py` turns it into `mathjax-config.html` (generated; never edit it by hand).

### Your own macros

Put a project's own macros in `macros.tex` at the project root (or set `macros-file: path/to/file.tex` in `_quarto.yml`), one per line:

```latex
\newcommand{\Sample}{\mathbb{S}}                 % a new macro
\newcommand{\Avg}[1]{\langle #1 \rangle}       % with an argument
\renewcommand{\Rb}{\mathbf{R}}                   % change one of mathkit's
```

`project-macros.lua` adds the file to the PDF preamble, after mathkit's macros, and hands the definitions to MathJax on every web page, where they win over mathkit's. Use `\renewcommand` to change a macro mathkit (or LaTeX) already has: `\newcommand` on an existing name stops the PDF build with LaTeX's "Command … already defined". The same syntax rules apply as for mathkit's own file (below).

### macros.tex rules

The converter understands `\providecommand`, `\newcommand` and `\renewcommand`, each with an optional `[n]` argument count and one `[default]` for the first argument. Keep one definition per line and avoid `\ifdefined`, `\let`, `\DeclareMathOperator` and `\def`; those work in LaTeX but MathJax has no equivalent, so the converter skips them silently.

Derivatives use the `diffcoeff` package's own syntax (`\diff[2]{y}{x}`, `\diffp[2,3]{f}{x,y}`, `\difc`, `\difcp`, `\dl{x,y}`). PDF loads the real package; for HTML, `diffcoeff.lua` rewrites these into plain TeX before MathJax runs. Its tests are in `tools/test-diffcoeff.lua` (`texlua tools/test-diffcoeff.lua` from the repository root).

## Colors: roles

The stylesheets and `blocks.tex` never name a color. They ask for a **role**: `var(--mk-block-idea)`, `var(--mk-env-theorem)`, `var(--mk-line)` on the web; `mkBlockIdea` or `mkText` in LaTeX. `_palette.scss` defines the palette (`$mk-light`, `$mk-dark`) and the `$roles` map, which says which palette color plays each role. `_roles.scss` publishes the roles as `--mk-*` properties for light and dark mode, and `roles.py` writes them to `tokens.tex` for PDF.

A different look is a different `_palette.scss` (and Bootstrap theme): that is how the [`cjgg`](../../../cjgg/_extensions/cjgg/) extension restyles the same machinery. `roles.py` refuses to run if a stylesheet uses a role that `$roles` doesn't define, so a missing color is caught before a commit, not on a page.

## Accessible PDF

Setting `tagged-pdf: true` in the project makes `doc-class.tex` turn on LaTeX's tagged-PDF
support. Requirements and caveats:

- TeX Live 2025 or newer (`tlmgr update --self --all`), LuaLaTeX.
- Tagging is an official LaTeX project but still labelled "testphase". Core classes, `amsmath`, `hyperref`, `graphicx`, `booktabs` and `tcolorbox` are supported; some packages are not yet and emit warnings or errors.
- If a build fails, first drop `pdfstandard=ua-2` (strict conformance), then `tagging-setup={math/setup=mathml-SE}` (MathML for formulas), and report which package complained.
- MathML (luamml) fails on amsmath's `gathered` (an assertion in `luamml-amsmath.lua`, TeX Live 2026), so don't use it: write multi-line math as `$$\begin{aligned} … \end{aligned}$$`. `aligned`, `split`, `array`, `pmatrix`, `gather*` and `align*` were tested and work. Also avoid Sage's `show("label", x)`: Sage typesets the label as `\verb` inside math, which tagging can't handle; `print("label")` then `show(x)` works.
- tikz-cd diagrams need `math mode=false` and `ampersand replacement=\&`, with `$…$` written in every cell and label: tagging scans each formula for its closing `$`, which tikz-cd normally inserts later, and reads a formula's `&` too early. Inside `$$ … $$` (so `{#eq-…}` labels still work):
  ```latex
  \begin{tikzcd}[math mode=false, ampersand replacement=\&]
      $V$ \arrow[r,"$\rho(g)$"] \& $V$
  \end{tikzcd}
  ```
- Set `latex-min-runs: 3` alongside `tagged-pdf: true`. Tagging numbers link annotations from the page count of the *previous* LaTeX run; Quarto stops rerunning before that has settled, and the last pages lose their tags (veraPDF: "content … shall be an artifact"). Tagged builds are slow (minutes per run), so a course can keep both settings in a profile and build the tagged PDF on purpose.
- Alt text: Quarto's `fig-alt` reaches HTML but not LaTeX yet. For PDF, figures need `\includegraphics[alt={…}]`; a filter for that is a TODO.

## Files

```
_extension.yml        the manifest: which formats exist and what each sets
_palette.scss         colors and $roles                                    ← edit to restyle
_dark.scss            the one Bootstrap setting changed in Darkly
custom.scss           the stylesheet: imports the partials below
_roles.scss           publishes $roles as --mk-* custom properties
_base.scss            narrow-screen math, reduced motion, section-number contrast
_blocks.scss _theorems.scss _cells.scss _courses.scss
macros.tex            math macros, LaTeX syntax                            ← edit
mathjax-config.html   GENERATED from macros.tex: macros + MathJax options for HTML
tokens.tex            GENERATED from _palette.scss: the roles as \definecolor lines
mermaid-classes.mmd   GENERATED from _cells.scss + _palette.scss: diagram classes for PDF
copy-math-as-tex.html copying rendered math puts its TeX source on the clipboard
clean-tab-title.html  "Appendix C — " off tab titles, and off the heading of a hide-appendix page
figure-links.html     captioned figures' links become corner badges
revealjs.scss         the slides' stylesheet: reveal.js's default look, with the partials below
_slides.scss          blocks at a slide's scale, text that steps back, focus, reduced motion
_icons.scss           GENERATED by tools/icons-font.py: the Bootstrap Icons the stylesheets use, for slides
slides.lua            slides: MathJax 4 with the same macros (not reveal's MathJax 2); heading-form block headers
reveal-support.html   slides: reduced motion, relayout after MathJax, applets, a screen-reader report
diffcoeff.lua         diffcoeff derivative commands → plain TeX for MathJax (HTML only)
blocks.lua            .block-* divs → LaTeX environments (PDF only)
collapse-solutions.lua  {.solution collapse="true"} and remarks → <details> on web pages (above)
auto-numbering.lua centered-title.lua gradetable.lua   course filters (above)
hide-lines.lua figure-links.lua site-links.lua         code-cell filters (above)
project-macros.lua    the project's own macros.tex, in PDF and on web pages
graph-view.js .css    the map viewer: simulation, pan and zoom, card, search, List view (below)
concept-map.lua .js .css   the {{< concept-map >}} shortcode, on the map viewer (above)
uses.lua web-only.lua      drop {.uses} lines; keep {.web-only} chapters out of the PDF
chapter-zero.lua chapter-zero-refs.lua   a {.chapter-zero} chapter numbered 0, and references to it (above)
unnumbered-parts.lua  unnumbered-parts: [...] → those parts without a number in the PDF (above)
packages.tex          LaTeX packages for PDF, loaded before macros.tex
images.tex            PDF images fit a 4:3 box as wide as their column
blocks.tex            the .block-* tcolorbox environments
doc-class.tex         PDF template partial; adds \DocumentMetadata when tagged-pdf: true
show3d.py sage-setup.qmd   Sage 3D plots as stills + interactive viewers (below)
macros-to-mathjax.py  macros.tex → mathjax-config.html
roles.py              _palette.scss → tokens.tex; checks that every role used exists
mermaid-classes.py    _cells.scss mermaid classes → mermaid-classes.mmd
```

## Developing

This folder is the source of truth for the files shared with `cjgg` (listed in `tools/shared-files.txt`). Edit them here, then run `tools/sync-shared.sh`; see the repository README.
