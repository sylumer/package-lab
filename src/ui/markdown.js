// Small Markdown to HTML renderer for the docs panel. Line-based blocks, one inline function, no DOM.
// Covers what the repo's docs use: headings, paragraphs, nested lists, fenced code, tables, code/bold/italic/links.
// Not CommonMark: no images, raw HTML, blockquotes or rules; underscores are never emphasis.
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const SAFE = /^(https?:|mailto:|[^:]*$)/i // http(s), mailto, or no scheme (relative path, #anchor)

function inline(raw) {
  const code = []
  let s = esc(raw).replace(/`([^`]+)`/g, (_, c) => '\u0001' + (code.push('<code>' + c + '</code>') - 1) + '\u0001')
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\s][^*]*?)\*/g, '<em>$1</em>')
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) => SAFE.test(h) ? `<a href="${h}">${t}</a>` : `<a>${t}</a>`)
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => code[i])
}

const cells = l => l.trim().replace(/\\\|/g, '\u0000').replace(/^\||\|$/g, '').split('|').map(c => c.replace(/\u0000/g, '|').trim())
const LIST = /^(\s*)([-*]|\d+\.)\s+(.*)$/
const indent = l => l.match(/^ */)[0].length

export function markdown(text) {
  const seen = {}
  const slug = t => {
    const base = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '').toLowerCase()
      .replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/ /g, '-')
    const n = seen[base] = seen[base] === undefined ? -1 : seen[base] + 1
    return n < 0 ? base : base + '-' + (n + 1)
  }

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
        out += `<h${m[1].length} id="${slug(m[2])}">${inline(m[2])}</h${m[1].length}>\n`; i++
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
