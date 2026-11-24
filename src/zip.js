// A ZIP reader over the central directory: Map of entry name → Buffer. Stored and deflated entries only (all that
// SCORM packages use); ZIP64 isn't supported.
import * as zlib from 'node:zlib'
import { inflateRawSync, deflateRawSync } from 'node:zlib'

export const MAX_UNZIPPED = 2 * 1024 ** 3   // inflated bytes, all entries together

export function unzip(buf, max = MAX_UNZIPPED) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Not a ZIP file (no end of central directory).')
  const count = buf.readUInt16LE(eocd + 10), files = new Map()
  let p = buf.readUInt32LE(eocd + 16), budget = max
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged ZIP central directory.')
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20)
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42)
    const raw = buf.subarray(p + 46, p + 46 + nlen), name = (flags & 0x800 ? raw.toString('utf8') : raw.toString('latin1')).replace(/\\/g, '/')
    p += 46 + nlen + xlen + clen
    if (name.endsWith('/')) continue
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), data = buf.subarray(start, start + csize)
    if (method === 0) files.set(name, data)
    else if (method === 8) {   // capped, so a few KB that inflate to many GB (a zip bomb) can't exhaust memory
      let out
      try { out = inflateRawSync(data, { maxOutputLength: Math.max(1, budget) }) } catch (e) { if (e.code === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError) throw new Error(`The package unzips to more than ${+(max / 1024 ** 3).toFixed(1)} GB, so it can't be opened.`); throw e }
      budget -= out.length; files.set(name, out)
    }
    else throw new Error(`${name} uses compression method ${method}, which isn't supported.`)
  }
  return files
}

// CRC-32 of a buffer: zlib's when this Node has it (22.2+), otherwise a table (also exported, so tests can check both agree).
let table
export function crc32Table(buf) {
  table ??= Uint32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0 })
  let c = 0xffffffff
  for (const x of buf) c = table[(c ^ x) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
export const crc32 = zlib.crc32 ?? crc32Table

// A ZIP from a Map of entry name → Buffer, in the Map's order. Each entry is deflated, or stored when that isn't
// smaller. Names with characters outside ASCII carry the UTF-8 flag. ZIP64 isn't written: 65,535 entries and 4 GB at most.
// ponytail: whole archive built in memory; stream to a file if packages near the 4 GB limit matter.
export function zip(files, date = new Date()) {
  const time = date.getHours() << 11 | date.getMinutes() << 5 | date.getSeconds() >> 1
  const day = Math.max(0, date.getFullYear() - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate()
  const parts = [], central = []
  let offset = 0
  if (files.size > 0xffff) throw new Error('Too many files for a ZIP (65,535 at most).')
  for (const [name] of files) if (!name || /^[/\\]|^[a-z]:|\\|[\x00-\x1f\x7f]/i.test(name) || name.split('/').includes('..')) throw new Error(`Won’t write the unsafe ZIP entry name ${JSON.stringify(name)}.`)
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name, 'utf8'), flags = /^[\x20-\x7e]*$/.test(name) ? 0 : 0x800
    const crc = crc32(data), packed = data.length ? deflateRawSync(data) : data
    const stored = packed.length >= data.length, body = stored ? data : packed, method = stored ? 0 : 8
    if (offset + body.length > 0xfffffffe || data.length > 0xfffffffe) throw new Error('The package is too big for a ZIP without ZIP64 (4 GB).')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10); local.writeUInt16LE(day, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); local.copy(c, 6, 4, 30); c.writeUInt32LE(offset, 42)   // version made by, then the local header's fields from "version needed" on
    c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32)
    parts.push(local, nameBuf, body); central.push(c, nameBuf)
    offset += 30 + nameBuf.length + body.length
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, dir, end])
}
