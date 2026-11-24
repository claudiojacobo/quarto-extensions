--- An H1 with class 'centered-title' starts a document of its own in the PDF:
-- a homework, an exam, a handout, the syllabus.
--    - A new page, numbered 1 (the document's own page numbers).
--    - A named destination on that page, mathkit-doc.1, mathkit-doc.2, …: the
--      mark by which a splitter (the course template's .scripts/chopper.py)
--      finds where each document starts, with no guessing from titles.
--    - A table-of-contents entry at chapter level (which is also its bookmark),
--      and the title, centered, bold and large, in place of a numbered heading.
-- On web pages the heading is left alone.
-- @param el (table) A Pandoc header element (level, classes, content, ...)
-- @return (table|nil) A RawBlock (LaTeX), or nil if the header does not match.

local documents = 0

function Header(el)
  if el.level == 1 and el.classes:includes('centered-title') then

    if FORMAT:match('latex') then
      documents = documents + 1
      local title_text = pandoc.utils.stringify(el)
      local tex = "\\clearpage\n" ..
                  "\\setcounter{page}{1}\n" ..
                  "\\phantomsection\n" ..
                  "\\hypertarget{mathkit-doc." .. documents .. "}{}\n" ..
                  "\\addcontentsline{toc}{chapter}{" .. title_text .. "}\n" ..
                  "\\begin{center}\\huge\\bfseries " .. title_text .. "\\end{center}\n" ..
                  "\\vspace{1em}"
      return pandoc.RawBlock('tex', tex)
    end

  end
end
