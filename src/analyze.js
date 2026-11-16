// Static analysis of a package: its manifest, launch paths and what its scripts say about how they find the LMS
// and what they fetch. Pure: takes the files Map (name → Buffer) from unzip.
import { xmlTree, xKid, xKids, xFind } from './xml.js'
import { detectPacks, packStatic } from './packs/index.js'
import { textOf } from './packs/util.js'
import { parseCmi5, parseTincan, courseProblems, courseManifest } from './cmi5.js'

// A path inside the package from a base folder and an href: '..' and '.' resolved, %XX decoded, query and fragment
// dropped. null for a link to another site or scheme.
export function pkgPath(base, href) {
  let u
  try { u = new URL(href.trim(), 'https://pkg.invalid/' + base.split('/').map(encodeURIComponent).join('/')) } catch { return null }
  if (u.origin !== 'https://pkg.invalid') return null
  try { return decodeURIComponent(u.pathname.slice(1)) } catch { return u.pathname.slice(1) }
}
export const isRemote = href => /^[a-z][a-z0-9+.-]*:|^\/\//i.test(href.trim())
const title = n => !n ? '' : n.kids.length ? xFind(n, 'langstring')?.text ?? n.text : n.text

export function parseManifest(text, base = '') {
  const tree = xmlTree(text), meta = xKid(tree, 'metadata'), schemaversion = (xKid(meta, 'schemaversion')?.text || '').trim()
  const rootBase = base + (tree.attrs.base || ''), resNode = xKid(tree, 'resources'), resBase = rootBase + (resNode?.attrs.base || '')
  const resources = xKids(resNode, 'resource').map(r => {
    const b = resBase + (r.attrs.base || ''), href = r.attrs.href || ''
    return { id: r.attrs.identifier, type: (r.attrs.scormtype || 'asset').toLowerCase(), href, base: b,
      path: href && !isRemote(href) ? pkgPath(b, href) : null, query: href.includes('?') ? href.slice(href.indexOf('?')) : '',
      files: xKids(r, 'file').map(f => pkgPath(b, f.attrs.href || '')), deps: xKids(r, 'dependency').map(d => d.attrs.identifierref) }
  })
  const byId = Object.fromEntries(resources.map(r => [r.id, r]))
  const ns = Object.values(tree.attrs).join(' ')
  const version = /^1\.2$/.test(schemaversion) ? '1.2' : schemaversion ? '2004' : /adlcp_v1p3|imscp_v1p1\b/.test(ns) ? '2004' : '1.2'
  const edition = version === '1.2' ? '' : /4th/i.test(schemaversion) ? '4th' : /3rd/i.test(schemaversion) ? '3rd' : /CAM 1\.3|^1\.3$/i.test(schemaversion) ? '2nd' : ''
  const items = []
  const item = (n, depth) => {
    const res = byId[n.attrs.identifierref], val = (...names) => names.map(x => xKid(n, x)?.text).find(Boolean) || ''
    const obj = xFind(xFind(n, 'sequencing'), 'primaryObjective')
    const it = { id: n.attrs.identifier, title: title(xKid(n, 'title')), depth, resource: n.attrs.identifierref || '', res,
      params: n.attrs.parameters || '', type: res?.type || '', launchData: val('datafromlms'),
      mastery: val('masteryscore') || (obj?.attrs.satisfiedbymeasure === 'true' ? xKid(obj, 'minNormalizedMeasure')?.text : '') || '',
      maxTime: val('maxtimeallowed'), timeLimitAction: val('timelimitaction'), completionThreshold: val('completionThreshold') }
    items.push(it)
    xKids(n, 'item').forEach(k => item(k, depth + 1))
  }
  const orgs = xKids(xKid(tree, 'organizations'), 'organization')
  orgs.forEach(o => xKids(o, 'item').forEach(k => item(k, 0)))
  return { version, edition, schemaversion, title: title(xKid(orgs[0], 'title')), resources, items, namespaces: ns }
}

const TEXT = /\.(js|mjs|html?|json|xml|css|txt)$/i
const SCRIPTY = /\.(js|mjs|html?)$/i

// Line number of an offset in text.
const lineAt = (text, i) => { let n = 1; for (let k = text.indexOf('\n'); k !== -1 && k < i; k = text.indexOf('\n', k + 1)) n++; return n }

// What one script or page says. Each list holds { line, text } snippets, capped per file.
const HOSTS = 'www\\.w3\\.org|ns\\.adobe\\.com|purl\\.org|www\\.imsglobal\\.org|www\\.adlnet\\.org|ltsc\\.ieee\\.org|schemas\\.'
const absolute = hosts => new RegExp(`["'\`](https?:)?\\/\\/(?!${hosts})[a-z0-9.-]+\\.[a-z]{2,}[^"'\`\\s]*["'\`]`, 'gi')
const ABSOLUTE = absolute(HOSTS), ABSOLUTE_XAPI = absolute(HOSTS + '|adlnet\\.gov|w3id\\.org|id\\.tincanapi\\.com|activitystrea\\.ms')
// xapi: the package is cmi5 or Tin Can, whose vocabulary hosts (adlnet.gov, w3id.org…) are identifiers, not sites to reach.
export function scanText(name, text, xapi = false) {
  const out = { api12: [], api04: [], search: [], requests: [], absolute: [], serverPaths: [], hostChecks: [], modeSwitches: [], apiDefine: [], domainSet: [] }
  const add = (list, re, max = 20) => {
    for (const m of text.matchAll(re)) {
      if (list.length >= max) break
      const s = Math.max(0, m.index - 40), e = Math.min(text.length, m.index + m[0].length + 60)
      list.push({ line: lineAt(text, m.index), match: m[0].slice(0, 200), text: text.slice(s, e).replace(/\s+/g, ' ').slice(0, 220) })
    }
  }
  add(out.api12, /\bLMS(Initialize|Finish|GetValue|SetValue|Commit)\b/g)
  add(out.api04, /\bAPI_1484_11\b|\b(Initialize|Terminate)\s*\(\s*["']{2}\s*\)/g)
  add(out.search, /\b(window\.)?(top|opener|parent)\b[\w.]*\.(API|API_1484_11)\b|findAPI|getAPI|scanForAPI|ScanParentsForApi|GetAPI/gi)
  add(out.requests, /\bfetch\s*\(|XMLHttpRequest|\$\.(ajax|get|getJSON|post)\s*\(|axios\.\w+\s*\(|\.open\s*\(\s*["'](GET|POST|PUT)["']/g)
  add(out.absolute, xapi ? ABSOLUTE_XAPI : ABSOLUTE)
  add(out.serverPaths, /["'`]\/(?!\/)(api|content|services?|rest|data|assets|static|player|lms|xyleme|ws|v\d)\b[^"'`\s]*["'`]/gi)
  add(out.hostChecks, /location\.(hostname|host|origin|protocol)\b|document\.domain\b|window\.top\s*(!==|===|!=|==)\s*window/g)
  add(out.domainSet, /\bdocument\.domain\s*=(?!=)/g)
  add(out.apiDefine, /\b(window|self|top|parent)\.(API|API_1484_11)\s*=(?!=)/g)
  add(out.modeSwitches, /\b(isPreview|previewMode|standalone|isStandalone|lmsMode|scormMode|offlineMode|isHosted|useLMS|playerMode|runtimeMode|launchMode)\b/g)
  return out
}

// tool: a rule pack's id to apply whether or not it recognises the package (the Authoring tool option).
export function analyze(files, { tool = null } = {}) {
  const names = [...files.keys()]
  const lower = new Map(names.map(n => [n.toLowerCase(), n]))
  const res = { files: names.length, size: names.reduce((t, n) => t + files.get(n).length, 0), problems: [], fingerprints: [], scan: {} }
  const shallow = re => names.filter(n => re.test(n)).sort((a, b) => a.split('/').length - b.split('/').length)
  const manifests = shallow(/(^|\/)imsmanifest\.xml$/i), cmi5s = shallow(/(^|\/)cmi5\.xml$/i), tincans = shallow(/(^|\/)tincan\.xml$/i)
  // cmi5.xml makes it cmi5, unless an imsmanifest.xml sits higher in the ZIP (a SCORM package that carries a cmi5 sample deeper down);
  // tincan.xml with no imsmanifest.xml makes it Tin Can (xAPI); anything else is SCORM.
  const depth = n => n.split('/').length
  const isCmi5 = cmi5s[0] && (!manifests.length || depth(cmi5s[0]) <= depth(manifests[0]))
  const courseFile = isCmi5 ? cmi5s[0] : manifests.length ? undefined : tincans[0]
  res.format = isCmi5 ? 'cmi5' : courseFile ? 'tincan' : 'scorm'
  const root = (courseFile ?? manifests[0])?.replace(/(imsmanifest|cmi5|tincan)\.xml$/i, '') ?? ''
  res.root = root
  if (courseFile) {
    const kind = res.format === 'cmi5' ? 'cmi5.xml' : 'tincan.xml'
    if (!new RegExp(`(^|/)${kind.replace('.', '\\.')}$`).test(courseFile)) res.problems.push({ code: 'course-case', text: `The course file is named ${courseFile}; it must be ${kind} in lower case.` })
    if (root) res.problems.push({ code: 'course-not-root', text: `${kind} is in ${root}, not at the top of the ZIP. An LMS looks for it there.` })
    try {
      const course = (res.format === 'cmi5' ? parseCmi5 : parseTincan)(files.get(courseFile).toString('utf8'))
      res.course = course; res.manifest = courseManifest(course, root, pkgPath, isRemote)
      res.problems.push(...courseProblems(course))
    } catch (e) { res.problems.push({ code: 'manifest-xml', text: `${kind} isn't well-formed: ${e.message}` }) }
  } else if (!manifests.length) res.problems.push({ code: 'no-manifest', text: 'No imsmanifest.xml in the package.' })
  else {
    if (manifests[0] !== root + 'imsmanifest.xml') res.problems.push({ code: 'manifest-case', text: `The manifest is named ${manifests[0]}; it must be imsmanifest.xml in lower case.` })
    if (root) res.problems.push({ code: 'manifest-not-root', text: `The manifest is in ${root}, not at the top of the ZIP. Most LMSs need it at the top.` })
    try { res.manifest = parseManifest(files.get(manifests[0]).toString('utf8'), root) } catch (e) { res.problems.push({ code: 'manifest-xml', text: `The manifest isn't well-formed XML: ${e.message}` }) }
  }
  const m = res.manifest
  if (m) {
    const rid = id => res.format === 'scorm' ? id : `“${id}”`   // an AU's id is course content: quoted, so a redacted report masks it
    for (const r of m.resources) {
      if (r.path && !files.has(r.path)) {
        const ci = lower.get(r.path.toLowerCase())
        res.problems.push(ci ? { code: 'launch-case', text: `Resource ${rid(r.id)} launches ${r.path}, but the ZIP has ${ci}. Paths are case-sensitive on most servers.` }
          : { code: 'launch-missing', text: `Resource ${rid(r.id)} launches ${r.path}, which isn't in the package.` })
      }
      for (const f of r.files) if (f && !files.has(f) && !lower.has(f.toLowerCase())) res.problems.push({ code: 'file-missing', text: `Resource ${rid(r.id)} lists ${f}, which isn't in the package.` })
      if (r.href && isRemote(r.href)) res.problems.push({ code: 'launch-remote', text: `Resource ${rid(r.id)} launches ${r.href}, on another site: the package depends on that site being reachable.` })
    }
    if (res.format === 'scorm' && !m.items.some(i => i.type === 'sco')) res.problems.push({ code: 'no-sco', text: 'No item launches a SCO: assets never talk to the LMS, so no API calls or progress are expected.' })
  }
  const all = { api12: 0, api04: 0 }
  for (const n of names) {
    if (!TEXT.test(n) || files.get(n).length > 20e6) continue
    const text = textOf(files, n)   // decoded once and shared with the packs
    if (!SCRIPTY.test(n)) continue
    const s = scanText(n, text, res.format !== 'scorm')
    all.api12 += s.api12.length; all.api04 += s.api04.length
    if (Object.values(s).some(l => l.length)) res.scan[n] = s
  }
  res.apiUse = all.api12 && all.api04 ? 'both' : all.api12 ? '1.2' : all.api04 ? '2004' : 'none'
  // Authoring tools and wrappers are recognised by the rule packs (src/packs); their static findings are kept for staticFindings.
  res.tool = tool
  res.packs = detectPacks(res, files, tool)
  res.fingerprints = res.packs.map(p => p.name)
  res.packFindings = packStatic(res, files, res.packs)
  return res
}
