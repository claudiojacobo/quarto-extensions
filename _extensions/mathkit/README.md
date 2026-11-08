# mathkit — math on the web and in print, from one source

This extension provides the formats `mathkit-html` and `mathkit-pdf`: the
machinery behind a math course site (shared macros, blocks, theorem styling,
exams, Sage figures, an accessible PDF) with the look of stock Quarto
(Bootstrap's default theme, Darkly in dark mode, Latin Modern in PDF).

```bash
quarto add claudiojacobo/quarto-extensions/mathkit
```

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
::: {.block-info}
::: {.block-header}
A title, which may contain $math$
:::
The content.
:::
```

Block types: `info`, `code`, `success`, `attention`, `warning`, `danger`,
`note`, `tip`, `current`, `scholar`, `personal`, and `school` (the school's
colors). Quarto's theorem-like environments (`#def-`, `#thm-`, `#prp-`,
`#lem-`, `#cor-`, `#exr-`, and `.proof`, `.remark`, `.solution`) each get a
block style of their own; `.question` and `.counter-example` divs too. A proof's
tombstone can be swapped for an icon: `::: {.proof .smile}` (see `_theorems.scss`).

## Course machinery (both formats)

- `gradetable.lua`: `::: {.exam}` with `{.question}` and `{.part points=N}` divs becomes numbered problems with points and a grade table in place of a `[GRADETABLE]` paragraph; `@prb-…` citations link to problems. `{.exam total=28}` overrides the total (e.g. when students skip a question).
- `auto-numbering.lua`: an h1 "Homework 3" with `{.centered-title}` numbers that document's exercises 3.1, 3.2, … in PDF.
- `centered-title.lua`: `{.centered-title}` h1s become centered title pages with a TOC entry in PDF.
- `clean-tab-title.html` and `_courses.scss`: hide Quarto's "Appendix A –" prefix on appendix chapters (a workaround; see the course template README).

Project-level tooling (`build.sh`, profiles, splitting the PDF) stays in the course template, since it depends on the course's folder layout.

## Code cells (both formats)

- `hide-lines.lua`: a line of an executed cell ending in `#hide` runs but is removed from the displayed code (and from what the copy button copies). Hide only presentation (camera, size, seed), never math.
- `figure-links.lua`: code that displays an image and then a link marked `.figure-link` (a 3D plot's still and its interactive viewer, say) gets one output, not two, which keeps `layout-ncol` grids intact. On web pages the image becomes the link, with the link text as a badge in its corner. In PDF, a captioned image gets the link in its caption; an uncaptioned one keeps the image as it is, with the link in a paragraph after the cell.
- `site-links.lua`: `[text](3d/a.html){.site-link site-path="hw/3d/a.html"}` stays relative on web pages and becomes `<site-url>/hw/3d/a.html` in PDF, where a relative link to a web file would lead nowhere. Needs `site-url` in the project (top level, `book:` or `website:`).

## Diagrams

Mermaid node classes `solution`, `contradiction`, `engine`, `source`, `auxiliary`, `log` and `final` (`A["x = 1"]:::solution`) are styled by `_cells.scss` on web pages. For PDF, Quarto draws each diagram in a headless browser before any filter runs, on a page without the site's CSS, so a diagram that uses the classes must carry them itself. Make this the last line of such a diagram:

```
{{< include /_extensions/claudiojacobo/mathkit/mermaid-classes.mmd >}}
```

It adds a mermaid `init` directive whose `themeCSS` repeats the class rules with each color as `var(--mk-diagram-solution, #198754)`: on web pages the site's variables win, so light and dark mode work as before; in the PDF the light-mode fallbacks are used. (Mermaid's own `classDef` would also work in PDF, but mermaid writes it onto each shape as inline `!important` styles, which would override dark mode on the web.)

## Math macros

`macros.tex` is the one place math macros live. PDF reads it as-is; for the web, `macros-to-mathjax.py` turns it into `mathjax-config.html` (generated; never edit it by hand).

### macros.tex rules

The converter understands `\providecommand`, `\newcommand` and `\renewcommand`, each with an optional `[n]` argument count and one `[default]` for the first argument. Keep one definition per line and avoid `\ifdefined`, `\let`, `\DeclareMathOperator` and `\def`; those work in LaTeX but MathJax has no equivalent, so the converter skips them silently.

Derivatives use the `diffcoeff` package's own syntax (`\diff[2]{y}{x}`, `\diffp[2,3]{f}{x,y}`, `\difc`, `\difcp`, `\dl{x,y}`). PDF loads the real package; for HTML, `diffcoeff.lua` rewrites these into plain TeX before MathJax runs. Its tests are in `tools/test-diffcoeff.lua` (`texlua tools/test-diffcoeff.lua` from the repository root).

## Colors: roles

The stylesheets and `blocks.tex` never name a color. They ask for a **role**: `var(--mk-block-info)`, `var(--mk-env-theorem)`, `var(--mk-line)` on the web; `mkBlockInfo` or `mkText` in LaTeX. `_palette.scss` defines the palette (`$mk-light`, `$mk-dark`) and the `$roles` map, which says which palette color plays each role. `_roles.scss` publishes the roles as `--mk-*` properties for light and dark mode, and `roles.py` writes them to `tokens.tex` for PDF.

A different look is a different `_palette.scss` (and Bootstrap theme): that is how the [`cjgg`](../cjgg/) extension restyles the same machinery. `roles.py` refuses to run if a stylesheet uses a role that `$roles` doesn't define, so a missing color is caught before a commit, not on a page.

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
clean-tab-title.html  book tab titles without "Appendix A –"
figure-links.html     captioned figures' links become corner badges
diffcoeff.lua         diffcoeff derivative commands → plain TeX for MathJax (HTML only)
blocks.lua            .block-* divs → LaTeX environments (PDF only)
auto-numbering.lua centered-title.lua gradetable.lua   course filters (above)
hide-lines.lua figure-links.lua site-links.lua         code-cell filters (above)
packages.tex          LaTeX packages for PDF, loaded before macros.tex
images.tex            PDF images fit a 4:3 box as wide as their column
blocks.tex            the .block-* tcolorbox environments
doc-class.tex         PDF template partial; adds \DocumentMetadata when tagged-pdf: true
macros-to-mathjax.py  macros.tex → mathjax-config.html
roles.py              _palette.scss → tokens.tex; checks that every role used exists
mermaid-classes.py    _cells.scss mermaid classes → mermaid-classes.mmd
```

## Developing

This folder is the source of truth for the files shared with `cjgg` (listed in `tools/shared-files.txt`). Edit them here, then run `tools/sync-shared.sh`; see the repository README.
