/* concept-map.js — draws the concept map from the data concept-map.lua puts
   in the page (#concept-map-data). No libraries.

   Layout, in two steps.
   1. Chapters: each gets a spot, depending on the layout (the reader picks
      one; {{< concept-map layout="…" >}} sets the default).
      • Clusters: the chapters are a small simulation of their own. They
        repel each other, each taking up room for its items, and the arrows
        between two chapters pull them together, harder the more arrows
        there are. It starts from the Dependencies layout, squeezed sideways.
      • Dependencies: each chapter gets a column, one to the right of the
        deepest earlier chapter it uses, so nothing sits left of what it
        builds on; chapters sharing a column are stacked, each near the
        chapters it has the most arrows to.
      • Book order: rows in reading order, like a table of contents; each
        part starts a row.
      • Free: no chapters at all; the items find their own places.
      Every layout is computed the same way each time: same notes, same
      picture.
   2. Items: a force simulation. Items repel each other, arrows pull their
      ends together, and each item is drawn toward its chapter's spot.
   "Show chapters" draws a blob around each chapter, colored by part.

   Arrows implied by others aren't drawn: if C uses A and B, and B already
   uses A (directly or not), the arrow A → C is left out. The card still lists
   everything an item uses.

   Search: as you type, the items that match (name, title, label or
   statement; every word) stay lit; Enter steps through them.
   List view: the same information as text, by chapter (it's in the page as
   HTML, from concept-map.lua): for screen readers, keyboards, and anyone
   who'd rather read than look. Full screen: the button, or Esc to leave.

   Hover a node: it and its direct neighbours stay lit; the card shows it.
   Click a node: everything it depends on (all the way down) and what uses it
   directly stay lit, and the card stays. Click empty space or press Esc to
   clear. Drag nodes; drag empty space to pan; scroll or pinch to zoom.
   concepts.html#prp-x opens the map focused on that item. */
(function () {
  "use strict";

  // ---------- tuning ----------
  const COLUMN = 360;              // distance between columns of chapters
  const ROW = 32;                  // height each item adds to its chapter, for stacking chapters
  const CHAPTER_GAP = 100;         // space between chapters stacked in a column
  const CHARGE = -260;             // repulsion between nodes
  const CHARGE_RANGE = 400;        // ... only between nodes closer than this
  const LINK_DISTANCE = 70;
  // The layouts differ in where the chapters sit (step 1), how hard items are
  // pulled toward their chapter's spot (sideways, up/down), and what an arrow
  // between two chapters does: "vertical" only pulls its ends to similar
  // heights (sideways is the columns' job); "both" is an ordinary spring,
  // crossK times as strong as one inside a chapter. The first is the default.
  const LAYOUTS = {
    clusters: { name: "Clusters",     pullX: 0.1,   pullY: 0.1,   cross: "both", crossK: 0.1 },
    depth:    { name: "Dependencies", pullX: 0.1,   pullY: 0.04,  cross: "vertical", crossK: 0.5 },
    book:     { name: "Book order",   pullX: 0.12,  pullY: 0.12,  cross: "both", crossK: 0.08 },
    free:     { name: "Free",         pullX: 0.006, pullY: 0.006, cross: "both", crossK: 1 },
  };
  // Clusters: a chapter takes up room r0 + r1·√(items), plus gap between
  // chapters; how hard chapters keep their distance, how hard arrows pull
  // them together, the pull toward the middle; how much the starting
  // (Dependencies) layout is squeezed sideways; and how long it runs.
  const CL = { r0: 30, r1: 32, gap: 40, repel: 1, attract: 0.08, gravity: 0.004, squeeze: 0.6, steps: 1500 };
  const BOOK_CELL = 330, BOOK_ROW = 6;   // book order: width of a chapter; most chapters in a row
  const ALPHA_MIN = 0.001, ALPHA_DECAY = 1 - Math.pow(0.001, 1 / 600), VELOCITY_KEEP = 0.85;
  const ZOOM_MIN = 0.15, ZOOM_MAX = 6;
  const TEXT_ZOOM_MAX = 1.5;       // zoomed in past this, labels and shapes stop growing
  const FAR = 0.7;                 // zoomed out past this, only lit nodes have labels

  const SVGNS = "http://www.w3.org/2000/svg";
  const KIND_PLURAL = { def: "Definitions", thm: "Theorems", prp: "Propositions", lem: "Lemmas",
                        cor: "Corollaries", cnj: "Conjectures", exm: "Examples" };
  const KIND_ORDER = ["def", "thm", "prp", "lem", "cor", "cnj", "exm"];
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- shapes (centred at 0,0; r is the node's size) ----------
  const circle = r => `M${r},0A${r},${r} 0 1,1 ${-r},0A${r},${r} 0 1,1 ${r},0Z`;
  function star(R, r) {
    let d = "";
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * i / 5 - Math.PI / 2, q = i % 2 ? r : R;
      d += (i ? "L" : "M") + (q * Math.cos(a)).toFixed(2) + "," + (q * Math.sin(a)).toFixed(2);
    }
    return d + "Z";
  }
  function shape(kind, r) {
    switch (kind) {
      case "thm": return star(r * 1.5, r * 0.65);
      case "prp": { const s = r * 0.9; return `M${-s},${-s}H${s}V${s}H${-s}Z`; }
      case "lem": return `M0,${-r * 1.25}L${r * 1.15},${r * 0.8}L${-r * 1.15},${r * 0.8}Z`;
      case "cor": return `M0,${-r * 1.3}L${r * 1.3},0L0,${r * 1.3}L${-r * 1.3},0Z`;
      default: return circle(r);   // definitions; examples (hollow); conjectures
    }
  }

  function svg(name, attrs, parent) {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function tag(name, cls, parent, text) {
    const e = document.createElement(name);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  // MathJax may still be loading when the map is drawn: run fn once it's ready.
  function withMathJax(fn, tries = 50) {
    const mj = window.MathJax;
    if (mj && mj.startup && mj.startup.promise && mj.typesetPromise) mj.startup.promise.then(() => fn(mj)).catch(() => {});
    else if (tries > 0) setTimeout(() => withMathJax(fn, tries - 1), 200);
  }

  function init() {
    const root = document.getElementById("concept-map");
    const dataEl = document.getElementById("concept-map-data");
    if (!root || !dataEl) return;
    const data = JSON.parse(dataEl.textContent);
    const list = x => (Array.isArray(x) ? x : []);
    const chapters = list(data.chapters), nodes = list(data.nodes);
    // The reader's last choices, if the browser kept them; otherwise the
    // course's defaults (the shortcode's layout="…" and outline="…").
    const store = {
      get(k) { try { return localStorage.getItem("concept-map-" + k); } catch (e) { return null; } },
      set(k, v) { try { localStorage.setItem("concept-map-" + k, v); } catch (e) { /* not remembered */ } },
    };
    const options = data.options || {};
    const firstLayout = Object.keys(LAYOUTS)[0];
    let layoutKey = [store.get("layout"), options.layout].find(k => k && LAYOUTS[k]) || firstLayout;
    let layout = LAYOUTS[layoutKey];
    let outline = (store.get("outline") || options.outline || "true") !== "false";
    const byId = new Map(nodes.map(n => [n.id, n]));
    const seen = new Set();
    const edges = list(data.edges).filter(e => {
      const key = e.source + " " + e.target;
      if (!byId.has(e.source) || !byId.has(e.target) || seen.has(key)) return false;
      seen.add(key); return true;
    }).map(e => ({ source: byId.get(e.source), target: byId.get(e.target) }));

    // ---------- model ----------
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const n of nodes) { n.deps = []; n.users = []; }
    for (const e of edges) { e.target.deps.push(e.source); e.source.users.push(e.target); }

    // Step 1: where each chapter sits (see the top of this file).
    function placeChapters() {
      const C = chapters.length;
      const weight = chapters.map(() => new Array(C).fill(0));   // arrows between chapters
      const uses = chapters.map(() => new Set());
      for (const ch of chapters) ch.size = 0;
      for (const n of nodes) chapters[n.chapter - 1].size++;
      for (const e of edges) {
        const a = e.source.chapter - 1, b = e.target.chapter - 1;
        if (a === b) continue;
        weight[a][b]++; weight[b][a]++;
        uses[b].add(a);
      }
      if (layout === LAYOUTS.book) return placeBook(C);
      if (layout === LAYOUTS.clusters) return placeClusters(C, weight, uses);
      if (layout === LAYOUTS.free) { for (const ch of chapters) ch.x = ch.y = 0; return; }
      // column: one past the deepest earlier chapter it uses (a use of a later
      // chapter, a forward reference, doesn't move it)
      const column = new Array(C).fill(0);
      for (let b = 0; b < C; b++)
        for (const a of uses[b]) if (a < b) column[b] = Math.max(column[b], column[a] + 1);
      const columns = [];
      for (let c = 0; c < C; c++) (columns[column[c]] = columns[column[c]] || []).push(c);
      // height: the weighted average height of its neighbours, then spread
      // out so that chapters sharing a column don't overlap
      const y = new Array(C).fill(0), placed = new Array(C).fill(false);
      const half = c => chapters[c].size * ROW / 2;
      const pull = (c, ok) => {
        let s = 0, w = 0;
        for (let d = 0; d < C; d++) if (d !== c && weight[c][d] && ok(d)) { s += weight[c][d] * y[d]; w += weight[c][d]; }
        return w ? s / w : null;
      };
      const stack = cols => {
        const order = cols.slice().sort((a, b) => y[a] - y[b] || a - b);
        const want = order.map(c => y[c]);
        for (let i = 1; i < order.length; i++) {
          const p = order[i - 1], c = order[i];
          y[c] = Math.max(y[c], y[p] + half(p) + half(c) + CHAPTER_GAP);
        }
        const shift = order.reduce((s, c, i) => s + y[c] - want[i], 0) / order.length;
        for (const c of order) y[c] -= shift;
      };
      for (const cols of columns) {                 // left to right: near what they build on
        for (const c of cols) { const p = pull(c, d => placed[d]); y[c] = p == null ? 0 : p; }
        stack(cols);
        for (const c of cols) placed[c] = true;
      }
      for (let pass = 0; pass < 4; pass++)          // then near everything they're connected to
        for (const cols of columns) {
          for (const c of cols) { const p = pull(c, () => true); if (p != null) y[c] = p; }
          stack(cols);
        }
      chapters.forEach((ch, c) => { ch.x = column[c] * COLUMN; ch.y = y[c]; });
    }
    // Book order: chapters in reading order, like a table of contents. Each
    // part starts a new row (a part of one chapter joins the next), and a long
    // part is split into rows of equal length.
    function placeBook(C) {
      const groups = [];
      for (let c = 0; c < C; c++) {
        const last = groups[groups.length - 1];
        const samePart = last && chapters[last[last.length - 1]].part === chapters[c].part;
        const lonely = last && last.length === 1;
        if (last && (samePart || lonely)) last.push(c); else groups.push([c]);
      }
      const height = c => 90 + 20 * chapters[c].size;
      let y = 0;
      for (const g of groups) {
        const rows = Math.ceil(g.length / BOOK_ROW), per = Math.ceil(g.length / rows);
        for (let i = 0; i < g.length; i += per) {
          const row = g.slice(i, i + per), h = Math.max(...row.map(height));
          row.forEach((c, j) => { chapters[c].x = j * BOOK_CELL; chapters[c].y = y + h / 2; });
          y += h + 70;
        }
      }
    }
    // Clusters: the chapters are a small simulation of their own (see CL),
    // run to rest once, from the same start every time.
    function placeClusters(C, weight) {
      // start from the Dependencies layout, squeezed, so prerequisites tend to
      // stay on the left; then let the chapters settle
      layout = LAYOUTS.depth; placeChapters(); layout = LAYOUTS.clusters;
      const R = c => CL.r0 + CL.r1 * Math.sqrt(chapters[c].size);
      let maxW = 1;
      for (let i = 0; i < C; i++) for (let j = 0; j < C; j++) maxW = Math.max(maxW, weight[i][j]);
      const P = chapters.map(ch => ({ x: ch.x * CL.squeeze, y: ch.y, vx: 0, vy: 0 }));
      for (let it = 0; it < CL.steps; it++) {
        const a = 1 - it / CL.steps;
        for (let i = 0; i < C; i++) for (let j = i + 1; j < C; j++) {
          const p = P[i], q = P[j];
          let dx = q.x - p.x, dy = q.y - p.y;
          const d = Math.hypot(dx, dy) || 1e-3, min = R(i) + R(j) + CL.gap;
          let f = 0;
          if (d < 2 * min) f -= CL.repel * (2 * min - d) / min;                    // keep some room
          if (weight[i][j]) f += CL.attract * (weight[i][j] / maxW) * (d - min);   // arrows pull
          if (d < min) f -= 0.5 * (min - d);                                       // no overlaps
          dx /= d; dy /= d;
          p.vx += dx * f * a; p.vy += dy * f * a; q.vx -= dx * f * a; q.vy -= dy * f * a;
        }
        let cx = 0, cy = 0;
        for (const p of P) { cx += p.x / C; cy += p.y / C; }
        for (const p of P) {
          p.vx -= (p.x - cx) * CL.gravity * a; p.vy -= (p.y - cy) * CL.gravity * a;   // toward the middle
          p.x += (p.vx *= 0.6); p.y += (p.vy *= 0.6);
        }
      }
      P.forEach((p, c) => { chapters[c].x = p.x; chapters[c].y = p.y; });
    }
    placeChapters();

    // Items start scattered around their chapter's spot, from the same
    // "random" start every time.
    function scatter() {
      seed = 7;
      for (const n of nodes) {
        const ch = chapters[n.chapter - 1];
        n.tx = ch.x; n.ty = ch.y;
        n.x = n.tx + (rand() - 0.5) * 120;
        n.y = n.ty + (rand() - 0.5) * Math.max(120, ch.size * ROW);
        n.vx = n.vy = 0;
      }
    }
    for (const n of nodes) {
      n.r = n.kind === "exm" ? 5 : Math.min(15, 6 + 1.8 * Math.sqrt(n.users.length));
      n.fx = n.fy = null;
      n.w = n.r + 5 + 6.8 * n.label.length;   // node plus its label (measured once drawn)
    }
    scatter();

    // Which nodes and arrows are shown: examples can be hidden, and an arrow
    // is left out when a path through other shown nodes already implies it.
    let showExamples = true;
    let active = nodes.slice();
    let activeEdges = edges.slice();
    function applyFilter() {
      active = nodes.filter(n => showExamples || n.kind !== "exm");
      const on = new Set(active);
      const memo = new Map();
      const above = n => {                           // shown ancestors, through shown nodes
        if (memo.has(n)) return memo.get(n);
        const s = new Set(); memo.set(n, s);
        for (const d of n.deps) if (on.has(d)) { s.add(d); for (const x of above(d)) s.add(x); }
        return s;
      };
      activeEdges = edges.filter(e => on.has(e.source) && on.has(e.target) &&
        !e.target.deps.some(d => d !== e.source && on.has(d) && above(d).has(e.source)));
      for (const n of nodes) n.deg = 0;
      for (const e of activeEdges) { e.source.deg++; e.target.deg++; }
      const drawn = new Set(activeEdges);
      for (const n of nodes) n.g.style.display = n.el.style.display = on.has(n) ? "" : "none";
      for (const e of edges) e.line.style.display = drawn.has(e) ? "" : "none";
    }

    // ---------- step 2: the simulation (in the manner of d3-force) ----------
    const sim = { alpha: 1, target: 0, frame: null };
    function tick() {
      const a = sim.alpha, N = active.length;
      for (let i = 0; i < N; i++) {
        const p = active[i];
        for (let j = i + 1; j < N; j++) {
          const q = active[j];
          let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
          if (d2 > CHARGE_RANGE * CHARGE_RANGE && layout !== LAYOUTS.free) continue;   // (Free: no limit)
          if (d2 < 1e-6) { dx = (rand() - 0.5) * 1e-2; dy = (rand() - 0.5) * 1e-2; d2 = dx * dx + dy * dy; }
          const f = CHARGE * a / d2;                     // repulsion
          p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f;
          const d = Math.sqrt(d2), min = p.r + q.r + 10;  // no overlapping shapes
          if (d < min) {
            const k = (min - d) / d * 0.35;
            p.vx -= dx * k; p.vy -= dy * k; q.vx += dx * k; q.vy += dy * k;
          }
          // no overlapping labels: a label runs to the right of its node, so
          // two nodes at about the same height whose labels would overlap are
          // pushed apart vertically
          const gap = 18 - Math.abs(dy);
          if (gap > 0 && q.x - q.r < p.x + p.w && p.x - p.r < q.x + q.w) {
            const k = gap * 0.12 * (dy >= 0 ? 1 : -1);
            p.vy -= k; q.vy += k;
          }
        }
      }
      // springs along arrows. An arrow between chapters only pulls its ends
      // to similar heights: sideways is the columns' job.
      for (const e of activeEdges) {
        const s = e.source, t = e.target;
        const cross = s.chapter !== t.chapter && layout.cross === "vertical";
        const dx = t.x + t.vx - s.x - s.vx, dy = t.y + t.vy - s.y - s.vy;
        const l = cross ? Math.abs(dy) || 1e-6 : Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const strength = s.chapter !== t.chapter ? layout.crossK : 1;
        const k = (cross ? strength * Math.max(0, l - LINK_DISTANCE / 2) : strength * (l - LINK_DISTANCE)) / l
                  * a / Math.min(s.deg, t.deg), bias = s.deg / (s.deg + t.deg);
        if (!cross) { t.vx -= dx * k * bias; s.vx += dx * k * (1 - bias); }
        t.vy -= dy * k * bias; s.vy += dy * k * (1 - bias);
      }
      for (const n of active) {
        n.vx += (n.tx - n.x) * layout.pullX * a;          // toward its chapter's spot
        n.vy += (n.ty - n.y) * layout.pullY * a;
        if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; continue; }
        n.x += (n.vx *= VELOCITY_KEEP);
        n.y += (n.vy *= VELOCITY_KEEP);
      }
      sim.alpha += (sim.target - sim.alpha) * ALPHA_DECAY;
    }
    function run() {
      if (sim.frame) return;
      const step = () => {
        tick(); draw();
        if (sim.alpha > ALPHA_MIN || sim.target > 0) sim.frame = requestAnimationFrame(step);
        else sim.frame = null;
      };
      sim.frame = requestAnimationFrame(step);
    }
    function reheat(target) { sim.target = target; if (sim.alpha < 0.3) sim.alpha = 0.3; run(); }

    // ---------- DOM ----------
    root.textContent = "";
    const listEl = document.getElementById("concept-map-list");   // the List view, if the page has it
    const bar = tag("div", "cm-toolbar", root);
    const controls = tag("div", "cm-controls", bar);
    const views = tag("div", "cm-views", controls);
    views.setAttribute("role", "group"); views.setAttribute("aria-label", "View");
    const mapBtn = tag("button", "cm-button", views, "Map");
    const listBtn = tag("button", "cm-button", views, "List");
    if (!listEl) views.hidden = true;
    const searchBox = tag("input", "cm-search", controls);
    searchBox.type = "search"; searchBox.placeholder = "Search";
    searchBox.setAttribute("aria-label", "Search the definitions, theorems and examples");
    const countEl = tag("span", "cm-count", controls);
    countEl.setAttribute("aria-live", "polite");
    const legend = tag("div", "cm-legend", root);
    for (const kind of KIND_ORDER) {
      if (!nodes.some(n => n.kind === kind)) continue;
      const item = tag("span", "cm-legend-item", legend);
      const icon = svg("svg", { width: 18, height: 18, viewBox: "-9 -9 18 18", "aria-hidden": "true" }, item);
      svg("path", { d: shape(kind, 5.5), class: `cm-shape cm-${kind}` }, icon);
      item.appendChild(document.createTextNode(KIND_PLURAL[kind]));
    }
    const buttons = tag("div", "cm-buttons", bar);
    const exToggle = tag("label", "cm-toggle", buttons);
    const exBox = tag("input", null, exToggle);
    exBox.type = "checkbox"; exBox.checked = true;
    exToggle.appendChild(document.createTextNode(" Examples"));
    const zoomOut = tag("button", "cm-button cm-map-only", buttons, "−"); zoomOut.setAttribute("aria-label", "Zoom out");
    const zoomIn = tag("button", "cm-button cm-map-only", buttons, "+"); zoomIn.setAttribute("aria-label", "Zoom in");
    const fitBtn = tag("button", "cm-button cm-map-only", buttons, "Fit");
    const fullBtn = tag("button", "cm-button cm-full", buttons);
    const layoutPick = tag("select", "cm-button cm-select cm-map-only", buttons);
    layoutPick.setAttribute("aria-label", "Layout");
    for (const key in LAYOUTS) {
      const o = tag("option", null, layoutPick, LAYOUTS[key].name); o.value = key;
      if (key === layoutKey) o.selected = true;
    }
    const olToggle = tag("label", "cm-toggle cm-map-only", buttons);
    const olBox = tag("input", null, olToggle);
    olBox.type = "checkbox"; olBox.checked = outline;
    olToggle.appendChild(document.createTextNode(" Show chapters"));
    buttons.prepend(layoutPick, olToggle);

    // The stage holds three layers: the drawing (SVG: arrows and shapes), the
    // labels on top of it (HTML, so they can hold typeset math), and the card.
    const stage = tag("div", "cm-stage", root);
    const canvas = svg("svg", { class: "cm-svg", role: "group",
      "aria-label": "Concept map: definitions, theorems and examples, with arrows from each item to the items that use it."
        + (listEl ? " The List view has the same information as text." : "") }, stage);
    const defs = svg("defs", {}, canvas);
    for (const [id, cls] of [["cm-arrow", "cm-arrowhead"], ["cm-arrow-lit", "cm-arrowhead is-lit"]]) {
      const m = svg("marker", { id, viewBox: "0 -4 9 8", refX: 9, refY: 0, markerWidth: 7, markerHeight: 7,
                                 orient: "auto", markerUnits: "userSpaceOnUse" }, defs);
      svg("path", { d: "M0,-4L9,0L0,4Z", class: cls }, m);
    }
    const markers = [...defs.querySelectorAll("marker")];
    const view = svg("g", { class: "cm-view" }, canvas);
    const hullLayer = svg("g", { class: "cm-hulls" }, view);
    const edgeLayer = svg("g", { class: "cm-edges" }, view);
    const nodeLayer = svg("g", { class: "cm-nodes" }, view);
    const labelLayer = tag("div", "cm-labels", stage);
    labelLayer.setAttribute("aria-hidden", "true");          // the nodes carry the names
    const card = tag("aside", "cm-card", stage);
    card.hidden = true;
    card.setAttribute("aria-live", "polite");

    for (const ch of chapters) {
      ch.el = tag("div", "cm-chapter", labelLayer);
      ch.el.innerHTML = (ch.number ? ch.number + " " : "") + (ch.titleHtml || ch.title);
    }
    const parts = [...new Set(chapters.map(ch => ch.part))];
    for (const ch of chapters) {
      ch.hull = svg("path", { class: "cm-hull" }, hullLayer);
      ch.hull.style.setProperty("--cm-hull", `var(--cm-part-${parts.indexOf(ch.part) % 4})`);
    }
    for (const e of edges) e.line = svg("line", { class: "cm-edge", "marker-end": "url(#cm-arrow)" }, edgeLayer);
    for (const n of nodes) {
      n.g = svg("g", { class: `cm-node cm-${n.kind}`, tabindex: 0, role: "button",
                       "aria-label": n.name + (n.title ? ": " + n.title : "") }, nodeLayer);
      n.g.dataset.id = n.id;
      svg("path", { d: shape(n.kind, n.r), class: `cm-shape cm-${n.kind}` }, n.g);
      n.el = tag("div", "cm-label", labelLayer);
      n.el.innerHTML = n.labelHtml || n.label;
      n.el.dataset.id = n.id;
    }
    if (listEl) {
      root.appendChild(listEl);
      for (const li of listEl.querySelectorAll(".cm-list-item")) {
        const n = byId.get(li.dataset.id);
        if (!n) continue;
        n.li = li;
        const show = tag("button", "cm-list-show", li.querySelector(".cm-list-name"), "Show on the map");
        show.addEventListener("click", () => { setView("map"); setFocus(n, true); });
        for (const c of li.querySelectorAll("span.citation[data-cites]")) {
          const target = byId.get(c.dataset.cites);
          if (target) { const a = tag("a", null, null, target.name); a.href = "#cm-item-" + target.id; c.replaceWith(a); }
          else c.textContent = c.textContent.replace(/@/g, "");
        }
      }
    }
    const measure = ns => { for (const n of ns) if (n.el.offsetWidth) n.w = n.r + 5 + n.el.offsetWidth; };
    measure(nodes);
    const hasMath = el => el.querySelector(".math") !== null;
    const mathEls = [...chapters.map(ch => ch.el), ...nodes.map(n => n.el)].filter(hasMath);
    if (mathEls.length) withMathJax(mj => mj.typesetPromise(mathEls).then(() => {
      // MathJax makes each formula a tab stop; the nodes already are
      for (const el of mathEls) for (const m of el.querySelectorAll("mjx-container")) m.setAttribute("tabindex", "-1");
      measure(nodes.filter(n => mathEls.includes(n.el)));
      draw();
    }));

    // ---------- view transform ----------
    // t maps the map's coordinates to the screen. Zooming in spreads things
    // out; past TEXT_ZOOM_MAX, shapes, labels and arrows stop growing (they
    // are drawn at a scale s < 1), so crowded spots open up.
    const t = { x: 0, y: 0, k: 1 };
    const sizes = () => { const z = Math.min(t.k, TEXT_ZOOM_MAX); return { z, s: z / t.k }; };
    function applyTransform() {
      const { s } = sizes();
      view.setAttribute("transform", `translate(${t.x},${t.y}) scale(${t.k})`);
      stage.classList.toggle("is-far", t.k < FAR);
      canvas.style.setProperty("--cm-s", s);
      for (const m of markers) { m.setAttribute("markerWidth", 7 * s); m.setAttribute("markerHeight", 7 * s); }
      draw();
    }
    const toWorld = (cx, cy) => {
      const b = canvas.getBoundingClientRect();
      return { x: (cx - b.left - t.x) / t.k, y: (cy - b.top - t.y) / t.k };
    };
    function zoomAt(factor, cx, cy) {
      const b = canvas.getBoundingClientRect();
      const px = cx - b.left, py = cy - b.top;
      const k = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, t.k * factor));
      t.x = px - (px - t.x) * k / t.k; t.y = py - (py - t.y) * k / t.k; t.k = k;
      applyTransform();
    }
    function fit() {
      const shown = active.length ? active : nodes;
      if (!shown.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of shown) {
        x0 = Math.min(x0, n.x - 20); x1 = Math.max(x1, n.x + Math.min(n.w, 220));
        y0 = Math.min(y0, n.y - 50); y1 = Math.max(y1, n.y + 20);
      }
      const w = canvas.clientWidth || 800, h = canvas.clientHeight || 600;
      t.k = Math.max(ZOOM_MIN, Math.min(1.6, 0.92 * Math.min(w / (x1 - x0), h / (y1 - y0))));
      t.x = (w - (x0 + x1) * t.k) / 2; t.y = (h - (y0 + y1) * t.k) / 2;
      applyTransform();
    }
    function centerOn(n) {
      const w = canvas.clientWidth || 800, h = canvas.clientHeight || 600;
      t.x = w / 2 - n.x * t.k; t.y = h / 2 - n.y * t.k;
      applyTransform();
    }

    // ---------- drawing ----------
    // the convex hull of some points, as a path (drawn with a thick, rounded
    // outline, so it becomes a rounded blob around them)
    function hullPath(pts) {
      if (!pts.length) return "";
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const half = list => { const h = []; for (const p of list) { while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
      const hull = pts.length < 3 ? pts : [...half(pts), ...half(pts.slice().reverse())];
      return "M" + hull.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L") + "Z";
    }
    const px = v => v.toFixed(1) + "px";
    function draw() {
      const { z, s } = sizes();
      for (const e of activeEdges) {
        const p = e.source, q = e.target;
        const dx = q.x - p.x, dy = q.y - p.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
        const a = (p.r + 2) * s / l, b = (q.r * 1.3 + 3) * s / l;
        e.line.setAttribute("x1", p.x + dx * a); e.line.setAttribute("y1", p.y + dy * a);
        e.line.setAttribute("x2", q.x - dx * b); e.line.setAttribute("y2", q.y - dy * b);
      }
      const top = chapters.map(() => Infinity), sumX = chapters.map(() => 0), count = chapters.map(() => 0);
      for (const n of active) {
        n.g.setAttribute("transform", `translate(${n.x.toFixed(1)},${n.y.toFixed(1)}) scale(${s.toFixed(3)})`);
        const sx = t.x + n.x * t.k + (n.r + 5) * z, sy = t.y + n.y * t.k;
        n.el.style.transform = `translate(${px(sx)},${px(sy)}) translateY(-50%) scale(${z.toFixed(3)})`;
        const c = n.chapter - 1;
        top[c] = Math.min(top[c], n.y); sumX[c] += n.x; count[c]++;
      }
      hullLayer.style.display = outline ? "" : "none";
      if (outline) chapters.forEach((ch, c) => {
        const pts = [];
        for (const n of active) if (n.chapter === c + 1) { pts.push([n.x, n.y], [n.x + Math.min(n.w, 140) * s, n.y]); }
        ch.hull.setAttribute("d", hullPath(pts));
      });
      const zc = Math.max(0.6, z);                     // chapter titles stay readable zoomed out
      chapters.forEach((ch, c) => {
        const x = count[c] ? sumX[c] / count[c] : ch.x, y = count[c] ? top[c] : ch.y;
        ch.el.style.transform =
          `translate(${px(t.x + x * t.k)},${px(t.y + y * t.k - 28 * z)}) translate(-50%,-100%) scale(${zc.toFixed(3)})`;
      });
    }

    // ---------- highlighting and the card ----------
    let hover = null, focus = null;
    function ancestors(n) {
      const seen = new Set(), stack = [n];
      while (stack.length) for (const d of stack.pop().deps) if (!seen.has(d)) { seen.add(d); stack.push(d); }
      return seen;
    }
    // Lit: on hover, the node and its direct neighbours; on focus, the node,
    // everything below it, and what uses it directly. An arrow is lit when
    // both its ends are.
    function highlight() {
      let lit = null;
      if (focus) {
        const up = ancestors(focus); up.add(focus);
        lit = new Set([...up, ...focus.users]);
      } else if (hover) {
        lit = new Set([hover, ...hover.deps, ...hover.users]);
      } else if (matches) {
        lit = matches;
      }
      stage.classList.toggle("has-highlight", !!lit);
      for (const n of nodes) {
        for (const el of [n.g, n.el]) {
          el.classList.toggle("is-lit", !!lit && lit.has(n));
          el.classList.toggle("is-focus", n === focus);
          el.classList.toggle("is-hover", n === hover || n === current);
        }
      }
      for (const e of edges) {
        const on = !!lit && lit.has(e.source) && lit.has(e.target);
        e.line.classList.toggle("is-lit", on);
        e.line.setAttribute("marker-end", on ? "url(#cm-arrow-lit)" : "url(#cm-arrow)");
      }
      showCard(hover || focus || current);
    }
    function chip(n, parent) {
      const b = tag("button", "cm-chip cm-chip-" + n.kind, parent, n.name);
      b.title = n.label;
      b.addEventListener("click", ev => { ev.stopPropagation(); setFocus(n, true); });
      return b;
    }
    let shownInCard = null;
    function showCard(n) {
      if (n === shownInCard) return;
      shownInCard = n;
      if (!n) { card.hidden = true; return; }
      card.hidden = false;
      card.textContent = "";
      tag("p", "cm-card-name cm-text-" + n.kind, card, n.name);
      if (n.titleHtml) tag("p", "cm-card-title", card).innerHTML = n.titleHtml;
      const st = tag("div", "cm-card-statement", card);
      st.innerHTML = n.statementHtml;
      for (const c of st.querySelectorAll("span.citation[data-cites]")) {
        const target = byId.get(c.dataset.cites);
        if (target) c.replaceWith(chip(target));
        else c.textContent = c.textContent.replace(/@/g, "");
      }
      for (const [label, items] of [["Uses", n.deps], ["Used by", n.users]]) {
        if (!items.length) continue;
        const row = tag("p", "cm-card-rel", card);
        tag("span", "cm-card-rel-label", row, label);
        for (const m of items) chip(m, row);
      }
      const open = tag("a", "cm-card-open", card, "Open in the notes ↗");
      open.href = n.url; open.target = "_blank"; open.rel = "noopener";
      withMathJax(mj => {
        if (shownInCard !== n) return;
        if (mj.typesetClear) mj.typesetClear([card]);
        return mj.typesetPromise([card]);
      });
    }
    // ---------- search ----------
    for (const n of nodes) {
      const d = document.createElement("div");
      d.innerHTML = n.statementHtml;
      n.text = [n.name, n.label, n.title, d.textContent].join(" ").toLowerCase();
    }
    let matches = null, current = null;
    function search() {
      const words = searchBox.value.toLowerCase().split(/\s+/).filter(Boolean);
      matches = words.length ? new Set(active.filter(n => words.every(w => n.text.includes(w)))) : null;
      current = null;
      countEl.textContent = !matches ? "" : matches.size === 1 ? "1 match" : (matches.size || "No") + " matches";
      highlight(); filterList();
    }
    function clearSearch() { searchBox.value = ""; search(); }
    function stepMatch(back) {                     // Enter / Shift+Enter: the next match, in book order
      const found = active.filter(n => matches.has(n));
      const i = found.indexOf(current);
      current = found[(i + (back ? -1 : 1) + found.length) % found.length];
      if (viewMode === "list") { current.li.scrollIntoView({ block: "center" }); }
      else { centerOn(current); highlight(); }
    }
    function filterList() {
      if (!listEl) return;
      for (const n of nodes) if (n.li) n.li.hidden = (!showExamples && n.kind === "exm") || (!!matches && !matches.has(n));
      for (const sec of listEl.querySelectorAll(".cm-list-chapter")) sec.hidden = !sec.querySelector(".cm-list-item:not([hidden])");
    }

    // ---------- views ----------
    let viewMode = "map";
    function setView(v) {
      viewMode = listEl ? v : "map";
      root.classList.toggle("is-list", viewMode === "list");
      stage.hidden = viewMode === "list";
      legend.hidden = false;
      if (listEl) listEl.hidden = viewMode !== "list";
      mapBtn.setAttribute("aria-pressed", viewMode === "map");
      listBtn.setAttribute("aria-pressed", viewMode === "list");
      store.set("view", viewMode);
    }

    // ---------- full screen (or, where a browser can't, the whole window) ----------
    const ICON = {
      enter: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5"/></svg>',
      leave: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 1v5H1M15 6h-5V1M10 15v-5h5M1 10h5v5"/></svg>',
    };
    const isFull = () => document.fullscreenElement === root || root.classList.contains("is-expanded");
    function expand(on) {
      root.classList.toggle("is-expanded", on);
      document.documentElement.classList.toggle("cm-locked", on);
      fullChanged();
    }
    function setFull(on) {
      if (on && root.requestFullscreen) root.requestFullscreen().catch(() => expand(true));
      else if (on) expand(true);
      else if (document.fullscreenElement === root) document.exitFullscreen();
      else expand(false);
    }
    function fullChanged() {
      const on = isFull();
      root.classList.toggle("is-full", on);
      fullBtn.innerHTML = on ? ICON.leave : ICON.enter;
      fullBtn.setAttribute("aria-label", on ? "Leave full screen" : "Full screen");
      fullBtn.setAttribute("aria-pressed", on);
    }
    fullChanged();
    // When the drawing changes size (full screen, a window resize), keep what
    // was in the middle in the middle.
    let size = null;
    if (window.ResizeObserver) new ResizeObserver(() => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;                        // hidden: the List view
      if (size) { t.x += (w - size.w) / 2; t.y += (h - size.h) / 2; applyTransform(); }
      size = { w, h };
    }).observe(stage);

    function setFocus(n, center) {
      focus = n;
      history.replaceState(null, "", n ? "#" + n.id : location.pathname + location.search);
      if (n && center) centerOn(n);
      highlight();
    }

    // ---------- pointer and keyboard ----------
    // Shapes and labels both stand for their node.
    const nodeAt = el => {
      const h = el && el.closest ? el.closest(".cm-node, .cm-label") : null;
      return h ? byId.get(h.dataset.id) : null;
    };
    const inCard = el => !!(el && el.closest && el.closest(".cm-card"));
    const pointers = new Map();
    let gesture = null;   // { kind: "node" | "pan" | "pinch", … }
    stage.addEventListener("pointerdown", ev => {
      if (inCard(ev.target) || ev.button !== 0) return;
      stage.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        gesture = { kind: "pinch", d: Math.hypot(p.x - q.x, p.y - q.y) };
        return;
      }
      const n = nodeAt(ev.target);
      gesture = { kind: n ? "node" : "pan", node: n, x: ev.clientX, y: ev.clientY, moved: false };
    });
    stage.addEventListener("pointermove", ev => {
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (!gesture) return;
      if (gesture.kind === "pinch" && pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        zoomAt(d / gesture.d, (p.x + q.x) / 2, (p.y + q.y) / 2);
        gesture.d = d;
        return;
      }
      const dx = ev.clientX - gesture.x, dy = ev.clientY - gesture.y;
      if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
      gesture.moved = true;
      if (gesture.kind === "node") {
        const w = toWorld(ev.clientX, ev.clientY);
        gesture.node.fx = w.x; gesture.node.fy = w.y;
        if (reduceMotion) { gesture.node.x = w.x; gesture.node.y = w.y; draw(); }
        else reheat(0.3);
      } else if (gesture.kind === "pan") {
        t.x += dx; t.y += dy; gesture.x = ev.clientX; gesture.y = ev.clientY;
        applyTransform();
      }
    });
    function endGesture(ev) {
      if (!pointers.delete(ev.pointerId) || !gesture) return;
      if (gesture.kind === "pinch") { gesture = null; return; }   // lifting either finger ends a pinch
      if (gesture.kind === "node") {
        if (!gesture.moved) setFocus(gesture.node === focus ? null : gesture.node, false);
        gesture.node.fx = gesture.node.fy = null;
        sim.target = 0;
      } else if (gesture.kind === "pan" && !gesture.moved) {
        setFocus(null);
      }
      gesture = null;
    }
    stage.addEventListener("pointerup", endGesture);
    stage.addEventListener("pointercancel", endGesture);
    stage.addEventListener("wheel", ev => {
      if (inCard(ev.target)) return;                         // the card scrolls
      ev.preventDefault();
      zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX, ev.clientY);
    }, { passive: false });
    stage.addEventListener("pointerover", ev => {
      if (gesture && gesture.moved) return;
      const n = nodeAt(ev.target);
      if (n && n !== hover) { hover = n; highlight(); }
    });
    stage.addEventListener("pointerout", ev => {
      const n = nodeAt(ev.target);
      if (!n || n !== hover || nodeAt(ev.relatedTarget) === n) return;   // e.g. shape → its label
      hover = null; highlight();
    });
    nodeLayer.addEventListener("keydown", ev => {
      const n = nodeAt(ev.target);
      if (n && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); setFocus(n, true); }
    });
    nodeLayer.addEventListener("focusin", ev => {
      const n = nodeAt(ev.target);
      if (n) { hover = n; highlight(); }
    });
    nodeLayer.addEventListener("focusout", () => { hover = null; highlight(); });
    // Esc: first the focus, then the search, then full screen (a browser's
    // own full screen ends on Esc by itself).
    document.addEventListener("keydown", ev => {
      if (ev.key !== "Escape") return;
      if (focus) setFocus(null);
      else if (searchBox.value) clearSearch();
      else if (root.classList.contains("is-expanded")) setFull(false);
    });
    searchBox.addEventListener("input", search);
    searchBox.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && matches && matches.size) { ev.preventDefault(); stepMatch(ev.shiftKey); }
      else if (ev.key === "Escape" && searchBox.value) { ev.preventDefault(); ev.stopPropagation(); clearSearch(); }
    });
    mapBtn.addEventListener("click", () => setView("map"));
    listBtn.addEventListener("click", () => setView("list"));
    fullBtn.addEventListener("click", () => setFull(!isFull()));
    document.addEventListener("fullscreenchange", fullChanged);
    window.addEventListener("hashchange", () => {           // e.g. a link to #prp-x on this page
      const n = byId.get(decodeURIComponent(location.hash.slice(1)));
      if (n && n !== focus) setFocus(n, true);
    });
    const zoomCenter = f => { const b = canvas.getBoundingClientRect(); zoomAt(f, b.left + b.width / 2, b.top + b.height / 2); };
    zoomIn.addEventListener("click", () => zoomCenter(1.3));
    zoomOut.addEventListener("click", () => zoomCenter(1 / 1.3));
    fitBtn.addEventListener("click", fit);
    // A new layout settles out of sight, then everything glides there.
    layoutPick.addEventListener("change", () => {
      layoutKey = layoutPick.value; layout = LAYOUTS[layoutKey];
      store.set("layout", layoutKey);
      if (sim.frame) { cancelAnimationFrame(sim.frame); sim.frame = null; }
      const from = active.map(n => [n.x, n.y]), t0 = { ...t };
      placeChapters(); scatter();
      sim.alpha = 1; sim.target = 0;
      for (let i = 0; i < 300; i++) tick();
      const to = active.map(n => [n.x, n.y]);
      fit();
      if (reduceMotion) return;
      const t1 = { ...t }, start = performance.now(), GLIDE = 700;
      const step = now => {
        const u = Math.min(1, (now - start) / GLIDE), e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
        active.forEach((n, i) => { n.x = from[i][0] + (to[i][0] - from[i][0]) * e; n.y = from[i][1] + (to[i][1] - from[i][1]) * e; });
        t.x = t0.x + (t1.x - t0.x) * e; t.y = t0.y + (t1.y - t0.y) * e; t.k = t0.k * Math.pow(t1.k / t0.k, e);
        applyTransform();
        if (u < 1) sim.frame = requestAnimationFrame(step); else { sim.frame = null; run(); }
      };
      sim.frame = requestAnimationFrame(step);
    });
    olBox.addEventListener("change", () => { outline = olBox.checked; store.set("outline", String(outline)); draw(); });
    exBox.addEventListener("change", () => {
      showExamples = exBox.checked;
      if (focus && !showExamples && focus.kind === "exm") setFocus(null);
      applyFilter(); search(); reheat(0); fit();
    });

    // ---------- start ----------
    applyFilter();
    const warm = reduceMotion ? 400 : 300;     // settle most of the layout before showing it
    for (let i = 0; i < warm; i++) tick();
    fit();
    const fromHash = byId.get(decodeURIComponent(location.hash.slice(1)));
    if (fromHash) setFocus(fromHash, true); else highlight();
    setView(fromHash ? "map" : store.get("view") || "map");
    if (!reduceMotion) run();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
