--[[
web-only.lua — chapters that exist only on the website.

A book renders only its chapters, so a web-only page (the concept map) has to
be one. Mark its title `# Title {.unnumbered .web-only}`; in every format
other than HTML, this filter removes that chapter, from its heading up to the
next chapter or part, so the PDF has no trace of it.

What it looks for, in a book's PDF (seen in Quarto 1.11's AST): a numbered
chapter's heading sits in the document's top-level blocks, but an unnumbered
chapter's is wrapped in a Div of its own (with its table-of-contents entry),
and its text follows that Div; a part is a Div `.quarto-book-part` (older
Quarto: raw `\part{…}`). So a chapter starts at a level-1 heading or at a Div
wrapping one, and the filter works on the top-level blocks.

It runs at: post-render (see _extension.yml), after Quarto has numbered the
chapters and resolved cross-references. Raw blocks are kept even inside the
web-only chapter: before each chapter's title sits a marker
(`<!-- quarto-file-metadata: … -->`) that tells Quarto which file, and so
which chapter number, the content belongs to; removing the next chapter's
would leave it unnumbered and its @sec- label unresolved.
]]

if quarto.doc.is_format("html") then return {} end

-- The level-1 heading a top-level block is, or wraps.
local function chapter_heading(b)
  if b.t == "Header" and b.level == 1 then return b end
  if b.t == "Div" then
    for _, c in ipairs(b.content) do
      if c.t == "Header" and c.level == 1 then return c end
    end
  end
  return nil
end

local function starts_part(b)
  return (b.t == "Div" and b.classes:includes("quarto-book-part"))
      or (b.t == "RawBlock" and b.text:match("\\part[%*{%[]") ~= nil)
end

return {
  {
    Pandoc = function(doc)
      local out, skipping = pandoc.Blocks({}), false
      for _, b in ipairs(doc.blocks) do
        local h = chapter_heading(b)
        if h then
          skipping = h.classes:includes("web-only")
        elseif skipping and starts_part(b) then
          skipping = false
        end
        if not skipping or b.t == "RawBlock" then out:insert(b) end
      end
      doc.blocks = out
      return doc
    end,
  },
}
