-- Pandoc filter for building the User Guide as one document (see README.md, "Making a website or a PDF").
-- Run with --file-scope, which prefixes every id with its file ("09-macros.md" becomes "macros.md__…", since an id
-- can't start with a digit) and turns links between chapters into "#file.md__anchor". Two kinds still miss:
--   * a link to a whole chapter, "#file.md": pointed at that chapter's first heading;
--   * an anchor that starts with digits ("#appendix-a-answers.md__02-blank-page"): pandoc dropped the digits from the id.
-- Links to docs outside the User Guide (../cli.md) are left alone: they work on a website that has those pages.
local first = {}

local function collect(h)
  local file = h.identifier:match('^(.-%.md)__')
  if file and not first[file] then first[file] = h.identifier end
end

local function fix(link)
  local file, anchor = link.target:match('^#(.-%.md)__(.*)$')
  if file then
    link.target = '#' .. file .. '__' .. anchor:gsub('^[^%a]+', '')
  else
    file = link.target:match('^#(.-%.md)$')
    if file and first[file] then link.target = '#' .. first[file] end
  end
  return link
end

function Pandoc(doc)
  doc.blocks:walk({ Header = collect })
  return doc:walk({ Link = fix })
end
