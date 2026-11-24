#!/usr/bin/env node
// check-contrast.mjs: the contrast of every visible text element on a built
// site, as drawn, in light and dark mode.
//
//   node tools/check-contrast.mjs path/to/_site                 # every page
//   node tools/check-contrast.mjs path/to/_site index.html …    # some pages
//   CSS='.block-header{opacity:.9}' node tools/check-contrast.mjs …   # a rule added first
//
// Each element's text color is composited over every ancestor's background
// and through every ancestor's opacity, as the browser draws it (Quarto gives
// h3-h6 `opacity: .9`, which a check of declared colors never sees), after
// the 0.2 s link transitions. Normal text needs 4.5:1, large text 3:1 (WCAG
// AA). Text inside a closed <details> is skipped (its summary is not), as is
// MathJax's output (it inherits the color around it) and anything hidden.
// Outside requests are blocked, so fonts and MathJax from CDNs don't load.
//
// Needs Node 18+ and Playwright: once, cd tools && npm install && npx playwright install chromium.
// Exits 1 if any element falls short, and lists them by kind.
import { createRequire } from "node:module";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
// require() also finds a global install (NODE_PATH), which import doesn't
const { chromium } = createRequire(import.meta.url)("playwright");
const [ROOT, ...ONLY] = process.argv.slice(2);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json" };
const server = http.createServer((req, res) => { let p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname)); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html"); if (!fs.existsSync(p)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(res); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => ["site_libs", "3d", "index_files"].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".html") ? [path.join(d, e.name)] : []);
const pages = ONLY.length ? ONLY : walk(ROOT).map((f) => path.relative(ROOT, f)).sort();
const b = await chromium.launch();
let failed = 0;
for (const scheme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  await ctx.addInitScript((s) => { try { localStorage.setItem("quarto-color-scheme", s === "dark" ? "alternate" : "default"); } catch (e) {} }, scheme);
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.abort());
  let total = 0, dimmed = 0; const fails = {};
  for (const p of pages) {
    const pg = await ctx.newPage();
    await pg.goto(`http://127.0.0.1:${server.address().port}/${p}`, { waitUntil: "load" }).catch(() => {});
    if (process.env.CSS) await pg.addStyleTag({ content: process.env.CSS }); await pg.waitForTimeout(900);
    const rows = await pg.evaluate(() => {
      const cv = document.createElement("canvas"); cv.width = cv.height = 1; const g = cv.getContext("2d", { willReadFrequently: true });
      const rgba = (c) => { g.clearRect(0, 0, 1, 1); g.fillStyle = "#000"; g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
      const over = (c, B) => c[3] === 0 ? B : [0, 1, 2].map((i) => c[i] * c[3] + B[i] * (1 - c[3]));
      // a layer drawn at an opacity, rounded to 8 bits as the screen does (so .999 changes nothing)
      const mix = (B, C, o) => [0, 1, 2].map((i) => Math.round(C[i] * o + B[i] * (1 - o)));
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };
      const comp = (chain, i, B, useOp) => { const a = chain[i]; const cs = getComputedStyle(a); const B2 = over(rgba(cs.backgroundColor), B); let r = i === chain.length - 1 ? { bg: B2, text: over(rgba(cs.color), B2) } : comp(chain, i + 1, B2, useOp); const o = useOp ? parseFloat(cs.opacity) : 1; if (o < 1) r = { bg: mix(B, r.bg, o), text: mix(B, r.text, o) }; return r; };
      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        if (!([...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 1))) continue;
        if (el.closest("script, style, noscript, svg, mjx-container, .visually-hidden, .sr-only, [aria-hidden=true]")) continue;
        const cs = getComputedStyle(el); const rc = el.getBoundingClientRect();
        if (cs.visibility === "hidden" || cs.display === "none" || rc.width === 0 || rc.height === 0) continue;
        if (el.closest("details:not([open])") && !el.closest("summary")) continue;
        const chain = []; for (let a = el; a; a = a.parentElement) chain.unshift(a);
        let hid = false, op = 1; for (const a of chain) { const s = getComputedStyle(a); if (s.display === "none" || s.visibility === "hidden") hid = true; op *= parseFloat(s.opacity); }
        if (hid || op === 0) continue;
        const r1 = comp(chain, 0, [255, 255, 255], true), r0 = comp(chain, 0, [255, 255, 255], false);
        const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700; const large = size >= 24 || (bold && size >= 18.66);
        out.push({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""), text: el.textContent.trim().slice(0, 32), ratio: ratio(r1.text, r1.bg), noop: ratio(r0.text, r0.bg), op: Math.round(op * 100) / 100, need: large ? 3 : 4.5, ctx: (el.closest("[class*='block-']:not(.block-header), .theorem, .proof, .callout") || {}).className || "" });
      }
      return out;
    });
    total += rows.length;
    for (const r of rows) { if (r.op < 1) dimmed++; if (r.ratio < r.need) { const k = `${r.sel} op=${r.op} in [${String(r.ctx).slice(0, 40)}]: ${r.ratio} (without opacity ${r.noop}, needs ${r.need})`; (fails[k] = fails[k] || []).push(`${p} "${r.text}"`); } }
    await pg.close();
  }
  failed += Object.values(fails).flat().length;
  console.log(`\n[${scheme}] ${total} text elements on ${pages.length} pages; ${dimmed} under an opacity < 1; failing: ${Object.values(fails).flat().length}`);
  for (const [k, v] of Object.entries(fails)) console.log(`  ${k}  ×${v.length}  e.g. ${v.slice(0, 2).join(" | ")}`);
  await ctx.close();
}
await b.close(); server.close();
process.exitCode = failed ? 1 : 0;
