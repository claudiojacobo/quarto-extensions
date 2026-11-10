# quarto-extensions

Quarto extensions by Claudio. Each top-level folder holds one extension, in
`<name>/_extensions/<name>/` (the layout `quarto add` needs to install one
without the other):

| Extension | What it is | Formats |
| --- | --- | --- |
| [`mathkit`](mathkit/_extensions/mathkit/) | Math on the web and in print from one source: shared macros for MathJax and LaTeX, blocks and theorem styling, exams and homework numbering, Sage figures with interactive links, diagrams, a concept map of a book's results, and an accessible (tagged, PDF/UA-2, MathML) PDF. Looks like stock Quarto. Used by the [math course template](https://github.com/claudiojacobo/quarto-math-course-template). | `mathkit-html`, `mathkit-pdf` |
| [`cjgg`](cjgg/_extensions/cjgg/) | The same machinery with the look of https://cjgg.me: Catppuccin and Carleton colors, its fonts, the homepage's galleries. | `cjgg-html`, `cjgg-pdf` |

## Using an extension

```bash
quarto add claudiojacobo/quarto-extensions/mathkit
```

Then, in the project's `_quarto.yml`:

```yaml
format:
  mathkit-html:
    toc: true
```

Options normally placed under `html:` go under `mathkit-html:` instead, and
pages that set their own `format:` must say `mathkit-html`, not `html`.

Update later with `quarto update claudiojacobo/quarto-extensions/mathkit`, or
pin a version with `quarto add claudiojacobo/quarto-extensions/mathkit@v0.12.0`.

## Developing

### Shared files

The two extensions share most of their files: filters, LaTeX, the
structural stylesheets, generators (`tools/shared-files.txt`). Quarto
extensions can't depend on each other, so each carries its own copy, and
**mathkit's copy is the source of truth**:

1. Edit a shared file in `mathkit/_extensions/mathkit/`.
2. Run `tools/sync-shared.sh`, which copies the shared files into `cjgg`.

Each extension keeps its own `_extension.yml`, `README.md`, `_palette.scss`,
`custom.scss` and theme files. Shared stylesheets ask for colors by role
(`var(--mk-block-info)`); each `_palette.scss` maps the roles to its own
colors (see *Colors: roles* in mathkit's README).

### Checks

`tools/check-generated.sh` fails if a shared copy differs from mathkit's
(without overwriting it: the difference may be an edit made in the wrong
place), or if a generated file is out of date: each extension's
`mathjax-config.html` (from `macros.tex`), `tokens.tex` (from
`_palette.scss`) and `mermaid-classes.mmd`. It runs on every push (GitHub
Actions) and, once per clone after `git config core.hooksPath tools/hooks`,
before every commit.

### The concept map

`tools/check-concept-map.mjs` checks that a change to the concept map's
viewer (`graph-view.js`, `concept-map.js` and their stylesheets) changes
nothing a reader sees, unless meant to. It drives both versions through the
same layouts and interactions in Chromium and compares the page after each
step: every position, class and computed style.

```bash
(cd tools && npm install && npx playwright install chromium)   # once
node tools/check-concept-map.mjs --ref v0.9.3                # working copy vs a release
node tools/check-concept-map.mjs --ref HEAD ../math-342/_site/concepts.html   # also a real map
```

### The style sample

`tools/sample/` is one page using every styled feature. Render it before and
after a change to the stylesheets to compare the two:

```bash
cd tools/sample
quarto render                      # cjgg    -> _site/
quarto render --profile mathkit    # mathkit -> _site-mathkit/
```

Its `_extensions` links to this repo's extensions, so it always uses the working copy.
To test a project against the working copy instead of a release, install from
the folder: `quarto add ../quarto-extensions/mathkit`.

### Releases

Both extensions share a version number. Bump `version:` in both
`_extension.yml` files, then tag: `git tag v0.7.0 && git push --tags`.
Versions follow [semantic versioning](https://semver.org).

## License

MIT; see [LICENSE](LICENSE).
