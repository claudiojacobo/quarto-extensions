--[[
figure-links.lua — attach a cell's link output to the image before it.

Code can display an image and then a link marked `.figure-link`, e.g.
    [Explore in 3D ↗](3d/abc.html){.figure-link …}
As two separate outputs, the link takes its own slot in layout-ncol grids and
wraps onto a new row. This filter merges it into the previous output that
contains an image, within the same cell:
  • a captioned image (a figure): the link is appended to the caption, in
    every format (Quarto rebuilds figures from the image alone, so a link
    wrapped around the image would be lost);
  • an uncaptioned image on web pages: the image itself becomes the link,
    with the link text as a small badge in its corner (styled in _cells.scss);
  • an uncaptioned image elsewhere (PDF): the image becomes clickable and
    the link text follows it.
If the link can't be placed, it is left where it was rather than dropped.
The link keeps its classes and attributes, so site-links.lua (which must run
after this filter) still makes it absolute in PDF.
]]

local is_html = FORMAT:match("html") ~= nil or FORMAT:match("revealjs") ~= nil

local function walk(block, filter)       -- pandoc 3 method, or older function
  if block.walk then return block:walk(filter) end
  return pandoc.walk_block(block, filter)
end

-- The Link, if this block is an output holding nothing but a .figure-link.
local function lone_figure_link(block)
  if block.t ~= "Div" or #block.content ~= 1 then return nil end
  local para = block.content[1]
  if para.t ~= "Para" and para.t ~= "Plain" then return nil end
  local link
  for _, il in ipairs(para.content) do
    if il.t == "Link" and il.classes:includes("figure-link") and not link then
      link = il
    elseif il.t ~= "Space" and il.t ~= "SoftBreak" then
      return nil
    end
  end
  return link
end

local function contains_image(block)
  local found = false
  walk(block, { Image = function(img) found = true; return nil end })
  return found
end

-- Returns the rewritten block, and whether the link was placed in it.
local function attach(block, link)
  local function copy_link(content)
    return pandoc.Link(content, link.target, link.title, link.attr)
  end

  -- A captioned image is a Figure. Quarto re-renders figures from the image
  -- alone, so a link wrapped around the image would be dropped; the caption
  -- is kept, so the link goes there (in every format).
  local has_figure = false
  walk(block, { Figure = function(fig) has_figure = true; return nil end })
  if has_figure then
    local placed = false
    local wrapped = walk(block, { Figure = function(fig)
      if placed then return nil end
      local long = fig.caption.long
      if #long > 0 and (long[#long].t == "Plain" or long[#long].t == "Para") then
        long[#long].content:extend({ pandoc.Space(), pandoc.Str("("),
                                     copy_link(link.content), pandoc.Str(")") })
      else
        long:insert(pandoc.Plain({ copy_link(link.content) }))
      end
      fig.caption.long = long
      placed = true
      return fig
    end })
    return wrapped, placed
  end

  -- An uncaptioned image: the image itself becomes the link. On web pages
  -- the link text becomes a corner badge; elsewhere it follows the image.
  local placed = false
  local wrapped = walk(block, { Image = function(img)
    if placed then return nil end
    local inner = { img }
    if is_html then
      inner[#inner + 1] = pandoc.Span(link.content, pandoc.Attr("", { "figure-link-badge" }))
    end
    placed = true
    return copy_link(inner)
  end })
  if placed and not is_html and wrapped.t == "Div" then
    wrapped.content:insert(pandoc.Para({ copy_link(link.content) }))
  end
  return wrapped, placed
end

function Div(cell)
  if not cell.classes:includes("cell") then return nil end
  local out, changed = pandoc.List(), false
  for _, block in ipairs(cell.content) do
    local link = lone_figure_link(block)
    if link then
      for i = #out, 1, -1 do
        if contains_image(out[i]) then
          local rewritten, placed = attach(out[i], link)
          if placed then                    -- only drop the link once it has a new home
            out[i] = rewritten
            link, changed = nil, true
          end
          break
        end
      end
      if link then out:insert(block) end   -- no image before it: leave as is
    else
      out:insert(block)
    end
  end
  if changed then
    cell.content = out
    return cell
  end
end
