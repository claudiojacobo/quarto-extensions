--[[
collapse-solutions.lua — a solution that opens when asked for.

    ::: {.solution collapse="true"}
    Differentiate the outer function, then …
    :::

On web pages (and slides) this becomes the browser's own disclosure,
<details> with "Solution" as its <summary>: closed until the reader clicks
it, or reaches it with Tab and presses Enter or Space; screen readers
announce it as collapsed or expanded. No script is involved. (Quarto's
collapsible callouts, `collapse="true"` on a callout, can't be reached from
the keyboard.) `collapse="false"` gives the same thing, open at first.
`title="Hint"` changes the word on the line.

Everywhere else (PDF) nothing changes: the solution is Quarto's ordinary
one, printed in full. To keep solutions out of the PDF, wrap them in
`:::: {.content-visible when-format="html"}` as usual.

It is styled as solutions are (_theorems.scss: `details.proof.solution`).

It runs at: post-render (see _extension.yml). Quarto takes hold of solutions
before any filter of ours can (a filter at pre-quarto never sees the div), so
this one works on what Quarto has made of it: a div with the classes `proof
solution`, still carrying `collapse`, whose first paragraph begins with the
label Quarto wrote (`<span class="proof-title"><em>Solution</em>. </span>`).
That label, in the document's language, becomes the summary.
]]

local function escape(s)
  return (s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

-- Take Quarto's label off the front of the first paragraph; return its text.
local function take_label(blocks)
  local first = blocks[1]
  if not first or (first.t ~= "Para" and first.t ~= "Plain") then return nil end
  local span = first.content[1]
  if not span or span.t ~= "Span" or not span.classes:includes("proof-title") then return nil end
  local label = pandoc.utils.stringify(span):gsub("[%s%.:]+$", "")
  first.content:remove(1)
  while first.content[1] and first.content[1].t == "Space" do first.content:remove(1) end
  if #first.content == 0 then blocks:remove(1) end
  return label
end

function Div(el)
  local collapse = el.attributes["collapse"]
  if collapse == nil or not el.classes:includes("solution") then return nil end
  if not FORMAT:match("html") and not FORMAT:match("revealjs") then return nil end
  local label = take_label(el.content)
  local title = el.attributes["title"] or label or "Solution"
  local id = el.identifier ~= "" and (' id="' .. escape(el.identifier) .. '"') or ""
  local open = (collapse == "false") and " open" or ""
  local blocks = pandoc.Blocks({
    pandoc.RawBlock("html", '<details class="proof solution"' .. id .. open .. '>\n<summary><span class="proof-title">'
      .. escape(title) .. '</span></summary>'),
  })
  blocks:extend(el.content)
  blocks:insert(pandoc.RawBlock("html", "</details>"))
  return blocks
end
