--[[
concept-map.lua — the {{< concept-map >}} shortcode: a map of a book's
definitions, theorems and examples (see "Concept map" in the README).

Reads every chapter listed under `book: chapters:` in _quarto.yml and finds
its definitions, theorems, propositions, lemmas, corollaries and examples
(divs labelled #def-…, #thm-…, …). Each becomes a node of the map, with
  • its number, as Quarto numbers it (per kind, within the chapter),
  • its title (the div's first heading) and statement,
  • its label on the map: the div's label="…" attribute if it has one,
    otherwise its title, otherwise its number ("Proposition 1.2"),
  • a link to it in the notes;
and there is an arrow from A to B when B's line [@… @…]{.uses} lists A.
concept-map.js draws the map from this data, with graph-view.js.

Exercises (#exr-…) are on the map only when they're connected: an exercise
with a .uses line of its own, or one that an item's .uses line lists (a
result students prove in the homework, say). The rest (computations, drill)
stay off. Exercises in the book's appendices (homework, practice exams) are
read too, and named after their assignment: "Homework 3, Exercise 2" (the
second exercise in the file whose title is "Homework 3"); an exercise in a
chapter is "Exercise 2.3", like the other kinds. Any item with the class
.no-map is left off.

Instructor-only content (.solution divs, and anything shown or hidden by
profile: .content-visible when-profile="instructor") is never on the map.

A label="…" is for a title too long for the map, or an item without a title:
  ::: {#prp-ring-basics label="Arithmetic in a ring"}
It may contain math ($…$), as titles may.

Options: {{< concept-map layout="book" outline="false" >}} sets what a
reader sees first (layouts: clusters, depth, book, free; outlines on unless
outline="false"). The reader's own choices are remembered in their browser.

The page also gets the same information as a list (headings by chapter; for
each item its title, what it uses, what uses it, and its statement), as plain
HTML: the map's List view, what a screen reader reads, and what's there
without JavaScript.

Statements are shown as written, with their references resolved here, since
Quarto never sees them: a reference to another item becomes a chip on the
card (a link in the list); one to a chapter or section becomes a link with
its title; a citation ([@DF2004, Prop. 1.1]) becomes "Dummit & Foote,
Prop. 1.1", linked to the references page, from the project's bibliography.
Links are relative to the map's page, wherever it sits in the project.
{{< include … >}} lines in chapters are expanded, so included items count.

The data is collected when the map's page renders. `quarto preview` re-renders
only the page you edit, so render the whole book to update the map.
]]

local KINDS = {
  def = "Definition", thm = "Theorem", prp = "Proposition", lem = "Lemma",
  cor = "Corollary", exm = "Example", cnj = "Conjecture", exr = "Exercise",
}

-- Blocks for the instructor only, which must never reach the map: solutions,
-- and anything shown or hidden by profile.
local function instructor_only(el)
  return el.classes:includes("solution") or el.attributes["when-profile"] ~= nil
    or el.attributes["unless-profile"] ~= nil
end

local function read_file(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local text = f:read("a")
  f:close()
  return text
end

-- {{< include path >}} lines replaced by the file's text (a path starting
-- with / is from the project root; otherwise from the including file's folder).
local function expand_includes(text, root, dir, depth)
  if (depth or 0) > 5 then return text end
  return (text:gsub("{{<%s*include%s+([^%s>]+)%s*>}}", function(path)
    local full = path:sub(1, 1) == "/" and pandoc.path.join({ root, path:sub(2) })
      or pandoc.path.join({ root, dir, path })
    local inner = read_file(full)
    if not inner then return "" end
    return expand_includes(inner, root, pandoc.path.directory(pandoc.path.make_relative(full, root)), (depth or 0) + 1)
  end))
end

-- The project's _quarto.yml: the chapter files of the book, in order (parts
-- flattened), each with the title of its part ("" outside any part), then the
-- appendices' (appendix = true), and the bibliography files.
local function project(root)
  local text = read_file(pandoc.path.join({ root, "_quarto.yml" }))
  if not text then return { chapters = {}, bibliography = {} } end
  local meta = pandoc.read("---\n" .. text .. "\n---\n", "markdown").meta
  local files = {}
  local function walk(list, part, appendix)
    if not list then return end
    for _, item in ipairs(list) do
      local ty = pandoc.utils.type(item)
      if ty == "Inlines" or ty == "string" then
        files[#files + 1] = { file = pandoc.utils.stringify(item), part = part, appendix = appendix }
      elseif ty == "table" then            -- a part: { part = …, chapters = … } (appendices: contents)
        walk(item.chapters or item.contents, item.part and pandoc.utils.stringify(item.part) or part, appendix)
      end
    end
  end
  if meta.book then
    walk(meta.book.chapters, "", false)
    walk(meta.book.appendices, "", true)
  end
  local bib = {}
  local b = meta.bibliography
  if b then
    if pandoc.utils.type(b) == "List" then
      for _, item in ipairs(b) do bib[#bib + 1] = pandoc.utils.stringify(item) end
    else
      bib[1] = pandoc.utils.stringify(b)
    end
  end
  return { chapters = files, bibliography = bib }
end

-- The bibliography's entries, as id -> "Dummit & Foote" (one author: "Lang";
-- three or more: "Artin et al."; no author: the title).
local function read_bibliography(root, files)
  local out = {}
  for _, file in ipairs(files) do
    local text = read_file(pandoc.path.join({ root, file }))
    local ok, doc = pcall(function()
      return text and pandoc.read(text, file:match("%.json$") and "csljson" or "bibtex")
    end)
    if ok and doc and doc.meta.references then
      for _, ref in ipairs(doc.meta.references) do
        local names = {}
        for _, a in ipairs(ref.author or ref.editor or {}) do
          names[#names + 1] = pandoc.utils.stringify(a.family or a.literal or a)
        end
        local who
        if #names == 0 then who = ref.title and pandoc.utils.stringify(ref.title) or pandoc.utils.stringify(ref.id)
        elseif #names == 1 then who = names[1]
        elseif #names == 2 then who = names[1] .. " & " .. names[2]
        else who = names[1] .. " et al." end
        out[pandoc.utils.stringify(ref.id)] = who
      end
    end
  end
  return out
end

local function blank(inlines)
  for _, il in ipairs(inlines) do
    if il.t ~= "Space" and il.t ~= "SoftBreak" and il.t ~= "LineBreak" then return false end
  end
  return true
end

-- Plain text for tooltips and screen readers; math stays TeX, between $…$.
local function plain(inlines)
  return pandoc.utils.stringify(pandoc.Inlines(inlines):walk({
    Math = function(m)
      return pandoc.Str(m.mathtype == "InlineMath" and ("$" .. m.text .. "$") or m.text)
    end,
  }))
end

local function html(blocks)
  local out = pandoc.write(pandoc.Pandoc(blocks), "html", { html_math_method = "mathjax" })
  return (out:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- A theorem-like div's statement without its .uses line, and the ids listed there.
local function split_uses(blocks)
  local uses = {}
  local stripped = pandoc.Blocks(blocks):walk({
    Span = function(span)
      if span.classes:includes("uses") then
        span:walk({ Cite = function(cite)
          for _, c in ipairs(cite.citations) do uses[#uses + 1] = c.id end
        end })
        return {}
      end
    end,
  })
  local out = pandoc.Blocks({})
  for _, b in ipairs(stripped) do
    if not ((b.t == "Para" or b.t == "Plain") and blank(b.content)) then out:insert(b) end
  end
  -- the line break that followed the .uses line, if the statement continued the paragraph
  local first = out[1]
  if first and (first.t == "Para" or first.t == "Plain") then
    while first.content[1] and (first.content[1].t == "SoftBreak" or first.content[1].t == "Space") do
      first.content:remove(1)
    end
  end
  return out, uses
end

-- `root` is the project folder; `page` the map's page, relative to it (links
-- are made relative to the page's folder).
local function collect(root, page)
  local proj = project(root)
  local page_dir = pandoc.path.split(pandoc.path.directory(page))
  local function link_to(file, id)
    -- relative to the page's folder: up out of it, then down to the file
    local target = pandoc.path.split((file:gsub("%.qmd$", ".html")))
    local common = 0
    while common < #page_dir and page_dir[common + 1] ~= "." and page_dir[common + 1] == target[common + 1] do
      common = common + 1
    end
    local parts = {}
    for i = common + 1, #page_dir do if page_dir[i] ~= "." then parts[#parts + 1] = ".." end end
    for i = common + 1, #target do parts[#parts + 1] = target[i] end
    return table.concat(parts, "/") .. (id and id ~= "" and ("#" .. id) or "")
  end

  local chapters, nodes, by_id = {}, {}, {}
  local off = {}                          -- id -> { name, url } of an item left off the map
  local headers = {}                      -- id -> { text = "Chapter 3" or the title, url = … }
  local refs_file = nil                   -- the chapter holding the bibliography (its {#refs} div)
  local number = 0
  for _, entry in ipairs(proj.chapters) do
    local file = entry.file
    local text = read_file(pandoc.path.join({ root, file }))
    if text then
      text = expand_includes(text, root, pandoc.path.directory(file))
      local doc = pandoc.read(text, "markdown")
      doc.blocks = doc.blocks:walk({
        Div = function(div) if instructor_only(div) then return {} end end,
        Span = function(span) if instructor_only(span) then return {} end end,
      })
      local chapter = { file = file, part = entry.part, title = "", titleHtml = "", number = nil,
                        appendix = entry.appendix or nil }
      local h1 = nil
      for _, b in ipairs(doc.blocks) do
        if b.t == "Header" and b.level == 1 then h1 = b; break end
      end
      local title_inlines = h1 and h1.content or (doc.meta.title and pandoc.Inlines(doc.meta.title))
      if title_inlines then
        chapter.title = plain(title_inlines)
        chapter.titleHtml = html({ pandoc.Plain(title_inlines) })
      end
      if entry.appendix then
        -- an assignment: no chapter number; its exercises are named after its title
      elseif h1 and h1.classes:includes("chapter-zero") then
        chapter.number = 0                  -- see chapter-zero.lua
      elseif not (h1 and h1.classes:includes("unnumbered")) then
        number = number + 1
        chapter.number = number
      end
      doc.blocks:walk({
        Header = function(h)
          if h.identifier == "" then return nil end
          local text = (h.level == 1 and chapter.number) and ("Chapter " .. chapter.number) or plain(h.content)
          if h.level == 1 and entry.appendix then text = chapter.title end
          headers[h.identifier] = { text = text, url = link_to(file, h.level == 1 and "" or h.identifier) }
        end,
        Div = function(div)
          if div.identifier == "refs" then refs_file = file end
        end,
      })
      local counters, found = {}, 0
      doc.blocks:walk({
        Div = function(div)
          local prefix = div.identifier:match("^(%a+)%-")
          if not (prefix and KINDS[prefix]) then return nil end
          if entry.appendix and prefix ~= "exr" then return nil end   -- appendices: only exercises
          local blocks = pandoc.Blocks(div.content)
          local title_inlines = nil
          if blocks[1] and blocks[1].t == "Header" then
            title_inlines = blocks[1].content
            blocks:remove(1)
          end
          local statement, uses = split_uses(blocks)
          counters[prefix] = (counters[prefix] or 0) + 1   -- counted even if left off, as Quarto counts
          local num = chapter.number and (chapter.number .. "." .. counters[prefix]) or nil
          local name = KINDS[prefix] .. (num and (" " .. num) or "")
          if entry.appendix then                           -- "Homework 3, Exercise 2"
            name = (chapter.title ~= "" and (chapter.title .. ", ") or "") .. KINDS[prefix] .. " " .. counters[prefix]
          end
          if div.classes:includes("no-map") then
            off[div.identifier] = { name = name, url = link_to(file, div.identifier) }
            return nil
          end
          local label_inlines = title_inlines
          if div.attributes.label and div.attributes.label ~= "" then
            local parsed = pandoc.read(div.attributes.label, "markdown").blocks[1]
            if parsed and parsed.content then label_inlines = parsed.content end
          end
          local node = {
            id = div.identifier,
            kind = prefix,
            name = name,                                   -- "Proposition 1.2"
            title = title_inlines and plain(title_inlines) or "",
            titleHtml = title_inlines and html({ pandoc.Plain(title_inlines) }) or "",
            label = label_inlines and plain(label_inlines) or name,
            labelHtml = label_inlines and html({ pandoc.Plain(label_inlines) }) or name,
            statement = statement,                         -- rendered below, once every id is known
            chapter = chapter,                             -- the table for now; its index below
            url = link_to(file, div.identifier),
            uses = uses,
          }
          nodes[#nodes + 1] = node
          by_id[node.id] = node
          found = found + 1
        end,
      })
      if found > 0 then chapters[#chapters + 1] = chapter end
    end
  end

  -- Arrows: dependency -> the item that uses it. Quarto warns about
  -- references that don't exist when it renders their chapter; the map says
  -- which arrows it had to leave out.
  local edges, unknown = {}, {}
  for _, node in ipairs(nodes) do
    for _, dep in ipairs(node.uses) do
      if by_id[dep] and dep ~= node.id then
        edges[#edges + 1] = { source = dep, target = node.id }
      elseif not by_id[dep] and not off[dep] then
        unknown[#unknown + 1] = node.id .. " uses " .. dep
      end
    end
    node.uses = nil
  end
  if #unknown > 0 then
    quarto.log.warning("concept map: no definition, theorem, example or exercise with these ids: "
      .. table.concat(unknown, "; "))
  end

  -- Exercises only when connected (see the top of this file); then chapters
  -- left with nothing go too, and the rest are numbered in order.
  local linked = {}
  for _, e in ipairs(edges) do linked[e.source] = true; linked[e.target] = true end
  local kept = {}
  for _, node in ipairs(nodes) do
    if node.kind == "exr" and not linked[node.id] then off[node.id] = node; by_id[node.id] = nil
    else kept[#kept + 1] = node end
  end
  nodes = kept
  local used, index = {}, {}
  for _, node in ipairs(nodes) do used[node.chapter] = true end
  local kept_chapters = {}
  for _, ch in ipairs(chapters) do
    if used[ch] then kept_chapters[#kept_chapters + 1] = ch; index[ch] = #kept_chapters end
  end
  chapters = kept_chapters
  for _, node in ipairs(nodes) do
    node.open = node.chapter.appendix and node.chapter.title ~= "" and node.chapter.title or nil
    node.chapter = index[node.chapter]
  end
  for _, ch in ipairs(chapters) do ch.appendix = nil end

  -- Statements, with their references resolved (see the top of this file).
  local bib = read_bibliography(root, proj.bibliography)
  local function resolve(cite)
    local all_nodes = true
    for _, c in ipairs(cite.citations) do if not by_id[c.id] then all_nodes = false end end
    if all_nodes then return nil end                -- chips, made by concept-map.js
    local out = pandoc.Inlines({})
    local in_text = cite.citations[1].mode == "AuthorInText"
    if not in_text then out:insert(pandoc.Str("[")) end
    for i, c in ipairs(cite.citations) do
      if i > 1 then out:insert(pandoc.Str(";")); out:insert(pandoc.Space()) end
      if #c.prefix > 0 then out:extend(c.prefix); out:insert(pandoc.Space()) end
      local h, who = headers[c.id], bib[c.id]
      local item = off[c.id] or by_id[c.id]
      if item then                                  -- an item (in a list with other things), or an exercise not on the map
        out:insert(pandoc.Link(pandoc.Inlines({ pandoc.Str(item.name) }), item.url))
      elseif h then
        out:insert(pandoc.Link(pandoc.Inlines({ pandoc.Str(h.text) }), h.url))
      elseif who then
        local label = pandoc.Inlines({ pandoc.Str(who) })
        out:insert(refs_file and pandoc.Link(label, link_to(refs_file, "ref-" .. c.id)) or pandoc.Span(label))
      else
        out:insert(pandoc.Str(c.id))
      end
      if #c.suffix > 0 then out:extend(c.suffix) end
    end
    if not in_text then out:insert(pandoc.Str("]")) end
    return out
  end
  for _, node in ipairs(nodes) do
    node.statementHtml = html(pandoc.Blocks(node.statement):walk({ Cite = resolve }))
    node.statement = nil
  end

  -- The map assumes no circular dependencies: report any.
  local state, cycle = {}, nil
  local deps = {}
  for _, e in ipairs(edges) do
    deps[e.target] = deps[e.target] or {}
    table.insert(deps[e.target], e.source)
  end
  local function visit(id, path)
    if cycle then return end
    if state[id] == "done" then return end
    if state[id] == "open" then
      local loop, start = {}, false
      for _, p in ipairs(path) do
        if p == id then start = true end
        if start then loop[#loop + 1] = p end
      end
      loop[#loop + 1] = id
      cycle = loop
      return
    end
    state[id] = "open"
    path[#path + 1] = id
    for _, d in ipairs(deps[id] or {}) do visit(d, path) end
    path[#path] = nil
    state[id] = "done"
  end
  for _, node in ipairs(nodes) do visit(node.id, {}) end
  if cycle then
    quarto.log.warning("concept map: circular dependency " .. table.concat(cycle, " -> "))
  end

  return { chapters = chapters, nodes = nodes, edges = edges }
end

local function esc(s)
  return (s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

-- The map as a list, in HTML.
local function list_html(data)
  local by_id, deps, users = {}, {}, {}
  for _, n in ipairs(data.nodes) do by_id[n.id], deps[n.id], users[n.id] = n, {}, {} end
  for _, e in ipairs(data.edges) do
    table.insert(deps[e.target], e.source)
    table.insert(users[e.source], e.target)
  end
  local function relation(label, ids)
    if #ids == 0 then return "" end
    local links = {}
    for _, id in ipairs(ids) do
      links[#links + 1] = '<a href="#cm-item-' .. id .. '">' .. esc(by_id[id].name) .. "</a>"
    end
    return '<p class="cm-list-rel"><span class="cm-list-rel-label">' .. label .. "</span> "
      .. table.concat(links, ", ") .. "</p>"
  end
  local out = { '<div class="cm-list" id="concept-map-list">' }
  for c, ch in ipairs(data.chapters) do
    out[#out + 1] = '<section class="cm-list-chapter"><h2 class="cm-list-heading">'
      .. (ch.number and (ch.number .. " ") or "") .. ch.titleHtml .. "</h2>"
    out[#out + 1] = '<ul class="cm-list-items">'
    for _, n in ipairs(data.nodes) do
      if n.chapter == c then
        out[#out + 1] = table.concat({
          '<li class="cm-list-item cm-list-' .. n.kind .. '" id="cm-item-' .. n.id .. '" data-id="' .. n.id .. '">',
          '<p class="cm-list-name"><a href="' .. esc(n.url) .. '">' .. esc(n.name) .. "</a>"
            .. (n.titleHtml ~= "" and (": " .. n.titleHtml) or "") .. "</p>",
          relation("Uses", deps[n.id]),
          relation("Used by", users[n.id]),
          '<details><summary>Statement</summary><div class="cm-list-statement">' .. n.statementHtml .. "</div></details>",
          "</li>",
        })
      end
    end
    out[#out + 1] = "</ul></section>"
  end
  out[#out + 1] = "</div>"
  return table.concat(out, "\n")
end

return {
  ["concept-map"] = function(args, kwargs, meta)
    if not quarto.doc.is_format("html") then return pandoc.Null() end
    local root = quarto.project.directory or pandoc.path.directory(quarto.doc.input_file)
    local page = pandoc.path.make_relative(quarto.doc.input_file, root)
    local data = collect(root, page)
    local options = {}
    for _, key in ipairs({ "layout", "outline" }) do
      if kwargs[key] then
        local value = pandoc.utils.stringify(kwargs[key])
        if value ~= "" then options[key] = value end
      end
    end
    data.options = options
    -- the viewer (shared with any other map on the page), then the concept map's own part
    quarto.doc.add_html_dependency({
      name = "graph-view",
      version = "0.14.0",
      scripts = { "graph-view.js" },
      stylesheets = { "graph-view.css" },
    })
    quarto.doc.add_html_dependency({
      name = "concept-map",
      version = "0.14.0",
      scripts = { "concept-map.js" },
      stylesheets = { "concept-map.css" },
    })
    local json = pandoc.json.encode(data):gsub("</", "<\\/")
    return pandoc.RawBlock("html", table.concat({
      '<div class="graph-view concept-map" id="concept-map"></div>',
      list_html(data),
      '<script type="application/json" id="concept-map-data">' .. json .. "</script>",
    }, "\n"))
  end,
}
