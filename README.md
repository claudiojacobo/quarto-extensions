# cjgg-quarto-extensions

Quarto extensions by Claudio!

Each folder under `_extensions/` is one extension. Install the desired extensions by name:

```bash
quarto add claudiojacobo/quarto-extensions/cjgg
```

| Extension | What it is | Formats it provides |
| --- | --- | --- |
| [`cjgg`](_extensions/cjgg/) | The design system behind https://cjgg.me and its course sites: Catppuccin + Carleton colors, callout blocks, theorem styling, a shared math-macro library, MathJax line breaking, and a tagged (accessible) PDF setup. | `cjgg-html`, `cjgg-pdf` |

Planned: `accessible-math`, the same machinery with a neutral look, for the [math course template](https://github.com/claudiojacobo/quarto-math-course-template).

## Using an extension

In the project's `_quarto.yml`:

```yaml
format:
  cjgg-html:
    toc: true
```

Options normally placed under `html:` go under `cjgg-html:` instead.
Pages that set their own `format:` must also say `cjgg-html`, not `html`.

### Updates and pinning

Update to the latest version later with:

```bash
quarto update claudiojacobo/quarto-extensions/cjgg
```

Pin a version with `quarto add claudiojacobo/quarto-extensions/cjgg@v0.1.0`.

## Developing

Edit the files under `_extensions/<name>/`, then test from a project that
installs the extension from this folder instead of GitHub:

```bash
quarto add ../quarto-extensions/_extensions/cjgg   # path relative to the project
```

Each extension's own README documents its internals. Versions follow [semantic versioning](https://semver.org); bump `version:` in `_extension.yml` and tag the commit (`git tag v0.2.0 && git push --tags`) when we want projects to be able to pin to it.

## License

MIT; see [LICENSE](LICENSE).
