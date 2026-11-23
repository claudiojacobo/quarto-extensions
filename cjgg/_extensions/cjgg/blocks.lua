-- blocks.lua
-- PDF only: turns `::: {.block-note}` divs (any `block-*` class except
-- block-header) into \begin{block-note}{Title} ... \end{block-note}, the
-- tcolorbox environments in blocks.tex. The title is the content of an inner
-- `::: {.block-header}` div, or of a heading with that class
-- (`## Title {.block-header}`), kept as formatted text so that math, emphasis
-- and citations in it are typeset normally (pandoc.utils.stringify would hand
-- LaTeX raw TeX outside math mode, e.g. `\int`, and fail).
-- In every format: a block name retired in 0.17.0 is drawn in the color it had
-- (the class is renamed), with a warning naming the block to use instead.
local RETIRED = {
  ["block-info"] = { "block-cyan", "block-idea" },
  ["block-success"] = { "block-green", "block-method" },
  ["block-attention"] = { "block-yellow", "block-yellow" },
  ["block-warning"] = { "block-orange", "block-caution" },
  ["block-danger"] = { "block-red", "block-caution" },
  ["block-note"] = { "block-purple", "block-aside" },
  ["block-scholar"] = { "block-research", "block-research" },
}

local function retire(el)
  local changed = false
  for i, class in ipairs(el.classes) do
    local r = RETIRED[class]
    if r then
      local header = ""
      for _, child in ipairs(el.content) do
        if (child.t == "Div" or child.t == "Header") and child.classes:includes("block-header") then
          header = " (\"" .. pandoc.utils.stringify(child):sub(1, 40) .. "\")"
          break
        end
      end
      quarto.log.warning(class .. header .. " was retired in mathkit 0.17.0 and is drawn as " .. r[1]
        .. ": use " .. r[2] .. (r[2] ~= r[1] and (", or " .. r[1] .. " for the color alone") or "")
        .. " (\"Blocks and theorems\" in the mathkit README)")
      el.classes[i] = r[1]
      changed = true
    end
  end
  return changed
end

function Div(el)
  local changed = retire(el)
  -- If we are NOT rendering to PDF/LaTeX, nothing more to do
  if not FORMAT:match 'latex' and not FORMAT:match 'pdf' then
    return changed and el or nil
  end
  -- Hunt for any class that starts with 'block-' EXCEPT 'block-header'
  local block_type = nil
  for _, class in ipairs(el.classes) do
    if class:match("^block%-") and class ~= "block-header" then
      block_type = class
      break
    end
  end
  -- If it's not one of our container blocks, leave it alone.
  if not block_type then return nil end
  -- Separate the header (if any) from the content.
  local title = pandoc.Inlines({})
  local new_content = pandoc.Blocks({})
  for _, child in ipairs(el.content) do
    if child.t == "Div" and child.classes:includes("block-header") then
      title = pandoc.utils.blocks_to_inlines(child.content)
    elseif child.t == "Header" and child.classes:includes("block-header") then
      title = child.content
    else
      new_content:insert(child)
    end
  end
  -- \begin{block-x}{<title>} as a paragraph, so the title stays formatted text
  local opening = pandoc.Inlines({ pandoc.RawInline('latex', '\\begin{' .. block_type .. '}{') })
  opening:extend(title)
  opening:insert(pandoc.RawInline('latex', '}'))
  new_content:insert(1, pandoc.Plain(opening))
  new_content:insert(pandoc.RawBlock('latex', '\\end{' .. block_type .. '}'))
  return pandoc.Div(new_content)
end
