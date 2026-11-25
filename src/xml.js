// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// A small XML parser for manifests: { name (local, no prefix), attrs (local names, lower case), kids, text }.
// No DTDs or entities beyond the five predefined ones and numeric references.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescape = s => s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m)
const local = n => n.slice(n.indexOf(':') + 1)

export function xmlTree(text) {
  const root = { name: '#root', attrs: {}, kids: [], text: '' }, stack = [root]
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  for (const m of text.replace(/^﻿/, '').matchAll(re)) {
    const top = stack[stack.length - 1]
    if (m[1] !== undefined) top.text += m[1]
    else if (m[3]) {
      if (stack.length < 2 || top.name !== local(m[3])) throw new Error(`Unexpected </${m[3]}>.`)
      top.text = top.text.trim(); stack.pop()
    } else if (m[4]) {
      const attrs = {}
      for (const a of m[5].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[local(a[1]).toLowerCase()] = unescape(a[2] ?? a[3])
      const node = { name: local(m[4]), attrs, kids: [], text: '' }
      top.kids.push(node)
      if (!m[6]) stack.push(node)
    } else if (m[7]) top.text += unescape(m[7])
  }
  if (stack.length > 1) throw new Error(`<${stack[stack.length - 1].name}> isn't closed.`)
  if (!root.kids.length) throw new Error('No XML elements found.')
  return root.kids[0]
}
const eq = (a, b) => a.toLowerCase() === b.toLowerCase()
export const xKid = (n, name) => n?.kids.find(k => eq(k.name, name))
export const xKids = (n, name) => n?.kids.filter(k => eq(k.name, name)) ?? []
export function xFind(n, name) {
  if (!n) return undefined
  for (const k of n.kids) { if (eq(k.name, name)) return k; const f = xFind(k, name); if (f) return f }
}
