--[[
school-slides.lua — cjgg slides: the title slide, and every section heading
marked .part-slide, get the school blue as their background:

    # Part 1 {.part-slide}

The color is read from this extension's _palette.scss ("school-primary" in
$site-light), the one place the palette lives, and written as a color
(#003069), not as var(--school-primary): reveal.js reads a slide's
background to decide whether the slide number and the menu button go light
over it, and it cannot read a CSS variable. (Set in the format's YAML
instead, `var(--school-primary)` would also have its "--" turned into a dash.)
A document or heading that sets its own background keeps it. Slides only.
]]

if not quarto.doc.is_format("revealjs") then return {} end

local function school_primary()
  -- quarto.utils.resolve_path: a file beside this script, in the extension
  local path = (quarto.utils and quarto.utils.resolve_path and quarto.utils.resolve_path("_palette.scss"))
    or pandoc.path.join({ pandoc.path.directory(PANDOC_SCRIPT_FILE), "_palette.scss" })
  local f = io.open(path, "r")
  if not f then return "var(--school-primary)" end
  local text = f:read("a")
  f:close()
  return text:match('"school%-primary":%s*(#%x+)') or "var(--school-primary)"
end

local BLUE = school_primary()

return {
  {
    Header = function(h)
      if h.classes:includes("part-slide") and not h.attributes["background-color"] then
        h.attributes["background-color"] = BLUE
        return h
      end
    end,
    Meta = function(meta)
      local attrs = meta["title-slide-attributes"]
      if attrs == nil then
        meta["title-slide-attributes"] = pandoc.MetaMap({ ["data-background-color"] = pandoc.MetaString(BLUE) })
        return meta
      elseif type(attrs) == "table" and attrs["data-background-color"] == nil then
        attrs["data-background-color"] = pandoc.MetaString(BLUE)
        meta["title-slide-attributes"] = attrs
        return meta
      end
    end,
  },
}
