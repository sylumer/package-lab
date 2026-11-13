// A ZIP reader over the central directory: Map of entry name → Buffer. Stored and deflated entries only (all that
// SCORM packages use); ZIP64 isn't supported.
import { inflateRawSync } from 'node:zlib'

export function unzip(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Not a ZIP file (no end of central directory).')
  const count = buf.readUInt16LE(eocd + 10), files = new Map()
  let p = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged ZIP central directory.')
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20)
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42)
    const raw = buf.subarray(p + 46, p + 46 + nlen), name = (flags & 0x800 ? raw.toString('utf8') : raw.toString('latin1')).replace(/\\/g, '/')
    p += 46 + nlen + xlen + clen
    if (name.endsWith('/')) continue
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), data = buf.subarray(start, start + csize)
    if (method === 0) files.set(name, data)
    else if (method === 8) files.set(name, inflateRawSync(data))
    else throw new Error(`${name} uses compression method ${method}, which isn't supported.`)
  }
  return files
}
