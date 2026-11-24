#!/usr/bin/env node
// check-deck.mjs: what the audience of a reveal.js deck sees, step by step.
// Every slide and every fragment step, at 1280×720: the contrast of every
// visible text against what is really behind it (the slide's own background,
// tints, opacity), its size on the screen, the slide number; slides whose
// content is taller than the slide; console messages and missing files.
//
//   node tools/check-deck.mjs tools/sample/_site slides.html
//   node tools/check-deck.mjs tools/sample/_site slides.html --background=#000000
//   node tools/check-deck.mjs tools/sample/_site slides.html --reduced --out /tmp/steps
//
// --background=COLOR puts every slide on that color first (as
// `{background-color="…"}` would): the test for dark slides. --reduced asks
// for reduced motion. --out DIR keeps a picture of every step there.
//
// Slide text needs 4.5:1, large or not: the back row is the reader. Text
// inside MathJax's output, notes and anything hidden is skipped; the menu
// button's icon is an image, so look at it in the pictures. Outside requests
// are blocked, so fonts and MathJax from CDNs don't load: sizes and "taller
// than the slide" are measured with fallback fonts and untypeset TeX, so
// look at a real render for those.
//
// Needs Node 18+ and Playwright (see check-contrast.mjs). Exits 1 if any text
// falls short.
import { createRequire } from "node:module";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
// require() also finds a global install (NODE_PATH), which import doesn't
const { chromium } = createRequire(import.meta.url)("playwright");
const args = process.argv.slice(2);
const flag = (name) => { const a = args.find((x) => x === name || x.startsWith(name + "=")); return a === undefined ? undefined : a.includes("=") ? a.slice(a.indexOf("=") + 1) : true; };
const outAt = args.indexOf("--out");
const OUT = outAt >= 0 ? args[outAt + 1] : (typeof flag("--out") === "string" ? flag("--out") : null);
const [ROOT, PAGE] = args.filter((a, i) => !a.startsWith("--") && !(outAt >= 0 && i === outAt + 1));
if (!ROOT || !PAGE) { console.error("usage: node tools/check-deck.mjs <site folder> <deck.html> [--background=COLOR] [--reduced] [--out DIR]"); process.exit(2); }
const BACKGROUND = flag("--background");
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json" };
const server = http.createServer((req, res) => { let p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname)); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html"); if (!fs.existsSync(p)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(res); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: flag("--reduced") ? "reduce" : "no-preference" });
await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.abort());
const pg = await ctx.newPage();
const consoleLines = [], missing = [];
pg.on("console", (m) => { if (!/Failed to load resource/.test(m.text())) consoleLines.push(`${m.type()}: ${m.text()}`); });
pg.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));
pg.on("response", (r) => { if (r.status() === 404) missing.push(r.url()); });
await pg.goto(`http://127.0.0.1:${server.address().port}/${PAGE}`, { waitUntil: "load" });
await pg.waitForFunction(() => window.Reveal && Reveal.isReady && Reveal.isReady(), null, { timeout: 15000 });
if (BACKGROUND) await pg.evaluate((c) => { for (const s of Reveal.getSlides()) s.setAttribute("data-background-color", c); Reveal.sync(); }, BACKGROUND);
await pg.addStyleTag({ content: "*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; }" });
await pg.waitForTimeout(800);

const measure = () => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const g = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => { g.clearRect(0, 0, 1, 1); g.fillStyle = "#000"; g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (c, B) => c[3] === 0 ? B : [0, 1, 2].map((i) => c[i] * c[3] + B[i] * (1 - c[3]));
  const mix = (B, C, o) => [0, 1, 2].map((i) => Math.round(C[i] * o + B[i] * (1 - o)));
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };
  const slide = Reveal.getCurrentSlide();
  // What is behind the slide: the page, then the slide's own background
  let base = [255, 255, 255];
  for (const el of [document.documentElement, document.body, document.querySelector(".reveal")]) if (el) base = over(rgba(getComputedStyle(el).backgroundColor), base);
  const bg = Reveal.getSlideBackground(slide);
  if (bg) for (const el of [bg, bg.querySelector(".slide-background-content")]) if (el) base = over(rgba(getComputedStyle(el).backgroundColor), base);
  const slidesEl = document.querySelector(".reveal .slides");
  // Each ancestor's background composited, and its opacity applied, as drawn
  const comp = (chain, i, B) => { const cs = getComputedStyle(chain[i]); const B2 = over(rgba(cs.backgroundColor), B); let r = i === chain.length - 1 ? { bg: B2, text: over(rgba(cs.color), B2) } : comp(chain, i + 1, B2); const o = parseFloat(cs.opacity); if (o < 1) r = { bg: mix(B, r.bg, o), text: mix(B, r.text, o) }; return r; };
  const scale = Reveal.getScale(), out = [];
  for (const el of slide.querySelectorAll("*")) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 0)) continue;
    if (el.closest("script, style, mjx-container, .visually-hidden, aside.notes, .notes, [aria-hidden=true]")) continue;
    const cs = getComputedStyle(el), rc = el.getBoundingClientRect();
    if (rc.width === 0 || rc.height === 0) continue;
    const chain = []; for (let a = el; a && a !== slidesEl; a = a.parentElement) chain.unshift(a);
    let hidden = false, op = 1; for (const a of chain) { const s = getComputedStyle(a); if (s.display === "none" || s.visibility === "hidden") hidden = true; op *= parseFloat(s.opacity); }
    if (hidden || op === 0) continue;
    const r = comp(chain, 0, base);
    out.push({ sel: el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""), text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 30), ratio: ratio(r.text, r.bg), px: Math.round(parseFloat(cs.fontSize) * scale * 10) / 10, op: Math.round(op * 100) / 100 });
  }
  // The slide number, over the slide's background
  const sn = document.querySelector(".reveal .slide-number");
  if (sn && getComputedStyle(sn).display !== "none") {
    let B = base; for (let a = sn; a && a !== document.querySelector(".reveal"); a = a.parentElement) B = over(rgba(getComputedStyle(a).backgroundColor), B);
    out.push({ sel: "slide number", text: sn.textContent.replace(/\s+/g, ""), ratio: ratio(over(rgba(getComputedStyle(sn).color), B), B), px: parseFloat(getComputedStyle(sn).fontSize), op: 1 });
  }
  const st = Reveal.getState();
  const tall = slide.scrollHeight > Reveal.getConfig().height + 2 && !slide.classList.contains("scrollable");
  return { h: st.indexh, v: st.indexv, f: st.indexf, title: ((slide.querySelector("h1,h2,h3") || {}).textContent || slide.id).trim().slice(0, 30), rows: out, tall };
};

const config = await pg.evaluate(() => { const c = Reveal.getConfig(); return { size: `${c.width}×${c.height}`, scale: Math.round(Reveal.getScale() * 100) / 100, transition: c.transition, slides: Reveal.getTotalSlides() }; });
const steps = [];
const n = await pg.evaluate(() => Reveal.getSlides().length);
for (let k = 0; k < n; k++) {
  await pg.evaluate((k) => { const i = Reveal.getIndices(Reveal.getSlides()[k]); Reveal.slide(i.h, i.v, -1); }, k);
  for (let f = 0; f < 60; f++) {
    await pg.waitForTimeout(150);
    const m = await pg.evaluate(measure);
    if (OUT) await pg.screenshot({ path: path.join(OUT, `${String(steps.length).padStart(3, "0")}-s${m.h}${m.v ? "." + m.v : ""}f${m.f ?? "-"}.png`) });
    steps.push(m);
    if (!(await pg.evaluate(() => Reveal.nextFragment()))) break;
  }
}
await b.close(); server.close();

const fails = {}, sizes = [];
for (const s of steps) for (const r of s.rows) {
  if (r.ratio < 4.5) (fails[`${r.sel} ${r.ratio}:1${r.op < 1 ? " (opacity " + r.op + ")" : ""}`] ??= new Set()).add(`"${s.title}": "${r.text}"`);
  if (r.sel !== "slide number") sizes.push(r);
}
const seen = new Set(); const smallest = sizes.sort((a, b) => a.px - b.px).filter((r) => !seen.has(r.sel + r.px) && seen.add(r.sel + r.px)).slice(0, 5);
console.log(`${PAGE}${BACKGROUND ? ", every slide on " + BACKGROUND : ""}: ${config.slides} slides, ${steps.length} steps, ${config.size} at scale ${config.scale}, transition ${config.transition}`);
console.log(`text under 4.5:1: ${Object.keys(fails).length ? "" : "none"}`);
for (const [k, v] of Object.entries(fails)) console.log(`  ${k}  ×${v.size}, e.g. ${[...v].slice(0, 2).join("; ")}`);
console.log(`smallest text (px on a 1280×720 screen): ${smallest.map((r) => `${r.px} ${r.sel} "${r.text}"`).join(" · ")}`);
console.log(`taller than the slide: ${[...new Set(steps.filter((s) => s.tall).map((s) => s.title))].join(" | ") || "none"}`);
console.log(`console: ${consoleLines.length ? "\n  " + consoleLines.join("\n  ") : "nothing"}`);
console.log(`missing files: ${[...new Set(missing)].join(" ") || "none"}`);
process.exit(Object.keys(fails).length ? 1 : 0);
