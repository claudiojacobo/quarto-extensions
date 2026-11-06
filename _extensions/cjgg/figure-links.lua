--[[
figure-links.lua — attach a cell's link output to the image before it.

Code can display an image and then a link marked `.figure-link`, e.g.
    [Explore in 3D ↗](3d/abc.html){.figure-link …}
As two separate outputs, the link takes its own slot in layout-ncol grids and
wraps onto a new row. This filter merges it into the previous output that
contains an image, within the same cell:
  • web pages: the image itself becomes the link, with the link text as a
    small badge in its corner (styled in _cells.scss);
  • other formats (PDF): the image becomes clickable and the link text is
    added to the figure's caption (or placed just under an uncaptioned image).
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

local function attach(block, link)
  local function copy_link(content)
    return pandoc.Link(content, link.target, link.title, link.attr)
  end
  local wrapped = walk(block, { Image = function(img)
    local inner = { img }
    if is_html then
      inner[#inner + 1] = pandoc.Span(link.content, pandoc.Attr("", { "figure-link-badge" }))
    end
    return copy_link(inner)
  end })
  if is_html then return wrapped end

  -- PDF: put the link text in the figure's caption, so it travels with the
  -- figure if LaTeX floats it; without a caption, place it just after.
  local in_caption = false
  wrapped = walk(wrapped, { Figure = function(fig)
    local long = fig.caption.long
    if #long > 0 and (long[#long].t == "Plain" or long[#long].t == "Para") then
      long[#long].content:extend({ pandoc.Space(), pandoc.Str("("),
                                   copy_link(link.content), pandoc.Str(")") })
    else
      long:insert(pandoc.Plain({ copy_link(link.content) }))
    end
    fig.caption.long = long
    in_caption = true
    return fig
  end })
  if not in_caption and wrapped.t == "Div" then
    wrapped.content:insert(pandoc.Para({ copy_link(link.content) }))
  end
  return wrapped
end

function Div(cell)
  if not cell.classes:includes("cell") then return nil end
  local out, changed = pandoc.List(), false
  for _, block in ipairs(cell.content) do
    local link = lone_figure_link(block)
    if link then
      for i = #out, 1, -1 do
        if contains_image(out[i]) then
          out[i] = attach(out[i], link)
          link, changed = nil, true
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
