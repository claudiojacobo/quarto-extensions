/* curriculum.js: the course map, from the data curriculum.lua puts in the
   page (#curriculum-data: what curriculum-map's `visualize.py --export`
   writes), drawn by graph-view.js (which must load first). No libraries.

   Courses are circles, coloured by area: a course in several areas is cut
   into equal wedges, one per area; a fainter tint is earlier in the area's
   sequence; a topics course (its title and topic change by year) has a
   dashed ring. A required prerequisite is an arrow. A "one of" group is a
   small diamond (a gate): its alternatives run into it without arrowheads,
   and one arrow leaves it for each course that lists the group. So every
   arrowhead at a course is something a student needs; the diamond is the
   only place where "or" happens. The export decides which arrows are drawn
   (a prerequisite that another one already guarantees isn't); the card
   lists them all.

   Layouts:
   • Sequence: a column per step, from the export ("just in time": a course
     one column after its latest prerequisite, and as late as what needs it
     allows); in each column, the courses in bands by area.
   • By area: the areas are a small simulation of their own (as the concept
     map's chapters are in Clusters), arrows between two areas pulling them
     together; each course is drawn toward its area (several: between them).
   • Free: the ordinary force layout, started from Sequence.
   "Highlight areas" outlines the major's elective areas (the export's
   buckets); it's on by default in By area.

   Hover or click a course: it, everything it needs (all the way back, every
   alternative of a "one of" included) and the courses it leads to directly
   light up, and the card shows its name, areas, prerequisites (each a
   button to that course), what it leads to, and a link to its description
   in the catalog. Hover a diamond: its alternatives and the courses that
   use it.

   TODO, later (see "Later" in curriculum-map's README): statistics courses
   (once they're in the track, they come with the export); other
   departments' courses that require ours; concept-level links between
   courses, once the concept graphs are filled in; a course opening into its
   concepts; links to course pages on cjgg.me; the proposed sequence. */
(function () {
  "use strict";

  // ---------- tuning ----------
  const COLUMN = 190;              // Sequence: between columns
  const ROW = 33;                  // Sequence: between courses stacked in a column
  const BAND_GAP = 18;             // Sequence: between areas' bands
  const COURSE_R = 11, GATE_R = 6;
  const SHADE_MIX = [55, 72, 86, 100];   // a course's fill: this % of its area's colour, by shade (the rest: the background)
  // By area: an area takes up room r0 + r1·√(courses), plus gap; how hard
  // areas keep their distance, how hard arrows pull them together, the pull
  // toward the middle, how much the start (Sequence) is squeezed sideways,
  // and how long it runs. As the concept map's Clusters.
  const CL = { r0: 40, r1: 36, gap: 46, repel: 1, attract: 0.1, gravity: 0.006, squeeze: 0.7, steps: 1200 };
  const LAYOUTS = {
    // Sequence: the places are the layout's; the simulation only keeps things apart
    sequence: { name: "Sequence", pullX: 0.5, pullY: 0.5, charge: -60, chargeRange: 60, labelGap: 10, alphaMin: 0.02,
                spring: () => ({ k: 0, vertical: true }) },
    area:     { name: "By area", pullX: 0.08, pullY: 0.08, charge: -160, chargeRange: 200, linkDistance: 60 },
    free:     { name: "Free", pullX: 0.004, pullY: 0.004, chargeRange: Infinity, linkDistance: 75 },
  };

  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const COLOR_NAME = /^[a-z][a-z0-9-]*$/, HEX = /^#[0-9a-f]{3,8}$/i;

  function init() {
    const root = document.getElementById("curriculum");
    const dataEl = document.getElementById("curriculum-data");
    if (!root || !dataEl || !window.GraphView) return;
    const { svg, tag, storage } = window.GraphView;
    const { circle } = window.GraphView.shapes;
    const data = JSON.parse(dataEl.textContent);
    const list = x => (Array.isArray(x) ? x : []);
    const store = storage("curriculum-");
    const catalog = /^https?:\/\//.test(root.dataset.catalog || "") ? root.dataset.catalog : null;

    // ---------- areas: their colours as --cur-a0, --cur-a1, … ----------
    const areas = list(data.areas).map(a => ({
      id: String(a.id), name: String(a.name || a.id), bucket: !!a.bucket,
      icon: COLOR_NAME.test(a.icon || "") ? a.icon : null,
      css: COLOR_NAME.test(a.color || "") ? `var(--ctp-${a.color}${HEX.test(a.hex || "") ? ", " + a.hex : ""})`
        : HEX.test(a.hex || "") ? a.hex : "var(--cm-edge)",
      hull: null, label: null,
    }));
    const areaIndex = new Map(areas.map((a, i) => [a.id, i]));
    areas.forEach((a, i) => root.style.setProperty(`--cur-a${i}`, a.css));
    const areaVar = i => (i == null ? "var(--cm-edge)" : `var(--cur-a${i})`);

    // ---------- nodes: the courses (in the track's order: the keyboard's), then the gates ----------
    // Every node gets the same fields, in the same order, including those the
    // viewer adds: the simulation runs faster for it.
    const blank = { deps: null, users: null, r: 0, fx: null, fy: null, w: 0, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
                    deg: 0, g: null, el: null, li: null, text: "", pullX: null, pullY: null };
    const courses = list(data.courses).map((c, i) => Object.assign({
      id: String(c.id), kind: "course", index: i, code: c.code ? String(c.code) : null, name: String(c.name || c.id),
      label: String(c.code || c.name || c.id),
      areas: list(c.areas).filter(a => areaIndex.has(a)).map(a => areaIndex.get(a)),
      shade: Number.isInteger(c.shade) && c.shade >= 0 ? c.shade : 0, varies: !!c.varies,
      requires: list(c.requires).map(String), oneOf: list(c.oneOf).map(g => list(g).map(String)),
      level: c.level || null, members: null, text: "",
    }, blank));
    const gates = list(data.gates).filter(g => g.shown !== false).map((g, i) => Object.assign({
      id: String(g.id), kind: "gate", index: courses.length + i, code: null, name: String(g.text || "one of"),
      label: "", areas: [], shade: 0, varies: false, requires: [], oneOf: [],
      level: g.level || null, members: list(g.members).map(String), text: "",
    }, blank));
    const nodes = [...courses, ...gates];
    const byId = new Map(nodes.map(n => [n.id, n]));
    const edges = list(data.edges).filter(e => e.shown !== false)
      .map(e => ({ source: String(e.source), target: String(e.target), kind: String(e.kind || "required") }));
    const codeOf = id => (byId.get(id) ? byId.get(id).label : id);
    // what each course leads to: the courses that list it, required or as an alternative
    const leadsTo = new Map(courses.map(c => [c.id, []]));
    for (const c of courses) {
      const pre = new Set([...c.requires, ...c.oneOf.flat()]);
      for (const p of pre) if (leadsTo.has(p)) leadsTo.get(p).push(c);
    }
    if (!courses.some(c => c.level)) delete LAYOUTS.sequence;   // a cycle: no columns from the export

    // ---------- layouts ----------
    // Sequence: x from the column; y from the course's band (its first area),
    // the courses of a band in one column centred in it. A gate sits in its
    // column (between the courses'), at the height of what it joins.
    function placeSequence() {
      const band = n => (n.areas.length ? n.areas[0] : areas.length);
      const col = n => (n.level && Number.isFinite(n.level.late) ? n.level.late : 0);
      const cells = new Map();                         // "band col" → courses
      for (const n of courses) {
        const k = band(n) + " " + col(n);
        (cells.get(k) || cells.set(k, []).get(k)).push(n);
      }
      const height = new Array(areas.length + 1).fill(0);
      for (const [k, ns] of cells) { const b = +k.split(" ")[0]; height[b] = Math.max(height[b], ns.length); }
      const top = [];
      let y = 0;
      for (let b = 0; b <= areas.length; b++) { top[b] = y; if (height[b]) y += height[b] * ROW + BAND_GAP; }
      for (const [k, ns] of cells) {
        const b = +k.split(" ")[0];
        ns.forEach((n, i) => { n.tx = col(n) * COLUMN; n.ty = top[b] + (i + (height[b] - ns.length) / 2) * ROW; });
      }
      for (const g of gates) {
        const near = [...g.members.map(id => byId.get(id)), ...g.users].filter(n => n && n.kind === "course");
        g.tx = (g.level && Number.isFinite(g.level.late) ? g.level.late : 0) * COLUMN;
        g.ty = near.length ? near.reduce((s, n) => s + n.ty, 0) / near.length : 0;
      }
      for (const n of nodes) { n.x = n.tx; n.y = n.ty; n.vx = n.vy = 0; n.pullX = n.pullY = null; }
    }
    // By area: see the top of this file.
    function placeAreas(view) {
      placeSequence();
      const A = areas.length;
      const P = areas.map(() => ({ x: 0, y: 0, n: 0, vx: 0, vy: 0 }));
      for (const n of courses) for (const i of n.areas) { P[i].x += n.tx * CL.squeeze; P[i].y += n.ty; P[i].n++; }
      for (const p of P) if (p.n) { p.x /= p.n; p.y /= p.n; }
      const W = areas.map(() => new Array(A).fill(0));
      let maxW = 1;
      for (const c of courses) for (const id of [...c.requires, ...c.oneOf.flat()]) {
        const p = byId.get(id);
        if (!p) continue;
        for (const i of p.areas) for (const j of c.areas) if (i !== j) { W[i][j]++; W[j][i]++; maxW = Math.max(maxW, W[i][j]); }
      }
      const R = i => CL.r0 + CL.r1 * Math.sqrt(P[i].n);
      const on = P.map(p => p.n > 0);
      for (let it = 0; it < CL.steps; it++) {
        const a = 1 - it / CL.steps;
        for (let i = 0; i < A; i++) for (let j = i + 1; j < A; j++) {
          if (!on[i] || !on[j]) continue;
          const p = P[i], q = P[j];
          let dx = q.x - p.x, dy = q.y - p.y;
          const d = Math.hypot(dx, dy) || 1e-3, min = R(i) + R(j) + CL.gap;
          let f = 0;
          if (d < 2 * min) f -= CL.repel * (2 * min - d) / min;                 // keep some room
          if (W[i][j]) f += CL.attract * (W[i][j] / maxW) * (d - min);          // arrows pull
          if (d < min) f -= 0.5 * (min - d);                                    // no overlaps
          dx /= d; dy /= d;
          p.vx += dx * f * a; p.vy += dy * f * a; q.vx -= dx * f * a; q.vy -= dy * f * a;
        }
        let cx = 0, cy = 0, k = 0;
        for (let i = 0; i < A; i++) if (on[i]) { cx += P[i].x; cy += P[i].y; k++; }
        cx /= k || 1; cy /= k || 1;
        for (let i = 0; i < A; i++) if (on[i]) {
          const p = P[i];
          p.vx -= (p.x - cx) * CL.gravity * a; p.vy -= (p.y - cy) * CL.gravity * a;   // toward the middle
          p.x += (p.vx *= 0.6); p.y += (p.vy *= 0.6);
        }
      }
      for (const n of courses) {
        const own = n.areas.length ? n.areas.map(i => P[i]) : [{ x: 0, y: 0 }];
        n.tx = own.reduce((s, p) => s + p.x, 0) / own.length;
        n.ty = own.reduce((s, p) => s + p.y, 0) / own.length;
        n.x = n.tx + (view.rand() - 0.5) * 80; n.y = n.ty + (view.rand() - 0.5) * 80;
      }
      for (const g of gates) {
        const near = [...g.members.map(id => byId.get(id)), ...g.users].filter(n => n && n.kind === "course");
        g.tx = near.reduce((s, n) => s + n.tx, 0) / (near.length || 1);
        g.ty = near.reduce((s, n) => s + n.ty, 0) / (near.length || 1);
        g.x = g.tx; g.y = g.ty;
      }
      for (const n of nodes) n.vx = n.vy = 0;
    }
    if (LAYOUTS.sequence) LAYOUTS.sequence.place = () => placeSequence();
    LAYOUTS.area.place = view => placeAreas(view);
    // an arrow within an area pulls as usual; between two areas, weakly
    LAYOUTS.area.spring = e => (e.source.areas[0] != null && e.source.areas[0] === e.target.areas[0]
      ? { k: 0.8, vertical: false } : { k: 0.12, vertical: false });
    LAYOUTS.free.place = () => {
      if (LAYOUTS.sequence) placeSequence();
      else for (const n of nodes) { n.x = n.index * 20; n.y = (n.index % 7) * 30; }
      const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length, cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
      for (const n of nodes) { n.tx = cx; n.ty = cy; n.vx = n.vy = 0; }
    };

    // ---------- outlines of the buckets ----------
    let outline = null;                                     // the reader's choice, if they made one
    const stored = store.get("areas");
    if (stored === "true" || stored === "false") outline = stored === "true";
    const outlined = view => (outline != null ? outline : view.layoutKey() === "area");
    let olBox = null;
    function hullPath(pts) {
      if (!pts.length) return "";
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const half = l => { const h = []; for (const p of l) { while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
      const hull = pts.length < 3 ? pts : [...half(pts), ...half(pts.slice().reverse())];
      return "M" + hull.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L") + "Z";
    }
    const px = v => v.toFixed(1) + "px";
    const icon = a => (a.icon ? `<i class="bi bi-${a.icon}" aria-hidden="true"></i>` : "");

    // ---------- shapes ----------
    const diamond = r => `M0,${-r * 1.3}L${r * 1.3},0L0,${r * 1.3}L${-r * 1.3},0Z`;
    // the wedge of a circle of radius r from angle a0 to a1 (radians; 0 is up, clockwise)
    function wedge(r, a0, a1) {
      const pt = a => `${(r * Math.sin(a)).toFixed(2)},${(-r * Math.cos(a)).toFixed(2)}`;
      return `M0,0L${pt(a0)}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0},1 ${pt(a1)}Z`;
    }
    const mix = n => SHADE_MIX[Math.min(n.shade, SHADE_MIX.length - 1)] + "%";

    // ---------- the card ----------
    function chip(m, parent, view) {
      const b = tag("button", "cm-chip cur-chip", parent, m.label);
      b.style.setProperty("--cur-b", areaVar(m.areas[0]));
      b.title = m.name;
      b.addEventListener("click", ev => { ev.stopPropagation(); view.setFocus(m, true); });
      return b;
    }
    function badges(n, parent) {
      if (!n.areas.length) return;
      const row = tag("p", "cur-badges", parent);
      for (const i of n.areas) {
        const a = areas[i];
        const b = tag("span", "cur-badge" + (a.bucket ? " cur-bucket" : ""), row);
        b.style.setProperty("--cur-b", areaVar(i));
        b.innerHTML = icon(a) + esc(a.name);
      }
    }
    function card(n, el, view) {
      if (n.kind === "gate") {
        tag("p", "cm-card-name cur-gate-name", el, "One of");
        const row = tag("p", "cm-card-rel", el);
        n.members.forEach(id => { const m = byId.get(id); if (m) chip(m, row, view); });
        const users = n.users.filter(u => u.kind === "course");
        if (users.length) {
          const r2 = tag("p", "cm-card-rel", el);
          tag("span", "cm-card-rel-label", r2, "Needed by");
          for (const u of users) chip(u, r2, view);
        }
        return;
      }
      const name = tag("p", "cm-card-name", el, n.code ? `${n.code}: ${n.name}` : n.name);
      name.style.borderLeftColor = areaVar(n.areas[0]);
      badges(n, el);
      if (n.varies) tag("p", "cur-small", el, "A topics course: its title and topic change from year to year.");
      const pre = tag("p", "cm-card-rel", el);
      tag("span", "cm-card-rel-label", pre, "Prerequisites");
      const parts = [];
      for (const id of n.requires) if (byId.get(id)) parts.push(p => chip(byId.get(id), p, view));
      for (const g of n.oneOf) parts.push(p => {
        const box = tag("span", "cur-oneof", p);
        tag("span", "cur-oneof-label", box, "one of");
        for (const id of g) if (byId.get(id)) chip(byId.get(id), box, view);
      });
      if (!parts.length) tag("span", "cur-none", pre, "none listed here (see the catalog)");
      parts.forEach((part, i) => { if (i) tag("span", "cur-and", pre, "and"); part(pre); });
      const next = leadsTo.get(n.id) || [];
      if (next.length) {
        const row = tag("p", "cm-card-rel", el);
        tag("span", "cm-card-rel-label", row, "Leads to");
        for (const m of next) chip(m, row, view);
      }
      if (catalog && n.code) {
        const a = tag("a", "cm-card-open", el, "Catalog description ↗");
        a.href = catalogLink(n.code); a.target = "_blank"; a.rel = "noopener";
      }
    }
    // the catalog page, scrolled to the course's heading ("MATH 236: …") by a text fragment
    const catalogLink = code => catalog.replace(/#.*$/, "") + "#:~:text=" + encodeURIComponent(code + ":").replace(/-/g, "%2D");

    // ---------- the map ----------
    const view = GraphView.create(root, {
      nodes, edges,
      list: document.getElementById("curriculum-list"),
      store: "curriculum-",
      layouts: LAYOUTS,
      layout: root.dataset.layout || null,
      underlay: "cur-hulls",
      labelMinScale: 0.6, minScale: 0.5,
      ariaLabel: "Course map: the mathematics courses, with an arrow from each course to the courses that require it. " +
        "A small diamond is a choice: any one of the courses leading into it.",
      searchLabel: "Search the courses by number, name or area",
      radius: n => (n.kind === "gate" ? GATE_R : COURSE_R),
      labelText: n => n.label,
      passive: n => n.kind === "gate",
      node: n => (n.kind === "gate"
        ? { cls: "cur-gate", d: diamond(n.r), aria: n.name, html: "" }
        : { cls: "cur-course" + (n.varies ? " cur-varies" : "") + (n.areas.length > 1 ? " cur-multi" : ""),
            d: circle(n.r),
            aria: (n.code ? n.code + ", " : "") + n.name + (n.varies ? " (topics course)" : ""),
            html: `<span class="cur-code">${esc(n.label)}</span>` + (n.code ? `<span class="cur-name">${esc(n.name)}</span>` : "") }),
      edge: e => (e.kind === "option" ? { cls: "cur-option", arrow: false } : { cls: "cur-" + e.kind }),
      searchText: n => [n.code, n.code && n.code.replace(/\s+/g, ""), n.code && n.code.replace(/^\D+/, ""),
        n.name, ...n.areas.map(i => areas[i].name), n.varies ? "topics course" : ""].filter(Boolean).join(" "),
      // Lit: a course, everything it needs (through the diamonds, every
      // alternative), and what it leads to directly; a diamond, its
      // alternatives and the courses that use it; otherwise the matches.
      lit: ({ hover, focus, matches, view }) => {
        const n = focus || hover;
        if (!n) return matches;
        if (n.kind === "gate") return new Set([n, ...n.deps, ...n.users]);
        const lit = view.ancestors(n);
        lit.add(n);
        for (const u of n.users) { lit.add(u); if (u.kind === "gate") for (const v of u.users) lit.add(v); }
        return lit;
      },
      card,
      legend: el => {
        areas.forEach((a, i) => {
          if (!courses.some(n => n.areas.includes(i))) return;
          const item = tag("span", "cm-legend-item", el);
          item.style.setProperty("--cur-b", areaVar(i));
          const sw = svg("svg", { width: 16, height: 16, viewBox: "-8 -8 16 16", "aria-hidden": "true" }, item);
          svg("path", { d: circle(6), class: "cm-shape cur-course" }, sw).style.setProperty("--cur-c", areaVar(i));
          const text = tag("span", null, item);
          text.innerHTML = icon(a) + esc(a.name);
        });
        tag("span", "cur-legend-break", el);
        const key = (draw, text) => {
          const item = tag("span", "cm-legend-item", el);
          const sw = svg("svg", { width: 34, height: 16, viewBox: "0 -8 34 16", "aria-hidden": "true" }, item);
          draw(sw);
          item.appendChild(document.createTextNode(text));
        };
        key(sw => {
          svg("line", { x1: 2, y1: 0, x2: 25, y2: 0, class: "cm-edge" }, sw);
          svg("path", { d: "M24,-4L32,0L24,4Z", class: "cm-arrowhead" }, sw);
        }, "Required");
        key(sw => {
          svg("line", { x1: 0, y1: -6, x2: 12, y2: -1, class: "cm-edge cur-option" }, sw);
          svg("line", { x1: 0, y1: 6, x2: 12, y2: 1, class: "cm-edge cur-option" }, sw);
          svg("path", { d: diamond(4), class: "cm-shape cur-gate", transform: "translate(17,0)" }, sw);
          svg("line", { x1: 22, y1: 0, x2: 27, y2: 0, class: "cm-edge" }, sw);
          svg("path", { d: "M26,-4L34,0L26,4Z", class: "cm-arrowhead" }, sw);
        }, "One of these");
        key(sw => {
          svg("path", { d: circle(6), class: "cm-shape cur-course cur-legend-varies", transform: "translate(17,0)" }, sw);
        }, "Topics course");
      },
      controls: view => {
        const toggle = tag("label", "cm-toggle cm-map-only");
        olBox = tag("input", null, toggle);
        olBox.type = "checkbox";
        toggle.appendChild(document.createTextNode(" Highlight areas"));
        olBox.addEventListener("change", () => { outline = olBox.checked; store.set("areas", String(outline)); view.draw(); });
        return [toggle];
      },
      // the buckets' outlines (SVG, under the arrows) and names (HTML, over the drawing)
      setup: view => {
        areas.forEach((a, i) => {
          if (!a.bucket) return;
          a.hull = svg("path", { class: "cur-hull" }, view.underlay);
          a.hull.style.setProperty("--cur-h", areaVar(i));
          a.label = tag("div", "cur-hull-label", view.labelLayer);
          a.label.style.setProperty("--cur-h", areaVar(i));
          a.label.innerHTML = icon(a) + esc(a.name);
        });
      },
      onDraw: (view, { z, s }) => {
        const on = outlined(view), t = view.t, active = view.active();
        if (olBox && olBox.checked !== on) olBox.checked = on;
        view.underlay.style.display = on ? "" : "none";
        areas.forEach((a, i) => {
          if (!a.hull) return;
          a.label.hidden = !on;
          if (!on) return;
          const pts = [];
          let top = Infinity, bottom = -Infinity, right = -Infinity, sx = 0, k = 0;
          for (const n of active) if (n.areas.includes(i)) {
            const end = n.x + Math.min(n.w, 80) * s;
            pts.push([n.x, n.y], [end, n.y]);
            top = Math.min(top, n.y); bottom = Math.max(bottom, n.y); right = Math.max(right, end); sx += n.x; k++;
          }
          a.hull.setAttribute("d", hullPath(pts));
          a.label.hidden = !k;
          if (!k) return;
          const zc = Math.max(0.6, z);
          // Sequence: the bands are close together, so the name goes to the
          // right of the outline; otherwise above it
          a.label.style.transform = view.layoutKey() === "sequence"
            ? `translate(${px(t.x + right * t.k + 34 * z)},${px(t.y + (top + bottom) / 2 * t.k)}) translateY(-50%) scale(${zc.toFixed(3)})`
            : `translate(${px(t.x + (sx / k) * t.k)},${px(t.y + top * t.k - 30 * z)}) translate(-50%,-100%) scale(${zc.toFixed(3)})`;
          a.label.classList.toggle("cur-hull-label-side", view.layoutKey() === "sequence");
        });
      },
    });

    // colours: each course's area and shade; a course in several areas, wedges
    for (const n of courses) {
      n.g.style.setProperty("--cur-c", areaVar(n.areas[0]));
      n.g.style.setProperty("--cur-mix", mix(n));
      if (n.areas.length < 2) continue;
      const shape = n.g.querySelector(".cm-shape");
      const step = 2 * Math.PI / n.areas.length;
      n.areas.forEach((ai, k) => {
        if (k === 0) return;                           // the first area: the circle itself
        const p = svg("path", { d: wedge(n.r, k * step, (k + 1) * step), class: "cur-wedge" }, n.g);
        p.style.setProperty("--cur-c", areaVar(ai));
      });
      svg("path", { d: shape.getAttribute("d"), class: "cm-shape cur-ring" }, n.g);
    }
    view.draw();
    return view;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
