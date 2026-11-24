/* applet.js: what a site's applets share. Part of the cjgg extension's
   applet kit: a site's pre-render step (tokens-to-css.py) copies it into the
   site's theme/, beside tokens.css, on every render, so edit it in the
   extension, not the copy.

   An applet is a page of its own (on the homepage,
   illustration/<name>/models/*.html), shown in an iframe on one of the
   site's pages, or in a slide. It links

     <link rel="stylesheet" href="/theme/tokens.css">   the palette (generated)
     <link rel="stylesheet" href="/theme/applet.css">   the shared look

   and imports what it needs in a module script:

     import { theme, color, rgb, rgba, drag, fullscreen, visible, onDemand }
       from "/theme/applet.js";

     theme.dark              true while the applet is dark
     theme.on(fn)            fn(dark) now and whenever it changes
     theme.fix("dark")       stop following the page ("light" too; null to follow again)

     color("--ctp-red")      a custom property's value, as written (for CSS and canvas styles)
     rgb("--ctp-lavender")   [r, g, b], each 0–1, sRGB as authored (for shader uniforms);
                             opaque colors only; null if the property is not a color
     rgba("--ctp-peach", .6) "rgba(254, 100, 11, 0.6)"

     drag(element, { down(p, event), move(p, event), up(p, event) })
                             mouse, finger or pen; p = { x, y } in CSS pixels from the
                             element's top-left corner. down() returning false declines the
                             gesture. up() also runs when the browser cancels the gesture.
                             One pointer at a time; the drag goes on outside the element,
                             and outside the iframe. Fingers on the element no longer
                             scroll the page (touch-action: none), so give drag() only
                             what can be dragged.
     fullscreen(button, element)
                             the button toggles fullscreen for the element and keeps its
                             aria-pressed. Where a browser has no fullscreen for elements
                             (an iPhone), the button instead opens the applet on a page of
                             its own, which fills the screen (?theme=…&back=1: the same
                             theme, and a way back); there, it becomes ✕ and goes back.
                             Only from a page of this site: in another site's page (a
                             deck) that allows no fullscreen, and on an applet opened on
                             its own without back=1, the button is hidden.

     visible()               false while the applet is scrolled out of sight or its tab is
                             hidden; visible.on(fn) calls fn(visible) when that changes
     onDemand(draw)          returns request(): draw() runs once in the next frame, however
                             many requests came; while the applet is out of sight it waits,
                             and runs when the applet comes back. For animation, draw()
                             requests again while things move.

   The theme, in order: theme.fix(); ?theme=dark or ?theme=light in the
   applet's own address; the last { type: "theme", dark } message from the
   page it is shown in; that page's quarto-dark / quarto-light class on its
   <body>, when the page is on this site (watched); else the system's color
   scheme. The class quarto-dark goes on the applet's <html> (tokens.css
   switches the palette there), so applets declare their own variables on
   :root: a variable that refers to another (--x: var(--ctp-base)) is
   resolved on the element that declares it.

   In a deck (mathkit-revealjs, cjgg-revealjs), the deck keeps its keys
   after a click into the applet by listening in the applet itself, which
   needs the deck and the applet on the same site; and the deck must be
   served (quarto preview, or the site), since this file is loaded as a
   module from /theme/, which a page opened as a file can't do.

   Nothing here loads anything from another site. */

const root = document.documentElement;
const embedded = window.parent !== window;
root.classList.toggle("applet-alone", !embedded);   // applet.css: no frame on a page of its own

// ---------- theme ----------

const asked = new URLSearchParams(location.search).get("theme");
const fromAddress = asked === "dark" || asked === "light" ? asked : null;
const system = matchMedia("(prefers-color-scheme: dark)");

let fixed = null;      // theme.fix()
let told = null;       // the last message from the embedding page
let pageSays = null;   // the embedding page's classes, if it is on this site

function readPage() {
  try {
    const doc = window.parent.document;
    const body = doc.body;
    if (body && body.classList.contains("quarto-dark")) return "dark";
    if (body && body.classList.contains("quarto-light")) return "light";
    const bs = doc.documentElement.getAttribute("data-bs-theme");
    return bs === "dark" || bs === "light" ? bs : null;
  } catch (e) {
    return null; // a page on another site: messages only
  }
}

const themeListeners = new Set();
let shown = null;

function chosen() {
  return fixed || fromAddress || told || pageSays || (system.matches ? "dark" : "light");
}

function applyTheme() {
  const next = chosen();
  if (next === shown) return;
  shown = next;
  root.classList.toggle("quarto-dark", next === "dark");
  root.classList.toggle("quarto-light", next === "light");
  for (const fn of themeListeners) call(fn, next === "dark");
}

function call(fn, value) {
  try { fn(value); } catch (e) { console.error(e); }
}

if (embedded) {
  pageSays = readPage();
  try {
    const doc = window.parent.document;
    const watch = new MutationObserver(() => { pageSays = readPage(); applyTheme(); });
    const what = { attributes: true, attributeFilter: ["class", "data-bs-theme"] };
    watch.observe(doc.documentElement, what);
    if (doc.body) watch.observe(doc.body, what);
  } catch (e) { /* a page on another site */ }
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.type !== "theme") return;
    told = data.dark ? "dark" : "light";
    applyTheme();
  });
}
system.addEventListener("change", applyTheme);
applyTheme();

export const theme = {
  get dark() { return shown === "dark"; },
  on(fn) {
    themeListeners.add(fn);
    call(fn, shown === "dark");
    return () => themeListeners.delete(fn);
  },
  fix(name) {
    fixed = name === "dark" || name === "light" ? name : null;
    applyTheme();
  },
};

// ---------- colors ----------

export function color(name) {
  return getComputedStyle(root).getPropertyValue(name).trim();
}

let probe = null;   // a 1×1 canvas that turns any CSS color into numbers

export function rgb(name) {
  const value = color(name);
  if (!value) return null;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  if (!probe) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    probe = canvas.getContext("2d", { willReadFrequently: true });
  }
  probe.fillStyle = "#010203";     // left alone if the value is not a color
  probe.fillStyle = value;
  if (probe.fillStyle === "#010203" && value.toLowerCase() !== "#010203") return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

export function rgba(name, alpha = 1) {
  const c = rgb(name);
  if (!c) return color(name);
  const [r, g, b] = c.map((v) => Math.round(v * 255));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------- drags ----------

export function drag(element, { down, move, up } = {}) {
  element.style.touchAction = "none";
  element.style.userSelect = "none";
  element.style.webkitUserSelect = "none";
  let id = null;
  const at = (event) => {
    const r = element.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  };
  const end = (event) => {
    if (event.pointerId !== id) return;
    id = null;
    try { element.releasePointerCapture(event.pointerId); } catch (e) { /* already released */ }
    if (up) up(at(event), event);
  };
  element.addEventListener("pointerdown", (event) => {
    if (id !== null) return;                                        // one pointer at a time
    if (event.pointerType === "mouse" && event.button !== 0) return; // the main button only
    if (down && down(at(event), event) === false) return;
    id = event.pointerId;
    try { element.setPointerCapture(id); } catch (e) { /* the pointer is already gone */ }
  });
  element.addEventListener("pointermove", (event) => {
    if (event.pointerId === id && move) move(at(event), event);
  });
  element.addEventListener("pointerup", end);
  element.addEventListener("pointercancel", end);
  element.addEventListener("lostpointercapture", end);
}

// ---------- fullscreen ----------

const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

export function fullscreen(button, element = root) {
  const enter = element.requestFullscreen || element.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  const enabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (enter && exit && enabled) {
    const sync = () => button.setAttribute("aria-pressed", String(fullscreenElement() === element));
    button.addEventListener("click", () => {
      const result = fullscreenElement() ? exit.call(document) : enter.call(element);
      if (result && result.catch) result.catch((e) => console.warn("fullscreen:", e.message));
    });
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    sync();
    return;
  }
  // No fullscreen for elements here (an iPhone). In a page, the button opens
  // the applet on a page of its own, filling the screen; there, it goes back.
  button.removeAttribute("aria-pressed");
  const sameSite = (() => { try { return window.top.location.origin === location.origin; } catch (e) { return false; } })();
  if (embedded && sameSite) {
    button.title = "Open on a page of its own";
    button.setAttribute("aria-label", "Open the applet on a page of its own");
    button.addEventListener("click", () => {
      const url = new URL(location.href);
      url.searchParams.set("theme", theme.dark ? "dark" : "light");
      url.searchParams.set("back", "1");
      try { window.top.location.href = url.href; } catch (e) { window.open(url.href, "_top"); }
    });
  } else if (!embedded && new URLSearchParams(location.search).get("back") === "1") {
    button.textContent = "✕";
    button.title = "Back";
    button.setAttribute("aria-label", "Back to the page");
    button.addEventListener("click", () => {
      if (history.length > 1) { history.back(); return; }
      const from = document.referrer && new URL(document.referrer).origin === location.origin ? document.referrer : null;
      location.href = from || new URL("../", location.href).href;   // an applet lives in <page>/models/
    });
  } else {
    button.hidden = true;
  }
}

// ---------- on screen ----------

let inView = true;   // until the first report
const isVisible = () => inView && document.visibilityState !== "hidden";
const visibleListeners = new Set();
let wasVisible = isVisible();

function visibilityChanged() {
  const now = isVisible();
  if (now === wasVisible) return;
  wasVisible = now;
  for (const fn of visibleListeners) call(fn, now);
}

if ("IntersectionObserver" in window) {
  // the implicit root is the top page's viewport, so this sees the iframe
  // scrolled out of sight in the page around it
  new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    visibilityChanged();
  }).observe(root);
}
document.addEventListener("visibilitychange", visibilityChanged);

export function visible() {
  return isVisible();
}
visible.on = (fn) => {
  visibleListeners.add(fn);
  return () => visibleListeners.delete(fn);
};

export function onDemand(draw) {
  let wanted = false, queued = false;
  const run = () => {
    queued = false;
    if (!wanted || !isVisible()) return;   // waits for visible.on below
    wanted = false;
    draw();
  };
  const request = () => {
    wanted = true;
    if (!queued) { queued = true; requestAnimationFrame(run); }
  };
  visible.on((now) => { if (now && wanted) request(); });
  return request;
}
