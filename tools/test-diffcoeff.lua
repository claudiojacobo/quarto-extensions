-- Tests for mathkit/_extensions/mathkit/diffcoeff.lua. Run from the repository root:
--     texlua tools/test-diffcoeff.lua
-- Each case: diffcoeff input, and the plain TeX MathJax should receive.
package.path = "mathkit/_extensions/mathkit/?.lua;" .. package.path
local dc = require("diffcoeff")

local cases = {
  -- Claudio's LaTeXiT checks against the real package
  { [[\diff{f}{x}]],          [[\frac{\mathrm{d} f}{\mathrm{d} {x}}]] },
  { [[\diff[n+1]{f}{x}]],     [[\frac{\mathrm{d}^{n+1} f}{\mathrm{d} {x}^{n+1}}]] },
  { [[\diffp[2]{f}{x}]],      [[\frac{\partial^{2} f}{\partial {x}^{2}}]] },
  { [[\diffp[2,3]{f}{x,y}]],  [[\frac{\partial^{5} f}{\partial {x}^{2}\,\partial {y}^{3}}]] },
  { [[\difc[2]{f}{x,y}]],     [[\mathrm{d}_{x}^{2} \mathrm{d}_{y} f]] },
  { [[\difcp{f}{x}]],         [[\partial_{x} f]] },
  { [[\dl{x}]],               [[\mathop{}\!\mathrm{d}x]] },
  { [[\dl{x,y,z}]],           [[\mathop{}\!\mathrm{d}x\,\mathop{}\!\mathrm{d}y\,\mathop{}\!\mathrm{d}z]] },
  -- more forms
  { [[\diffp{f}{x,y}]],       [[\frac{\partial^{2} f}{\partial {x}\,\partial {y}}]] },
  { [[\diff{}{t}]],           [[\frac{\mathrm{d}}{\mathrm{d} {t}}]] },
  { [[\diff{y}{x}[0]=1]],     [[\left.\frac{\mathrm{d} y}{\mathrm{d} {x}}\right|_{0}=1]] },
  { [[\diffp[m,2]{u}{s,t}]],  [[\frac{\partial^{m+2} u}{\partial {s}^{m}\,\partial {t}^{2}}]] },
  { [[\int_0^1 \cos x \dl{x}]], [[\int_0^1 \cos x \mathop{}\!\mathrm{d}x]] },
  { [[\diff{\Norm{v}}{t}]],   [[\frac{\mathrm{d} \Norm{v}}{\mathrm{d} {t}}]] },   -- nested braces
  { [[\diff{x_1}{t}]],        [[\frac{\mathrm{d} x_1}{\mathrm{d} {t}}]] },
  { [[\delta + \dlp{Q}]],     [[\delta + \dlp{Q}]] },                            -- other macros untouched
  { [[\diff*{f}{x}]],         [[\diff*{f}{x}]] },                                -- unsupported: unchanged
}

-- LaTeX side: bracketed commands get braces; others are untouched.
local protect_cases = {
  { [[y = \diff[2]{y}{t} + 9y]],   [[y = {\diff[2]{y}{t}} + 9y]] },
  { [[\diffp[2,3]{f}{x,y}]],       [[{\diffp[2,3]{f}{x,y}}]] },
  { [[\diff{y}{x}[0]=1]],          [[{\diff{y}{x}[0]}=1]] },
  { [[\diff{y}{x} + \dl{x}]],      [[\diff{y}{x} + \dl{x}]] },
  { [[[a,b] \diffp{f}{x}]],        [[[a,b] \diffp{f}{x}]] },
}

local failed = 0
for n, c in ipairs(protect_cases) do
  local got = dc.protect(c[1])
  if got ~= c[2] then
    failed = failed + 1
    print(("FAIL protect %d  %s\n    want %s\n    got  %s"):format(n, c[1], c[2], got))
  end
end
for n, c in ipairs(cases) do
  local got = dc.expand(c[1])
  if got ~= c[2] then
    failed = failed + 1
    print(("FAIL %2d  %s\n    want %s\n    got  %s"):format(n, c[1], c[2], got))
  end
end
local total = #cases + #protect_cases
print(("%d/%d passed"):format(total - failed, total))
os.exit(failed == 0 and 0 or 1)
