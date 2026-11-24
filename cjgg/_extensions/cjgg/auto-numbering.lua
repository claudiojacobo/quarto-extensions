--- Process an H1 header with class 'centered-title' to inject LaTeX homework counters.
-- Finds the document's number or letter in its title, then injects LaTeX code that resets and renumbers exercise, codelisting, and lstlisting counters using it ("Homework 3" → Exercise 3.1, 3.2, …).
--    - A title with "Homework": the word after it, as before 0.17.1 ("Homework 3", "Homework A").
--    - Any other numbered title (not .unnumbered): a number or a single capital letter that
--      ends the title or comes just before a colon ("Problem Set 3", "Tarea B",
--      "Worksheet 2: Limits"). Titles with neither ("Syllabus", "The Great Character Hunt",
--      "What I Learned", "Group Work: A Guide") are left alone.
-- @param el (table) A Pandoc header element (level, classes, content, ...)
-- @return (table|nil) A list containing the original header and a RawBlock with LaTeX code, or nil if the header does not match the criteria.

local function document_id(text)
  local words = {}
  for word in text:gmatch("%S+") do words[#words + 1] = word end
  for i = 2, #words do
    local word = words[i]
    if i == #words or word:sub(-1) == ":" then
      local w = word:gsub("[%.:]+$", "")   -- "3:" → "3"
      if w:match("^%d+$") or w:match("^%u$") then return w end
    end
  end
  return nil
end

function Header(el)
  -- Look for an H1 that has your specific class
  if el.level == 1 and el.classes:includes("centered-title") then
    local text = pandoc.utils.stringify(el)

    local hw_id
    if string.find(text, "Homework") then
      -- The identifier (letter or number) immediately following "Homework "
      hw_id = string.match(text, "Homework%s+(%w+)")
    elseif not el.classes:includes("unnumbered") then
      hw_id = document_id(text)
    end

    if hw_id then
        -- Build the raw LaTeX block to inject.
        -- We use @ifundefined checks across the board so this template can be safely 
        -- reused in courses that do not use custom exercise environments or code blocks.
        local latex_snippet = string.format([[
\pagestyle{plain}
\setcounter{page}{1}

\makeatletter
\@ifundefined{c@exercise}{}{
  \setcounter{exercise}{0}
  \renewcommand{\theexercise}{%s.\arabic{exercise}}
  \renewcommand{\theHexercise}{%s.\arabic{exercise}}
}
\@ifundefined{c@codelisting}{}{
  \setcounter{codelisting}{0}
  \renewcommand{\thecodelisting}{%s.\arabic{codelisting}}
  \renewcommand{\theHcodelisting}{%s.\arabic{codelisting}}
}
\@ifundefined{c@lstlisting}{}{
  \setcounter{lstlisting}{0}
  \renewcommand{\thelstlisting}{%s.\arabic{lstlisting}}
  \renewcommand{\theHlstlisting}{%s.\arabic{lstlisting}}
}
\makeatother
]], hw_id, hw_id, hw_id, hw_id, hw_id, hw_id)
        
        -- Return the original header, immediately followed by our auto-generated LaTeX
        return {el, pandoc.RawBlock('latex', latex_snippet)}
    end
  end
end
