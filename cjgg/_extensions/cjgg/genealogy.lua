--[[
genealogy.lua: the {{< genealogy >}} shortcode (cjgg only): an academic
genealogy, drawn by genealogy.js on the map viewer (graph-view.js).

  {{< genealogy data="genealogy.json" layout="generations" >}}

data     the file department-genealogy's build.py writes, relative to the
         page [genealogy.json]
layout   what a reader sees first: generations, timeline or free (each
         reader's own choice is then remembered) [generations]

Sizes, to tune on the page:
member-size     members' radius, in map units (they're 46 apart) [12]
ancestor-size   ancestors' radius [7]
min-scale       zoomed out, shapes are drawn at least this fraction of
                their size, however small the map (0.4: 40%) [0.4]
edge-width      arrows' width on screen, in pixels; lit, twice that [1.5]

The page gets the map, its data, and the same information as a list:
members by group, each with their degree, Carleton years, advisors back
three generations, and their titles. (A member's note, if the data has one,
is never shown.) The list is the map's List
view, what a screen reader reads, and what's there without JavaScript.

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

-- JSON numbers come back as floats ("2020.0"); years and ids are whole
local function whole(v)
  if type(v) == "number" then return string.format("%d", math.floor(v + 0.5)) end
  if v == nil or v == pandoc.json.null then return nil end
  return tostring(v)
end

local function present(v)
  return v ~= nil and v ~= pandoc.json.null and v ~= ""
end

local function list_html(data)
  local people, advisors = {}, {}
  for _, p in ipairs(data.people or {}) do
    local id = whole(p.id)
    people[id] = p
    advisors[id] = {}
  end
  for _, e in ipairs(data.edges or {}) do
    local a, s = whole(e[1]), whole(e[2])
    if advisors[s] then table.insert(advisors[s], a) end
  end
  local function year_of(id)
    local p = people[id]
    return p and present(p.year) and tonumber(whole(p.year)) or 9999
  end
  local function who(id)
    local p = people[id]
    if not p then return esc(id) end
    local bits = {}
    if present(p.school) then bits[#bits + 1] = esc(p.school) end
    if present(p.year) then bits[#bits + 1] = whole(p.year) end
    return esc(p.name) .. (#bits > 0 and (" (" .. table.concat(bits, ", ") .. ")") or "")
  end
  -- the advisors one, two and three generations back
  local function generations(id)
    local out, current, seen = {}, { id }, { [id] = true }
    for g = 1, 3 do
      local next_gen = {}
      for _, x in ipairs(current) do
        for _, a in ipairs(advisors[x] or {}) do
          if not seen[a] then seen[a] = true; next_gen[#next_gen + 1] = a end
        end
      end
      table.sort(next_gen, function(a, b) return year_of(a) < year_of(b) end)
      if #next_gen == 0 then break end
      out[g] = next_gen
      current = next_gen
    end
    return out
  end
  local labels = { "Advisor", "Two generations back", "Three generations back" }

  local out = { '<div class="cm-list" id="genealogy-list">' }
  for gi, group in ipairs(data.groups or {}) do
    local members = {}
    for _, p in ipairs(data.people or {}) do
      if present(p.member) and p.member.group == group.key then members[#members + 1] = p end
    end
    table.sort(members, function(a, b)
      local sa = present(a.member.start) and a.member.start or 9999
      local sb = present(b.member.start) and b.member.start or 9999
      if sa ~= sb then return sa < sb end
      return tostring(a.name) < tostring(b.name)
    end)
    if #members > 0 then
      out[#out + 1] = '<section class="cm-list-chapter"><h2 class="cm-list-heading">' .. esc(group.label) .. "</h2>"
      out[#out + 1] = '<ul class="cm-list-items">'
      for _, p in ipairs(members) do
        local id, m = whole(p.id), p.member
        local name = present(p.mgp)
          and ('<a href="https://www.mathgenealogy.org/id.php?id=' .. whole(p.mgp) .. '">' .. esc(p.name) .. "</a>")
          or ("<strong>" .. esc(p.name) .. "</strong>")
        local degree = {}
        if present(m.degree) then degree[#degree + 1] = esc(m.degree) end
        if present(p.school) then degree[#degree + 1] = esc(p.school) end
        degree[#degree + 1] = present(p.year) and whole(p.year) or "year unknown"
        local at = nil
        if present(m.start) and present(m["end"]) then
          local s, e = whole(m.start), whole(m["end"])
          at = "at Carleton " .. (s == e and ("during " .. s) or (s .. "–" .. e))
        elseif present(m.start) then at = "at Carleton from " .. whole(m.start)
        elseif present(m["end"]) then at = "at Carleton until " .. whole(m["end"]) end
        local item = {
          '<li class="cm-list-item gv-list-g' .. (gi - 1) .. '" id="cm-item-' .. esc(id) .. '" data-id="' .. esc(id) .. '">',
          '<p class="cm-list-name">' .. name .. "</p>",
          '<p class="gv-list-degree">' .. table.concat(degree, ", ") .. (at and (" · " .. at) or "") .. "</p>",
        }
        local gens = generations(id)
        if not gens[1] then
          item[#item + 1] = '<p class="cm-list-rel">No advisor on record.</p>'
        end
        for g, ids in ipairs(gens) do
          local names = {}
          for _, a in ipairs(ids) do names[#names + 1] = who(a) end
          local label = (g == 1 and #ids > 1) and "Advisors" or labels[g]
          item[#item + 1] = '<p class="cm-list-rel"><span class="cm-list-rel-label">' .. label .. "</span> "
            .. table.concat(names, "; ") .. "</p>"
        end
        local more = {}
        if present(m.titles) then more[#more + 1] = "<p>" .. esc(m.titles):gsub("\n", "<br>") .. "</p>" end
        if present(m.degrees) then more[#more + 1] = "<p>Degrees: " .. esc(m.degrees):gsub("\n", "; ") .. "</p>" end
        if #more > 0 then
          item[#item + 1] = "<details><summary>At Carleton</summary>" .. table.concat(more) .. "</details>"
        end
        item[#item + 1] = "</li>"
        out[#out + 1] = table.concat(item)
      end
      out[#out + 1] = "</ul></section>"
    end
  end
  out[#out + 1] = "</div>"
  return table.concat(out, "\n")
end

return {
  ["genealogy"] = function(args, kwargs, meta)
    if not quarto.doc.is_format("html") then return pandoc.Null() end
    local function opt(key, default)
      local v = kwargs[key] and pandoc.utils.stringify(kwargs[key]) or ""
      return v ~= "" and v or default
    end
    local file = opt("data", "genealogy.json")
    local path = pandoc.path.join({ pandoc.path.directory(quarto.doc.input_file), file })
    local text = read_file(path)
    if not text then
      quarto.log.warning("genealogy: no data file " .. path)
      return pandoc.RawBlock("html", '<p class="genealogy-missing">The genealogy\'s data (' .. esc(file) .. ") is missing.</p>")
    end
    local ok, data = pcall(pandoc.json.decode, text, false)
    if not ok or type(data) ~= "table" then
      quarto.log.warning("genealogy: " .. path .. " isn't valid JSON")
      return pandoc.RawBlock("html", '<p class="genealogy-missing">The genealogy\'s data (' .. esc(file) .. ") can't be read.</p>")
    end
    -- the viewer (shared with any other map on the page), then the genealogy's own part
    quarto.doc.add_html_dependency({
      name = "graph-view",
      version = "0.14.0",
      scripts = { "graph-view.js" },
      stylesheets = { "graph-view.css" },
    })
    quarto.doc.add_html_dependency({
      name = "genealogy",
      version = "0.14.0",
      scripts = { "genealogy.js" },
      stylesheets = { "genealogy.css" },
    })
    local attrs = ""
    for _, key in ipairs({ "layout", "member-size", "ancestor-size", "min-scale", "edge-width" }) do
      local v = opt(key, "")
      if v ~= "" then
        if key ~= "layout" and not tonumber(v) then
          quarto.log.warning("genealogy: " .. key .. "=\"" .. v .. "\" isn't a number; ignored")
        else
          attrs = attrs .. " data-" .. key .. '="' .. esc(v) .. '"'
        end
      end
    end
    return pandoc.RawBlock("html", table.concat({
      '<div class="graph-view genealogy" id="genealogy"' .. attrs .. "></div>",
      list_html(data),
      '<script type="application/json" id="genealogy-data">' .. text:gsub("</", "<\\/") .. "</script>",
    }, "\n"))
  end,
}
