--[[
slides.lua — what the slide formats (mathkit-revealjs, cjgg-revealjs) need
from a deck, before pandoc writes it. On every other format it does nothing.

1. Math as on the sites: MathJax 4, with the same macros and settings
(mathjax-config.html).

Quarto's revealjs format typesets with reveal.js's math plugin, which loads
MathJax 2 and ignores mathjax-config.html. So for slides the format sets
`html-math-method: plain` (no plugin, no MathJax 2), and this filter writes
each formula as MathJax 4 expects to find it, `\(...\)` or `\[...\]` in a
`span.math`, exactly as pandoc writes them for web pages, and loads MathJax 4
itself. reveal-support.html lays the slides out again once MathJax is done.

MathJax comes from jsDelivr, as on the sites. For a deck that must run with
no network, a site serves its own copy, named in its _quarto.yml:

    mathjax-url: /vendor/mathjax-4.1.3/tex-chtml.js
    mathjax-fonts: /vendor/mathjax-4.1.3/fonts

mathjax-url is the `mathjax` package's tex-chtml.js (its extensions, such as
mathtools and colortbl, load from beside it); mathjax-fonts is the folder
that holds the font package, as `mathjax-newcm-font/` (MathJax 4 keeps its
fonts apart, and would fetch them from the CDN). Paths from the site's root:
a deck is served, not opened as a file.

Formulas written this way are raw HTML to pandoc, so where pandoc makes plain
text from a caption or a title they would vanish. So first, with the formulas
still formulas: an image gets its caption as alt text, TeX as written, unless
it has alt text of its own (`fig-alt`); and the tab title (pagetitle) keeps
the title's TeX. For a figure that matters beyond the math: Quarto gives a
captioned image no alt text (its caption labels the figure), and when it is
the only image on a slide, Quarto's auto-stretch moves it out of the figure
and its caption into a plain paragraph, which leaves the image unlabeled. A numbered equation's
number is written as on web pages, `\tag{1}` (Quarto writes `\qquad(1)`
after the formula when the math method is plain).

2. A div that opens with a heading below the slide's level stays a div.
Pandoc makes such a div a <section>, which reveal.js takes for a slide (going
to the next slide jumped back to the first). A block's header written as a
heading (`### Title {.block-header}`) becomes the header div it stands for,
marked as a heading one level under the slide's (role="heading",
aria-level); any other div gets an empty HTML comment before its heading,
which keeps the heading and stops the section.

It runs at: post-render (see _extension.yml), after Quarto has numbered
equations and resolved references.
]]

if not quarto.doc.is_format("revealjs") then return {} end

local DEFAULT_URL = "https://cdn.jsdelivr.net/npm/mathjax@4/tex-chtml.js"
local SLIDE_LEVEL = (PANDOC_WRITER_OPTIONS and PANDOC_WRITER_OPTIONS.slide_level) or 2

-- TeX goes into HTML text: escape what HTML would read as markup. MathJax
-- reads the text after the browser has decoded it, so it sees the TeX as written.
local function html_escape(s)
  return (s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"))
end

local function attribute_escape(s)
  return (html_escape(s):gsub('"', "&quot;"))
end

-- Inlines as plain text, each formula as its TeX
local function plain_with_tex(inlines)
  local copy = pandoc.Inlines(inlines):walk({ Math = function(m) return pandoc.Str(m.text) end })
  return pandoc.utils.stringify(copy)
end

local function has_math(inlines)
  local found = false
  pandoc.Inlines(inlines):walk({ Math = function() found = true end })
  return found
end

-- Plain text of a caption (or of a whole figure, its image left out), TeX for formulas
local function caption_text(x)
  if x == nil then return "" end
  local ok, walked = pcall(function()
    return x:walk({ Math = function(m) return pandoc.Str(m.text) end, Image = function() return {} end })
  end)
  local text = pandoc.utils.stringify(ok and walked or x)
  return (text:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- The content with its one image given the caption as alt text, or nil
-- (more than one image, no caption, or alt text already there)
local function label_image(content, caption)
  if content == nil or caption == "" then return nil end
  local images = 0
  content:walk({ Image = function() images = images + 1 end })
  if images ~= 1 then return nil end
  local changed = false
  local result = content:walk({
    Image = function(img)
      if img.attributes["alt"] or img.attributes["fig-alt"] or #img.caption > 0 then return nil end
      img.attributes["alt"] = caption
      changed = true
      return img
    end,
  })
  return changed and result or nil
end

return {
  -- 1a. While the formulas are still formulas
  {
    Image = function(img)
      if img.attributes["alt"] or img.attributes["fig-alt"] or not has_math(img.caption) then return nil end
      img.attributes["alt"] = plain_with_tex(img.caption)
      return img
    end,
    -- A figure's caption labels its one image (Quarto keeps the caption on
    -- the figure, not in the image). Depending on when Quarto renders it, a
    -- figure is its own node (FloatRefTarget), a pandoc Figure, or a
    -- div.quarto-figure around raw <figure> and <figcaption> tags.
    FloatRefTarget = function(float)
      if float.type ~= "Figure" then return nil end
      local content = label_image(float.content, caption_text(float.caption_long))
      if not content then return nil end
      float.content = content
      return float
    end,
    Figure = function(fig)
      local content = label_image(fig.content, caption_text(fig.caption.long))
      if not content then return nil end
      fig.content = content
      return fig
    end,
    Div = function(div)
      if not (div.classes:includes("quarto-figure") or div.classes:includes("quarto-float")) then return nil end
      local content = label_image(div.content, caption_text(div))
      if not content then return nil end
      div.content = content
      return div
    end,
    Span = function(span)
      if not span.identifier:match("^eq%-") then return nil end
      return span:walk({
        Math = function(m)
          if m.mathtype ~= "DisplayMath" then return nil end
          local formula, number = m.text:match("^(.-)%s*\\qquad%s*%((.-)%)%s*$")
          if not formula then return nil end
          m.text = formula .. "\n\\tag{" .. number .. "}"
          return m
        end,
      })
    end,
    Meta = function(meta)
      if meta.pagetitle then
        if type(meta.pagetitle) == "table" and has_math(meta.pagetitle) then
          meta.pagetitle = pandoc.MetaString(plain_with_tex(meta.pagetitle))
          return meta
        end
      elseif meta.title and has_math(meta.title) then
        meta.pagetitle = pandoc.MetaString(plain_with_tex(meta.title))
        return meta
      end
    end,
  },
  -- 1b and 2
  {
    Math = function(m)
      if m.mathtype == "DisplayMath" then
        return pandoc.RawInline("html",
          '<span class="math display">\\[' .. html_escape(m.text) .. "\\]</span>")
      end
      return pandoc.RawInline("html",
        '<span class="math inline">\\(' .. html_escape(m.text) .. "\\)</span>")
    end,
    Div = function(div)
      local first = div.content[1]
      if not (first and first.t == "Header" and first.level > SLIDE_LEVEL) then return nil end
      if first.classes:includes("block-header") then
        local attr = pandoc.Attr(first.identifier, first.classes, first.attributes)
        attr.attributes["role"] = "heading"
        attr.attributes["aria-level"] = tostring(SLIDE_LEVEL + 1)
        div.content[1] = pandoc.Div({ pandoc.Plain(first.content) }, attr)
      else
        div.content:insert(1, pandoc.RawBlock("html", "<!-- -->"))
      end
      return div
    end,
    Meta = function(meta)
      local url = meta["mathjax-url"] and pandoc.utils.stringify(meta["mathjax-url"]) or DEFAULT_URL
      local fonts = meta["mathjax-fonts"] and pandoc.utils.stringify(meta["mathjax-fonts"])
      local lines = {}
      if fonts then
        -- After mathjax-config.html (the header's order), before MathJax runs
        table.insert(lines, "<script>window.MathJax = window.MathJax || {}; MathJax.loader = MathJax.loader || {}; "
          .. "MathJax.loader.paths = Object.assign({}, MathJax.loader.paths, { fonts: " .. quarto.json.encode(fonts) .. " });</script>")
      end
      table.insert(lines, '<script id="MathJax-script" defer src="' .. attribute_escape(url) .. '"></script>')
      quarto.doc.include_text("in-header", table.concat(lines, "\n"))
      return nil
    end,
  },
}
