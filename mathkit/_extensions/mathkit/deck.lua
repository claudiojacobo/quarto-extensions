--[[
deck.lua — {{< deck slides/lecture-7.qmd >}}: a reveal.js deck shown in a page.

The argument is the deck's source, from the project's root (its .html works
too). On a web page the deck appears in a 16:9 frame, named for screen
readers by the deck's own title (the `title:` line of its front matter;
title="…" gives another), with a link under it to the deck on a page of its
own. Click into the frame to give the deck the keyboard: F is full screen
there, Escape the overview. A link in the deck that leaves it opens in the
whole window, not in the frame (reveal-support.html). In other formats (PDF)
the shortcode gives nothing: a link for the PDF's readers goes beside it
(site-links.lua).

The frame shows the rendered deck, the .html beside its source, so the deck
must be rendered and copied into the site with the page (in the course
template, slides/ is a project of its own that build.sh renders first, and
the book copies the decks in). A deck not rendered yet gets a warning.
]]

local function esc(s)
  return (s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

-- The title in a deck's front matter: its first `title:` line, unquoted.
-- (A title written over several lines isn't read: give title="…" instead.)
local function deck_title(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local text = f:read("a")
  f:close()
  local yaml = text:gsub("\r\n", "\n"):match("^%-%-%-[ \t]*\n(.-\n)%-%-%-")
  if not yaml then return nil end
  for line in yaml:gmatch("([^\n]*)\n") do
    local v = line:match("^title:%s*(.-)%s*$")
    if v then
      v = v:match('^"(.*)"$') or v:match("^'(.*)'$") or v
      return v ~= "" and v or nil
    end
  end
  return nil
end

return {
  ["deck"] = function(args, kwargs, meta)
    if not quarto.doc.is_format("html") then return pandoc.Blocks({}) end
    local src = args[1] and pandoc.utils.stringify(args[1]) or ""
    src = src:gsub("^/+", "")
    if src == "" then
      quarto.log.warning("deck.lua: name the deck's source, as {{< deck slides/lecture-7.qmd >}}")
      return pandoc.Blocks({})
    end
    local root = quarto.project.directory or pandoc.path.directory(quarto.doc.input_file)
    local stem = src:gsub("%.[^./]+$", "")
    local source = src:match("%.html$") and (stem .. ".qmd") or src
    local html = stem .. ".html"
    local html_path = pandoc.path.join({ root, html })
    local href = pandoc.path.make_relative(html_path, pandoc.path.directory(quarto.doc.input_file), true)

    local title = kwargs["title"] and pandoc.utils.stringify(kwargs["title"]) or ""
    if title == "" then title = deck_title(pandoc.path.join({ root, source })) or "Slides" end

    local f = io.open(html_path, "r")
    if f then
      f:close()
    else
      quarto.log.warning("deck.lua: " .. html .. " isn't rendered yet; the frame stays empty until it is")
    end

    local t, h = esc(title), esc(href)
    return pandoc.RawBlock("html", table.concat({
      '<div class="mk-deck">',
      '<iframe src="' .. h .. '" title="Slides: ' .. t .. '" loading="lazy" allow="fullscreen" allowfullscreen'
        .. ' style="display: block; width: 100%; aspect-ratio: 16 / 9; border: 1px solid var(--bs-border-color, #dee2e6); border-radius: 0.375rem;"></iframe>',
      '<p class="mk-deck-link" style="margin-top: 0.5rem;"><a href="' .. h .. '">' .. t .. "</a>: the slides on a page of their own."
        .. " In the frame, click the slides to use their keys (<kbd>F</kbd> full screen, <kbd>Esc</kbd> overview).</p>",
      "</div>",
    }, "\n"))
  end,
}
