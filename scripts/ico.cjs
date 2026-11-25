// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// An ICO file holding PNG images: a 6-byte header, one 16-byte entry per image, then the PNG bytes. `pngs` is [{ size, data }] (size 1 to 256 px, square).
module.exports = function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length)
  head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4)   // type 1 = icon
  let offset = head.length
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i
    head[e] = head[e + 1] = size >= 256 ? 0 : size   // 0 means 256
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6)   // planes, bits per pixel
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([head, ...pngs.map(p => p.data)])
}
