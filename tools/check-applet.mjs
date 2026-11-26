#!/usr/bin/env node
// check-applet.mjs: the tests of the cjgg README's "Building an applet", on
// one applet, in headless Chromium. The applet is served from its site's
// folder (a built _site, or any folder with theme/ beside it) and shown in an
// iframe, as a page or a deck would show it:
//
//   node tools/check-applet.mjs ~/Git/math-talks/_site my-talk/applets/my-applet.html
//   node tools/check-applet.mjs <site> <applet> --drag=0.37,0.47,0.45,0.3 --keys=ArrowRight,ArrowUp --out /tmp/applet
//
// It checks, and pictures in --out:
//   - it loads with no console error and no missing file, and asks nothing of another site;
//   - the theme message: { type: "theme", dark: true } turns it dark (the picture changes), and back;
//   - a drag by mouse and one by finger (pointer events) change the picture. --drag gives
//     the drag's start and end as fractions of the whole frame, header included (default
//     0.5,0.5,0.7,0.3: from the middle); start it on something that can be grabbed;
//   - the keyboard: Tab reaches something in it, the focus is visible, and --keys (default
//     ArrowRight ×3) change the picture;
//   - reduced motion: nothing moves on its own, no CSS transition or animation runs, and
//     after the keys and Home (a reset, by the starter's convention) it is still at once;
//   - its text in HTML has 4.5:1 against what is behind it, measured as drawn (faded text
//     too) on a page, a phone and a slide, light and dark;
//   - on a slide (?deck=1, a 1180×560 frame on a 1280×720 slide, told it is in a deck):
//     every text in HTML is 24px or more (18px in an exponent or index); its canvases
//     follow the deck's enlargement ({ type: "scale" }); after a drag the keyboard goes
//     back to the page around it (the deck), and after Tab it stays;
//   - pictures of a page (880×500), a phone held upright (360×600) and a slide, light and dark.
// What it can't see, look at in the pictures: text drawn on a canvas (its size and
// contrast), lines and points (3:1), text in HTML over a canvas (measured against the
// colors behind it in HTML, not the drawing), and whether the slide's picture reads
// from the back of a room (shrink it to a quarter).
//
// --axe=FILE runs axe (axe.min.js) from the page around the frame, as a reader's page is
// checked, and lists what axe left for review. Needs Node 18+ and Playwright (see
// check-contrast.mjs). Exits 1 if a check fails.
import { createRequire } from "node:module";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");

// options as --name=value or --name value
const args = process.argv.slice(2), options = {}, positional = [];
for (let i = 0; i < args.length; i++) {
  const m = /^--([a-z]+)(?:=(.*))?$/.exec(args[i]);
  if (!m) positional.push(args[i]);
  else options[m[1]] = m[2] !== undefined ? m[2] : args[++i];
}
const opt = (name, fallback) => options[name] !== undefined ? options[name] : fallback;
const [ROOT, APPLET] = positional;
if (!ROOT || !APPLET) { console.error("usage: node tools/check-applet.mjs <site folder> <applet path in it> [--drag=x0,y0,x1,y1] [--keys=K1,K2] [--out DIR] [--axe=axe.min.js]"); process.exit(2); }
const DRAG = opt("drag", "0.5,0.5,0.7,0.3").split(",").map(Number);
const DRAG_GIVEN = options.drag !== undefined;
const KEYS = opt("keys", "ArrowRight,ArrowRight,ArrowRight").split(",");
const OUT = opt("out", null), AXE = opt("axe", null);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const SRC = "/" + APPLET.replace(/^\/+/, "");

// ---------- a server for the site, and a host page with the frame ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".wasm": "application/wasm" };
const missing = [];
const host = (src, w, h, bg) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>check-applet</title>
<style>html,body{margin:0;background:${bg}}body{display:grid;place-items:center;min-height:100vh}iframe{display:block;border:0;width:${w}px;height:${h}px}</style></head>
<body><main><h1 style="position:absolute;left:-9999px">check-applet</h1><h2 style="position:absolute;left:-9999px">A section</h2><iframe title="The applet under test" src="${src}"></iframe></main></body></html>`;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__host.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(host(u.searchParams.get("src"), u.searchParams.get("w"), u.searchParams.get("h"), u.searchParams.get("bg") || "#ffffff")); return; }
  let p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) { missing.push(u.pathname); res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const O = `http://127.0.0.1:${server.address().port}`;

let failed = 0;
const report = (ok, what, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? ": " + detail : ""}`); };
const note = (what) => console.log(`      ${what}`);
const dragHint = DRAG_GIVEN ? "" : " (the default drag starts mid-frame: give --drag=x0,y0,x1,y1, fractions of the whole frame, header included, starting on something that can be grabbed)";

const browser = await chromium.launch();
const outside = [], problems = [];
async function open({ w, h, vw, vh, deck = false, touch = false, reduced = false, bg }) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: touch, reducedMotion: reduced ? "reduce" : "no-preference" });
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => { outside.push(r.request().url()); r.abort(); });
  const pg = await ctx.newPage();
  pg.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/Failed to load resource/.test(m.text())) problems.push(`${m.type()}: ${m.text()}`); });
  pg.on("pageerror", (e) => problems.push(`error: ${e.message}`));
  const src = SRC + (deck ? (SRC.includes("?") ? "&" : "?") + "deck=1" : "");
  await pg.goto(`${O}/__host.html?w=${w}&h=${h}&bg=${encodeURIComponent(bg || "#ffffff")}&src=${encodeURIComponent(src)}`, { waitUntil: "load" });
  const frame = (await pg.$("iframe"));
  const f = await frame.contentFrame();
  await f.waitForLoadState("load");
  await pg.waitForTimeout(800);
  return { ctx, pg, frame, f, box: await frame.boundingBox() };
}
// the messages a page on another site, or a deck, sends
const post = (s, message) => s.pg.evaluate((m) => document.querySelector("iframe").contentWindow.postMessage(m, "*"), message);
const theme = (s, dark, deck = false) => post(s, { type: "theme", dark, deck });
const snap = async (s, name) => { const buf = await s.pg.screenshot({ clip: s.box }); if (OUT && name) fs.writeFileSync(path.join(OUT, name + ".png"), buf); return buf; };
const picture = async (s, name) => { await s.pg.waitForTimeout(600); return snap(s, name); };
// Two pictures differ when more than 20 pixels change by more than 8 of 255: a blur
// behind a chip may round differently from one frame to the next.
let lab = null;
async function changed(a, b) {
  if (a.equals(b)) return 0;
  if (!lab) lab = await (await browser.newContext()).newPage();
  return lab.evaluate(async ([x, y]) => {
    const load = (d) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = "data:image/png;base64," + d; });
    const [i, j] = await Promise.all([load(x), load(y)]);
    const px = (img) => { const c = new OffscreenCanvas(img.width, img.height), g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
    const p = px(i), q = px(j); let n = 0;
    for (let k = 0; k < p.length; k += 4) if (Math.max(Math.abs(p[k] - q[k]), Math.abs(p[k + 1] - q[k + 1]), Math.abs(p[k + 2] - q[k + 2])) > 8) n++;
    return n;
  }, [a.toString("base64"), b.toString("base64")]);
}
const differ = async (a, b) => (await changed(a, b)) > 20;

// a drag through the page, by mouse or (with a CDP session) by finger
async function dragMouse(s) {
  const at = (fx, fy) => [s.box.x + fx * s.box.width, s.box.y + fy * s.box.height];
  await s.pg.mouse.move(...at(DRAG[0], DRAG[1])); await s.pg.mouse.down();
  for (let i = 1; i <= 8; i++) await s.pg.mouse.move(...at(DRAG[0] + (DRAG[2] - DRAG[0]) * i / 8, DRAG[1] + (DRAG[3] - DRAG[1]) * i / 8));
  await s.pg.mouse.up();
}

// Tab from the page into the applet, then on until the keys change it: Tab stops
// at the first control (a page of buttons first, a canvas after)
async function keyboard(s, { name = "keys" } = {}) {
  let reached = null;
  for (let i = 0; i < 12 && !reached; i++) {
    await s.pg.keyboard.press("Tab");
    reached = await s.f.evaluate(() => { const a = document.activeElement; if (!a || a === document.body || !document.hasFocus()) return null; const cs = getComputedStyle(a); return { tag: a.tagName.toLowerCase(), role: a.getAttribute("role"), label: a.getAttribute("aria-label") || a.textContent.trim().slice(0, 60), ring: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? `${cs.outlineWidth} ${cs.outlineColor}` : null }; }).catch(() => null);
  }
  let keyed = false;
  for (let i = 0; i < 6 && reached && !keyed; i++) {
    const was = await picture(s);
    for (const k of KEYS) await s.pg.keyboard.press(k);
    keyed = await differ(was, await picture(s, name));
    if (!keyed) await s.pg.keyboard.press("Tab");
  }
  return { reached, keyed };
}

// Every text in HTML that is shown: its size, and its contrast as drawn (its color and
// opacity over the backgrounds behind it). Text over a canvas is measured against the
// HTML behind it, not the drawing.
const measureTexts = (s) => s.f.evaluate(() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const g = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => { g.clearRect(0, 0, 1, 1); g.fillStyle = "#000"; g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const behind = (el) => { let bg = [255, 255, 255]; const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e); for (const e of chain) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) bg = [0, 1, 2].map((i) => c[i] * c[3] + bg[i] * (1 - c[3])); } return bg; };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement, cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!r.width || !r.height || cs.visibility === "hidden" || el.closest(".applet-visually-hidden, [hidden], [aria-hidden=true]") || el.closest("script, style")) continue;
    // not shown at all, or faded out entirely: not measured; faded in part: measured as drawn
    let hidden = false, opacity = 1;
    for (let e = el; e; e = e.parentElement) { const st = getComputedStyle(e); if (st.display === "none") hidden = true; opacity *= parseFloat(st.opacity); }
    if (hidden || opacity < 0.05) continue;
    const fg = rgba(cs.color), bg = behind(el), a = fg[3] * opacity, c = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
    const [hi, lo] = [lum(c), lum(bg)].sort((x, y) => y - x);
    out.push({ text: n.textContent.trim().slice(0, 30), px: parseFloat(cs.fontSize), script: !!el.closest("sub, sup"), ratio: Math.round((hi + 0.05) / (lo + 0.05) * 100) / 100 });
  }
  return out;
});
async function contrast(s, where) {
  const texts = await measureTexts(s);
  const faint = texts.filter((t) => t.ratio < 4.5);
  report(faint.length === 0, `its HTML text has 4.5:1 (${where})`, faint.length ? faint.map((t) => `"${t.text}" ${t.ratio}:1`).join("; ") : texts.length ? `${texts.length} texts, lowest ${Math.min(...texts.map((t) => t.ratio))}:1` : "no text in HTML");
  return texts;
}

// axe in the page and in the frame, run from the page: the applet checked as part of a page
const axeReview = new Set();   // what axe couldn't judge in the applet (targets through the iframe)
async function axe(s, what) {
  const src = fs.readFileSync(AXE, "utf8");
  if (!(await s.f.evaluate(() => !!window.axe))) await s.f.addScriptTag({ content: src });
  if (!(await s.pg.evaluate(() => !!window.axe))) await s.pg.addScriptTag({ content: src });
  await s.pg.waitForTimeout(400);
  const r = await s.pg.evaluate(async () => { const x = await axe.run(document, { resultTypes: ["violations", "incomplete"] }); return { violations: x.violations, incomplete: x.incomplete }; });
  report(r.violations.length === 0, what, r.violations.map((x) => `${x.id}: ` + x.nodes.map((n) => `${n.target.join(" > ")} (${(n.any[0] || n.all[0] || n.none[0] || {}).message || ""})`).join("; ")).join(" | "));
  // what axe couldn't judge in the applet (a target through the iframe); the host page's own left out
  for (const x of r.incomplete) for (const n of x.nodes) if (n.target.length > 1) axeReview.add(`${x.id} ${n.target.slice(-1)[0]}`);
}

// ---------- a page: load, theme, contrast, drag, keyboard ----------
{
  const s = await open({ w: 880, h: 500, vw: 1000, vh: 700 });
  await theme(s, false);
  const light = await picture(s, "page-light");
  await contrast(s, "a page, light");
  await theme(s, true);
  const dark = await picture(s, "page-dark");
  const isDark = await s.f.evaluate(() => document.documentElement.classList.contains("quarto-dark"));
  report(isDark && await differ(light, dark), "the theme message turns it dark", isDark ? "" : "no quarto-dark on <html>");
  await contrast(s, "a page, dark");
  await theme(s, false);
  const before = await picture(s, "page-light-again");
  report(!(await differ(before, light)), "and back to light, as it was");

  await dragMouse(s);
  const moved = await differ(before, await picture(s, "page-dragged"));
  report(moved, "a drag by mouse changes it", `from (${DRAG[0]}, ${DRAG[1]}) to (${DRAG[2]}, ${DRAG[3]}) of the frame${moved ? "" : dragHint}`);

  await s.pg.reload(); await s.pg.waitForTimeout(800);
  s.f = await (await s.pg.$("iframe")).contentFrame();
  await theme(s, false);
  const { reached, keyed } = await keyboard(s, { name: "page-keys" });
  report(!!reached, "Tab reaches it", reached ? `${reached.tag}${reached.role ? ` role=${reached.role}` : ""}: "${reached.label}"` : "nothing in the applet took the focus");
  if (reached) report(!!reached.ring, "the focus is visible", reached.ring || "no outline on the focused element");
  report(keyed, "the keyboard moves it too", KEYS.join(", "));
  await s.ctx.close();
}

// ---------- a finger ----------
{
  const s = await open({ w: 880, h: 500, vw: 1000, vh: 700, touch: true });
  await theme(s, false);
  const before = await picture(s, "touch-before");
  const cdp = await s.ctx.newCDPSession(s.pg);
  const at = (fx, fy) => ({ x: s.box.x + fx * s.box.width, y: s.box.y + fy * s.box.height, id: 1 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at(DRAG[0], DRAG[1])] });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [at(DRAG[0] + (DRAG[2] - DRAG[0]) * i / 8, DRAG[1] + (DRAG[3] - DRAG[1]) * i / 8)] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const moved = await differ(before, await picture(s, "touch-dragged"));
  report(moved, "a drag by finger changes it", moved ? "" : dragHint.trim());
  await s.ctx.close();
}

// ---------- reduced motion ----------
{
  const s = await open({ w: 880, h: 500, vw: 1000, vh: 700, reduced: true });
  await theme(s, false);
  const a = await picture(s); await s.pg.waitForTimeout(800);
  report(!(await differ(a, await snap(s))), "reduced motion: nothing moves on its own");
  const running = await s.f.evaluate(() => document.getAnimations().filter((x) => x.playState === "running").length);
  report(running === 0, "reduced motion: no CSS transition or animation running", running ? `${running} running` : "");
  const { keyed } = await keyboard(s);
  if (keyed) {
    await s.pg.keyboard.press("Home");
    await s.pg.waitForTimeout(80);
    const soon = await snap(s); await s.pg.waitForTimeout(900);
    report(!(await differ(soon, await snap(s))), "reduced motion: after the keys and Home, still at once", "no movement after the first frame");
  } else note("reduced motion: no keys that move it, so no motion after them to check");
  await s.ctx.close();
}

// ---------- on a slide ----------
{
  const s = await open({ w: 1180, h: 560, vw: 1280, vh: 720, deck: true });
  await theme(s, false, true);
  await picture(s, "slide-light");
  const deckClass = await s.f.evaluate(() => document.documentElement.classList.contains("applet-deck"));
  note(deckClass ? "?deck=1: <html> has applet-deck" : "?deck=1: <html> has no applet-deck (not an applet-kit applet?)");
  const texts = await contrast(s, "a slide, light");
  // exponents and indices may be smaller: 18px
  const small = texts.filter((t) => t.px < (t.script ? 18 : 24));
  report(small.length === 0, "on a slide, every HTML text is 24px or more (18px in an exponent or index)", small.length ? small.map((t) => `"${t.text}" ${t.px}px`).join("; ") : `smallest ${texts.length ? Math.min(...texts.map((t) => t.px)) : "-"}px`);
  await theme(s, true, true);
  await picture(s, "slide-dark");
  await contrast(s, "a slide, dark");
  await theme(s, false, true);

  // the deck enlarges its slides by 1.5 (a projector larger than the slide): canvases follow
  await post(s, { type: "scale", value: 1.5 }); await s.pg.waitForTimeout(400);
  const canvases = await s.f.evaluate(() => [...document.querySelectorAll("canvas")].filter((c) => c.clientWidth > 0).map((c) => ({ id: c.id || "canvas", ratio: c.width / c.clientWidth })));
  if (canvases.length) report(canvases.every((c) => c.ratio > 1.45), "its canvases follow the deck's enlargement (scale 1.5)", canvases.map((c) => `${c.id} ×${c.ratio.toFixed(2)}`).join(", "));
  else note("no canvas: nothing to enlarge");
  await post(s, { type: "scale", value: 1 }); await s.pg.waitForTimeout(300);

  // after a drag the keyboard goes back to the page (the deck); after Tab it stays
  await dragMouse(s); await s.pg.waitForTimeout(200);
  const kept = await s.f.evaluate(() => document.hasFocus());
  report(!kept, "on a slide, after a drag the keyboard goes back to the deck", kept ? `the applet kept it (${await s.f.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName))})` : "");
  const { keyed } = await keyboard(s);
  if (keyed) report(await s.f.evaluate(() => document.hasFocus()), "on a slide, after Tab the keys stay with the applet");
  if (AXE) for (const dark of [false, true]) { await theme(s, dark, true); await axe(s, `axe on the slide, ${dark ? "dark" : "light"}`); }
  await s.ctx.close();
}

// ---------- a phone, light and dark; axe on a page and a phone ----------
for (const [w, h, vw, vh, name] of [[880, 500, 1000, 700, "page"], [360, 600, 390, 700, "phone"]]) {
  const s = await open({ w, h, vw, vh });
  for (const dark of [false, true]) {
    await theme(s, dark); await picture(s, `${name}-${dark ? "dark" : "light"}`);
    if (name === "phone") await contrast(s, `a phone, ${dark ? "dark" : "light"}`);
  }
  if (AXE) for (const dark of [false, true]) { await theme(s, dark); await axe(s, `axe on a ${name}, ${dark ? "dark" : "light"}`); }
  await s.ctx.close();
}

if (axeReview.size) note(`axe left ${axeReview.size} in the applet for review (a letter too short to judge, text over a canvas): the contrast lines measure HTML text as drawn; see the pictures for the rest`);
report(problems.length === 0, "no console error or warning", [...new Set(problems)].join(" | "));
report(missing.length === 0, "no missing file", [...new Set(missing)].join(", "));
report(outside.length === 0, "nothing asked of another site", [...new Set(outside)].join(", "));
if (OUT) note(`pictures in ${OUT}`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
