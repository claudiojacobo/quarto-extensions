--[[
deck.lua — reveal.js decks in a site's pages: two shortcodes.

{{< deck slides/lecture-7.qmd >}}: one deck, shown in the page.
  The argument is the deck's source, from the project's root (its .html works
  too). On a web page the deck appears in a 16:9 frame, named for screen
  readers by the deck's own title (the `title:` line of its front matter;
  title="…" gives another), with a link under it to the deck on a page of its
  own. Click into the frame to give the deck the keyboard: F is full screen
  there, Escape the overview. A link in the deck that leaves it opens in the
  whole window, not in the frame (reveal-support.html).

{{< decks slides >}}: a list of every deck in a folder, to open one.
  The argument is the folder, from the project's root (slides/ if none). Each
  .qmd file in it (not those starting with _ or .) is a numbered item: its
  title, linked to the rendered deck, then its subtitle and date, when its
  front matter gives them. Decks with a date (date: 2026-04-01) come first, in
  date order; then the others, by file name.

Both read single-line `title:`, `subtitle:` and `date:` from a deck's front
matter (a value written over several lines isn't read). In other formats
than HTML (PDF) both give nothing: a link for the PDF's readers goes beside
them (site-links.lua). They link to the rendered deck, the .html beside its
source, so the deck must be rendered and copied into the site with the page
(in the course template, slides/ is a project of its own that build.sh
renders first, and the book copies the decks in). A deck not rendered yet
gets a warning.
]]

local MONTHS = { "January", "February", "March", "April", "May", "June", "July",
                 "August", "September", "October", "November", "December" }

local function esc(s)
  return (s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

local function exists(path)
  local f = io.open(path, "r")
  if f then f:close() end
  return f ~= nil
end

-- A YAML value as written on its line: "double" (with \ escapes), 'single'
-- (with '' for '), or plain (a trailing # comment removed).
local function unquote(v)
  local q = v:sub(1, 1)
  if q ~= '"' and q ~= "'" then return (v:gsub("%s+#.*$", "")) end
  local out, i = {}, 2
  while i <= #v do
    local c = v:sub(i, i)
    if q == '"' and c == "\\" then
      out[#out + 1] = v:sub(i + 1, i + 1)
      i = i + 2
    elseif c == q and q == "'" and v:sub(i + 1, i + 1) == "'" then
      out[#out + 1] = "'"
      i = i + 2
    elseif c == q then
      return table.concat(out)
    else
      out[#out + 1] = c
      i = i + 1
    end
  end
  return table.concat(out)
end

-- A deck's front matter, the fields written on one line: { title = …, … }.
local function front_matter(path)
  local fields = {}
  local f = io.open(path, "r")
  if not f then return fields end
  local text = f:read("a")
  f:close()
  local yaml = text:gsub("\r\n", "\n"):match("^%-%-%-[ \t]*\n(.-\n)%-%-%-")
  if not yaml then return fields end
  for line in yaml:gmatch("([^\n]*)\n") do
    local k, v = line:match("^([%w_-]+):%s*(.-)%s*$")
    if k and fields[k] == nil then
      v = unquote(v)
      if v ~= "" then fields[k] = v end
    end
  end
  return fields
end

-- Markdown (a title with $math$, say) as inlines.
local function md(s)
  return pandoc.utils.blocks_to_inlines(pandoc.read(s, "markdown").blocks)
end

local function iso(date)
  return date and date:match("^%d%d%d%d%-%d%d%-%d%d") or nil
end

-- 2026-04-01 as "April 1, 2026"; any other date as written.
local function show_date(date)
  local y, m, d = date:match("^(%d%d%d%d)%-(%d%d)%-(%d%d)")
  if y and MONTHS[tonumber(m)] then return MONTHS[tonumber(m)] .. " " .. tonumber(d) .. ", " .. y end
  return date
end

local function here()
  return pandoc.path.directory(quarto.doc.input_file)
end

local function project_root()
  return quarto.project.directory or here()
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
    local root = project_root()
    local stem = src:gsub("%.[^./]+$", "")
    local source = src:match("%.html$") and (stem .. ".qmd") or src
    local html = stem .. ".html"
    local html_path = pandoc.path.join({ root, html })
    local href = pandoc.path.make_relative(html_path, here(), true)

    local title = kwargs["title"] and pandoc.utils.stringify(kwargs["title"]) or ""
    if title == "" then title = front_matter(pandoc.path.join({ root, source })).title or "Slides" end

    if not exists(html_path) then
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

  ["decks"] = function(args, kwargs, meta)
    if not quarto.doc.is_format("html") then return pandoc.Blocks({}) end
    local folder = args[1] and pandoc.utils.stringify(args[1]) or ""
    folder = folder:gsub("^/+", ""):gsub("/+$", "")
    if folder == "" then folder = "slides" end
    local dir = pandoc.path.join({ project_root(), folder })
    local ok, names = pcall(pandoc.system.list_directory, dir)
    if not ok then
      quarto.log.warning("deck.lua: {{< decks " .. folder .. " >}}: there is no folder " .. folder)
      return pandoc.Blocks({})
    end

    local items = {}
    for _, name in ipairs(names) do
      if name:match("%.qmd$") and not name:match("^[_.]") then
        local stem = name:gsub("%.qmd$", "")
        local html_path = pandoc.path.join({ dir, stem .. ".html" })
        if not exists(html_path) then
          quarto.log.warning("deck.lua: " .. folder .. "/" .. stem .. ".html isn't rendered yet; its link leads nowhere until it is")
        end
        items[#items + 1] = {
          name = name,
          fm = front_matter(pandoc.path.join({ dir, name })),
          href = pandoc.path.make_relative(html_path, here(), true),
        }
      end
    end
    table.sort(items, function(a, b)
      local da, db = iso(a.fm.date), iso(b.fm.date)
      if da and db and da ~= db then return da < db end
      if (da == nil) ~= (db == nil) then return da ~= nil end
      return a.name < b.name
    end)

    if #items == 0 then
      return pandoc.Blocks({ pandoc.Para(md("No decks in `" .. folder .. "/` yet.")) })
    end
    local list = {}
    for _, it in ipairs(items) do
      local line = pandoc.Inlines({ pandoc.Link(md(it.fm.title or it.name), it.href) })
      if it.fm.subtitle then
        line:insert(pandoc.Str(":"))
        line:insert(pandoc.Space())
        line:extend(md(it.fm.subtitle))
      end
      if it.fm.date then
        line:insert(pandoc.Space())
        line:extend(md("(" .. show_date(it.fm.date) .. ")"))
      end
      list[#list + 1] = { pandoc.Plain(line) }
    end
    return pandoc.Blocks({ pandoc.OrderedList(list) })
  end,
}
