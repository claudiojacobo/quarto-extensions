#!/usr/bin/env node
// check-concept-map.mjs: does the concept map behave exactly as it did?
//
// Runs the same script of layouts and interactions on two versions of
// mathkit's concept map viewer and compares the page after every step: the
// whole map's HTML (every node position, arrow, label, class, the card, the
// list) and the computed style of every element. Layouts are seeded, so two
// versions that compute the same thing give the same bytes.
//
//   node tools/check-concept-map.mjs --ref v0.9.3                # working copy vs a tag
//   node tools/check-concept-map.mjs --ref HEAD path/to/_site/concepts.html …
//   node tools/check-concept-map.mjs --old DIR --new DIR         # two folders of files
//
// The maps checked are a built-in synthetic book (200 items in 12 chapters
// and 3 parts: every kind, examples, forward references, citations, a chapter
// with no number) and any rendered concept map pages given (their data and
// List view are reused). Runs in Chromium with reduced motion and without
// MathJax, so that nothing depends on timing.
//
// Needs Node 18+ and Playwright: once, cd tools && npm install && npx playwright install chromium.
// Exits 0 when every step matches; otherwise prints the first differences.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// require() also finds a global install (NODE_PATH), which import doesn't
const { chromium } = createRequire(import.meta.url)("playwright");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const EXT = "mathkit/_extensions/mathkit";
// The files a version may have, in load order; a version uses those it has.
const FILES = ["graph-view.css", "concept-map.css", "graph-view.js", "concept-map.js"];

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const ref = opt("--ref"), oldDir = opt("--old"), newDir = opt("--new");
const pages = args;
if (!ref && !oldDir) {
  console.error("usage: check-concept-map.mjs (--ref REV | --old DIR [--new DIR]) [concepts.html …]");
  process.exit(2);
}

function version(label, read) {
  const files = {};
  for (const f of FILES) { const text = read(f); if (text != null) files[f] = text; }
  if (!files["concept-map.js"]) throw new Error(`${label}: no concept-map.js`);
  return { label, files };
}
const fromDir = dir => f => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), "utf8") : null);
const fromGit = rev => f => {
  try { return execFileSync("git", ["-C", REPO, "show", `${rev}:${EXT}/${f}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return null; }
};
const A = ref ? version(ref, fromGit(ref)) : version(oldDir, fromDir(oldDir));
const B = version(newDir || "working copy", fromDir(newDir || path.join(REPO, EXT)));

// ---------------------------------------------------------------- maps to check
function synthetic() {
  let seed = 12345;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = xs => xs[Math.floor(rand() * xs.length)];
  const KIND = { def: "Definition", thm: "Theorem", prp: "Proposition", lem: "Lemma", cor: "Corollary", exm: "Example", cnj: "Conjecture" };
  const parts = ["Groups", "Groups", "Groups", "Groups", "Groups", "Rings", "Rings", "Rings", "Rings", "Fields", "", "Rings"];
  const chapters = parts.map((part, c) => ({
    file: `notes/ch${c + 1}.qmd`, part, title: `Chapter title ${c + 1}`,
    titleHtml: c === 3 ? `Actions on <span class="math inline">\\(X\\)</span>` : `Chapter title ${c + 1}`,
    number: c === 10 ? null : c + 1,
  }));
  const nodes = [], counters = chapters.map(() => ({}));
  for (let i = 0; i < 200; i++) {
    const chapter = 1 + Math.floor(Math.pow(rand(), 0.8) * chapters.length);
    const kind = pick(["def", "def", "def", "thm", "prp", "prp", "lem", "cor", "exm", "exm", "exm", "cnj"]);
    const c = counters[chapter - 1]; c[kind] = (c[kind] || 0) + 1;
    const num = chapters[chapter - 1].number ? `${chapters[chapter - 1].number}.${c[kind]}` : null;
    const name = KIND[kind] + (num ? " " + num : "");
    const titled = rand() < 0.7, words = 1 + Math.floor(rand() * 5);
    const title = titled ? Array.from({ length: words }, (_, w) => pick(["Lagrange", "cosets", "the", "order", "of", "a", "kernel", "is", "normal", "ideal", "prime"]) + (w === 0 ? "'s" : "")).join(" ") : "";
    const math = rand() < 0.15;
    nodes.push({
      id: `${kind}-n${i}`, kind, name, chapter,
      title, titleHtml: title + (math ? ` <span class="math inline">\\(G/N\\)</span>` : ""),
      label: title || name, labelHtml: (title || name) + (math ? ` <span class="math inline">\\(G/N\\)</span>` : ""),
      statementHtml: "", url: `notes/ch${chapter}.html#${kind}-n${i}`,
    });
  }
  nodes.sort((a, b) => a.chapter - b.chapter);                // book order, as the Lua side gives
  const edges = [];
  for (const n of nodes) {
    const k = n.kind === "def" ? Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3);
    for (let j = 0; j < k; j++) {
      const earlier = nodes.filter(m => m !== n && (m.chapter < n.chapter || (m.chapter === n.chapter && nodes.indexOf(m) < nodes.indexOf(n))) && m.kind !== "exm");
      if (!earlier.length) break;
      const near = rand() < 0.7 ? earlier.filter(m => m.chapter === n.chapter) : earlier;
      edges.push({ source: pick(near.length ? near : earlier).id, target: n.id });
    }
  }
  edges.push({ source: nodes[150].id, target: nodes[20].id });   // a forward reference
  edges.push({ ...edges[3] });                                  // a duplicate
  edges.push({ source: "def-missing", target: nodes[5].id });   // an unknown id
  for (const n of nodes) {
    const deps = edges.filter(e => e.target === n.id).map(e => e.source).filter(id => nodes.some(m => m.id === id));
    n.statementHtml = `<p>Let <span class="math inline">\\(G\\)</span> be a group` +
      (deps.length ? `; by <span class="citation" data-cites="${deps[0]}">@${deps[0]}</span>` : "") +
      ` and <span class="citation" data-cites="DF2004">[Dummit &amp; Foote]</span>, it holds.</p>`;
  }
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const byId = new Map(nodes.map(n => [n.id, n]));
  const rel = (label, ids) => ids.length ? `<p class="cm-list-rel"><span class="cm-list-rel-label">${label}</span> ` +
    ids.map(id => `<a href="#cm-item-${id}">${esc(byId.get(id).name)}</a>`).join(", ") + "</p>" : "";
  let list = '<div class="cm-list" id="concept-map-list">';
  chapters.forEach((ch, c) => {
    list += `\n<section class="cm-list-chapter"><h2 class="cm-list-heading">${ch.number ? ch.number + " " : ""}${ch.titleHtml}</h2>\n<ul class="cm-list-items">`;
    for (const n of nodes.filter(n => n.chapter === c + 1)) {
      const deps = [...new Set(edges.filter(e => e.target === n.id && byId.has(e.source)).map(e => e.source))];
      const users = [...new Set(edges.filter(e => e.source === n.id && byId.has(e.target)).map(e => e.target))];
      list += `\n<li class="cm-list-item cm-list-${n.kind}" id="cm-item-${n.id}" data-id="${n.id}"><p class="cm-list-name"><a href="${n.url}">${esc(n.name)}</a>${n.titleHtml ? ": " + n.titleHtml : ""}</p>${rel("Uses", deps)}${rel("Used by", users)}<details><summary>Statement</summary><div class="cm-list-statement">${n.statementHtml}</div></details></li>`;
    }
    list += "</ul></section>";
  });
  list += "\n</div>";
  return { name: "synthetic book", data: { chapters, nodes, edges, options: {} }, list };
}

function fromPage(file) {
  const html = fs.readFileSync(file, "utf8");
  const data = html.match(/<script type="application\/json" id="concept-map-data">([\s\S]*?)<\/script>/);
  const list = html.match(/<div class="cm-list" id="concept-map-list">[\s\S]*?\n<\/div>(?=\s*<script type="application\/json" id="concept-map-data">)/);
  if (!data) throw new Error(`${file}: no concept map data`);
  return { name: file, data: JSON.parse(data[1].replace(/<\\\//g, "</")), list: list ? list[0] : "" };
}

// ---------------------------------------------------------------- the page
function page(dir, v, map) {
  for (const [f, text] of Object.entries(v.files)) fs.writeFileSync(path.join(dir, f), text);
  const css = FILES.filter(f => f.endsWith(".css") && v.files[f]).map(f => `<link rel="stylesheet" href="${f}">`).join("\n");
  const js = FILES.filter(f => f.endsWith(".js") && v.files[f]).map(f => `<script src="${f}"></script>`).join("\n");
  const json = JSON.stringify(map.data).replace(/<\//g, "<\\/");
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html><html><head><meta charset="utf-8">
<style>body { margin: 16px; font: 16px/1.5 "DejaVu Sans", Arial, sans-serif; } .math { font-style: italic; }
/* no CSS transitions: a style is compared at rest, not halfway through a fade */
*, *::before, *::after { transition: none !important; animation: none !important; }</style>
${css}
${js}
</head><body>
<div class="graph-view concept-map" id="concept-map"></div>
${map.list}
<script type="application/json" id="concept-map-data">${json}</script>
</body></html>`);
  return "file://" + path.join(dir, "index.html");
}

// What the page looks like now: the map's HTML, the computed style of every
// element in it, where the URL points, what has the keyboard focus, and what
// the browser remembers.
const STYLE = ["display", "visibility", "opacity", "color", "background-color", "font-size", "font-weight",
  "font-style", "fill", "stroke", "stroke-width", "border-left-color", "border-left-width", "border-radius",
  "position", "top", "right", "bottom", "left", "width", "height", "cursor", "transform-origin", "text-shadow", "z-index"];
async function snapshot(p) {
  return p.evaluate(STYLE => {
    const root = document.getElementById("concept-map");
    const styles = [...root.querySelectorAll("*")].map(e => {
      const cs = getComputedStyle(e);
      return STYLE.map(k => cs.getPropertyValue(k)).join("|");
    });
    const a = document.activeElement;
    let stored = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); stored[k] = localStorage.getItem(k); } } catch (e) { stored = "n/a"; }
    return {
      html: root.outerHTML.replace(/></g, ">\n<").split("\n"),
      styles,
      hash: location.hash,
      active: a ? (a.dataset && a.dataset.id) || a.className || a.tagName : null,
      stored: JSON.stringify(stored),
      docClass: document.documentElement.className,
    };
  }, STYLE);
}

// ---------------------------------------------------------------- the script
async function center(p, sel) {
  const b = await p.locator(sel).first().boundingBox();
  if (!b) throw new Error(`not visible: ${sel}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
// The page's clock: animation frames run only when the check says so, each
// 1/60 s apart on a clock of the check's own (performance.now). After every
// step, frames run until none is asked for (the simulation has come to rest,
// a glide has ended), so every step is compared at rest, whatever the speed
// of the machine.
function clock() {
  let now = 0, next = 1;
  const queue = new Map();
  performance.now = () => now;
  window.requestAnimationFrame = cb => { queue.set(next, cb); return next++; };
  window.cancelAnimationFrame = id => { queue.delete(id); };
  // At most 1200 frames a step: enough for the simulation to come to rest from
  // a full start (600) and a glide; a drag in progress keeps it going, so it stops there.
  window.__frames = (limit = 1200) => {
    let n = 0;
    while (queue.size && n < limit) {
      const due = [...queue.values()]; queue.clear();
      now += 1000 / 60; n++;
      for (const cb of due) cb(now);
    }
    return n;
  };
}
async function settle(p) {
  for (let i = 0; i < 2; i++) {          // resize observers, full screen and focus changes come between frames
    await p.waitForTimeout(60);
    await p.evaluate(() => window.__frames());
  }
}
async function run(browser, v, map, steps) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-check-"));
  const url = page(dir, v, map);
  const out = [];
  const record = async (p, name) => { await settle(p); out.push({ name, ...(await snapshot(p)) }); };
  const errors = [];
  const fresh = async ({ layout, hash, motion = "reduce" } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, reducedMotion: motion });
    await ctx.addInitScript(clock);
    if (layout) await ctx.addInitScript(l => { try { localStorage.setItem("concept-map-layout", l); } catch (e) {} }, layout);
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push(String(e)));
    await p.goto(url + (hash ? "#" + hash : ""));
    return { p, ctx };
  };
  for (const step of steps) await step({ fresh, record, map });
  fs.rmSync(dir, { recursive: true, force: true });
  if (errors.length) out.push({ name: "page errors", html: errors, styles: [] });
  return out;
}

const LAYOUTS = ["clusters", "depth", "book", "free"];
const steps = [
  // each layout, as a reader who chose it last time sees it
  ...LAYOUTS.map(layout => async ({ fresh, record }) => {
    const { p, ctx } = await fresh({ layout }); await record(p, `open in ${layout}`); await ctx.close();
  }),
  // with motion: the simulation runs to rest; switching layouts glides
  async ({ fresh, record }) => {
    const { p, ctx } = await fresh({ motion: "no-preference" });
    await record(p, "open, animated, at rest");
    for (const l of ["free", "book", "depth", "clusters"]) {
      await p.selectOption(".cm-select", l); await record(p, `switch to ${l}`);
    }
    const m = await center(p, ".cm-node");
    await p.mouse.move(m.x, m.y); await p.mouse.down(); await p.mouse.move(m.x + 80, m.y - 30, { steps: 5 });
    await record(p, "dragging, animated");
    await p.mouse.up(); await record(p, "dropped, at rest");
    await ctx.close();
  },
  // the interactions
  async ({ fresh, record, map }) => {
    const { p, ctx } = await fresh();
    const ids = map.data.nodes.map(n => n.id);
    const nodeSel = id => `.cm-node[data-id="${id}"]`;
    const some = ids.filter((_, i) => i % 7 === 3).slice(0, 3);
    const m = await center(p, nodeSel(some[0]));
    await p.mouse.move(m.x, m.y); await record(p, "hover a node");
    await p.mouse.move(5, 5); await record(p, "hover away");
    await p.mouse.move(m.x, m.y); await p.mouse.down(); await p.mouse.up(); await record(p, "click a node");
    const chip = p.locator(".cm-card .cm-chip").first();
    if (await chip.count()) { await chip.click(); await record(p, "click a chip on the card"); }
    const m2 = await center(p, nodeSel(some[1]));
    await p.mouse.move(m2.x, m2.y); await record(p, "hover another while focused");
    await p.keyboard.press("Escape"); await record(p, "Esc clears the focus");
    // drag a node, then drag the background
    const d = await center(p, nodeSel(some[2]));
    await p.mouse.move(d.x, d.y); await p.mouse.down(); await p.mouse.move(d.x + 60, d.y + 40, { steps: 4 }); await p.mouse.up();
    await record(p, "drag a node");
    await p.mouse.move(600, 880); await p.mouse.down(); await p.mouse.move(650, 860, { steps: 3 }); await p.mouse.up();
    await record(p, "pan");
    const stage = await center(p, ".cm-stage");
    await p.mouse.move(stage.x, stage.y); await p.mouse.wheel(0, -300); await record(p, "zoom in with the wheel");
    await p.click("text=Fit"); await record(p, "Fit");
    await p.click('[aria-label="Zoom out"]'); await record(p, "zoom out button");
    // search
    await p.fill(".cm-search", "kernel"); await record(p, "search");
    await p.press(".cm-search", "Enter"); await p.press(".cm-search", "Enter"); await record(p, "Enter twice");
    await p.press(".cm-search", "Shift+Enter"); await record(p, "Shift+Enter");
    await p.press(".cm-search", "Escape"); await record(p, "Esc clears the search");
    await p.fill(".cm-search", "zzzz nothing"); await record(p, "search, no match");
    await p.fill(".cm-search", "");
    // toggles
    const ex = p.locator(".cm-toggle", { hasText: "Examples" }).locator("input");
    if (await ex.count()) { await ex.uncheck(); await record(p, "hide examples"); await ex.check(); await record(p, "show examples"); }
    await p.locator(".cm-toggle", { hasText: "Show chapters" }).locator("input").uncheck(); await record(p, "hide chapter outlines");
    // keyboard
    await p.locator(nodeSel(ids[0])).focus(); await record(p, "keyboard focus on the first item");
    await p.keyboard.press("ArrowDown"); await p.keyboard.press("ArrowDown"); await record(p, "ArrowDown twice");
    await p.keyboard.press("End"); await record(p, "End");
    await p.keyboard.press("Enter"); await record(p, "Enter focuses");
    await p.keyboard.press("Escape");
    // the List view
    if (await p.locator(".cm-views:not([hidden])").count()) {
      await p.click("text=List"); await record(p, "List view");
      await p.fill(".cm-search", "kernel"); await record(p, "search in the list");
      await p.press(".cm-search", "Enter"); await record(p, "Enter in the list");
      await p.fill(".cm-search", "");
      const show = p.locator(".cm-list-show").nth(2);
      await show.click(); await record(p, "Show on the map");
    }
    // full screen (or the whole window), and Esc
    await p.click(".cm-full"); await record(p, "full screen");
    await p.keyboard.press("Escape"); await p.keyboard.press("Escape"); await record(p, "Esc, Esc");
    await ctx.close();
  },
  // links to an item and to its list entry
  async ({ fresh, record, map }) => {
    const id = map.data.nodes[Math.floor(map.data.nodes.length / 2)].id;
    let { p, ctx } = await fresh({ hash: id }); await record(p, "open at #item"); await ctx.close();
    if (map.list) { ({ p, ctx } = await fresh({ hash: "cm-item-" + id })); await record(p, "open at #cm-item-item"); await ctx.close(); }
    ({ p, ctx } = await fresh());
    const other = map.data.nodes[3].id;
    await p.evaluate(h => { location.hash = h; }, other); await p.waitForTimeout(50); await record(p, "hashchange to an item");
    await ctx.close();
  },
];

// ---------------------------------------------------------------- compare
function firstDiffs(a, b, limit = 6) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < limit; i++)
    if (a[i] !== b[i]) out.push(`      line ${i}:\n        ${A.label}: ${a[i] === undefined ? "(none)" : a[i].slice(0, 300)}\n        ${B.label}: ${b[i] === undefined ? "(none)" : b[i].slice(0, 300)}`);
  return out;
}

const maps = [synthetic(), ...pages.map(fromPage)];
const browser = await chromium.launch();
let failed = 0;
for (const map of maps) {
  const a = await run(browser, A, map, steps), b = await run(browser, B, map, steps);
  let same = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || { name: "(missing)", html: [], styles: [] }, y = b[i] || { name: "(missing)", html: [], styles: [] };
    const problems = [];
    if (x.name !== y.name) problems.push(`    step names differ: ${x.name} / ${y.name}`);
    for (const k of ["hash", "active", "stored", "docClass"]) if (x[k] !== y[k]) problems.push(`    ${k}: ${x[k]} / ${y[k]}`);
    const h = firstDiffs(x.html, y.html), s = firstDiffs(x.styles, y.styles, 3);
    if (h.length) problems.push("    HTML:", ...h);
    if (s.length) problems.push("    computed styles:", ...s);
    if (problems.length) { failed++; console.log(`✗ ${map.name}: ${x.name}`); console.log(problems.join("\n")); }
    else same++;
  }
  console.log(`${map.name}: ${same}/${Math.max(a.length, b.length)} steps identical (${a.reduce((s, x) => s + x.html.length, 0)} lines of HTML compared)`);
}
await browser.close();
process.exit(failed ? 1 : 0);
