// Small Markdown to HTML renderer for the docs panel. Line-based blocks, one inline function, no DOM.
// Covers what the repo's docs use: headings, paragraphs, nested lists, fenced code, tables, code/bold/italic/links/images.
// Not CommonMark: no raw HTML, blockquotes or rules; underscores are never emphasis.
// Images are drawn from PNG data: URIs (docs.js inlines them for the panel) or relative paths; any other source shows its alt text.
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const SAFE = /^(https?:|mailto:|[^:]*$)/i // http(s), mailto, or no scheme (relative path, #anchor)
const IMG_SRC = /^(data:image\/png;base64,|(?!\/\/)[^:]*$)/i   // not a protocol-relative //host address

function inline(raw) {
  const code = []
  const hold = html => '\u0001' + (code.push(html) - 1) + '\u0001'   // kept out of the emphasis and link rules
  let s = esc(raw).replace(/`([^`]+)`/g, (_, c) => hold('<code>' + c + '</code>'))
  s = s.replace(/!\[([^\]\u0001]*)\]\(([^)\s]+)\)/g, (_, alt, src) => hold(IMG_SRC.test(src) ? `<img alt="${alt}" src="${src}">` : alt))
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\s][^*]*?)\*/g, '<em>$1</em>')
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) => SAFE.test(h) ? `<a href="${h}">${t}</a>` : `<a>${t}</a>`)
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => code[i])
}

const cells = l => l.trim().replace(/\\\|/g, '\u0000').replace(/^\||\|$/g, '').split('|').map(c => c.replace(/\u0000/g, '|').trim())
const LIST = /^(\s*)([-*]|\d+\.)\s+(.*)$/
const indent = l => l.match(/^ */)[0].length

// The anchor a heading gets. `seen` counts one document's headings, so a repeat gets -1, -2 … (pass the same {} for each heading of a document).
export function slugOf(t, seen = {}) {
  const base = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/ /g, '-')
  const n = seen[base] = seen[base] === undefined ? -1 : seen[base] + 1
  return n < 0 ? base : base + '-' + (n + 1)
}

// prefix goes before every heading id, so a doc heading can never take the id of an element in the page around it.
export function markdown(text, prefix = '') {
  const seen = {}
  const slug = t => slugOf(t, seen)

  function blocks(lines) {
    let out = '', i = 0
    const starts = l => /^#{1,6}\s/.test(l) || /^\s*```/.test(l) || LIST.test(l) || /^\|/.test(l)
    while (i < lines.length) {
      const l = lines[i]
      let m
      if (!l.trim()) { i++; continue }
      if ((m = l.match(/^\s*```(\w*)/))) { // fenced code; drop the fence's own indent from the body
        const pad = indent(l), body = []
        for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i].slice(Math.min(pad, indent(lines[i]))))
        i++
        out += `<pre><code${m[1] ? ` class="language-${m[1]}"` : ''}>${esc(body.join('\n'))}</code></pre>\n`
      } else if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*$/))) {
        out += `<h${m[1].length} id="${prefix}${slug(m[2])}">${inline(m[2])}</h${m[1].length}>\n`; i++
      } else if (/^\|/.test(l) && /^\|?\s*:?-+/.test(lines[i + 1] || '')) {
        const head = cells(l), rows = []
        for (i += 2; i < lines.length && /^\|/.test(lines[i]); i++) rows.push(cells(lines[i]))
        const tr = (r, t) => '<tr>' + r.map(c => `<${t}>${inline(c)}</${t}>`).join('') + '</tr>'
        out += `<table><thead>${tr(head, 'th')}</thead><tbody>${rows.map(r => tr(r, 'td')).join('')}</tbody></table>\n`
      } else if ((m = l.match(LIST))) {
        const b = m[1].length, tag = /\d/.test(m[2]) ? 'ol' : 'ul', items = []
        while (i < lines.length) {
          const im = lines[i].match(LIST)
          if (!im || im[1].length !== b) break
          const body = [im[3]], col = b + im[2].length + 1
          for (i++; i < lines.length; i++) {
            const nx = lines.slice(i).find(x => x.trim())
            if (lines[i].trim() ? indent(lines[i]) <= b : !nx || indent(nx) <= b) break
            body.push(lines[i].slice(Math.min(col, indent(lines[i]))))
          }
          items.push('<li>' + blocks(body).trim().replace(/^<p>(.*?)<\/p>\n?/s, '$1') + '</li>')
        }
        out += `<${tag}>${items.join('')}</${tag}>\n`
      } else {
        const p = []
        for (; i < lines.length && lines[i].trim() && (!p.length || !starts(lines[i])); i++) p.push(lines[i].trim())
        out += `<p>${inline(p.join(' '))}</p>\n`
      }
    }
    return out
  }
  return blocks(String(text).replace(/\r\n?/g, '\n').split('\n'))
}

// The headings of a document, with the ids markdown() gives them (no prefix). Heading lines inside code fences are not headings.
export function headings(md) {
  const seen = {}, out = []
  let fence = false
  for (const l of String(md).replace(/\r\n?/g, '\n').split('\n')) {
    let m
    if (/^\s*```/.test(l)) fence = !fence
    else if (!fence && (m = l.match(/^(#{1,6})\s+(.*?)\s*#*$/))) out.push({ level: m[1].length, text: m[2].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, ''), id: slugOf(m[2], seen) })
  }
  return out
}

// Case-insensitive search over docs [{ name, title, text }]: up to 20 hits, the first in each line, as
// { name, title, heading, id, html }. heading and id are the nearest heading above (or ''). html is ~80 characters
// around the match with the match in <mark>; everything is escaped before the tag goes in, so doc text never becomes markup.
export function searchDocs(texts, query, max = 20) {
  const q = String(query).trim().toLowerCase(), out = []
  if (!q) return out
  for (const { name, title, text } of texts) {
    const seen = {}
    let fence = false, heading = '', id = ''
    for (const raw of String(text).replace(/\r\n?/g, '\n').split('\n')) {
      let line = raw.replace(/\(data:[^)]*\)/g, '()'), m   // an inlined image's data is not text to search
      if (/^\s*```/.test(raw)) fence = !fence
      else if (!fence && (m = raw.match(/^(#{1,6})\s+(.*?)\s*#*$/))) { line = m[2]; heading = headings(raw)[0].text; id = slugOf(m[2], seen) }
      const i = line.toLowerCase().indexOf(q)   // ponytail: offsets assume lowercasing keeps lengths (true outside a few odd letters)
      if (i < 0) continue
      const a = Math.max(0, i - 40), b = Math.min(line.length, i + q.length + 40)
      out.push({ name, title, heading, id, html: esc(line.slice(a, i)).replace(/^/, a ? '…' : '') + '<mark>' + esc(line.slice(i, i + q.length)) + '</mark>' + esc(line.slice(i + q.length, b)) + (b < line.length ? '…' : '') })
      if (out.length >= max) return out
    }
  }
  return out
}

// Mac key symbols as words, off the Mac: keysFor(false, '⌥⌘I') is 'Ctrl+Alt+I'. Only a modifier run followed by a key is changed,
// and only in prose: fenced code, inline code and headings (whose text makes the anchors) are left as written.
const keyRun = s => s.replace(/([⌃⌥⇧⌘]+)([A-Z0-9.,])(?![A-Za-z])/g, (_, m, k) => [['⌘', 'Ctrl'], ['⌃', 'Ctrl'], ['⌥', 'Alt'], ['⇧', 'Shift']].filter(([c]) => m.includes(c)).map(x => x[1]).filter((v, i, a) => a.indexOf(v) === i).concat(k).join('+'))
export const keysFor = (mac, s) => {
  if (mac) return s
  let fence = false
  return String(s).split('\n').map(l => {
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return l }
    return fence || /^#{1,6}\s/.test(l) ? l : l.split(/(`+[^`]*`+)/).map((p, i) => i % 2 ? p : keyRun(p)).join('')
  }).join('\n')
}
