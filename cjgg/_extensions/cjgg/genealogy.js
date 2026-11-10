/* genealogy.js: an academic genealogy (advisors and students), from the data
   genealogy.lua puts in the page (#genealogy-data), drawn by graph-view.js
   (which must load first). No libraries.

   The data: groups (of department members, most recent first), people (each
   with a name, school and year, an MGP id if the Mathematics Genealogy
   Project has them, and for department members their group and Carleton
   record), and edges [advisor, student]. See department-genealogy's build.py.

   Layouts. All three start from one layered "seed", computed once:
     • every department member on the bottom level, every ancestor at least
       one level above all of their students (the longest path down);
     • arrows longer than a level get invisible way points, and the order
       within each level is found by sweeping up and down, placing each node
       at the average position of its neighbours (Sugiyama's method), from a
       few seeded starts, keeping the one with the fewest crossings;
     • the connected pieces are ordered separately: the biggest in the
       middle, the others beside it, the most recent members nearest;
     • members with no advisor on record are spread along the bottom, each
       group's across the whole width;
     • ancestors are placed over their students, then nudged toward all
       their neighbours, keeping a minimum spacing.
   • Generations: the seed. Each group of members has its own row (the most
     recent lowest), a short step apart; ancestors keep their levels, and
     the simulation straightens the arrows sideways and spaces the nodes.
     An advisor is never below a student.
   • Timeline: height is the year of the degree (centuries before 1700
     squeezed). A person with no year sits between their advisors' and
     students' years; a member with none, at their start at Carleton.
   • Free: the ordinary force layout, started from Generations.

   Hover a person: they, their advisors and their students light up. Click:
   everyone they descend from and everyone who descends from them. Compare
   two people (shift-click a second, or "Compare with…" on the card, then
   choose; or, with a mouse, just hover a second): both lineages light up,
   and their nearest common ancestors are ringed and named on the card, with
   how many generations back each is. Shift-drag moves a whole connected
   piece. Search looks in names, schools, years and Carleton titles. */
(function () {
  "use strict";

  // ---------- tuning ----------
  const MEMBER_GAP = 46;           // seed: between members on the bottom row
  const SEP = 46, DSEP = 16;       // seed: between nodes on a level; next to a way point
  const ROW_STEP = 28;             // Generations: between the groups' rows
  const LEVEL = 110;               // Generations: between levels of ancestors
  const SWEEPS = 30, STARTS = 4;   // seed: ordering sweeps, and seeded starts tried
  const GAP = 60;                  // an advisor at least this far above a student (Generations)
  const KX = 0.3;                  // sideways pull along an arrow (Generations, Timeline)
  const YEAR = 14, OLD_YEAR = 3.5; // Timeline: height of a year since 1700; of one before
  const LAYOUTS = {
    // alphaMin: Generations and Timeline start almost settled, so stop early (and stop redrawing)
    generations: { name: "Generations", charge: -150, chargeRange: 160, labelGap: 0, pullX: 0.002, pullY: 0.2, alphaMin: 0.02 },
    timeline:    { name: "Timeline",    charge: -150, chargeRange: 160, labelGap: 0, pullX: 0.002, pullY: 0.6, alphaMin: 0.02 },
    free:        { name: "Free",        charge: -260, chargeRange: 400, labelGap: 0, pullX: 0.003, pullY: 0.003, alphaMin: 0.005 },
  };

  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function init() {
    const root = document.getElementById("genealogy");
    const dataEl = document.getElementById("genealogy-data");
    if (!root || !dataEl || !window.GraphView) return;
    const { svg, tag } = window.GraphView;
    const { circle } = window.GraphView.shapes;
    const data = JSON.parse(dataEl.textContent);
    const list = x => (Array.isArray(x) ? x : []);
    const groups = list(data.groups);
    const groupIndex = new Map(groups.map((g, i) => [g.key, i]));
    // The shortcode's options (genealogy.lua puts them on the root element):
    // layout, and the sizes, for a page to tune without changing this file.
    const num = (v, d) => (v != null && v !== "" && Number.isFinite(+v) && +v > 0 ? +v : d);
    const ds = root.dataset;
    const options = {
      layout: ds.layout || null,
      memberSize: num(ds.memberSize, 12),        // members' radius, in map units (members are 46 apart)
      ancestorSize: num(ds.ancestorSize, 7),     // ancestors' radius
      minScale: num(ds.minScale, 0.4),           // zoomed out, shapes are never drawn smaller than this
      edgeWidth: num(ds.edgeWidth, 1.5),         // arrows' width on screen, in px (lit: twice this)
    };
    root.style.setProperty("--gv-edge", options.edgeWidth + "px");

    // Every node gets the same fields, in the same order, including those the
    // viewer adds: the simulation runs several times faster for it.
    const nodes = list(data.people).map(p => ({
      id: String(p.id), name: String(p.name || p.id), label: String(p.name || p.id),
      school: p.school || null, year: p.year != null ? p.year : null, mgp: p.mgp != null ? p.mgp : null,
      mgpName: p.mgp_name || null, member: p.member || null,
      gi: p.member && groupIndex.has(p.member.group) ? groupIndex.get(p.member.group) : -1,
      alone: false, level: 0, sx: 0, when: 0, depth: 0,
      deps: null, users: null, r: 0, fx: null, fy: null, w: 0, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
      deg: 0, g: null, el: null, li: null, text: "", pullX: null, pullY: null,
    }));
    const edges = list(data.edges).map(e => ({ source: String(e[0]), target: String(e[1]) }));
    const linkedIds = new Set(edges.flatMap(e => [e.source, e.target]));
    for (const n of nodes) n.alone = !!n.member && !linkedIds.has(n.id);

    // ---------- the seed (see the top of this file) ----------
    let seeded = false;
    function seed(view) {
      if (seeded) return;
      seeded = true;
      // levels: members at 0, ancestors above all their students
      const done = new Set();
      const level = n => {
        if (done.has(n)) return n.level;
        done.add(n); n.level = 0;
        let L = n.member ? 0 : 1;
        for (const s of n.users) L = Math.max(L, level(s) + 1);
        return (n.level = L);
      };
      for (const n of nodes) level(n);
      // one with more advisors than students moves up toward them (shorter arrows overall)
      for (let changed = true, pass = 0; changed && pass < 50; pass++) {
        changed = false;
        for (const n of nodes) {
          if (n.member || !n.deps.length || n.deps.length <= n.users.length) continue;
          const top = Math.min(...n.deps.map(a => a.level)) - 1;
          if (top > n.level) { n.level = top; changed = true; }
        }
      }
      const H = Math.max(0, ...nodes.map(n => n.level)) + 1;
      // connected pieces
      const pieceOf = new Map(), pieces = [];
      for (const n of nodes) if (!pieceOf.has(n)) {
        const p = [n], stack = [n]; pieceOf.set(n, p);
        while (stack.length) for (const m of (x => [...x.deps, ...x.users])(stack.pop())) if (!pieceOf.has(m)) { pieceOf.set(m, p); p.push(m); stack.push(m); }
        pieces.push(p);
      }
      const linked = pieces.filter(p => p.length > 1).sort((a, b) => b.length - a.length);
      const alone = nodes.filter(n => n.alone);

      // order one piece's levels, from a seeded start
      function orderPiece(piece, start) {
        const layers = Array.from({ length: H }, () => []);
        const items = [], of = new Map();
        const item = (real, L) => { const it = { real, L, up: [], down: [], p: 0, b: 0, x: 0 }; layers[L].push(it); items.push(it); return it; };
        for (const n of piece) of.set(n, item(n, n.level));
        for (const s of piece) for (const a of s.deps) {          // a way point on each level between
          let below = of.get(s);
          for (let L = s.level + 1; L < a.level; L++) { const d = item(null, L); d.down.push(below); below.up.push(d); below = d; }
          const top = of.get(a); top.down.push(below); below.up.push(top);
        }
        let r = start;
        const rnd = () => (r = (r * 16807 + 11) % 2147483647) / 2147483647;
        if (start) for (const it of items) { it.up.sort(() => rnd() - 0.5); it.down.sort(() => rnd() - 0.5); }
        let k = 0; const seen = new Set();
        const visit = it => { if (seen.has(it)) return; seen.add(it); it.p = k++; for (const u of it.up) visit(u); for (const d of it.down) visit(d); };
        for (const it of items) if (it.real && it.real.member) visit(it);
        for (const it of items) visit(it);
        for (const l of layers) { l.sort((a, b) => a.p - b.p); l.forEach((it, i) => it.p = i); }
        const crossings = () => {
          let c = 0;
          for (let L = 1; L < H; L++) {
            const es = [];
            for (const it of layers[L]) for (const d of it.down) es.push(it.p * 1e6 + d.p);
            es.sort((a, b) => a - b);
            for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) if (es[j] % 1e6 < es[i] % 1e6 && Math.floor(es[j] / 1e6) > Math.floor(es[i] / 1e6)) c++;
          }
          return c;
        };
        let best = crossings(), bestP = items.map(it => it.p);
        for (let sw = 0; sw < SWEEPS; sw++) {
          const down = sw % 2 === 0;
          for (let i = 0; i < H; i++) {
            const l = layers[down ? H - 1 - i : i];
            for (const it of l) {
              const nb = down ? it.up : it.down, all = nb.length ? nb : [...it.up, ...it.down];
              it.b = all.length ? all.reduce((x, m) => x + m.p, 0) / all.length : it.p;
            }
            l.sort((a, b) => a.b - b.b || a.p - b.p);
            l.forEach((it, j) => it.p = j);
          }
          const c = crossings();
          if (c < best) { best = c; bestP = items.map(it => it.p); }
        }
        items.forEach((it, i) => it.p = bestP[i]);
        for (const l of layers) l.sort((a, b) => a.p - b.p);
        return layers;
      }

      // x for every node, given each piece's order
      function place(orders) {
        // the biggest piece in the middle; the others beside it, the most recent members nearest
        const rank = p => Math.min(...p.filter(n => n.member).map(n => n.gi).concat([99]));
        const rest = orders.slice(1).map((layers, i) => ({ layers, p: linked[i + 1] }))
          .sort((a, b) => rank(a.p) - rank(b.p) || b.p.length - a.p.length);
        const left = [], right = [];
        rest.forEach((r, i) => (i % 2 === 0 ? right : left).push(r.layers));
        const seq = [...left.reverse(), orders[0], ...right];
        const layers = Array.from({ length: H }, (_, L) => seq.flatMap(o => o[L]));
        // the bottom row: linked members in order, and the others spread evenly,
        // each group's across the whole width
        const count = new Map();
        for (const n of alone) count.set(n.gi, (count.get(n.gi) || 0) + 1);
        const seenIn = new Map();
        const lone = alone.map(n => { const i = seenIn.get(n.gi) || 0; seenIn.set(n.gi, i + 1); return { n, at: (i + 0.5) / count.get(n.gi) }; })
          .sort((a, b) => a.at - b.at || a.n.gi - b.n.gi || (a.n.year || 0) - (b.n.year || 0));
        const linkedRow = layers[0];
        const total = linkedRow.length + lone.length, row = new Array(total);
        lone.forEach((o, i) => {
          let at = Math.min(total - 1, Math.round((i + 0.5) * total / lone.length - 0.5));
          while (row[at]) at++;
          row[at] = { real: o.n, L: 0, up: [], down: [], p: 0, b: 0, x: 0, lone: true };
        });
        let j = 0;
        for (let i = 0; i < total; i++) if (!row[i]) row[i] = linkedRow[j++];
        layers[0] = row;
        row.forEach((it, i) => it.x = i * MEMBER_GAP);
        const bary = nb => nb.reduce((s, m) => s + m.x, 0) / nb.length;
        const spread = (l, gap) => {               // in order, at least gap apart, near where each wants to be
          const f = l.map(it => it.x), r = f.slice();
          for (let i = 1; i < l.length; i++) f[i] = Math.max(f[i], f[i - 1] + gap(l[i - 1], l[i]));
          for (let i = l.length - 2; i >= 0; i--) r[i] = Math.min(r[i], r[i + 1] - gap(l[i], l[i + 1]));
          l.forEach((it, i) => it.x = (f[i] + r[i]) / 2);
          for (let i = 1; i < l.length; i++) l[i].x = Math.max(l[i].x, l[i - 1].x + gap(l[i - 1], l[i]));
        };
        const gapL = (a, b) => (a.real && b.real ? SEP : DSEP);
        const gap0 = (a, b) => MEMBER_GAP * (a.lone || b.lone ? 0.7 : 1);
        for (let L = 1; L < H; L++) { for (const it of layers[L]) if (it.down.length) it.x = bary(it.down); spread(layers[L], gapL); }
        for (let pass = 0; pass < 4; pass++) {
          for (let L = H - 2; L >= 1; L--) { for (const it of layers[L]) { const nb = [...it.up, ...it.down]; if (nb.length) it.x = bary(nb); } spread(layers[L], gapL); }
          for (const it of layers[0]) if (it.up.length) it.x = bary(it.up);
          for (let i = 0; i < row.length; i++) if (row[i].lone && row[i - 1] && row[i + 1]) row[i].x = (row[i - 1].x + row[i + 1].x) / 2;
          spread(row, gap0);
          for (let L = 1; L < H; L++) { for (const it of layers[L]) { const nb = [...it.up, ...it.down]; if (nb.length) it.x = bary(nb); } spread(layers[L], gapL); }
        }
        const mid = (row[0].x + row[row.length - 1].x) / 2;
        for (const l of layers) for (const it of l) if (it.real) it.real.sx = it.x - mid;
      }
      // straight-line crossings of the arrows, for choosing between starts
      function crossings() {
        const segs = edges.map(e => [view.byId.get(e.source), view.byId.get(e.target)]).filter(s => s[0] && s[1])
          .map(([a, b]) => ({ a, b, ax: a.sx, ay: genY(a), bx: b.sx, by: genY(b) }));
        const o = (ax, ay, bx, by, px, py) => Math.sign((bx - ax) * (py - ay) - (by - ay) * (px - ax));
        let c = 0;
        for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
          const s = segs[i], u = segs[j];
          if (s.a === u.a || s.a === u.b || s.b === u.a || s.b === u.b) continue;
          if (Math.max(s.ax, s.bx) < Math.min(u.ax, u.bx) || Math.max(u.ax, u.bx) < Math.min(s.ax, s.bx)) continue;
          if (o(s.ax, s.ay, s.bx, s.by, u.ax, u.ay) * o(s.ax, s.ay, s.bx, s.by, u.bx, u.by) < 0 &&
              o(u.ax, u.ay, u.bx, u.by, s.ax, s.ay) * o(u.ax, u.ay, u.bx, u.by, s.bx, s.by) < 0) c++;
        }
        return c;
      }
      let best = null;
      for (let s = 0; s < STARTS; s++) {
        place(linked.map(p => orderPiece(p, s ? s * 7919 : 0)));
        const c = crossings();
        if (!best || c < best.c) best = { c, x: nodes.map(n => n.sx) };
      }
      nodes.forEach((n, i) => n.sx = best.x[i]);

      // Timeline: each person's year, or an estimate between their neighbours'
      const memberYears = nodes.filter(n => n.member).map(n => n.year != null ? n.year : n.member.start).filter(y => y != null);
      const fallback = memberYears.length ? memberYears.reduce((a, b) => a + b, 0) / memberYears.length : 1950;
      for (const n of nodes) n.when = n.year != null ? n.year : n.member && n.member.start != null ? n.member.start : NaN;
      for (let pass = 0; pass < 60; pass++) {
        let changed = false;
        for (const n of nodes) {
          if (!Number.isNaN(n.when) && (n.year != null || n.member)) continue;
          const up = n.deps.map(a => a.when).filter(y => !Number.isNaN(y)), down = n.users.map(s => s.when).filter(y => !Number.isNaN(y));
          const hi = up.length ? Math.max(...up) : null, lo = down.length ? Math.min(...down) : null;
          const w = hi != null && lo != null ? (hi + lo) / 2 : hi != null ? hi + 25 : lo != null ? lo - 25 : NaN;
          if (!Number.isNaN(w) && w !== n.when) { n.when = w; changed = true; }
        }
        if (!changed) break;
      }
      for (const n of nodes) if (Number.isNaN(n.when)) n.when = fallback;
      // generations from the nearest member, for the ancestors' colours
      const queue = nodes.filter(n => n.member);
      const seenD = new Set(queue);
      for (let i = 0; i < queue.length; i++) for (const a of queue[i].deps) if (!seenD.has(a)) { seenD.add(a); a.depth = queue[i].depth + 1; queue.push(a); }
    }
    const rowsTop = Math.max(0, groups.length - 1) * ROW_STEP;
    const genY = n => (n.level === 0 ? -(n.gi >= 0 ? n.gi : 0) * ROW_STEP : -rowsTop - n.level * LEVEL);
    const timeY = w => (w >= 1700 ? (w - 2030) * YEAR : (1700 - 2030) * YEAR - (1700 - w) * OLD_YEAR);

    function start(view, x, y, ty, pullX, pullY) {
      for (const n of nodes) {
        n.x = x(n); n.y = y(n); n.tx = n.x; n.ty = ty(n); n.vx = n.vy = 0;
        n.pullX = n.alone ? 0.1 : pullX(n); n.pullY = pullY(n);
      }
    }
    LAYOUTS.generations.place = view => {
      seed(view);
      start(view, n => n.sx, genY, genY, () => null, n => (n.member ? 0.5 : null));
    };
    LAYOUTS.timeline.place = view => {
      seed(view);
      start(view, n => n.sx, n => timeY(n.when), n => timeY(n.when), () => null, () => null);
    };
    LAYOUTS.free.place = view => {
      seed(view);
      const ys = nodes.map(genY), cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      start(view, n => n.sx, genY, () => cy, () => null, () => null);
      for (const n of nodes) { n.tx = 0; if (n.alone) { n.tx = n.sx; n.ty = genY(n); n.pullY = 0.1; } }
    };
    // Generations and Timeline: arrows pull only sideways (heights are the
    // layout's), and in Generations an advisor stays at least GAP above a student.
    const sideways = gap => (view, a) => {
      for (const e of view.activeEdges()) {
        const s = e.source, t = e.target, dx = t.x - s.x, k = KX * a / Math.min(s.deg, t.deg);
        t.vx -= dx * k * 0.5; s.vx += dx * k * 0.5;
        if (gap) { const d = t.y - s.y; if (d < gap) { const v = (gap - d) * 0.2 * a; s.vy -= v; t.vy += v; } }
      }
    };
    LAYOUTS.generations.force = sideways(GAP);
    LAYOUTS.timeline.force = sideways(0);
    LAYOUTS.generations.spring = LAYOUTS.timeline.spring = () => ({ k: 0, vertical: false });

    // ---------- lineages and common ancestors ----------
    const lineage = (view, n) => new Set([n, ...view.ancestors(n), ...view.descendants(n)]);
    // generations up from n to each ancestor (n itself: 0)
    const upFrom = n => {
      const d = new Map([[n, 0]]), q = [n];
      for (let i = 0; i < q.length; i++) for (const a of q[i].deps) if (!d.has(a)) { d.set(a, d.get(q[i]) + 1); q.push(a); }
      return d;
    };
    // nearest common ancestors: common ancestors (a person counts as their own)
    // none of whose students is also one
    function common(a, b) {
      const da = upFrom(a), db = upFrom(b);
      const both = new Set([...da.keys()].filter(x => db.has(x)));
      return [...both].filter(x => !x.users.some(s => both.has(s)))
        .map(x => ({ n: x, a: da.get(x), b: db.get(x) }))
        .sort((x, y) => x.a + x.b - (y.a + y.b) || (x.n.year || 0) - (y.n.year || 0));
    }
    let lca = [], lcaSet = new Set();
    const second = ({ focus, compare, hover }) => compare || (focus && hover && hover !== focus ? hover : null);

    // ---------- the card ----------
    const years = m => (m.start != null && m.end != null ? (m.start === m.end ? `during ${m.start}` : `${m.start}–${m.end}`)
      : m.start != null ? `from ${m.start}` : m.end != null ? `until ${m.end}` : "");
    function card(n, el, view) {
      const chip = (m, parent, extra) => {
        const b = tag("button", "cm-chip " + (m.member ? "gv-chip-g" + m.gi : "gv-chip-ancestor"), parent, m.name + (extra || ""));
        b.title = m.name + (m.year != null ? ` (${m.year})` : "");
        b.addEventListener("click", ev => { ev.stopPropagation(); view.setFocus(m, true); });
        return b;
      };
      const rel = (label, people, max = 12) => {
        if (!people.length) return;
        const row = tag("p", "cm-card-rel", el);
        tag("span", "cm-card-rel-label", row, label);
        const sorted = people.slice().sort((a, b) => (a.year || 9999) - (b.year || 9999));
        for (const m of sorted.slice(0, max)) chip(m, row);
        if (sorted.length > max) tag("span", "gv-more", row, `and ${sorted.length - max} more`);
      };
      tag("p", "cm-card-name " + (n.member ? "gv-text-g" + n.gi : "gv-text-ancestor"), el, n.name);
      const degree = [n.member && n.member.degree, n.school, n.year != null ? String(n.year) : "year unknown"].filter(Boolean);
      tag("p", "gv-degree", el, degree.join(", "));
      if (n.mgpName) tag("p", "gv-small", el, `In the Mathematics Genealogy Project as ${n.mgpName}.`);
      if (n.member) {
        // (the group is the color beside the name, as on the map)
        const m = n.member;
        if (years(m)) tag("p", "gv-carleton", el, "At Carleton " + years(m));
        if (m.titles) for (const line of String(m.titles).split("\n")) tag("p", "gv-small", el, line);
        if (m.degrees) tag("p", "gv-small", el, "Degrees: " + String(m.degrees).replace(/\n/g, "; "));
        if (n.alone) tag("p", "gv-alone-note", el, "No advisor on record.");
      }
      rel(n.deps.length === 1 ? "Advisor" : "Advisors", n.deps);
      rel(n.users.length === 1 ? "Student" : "Students", n.users);
      // the comparison, on the card of either person
      const focus = view.focus(), other = second({ focus, compare: view.compare(), hover: n === focus ? null : n });
      const pair = focus && other && (n === focus || n === other) ? [focus, other] : null;
      if (pair) {
        const box = tag("div", "gv-compare", el);
        const [a, b] = pair;
        tag("p", "gv-compare-title", box, `${a.name} and ${b.name}`);
        if (!lca.length) tag("p", "gv-small", box, "No common ancestor on record: their lineages never meet in the data.");
        else {
          tag("p", "cm-card-rel-label gv-lca-title", box, lca.length === 1 ? "Nearest common ancestor" : "Nearest common ancestors");
          const gens = k => (k === 1 ? "1 generation" : `${k} generations`);
          for (const c of lca) {
            const row = tag("p", "gv-lca-row", box);
            chip(c.n, row);
            tag("span", "gv-gens", row, c.a === 0 ? `${b.name}'s ancestor, ${gens(c.b)} back`
              : c.b === 0 ? `${a.name}'s ancestor, ${gens(c.a)} back`
              : `${c.a} and ${gens(c.b)} back`);
          }
        }
        if (view.compare()) {
          const stop = tag("button", "cm-button gv-action", box, "Stop comparing");
          stop.addEventListener("click", ev => { ev.stopPropagation(); view.setCompare(null); });
        }
      } else if (n === focus) {
        if (view.picking()) tag("p", "gv-small gv-picking", el, "Choose someone on the map to compare with (Esc to cancel).");
        else {
          const cmp = tag("button", "cm-button gv-action", el, "Compare with…");
          cmp.addEventListener("click", ev => { ev.stopPropagation(); view.pickCompare(true); });
        }
      }
      if (n.mgp != null) {
        const a = tag("a", "cm-card-open", el, "Mathematics Genealogy Project ↗");
        a.href = "https://www.mathgenealogy.org/id.php?id=" + encodeURIComponent(n.mgp);
        a.target = "_blank"; a.rel = "noopener";
      }
    }

    const view = GraphView.create(root, {
      nodes, edges,
      list: document.getElementById("genealogy-list"),
      store: "genealogy-",
      layouts: LAYOUTS,
      layout: options.layout,
      compare: true, dragPieces: true, declutter: true, labelMinScale: 0.75, minScale: options.minScale,
      coalesce: true, searchDelay: 150,
      ariaLabel: "Academic genealogy of the department: each person, with arrows from advisor to student.",
      searchLabel: "Search names, schools, years and titles",
      radius: n => (n.member ? options.memberSize : options.ancestorSize),
      labelText: n => n.name,
      node: n => ({
        cls: n.member ? `gv-member gv-g${n.gi}` + (n.alone ? " gv-alone" : "") : "gv-ancestor",
        d: circle(n.r), aria: n.name + (n.year != null ? `, ${n.year}` : ""), html: esc(n.name),
      }),
      // also without accents, so that "Gauss" finds Gauß and "Godel" Gödel
      searchText: n => {
        const t = [n.name, n.mgpName, n.school, n.year, n.member && n.member.titles, n.member && n.member.degrees].filter(Boolean).join(" ");
        const plain = t.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/æ/g, "ae").replace(/ø/g, "o");
        return plain === t ? t : t + " " + plain;
      },
      // Lit: on hover, the person and their advisors and students; on focus,
      // their whole lineage; comparing, both lineages; otherwise the matches.
      lit: state => {
        const { hover, focus, matches, view } = state;
        const other = second(state);
        lca = focus && other ? common(focus, other) : [];
        lcaSet = new Set(lca.map(c => c.n));
        if (focus && other) return new Set([...lineage(view, focus), ...lineage(view, other)]);
        if (focus) return lineage(view, focus);
        if (hover) return new Set([hover, ...hover.deps, ...hover.users]);
        return matches;
      },
      onHighlight: () => {
        for (const n of nodes) { const on = lcaSet.has(n); n.g.classList.toggle("gv-lca", on); n.el.classList.toggle("gv-lca", on); }
      },
      labelPriority: (n, lit, view) => (n === view.focus() || n === view.compare() ? 6 : lcaSet.has(n) ? 5
        : lit && lit.has(n) ? (n.member ? 4 : 3) : n.member ? 2 : 1),
      card,
      legend: el => {
        const swatch = (cls, text) => {
          const item = tag("span", "cm-legend-item", el);
          const icon = svg("svg", { width: 18, height: 18, viewBox: "-9 -9 18 18", "aria-hidden": "true" }, item);
          svg("path", { d: circle(5.5), class: "cm-shape " + cls }, icon);
          item.appendChild(document.createTextNode(text));
        };
        groups.forEach((g, i) => { if (nodes.some(n => n.gi === i)) swatch(`gv-member gv-g${i}`, g.label); });
        if (nodes.some(n => n.alone)) swatch("gv-member gv-alone gv-legend-alone", "No advisor on record");
        const anc = tag("span", "cm-legend-item", el);
        tag("span", "gv-ramp", anc).setAttribute("aria-hidden", "true");
        anc.appendChild(document.createTextNode("Ancestors, recent to older"));
        swatch("gv-ancestor gv-lca", "Nearest common ancestor");
      },
    });
    // ancestors' colours: generations from the nearest member, recent to older
    const deepest = Math.max(1, ...nodes.map(n => n.depth));
    for (const n of nodes) if (!n.member) n.g.style.setProperty("--gv-t", (Math.min(n.depth, deepest) / deepest).toFixed(3));
    return view;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
