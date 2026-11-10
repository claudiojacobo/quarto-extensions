--[[
curriculum.lua: the {{< curriculum >}} shortcode (cjgg only): a map of the
math courses and their prerequisites, drawn by curriculum.js on the map
viewer (graph-view.js).

  {{< curriculum data="curriculum.json" layout="area"
                 catalog="https://www.carleton.edu/math-stats/courses/" >}}

data     the file curriculum-map's `visualize.py --export` writes, relative
         to the page [curriculum.json]
layout   what a reader sees first: area, sequence or free (each reader's own
         choice is then remembered) [area]
catalog  a page listing every course under a heading "MATH 236: …"; each
         course's card links to its heading there (a text fragment,
         #:~:text=MATH%20236%3A). No link without it.

The page gets the map, its data, and the same information as a list: the
courses by area, each with its areas, prerequisites (in words: "MATH 236
and (MATH 210 or MATH 211)") and what it leads to, linked within the list.
The list is the map's List view, what a screen reader reads, and what's
there without JavaScript.

`quarto preview` doesn't notice a changed data file: save the page too, or
render.
]]

local function read_file(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local text = f:read("a")
  f:close()
  return text
end

local function esc(s)
  return (tostring(s):gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

local function present(v)
  return v ~= nil and v ~= pandoc.json.null and v ~= ""
end

local function list(v)
  return type(v) == "table" and v or {}
end

-- for a text fragment: everything but letters, digits and . _ ~ percent-encoded
-- ("-" too: a text fragment reads it as a separator)
local function fragment(s)
  return (s:gsub("[^%w%._~]", function(c) return string.format("%%%02X", c:byte()) end))
end

local function color_of(a)
  local name = present(a.color) and tostring(a.color) or nil
  local hex = present(a.hex) and tostring(a.hex) or nil
  if hex and not hex:match("^#%x+$") then hex = nil end
  if name and name:match("^[%a][%w%-]*$") then
    return "var(--ctp-" .. name .. (hex and (", " .. hex) or "") .. ")"
  end
  return hex or "var(--cm-edge, #adb5bd)"
end

local function list_html(data, catalog)
  local areas, area_of = {}, {}
  for i, a in ipairs(list(data.areas)) do
    areas[i] = a
    area_of[tostring(a.id)] = a
  end
  local courses, by_id = list(data.courses), {}
  for _, c in ipairs(courses) do by_id[tostring(c.id)] = c end
  local function code(id)
    local c = by_id[id]
    if not c then return esc(id) end
    return esc(present(c.code) and c.code or c.name or id)
  end
  local function link(id)
    if not by_id[id] then return code(id) end
    return '<a href="#cm-item-' .. esc(id) .. '">' .. code(id) .. "</a>"
  end
  -- what each course leads to: the courses that list it, required or as an alternative
  local leads = {}
  for _, c in ipairs(courses) do
    local seen = {}
    local function add(p)
      p = tostring(p)
      if seen[p] then return end
      seen[p] = true
      leads[p] = leads[p] or {}
      table.insert(leads[p], tostring(c.id))
    end
    for _, p in ipairs(list(c.requires)) do add(p) end
    for _, g in ipairs(list(c.oneOf)) do for _, p in ipairs(list(g)) do add(p) end end
  end
  -- "MATH 236 and (MATH 210 or MATH 211)", linked; as visualize.py's prereqText
  local function prerequisites(c)
    local parts = {}
    for _, p in ipairs(list(c.requires)) do parts[#parts + 1] = link(tostring(p)) end
    local groups = list(c.oneOf)
    local function group(g)
      local xs = {}
      for _, p in ipairs(list(g)) do xs[#xs + 1] = link(tostring(p)) end
      return table.concat(xs, " or ")
    end
    if #parts == 0 and #groups == 1 then return group(groups[1]) end
    for _, g in ipairs(groups) do parts[#parts + 1] = "(" .. group(g) .. ")" end
    if #parts <= 2 then return table.concat(parts, " and ") end
    return table.concat(parts, ", ", 1, #parts - 1) .. " and " .. parts[#parts]
  end
  local function item(c)
    local id = tostring(c.id)
    local first = area_of[tostring(list(c.areas)[1])]
    local out = {
      '<li class="cm-list-item" id="cm-item-' .. esc(id) .. '" data-id="' .. esc(id) .. '"'
        .. (first and (' style="border-left-color: ' .. color_of(first) .. '"') or "") .. ">",
      '<p class="cm-list-name">' .. (present(c.code) and ("<strong>" .. esc(c.code) .. "</strong> ") or "")
        .. esc(c.name or id) .. "</p>",
    }
    if c.varies == true then
      out[#out + 1] = '<p class="cm-list-rel">A topics course: its title and topic change from year to year.</p>'
    end
    local names = {}
    for _, aid in ipairs(list(c.areas)) do
      local a = area_of[tostring(aid)]
      if a then
        names[#names + 1] = (present(a.icon) and tostring(a.icon):match("^[%a][%w%-]*$")
          and ('<i class="bi bi-' .. a.icon .. '" aria-hidden="true" style="--cur-b: ' .. color_of(a) .. '"></i>') or "")
          .. esc(a.name)
      end
    end
    if #names > 0 then
      out[#out + 1] = '<p class="cm-list-rel cur-list-areas"><span class="cm-list-rel-label">'
        .. (#names > 1 and "Areas" or "Area") .. "</span> " .. table.concat(names, ", ") .. "</p>"
    end
    local pre = prerequisites(c)
    out[#out + 1] = '<p class="cm-list-rel"><span class="cm-list-rel-label">Prerequisites</span> '
      .. (pre ~= "" and pre or "none listed here (see the catalog)") .. "</p>"
    if leads[id] then
      local xs = {}
      for _, u in ipairs(leads[id]) do xs[#xs + 1] = link(u) end
      out[#out + 1] = '<p class="cm-list-rel"><span class="cm-list-rel-label">Leads to</span> '
        .. table.concat(xs, ", ") .. "</p>"
    end
    if catalog and present(c.code) then
      out[#out + 1] = '<p class="cm-list-rel"><a href="' .. esc(catalog:gsub("#.*$", "")) .. "#:~:text="
        .. fragment(tostring(c.code) .. ":") .. '">Catalog description</a></p>'
    end
    out[#out + 1] = "</li>"
    return table.concat(out)
  end

  -- a section per area (a course in several areas: under the first), then any without one
  local out = { '<div class="cm-list" id="curriculum-list">' }
  local sections = {}
  for _, a in ipairs(areas) do sections[#sections + 1] = { id = tostring(a.id), name = a.name, items = {} } end
  local other = { name = "Other courses", items = {} }
  local index = {}
  for _, s in ipairs(sections) do index[s.id] = s end
  for _, c in ipairs(courses) do
    local s = index[tostring(list(c.areas)[1])] or other
    s.items[#s.items + 1] = item(c)
  end
  sections[#sections + 1] = other
  for _, s in ipairs(sections) do
    if #s.items > 0 then
      out[#out + 1] = '<section class="cm-list-chapter"><h2 class="cm-list-heading">' .. esc(s.name) .. "</h2>"
      out[#out + 1] = '<ul class="cm-list-items">' .. table.concat(s.items, "\n") .. "</ul></section>"
    end
  end
  out[#out + 1] = "</div>"
  return table.concat(out, "\n")
end

return {
  ["curriculum"] = function(args, kwargs, meta)
    if not quarto.doc.is_format("html") then return pandoc.Null() end
    local function opt(key, default)
      local v = kwargs[key] and pandoc.utils.stringify(kwargs[key]) or ""
      return v ~= "" and v or default
    end
    local file = opt("data", "curriculum.json")
    local path = pandoc.path.join({ pandoc.path.directory(quarto.doc.input_file), file })
    local text = read_file(path)
    if not text then
      quarto.log.warning("curriculum: no data file " .. path)
      return pandoc.RawBlock("html", '<p class="curriculum-missing">The course map\'s data (' .. esc(file) .. ") is missing.</p>")
    end
    local ok, data = pcall(pandoc.json.decode, text, false)
    if not ok or type(data) ~= "table" or type(data.courses) ~= "table" then
      quarto.log.warning("curriculum: " .. path .. " isn't a course map (curriculum-map's --export)")
      return pandoc.RawBlock("html", '<p class="curriculum-missing">The course map\'s data (' .. esc(file) .. ") can't be read.</p>")
    end
    if data.version ~= 1 then
      quarto.log.warning("curriculum: " .. path .. " is version " .. tostring(data.version) .. "; this shortcode reads version 1")
    end
    local catalog = opt("catalog", nil)
    if catalog and not catalog:match("^https?://") then
      quarto.log.warning("curriculum: catalog=\"" .. catalog .. "\" isn't a web address; ignored")
      catalog = nil
    end
    -- the viewer (shared with any other map on the page), then the course map's own part
    quarto.doc.add_html_dependency({
      name = "graph-view",
      version = "0.13.0",
      scripts = { "graph-view.js" },
      stylesheets = { "graph-view.css" },
    })
    quarto.doc.add_html_dependency({
      name = "curriculum",
      version = "0.13.0",
      scripts = { "curriculum.js" },
      stylesheets = { "curriculum.css" },
    })
    local attrs = ""
    local layout = opt("layout", nil)
    if layout then attrs = attrs .. ' data-layout="' .. esc(layout) .. '"' end
    if catalog then attrs = attrs .. ' data-catalog="' .. esc(catalog) .. '"' end
    return pandoc.RawBlock("html", table.concat({
      '<div class="graph-view curriculum" id="curriculum"' .. attrs .. "></div>",
      list_html(data, catalog),
      '<script type="application/json" id="curriculum-data">' .. text:gsub("</", "<\\/") .. "</script>",
    }, "\n"))
  end,
}
