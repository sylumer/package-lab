// SCORM Driver (Rustici). The layout and indexAPI.html's strContentLocation are from the vendor docs (docs/packs/scormdriver.md).
// strLMSStandard's values are not in those docs, so that rule is info; "SCORM" is read as 1.2 and "SCORM2004" as 2004.
import { score, named, textOf, dirOf, resolve, apiCalls, lookups } from './util.js'

const lineOf = (t, i) => t.slice(0, i).split('\n').length

export default {
  id: 'scormdriver', name: 'SCORM Driver (Rustici)',
  detect: (a, files) => score(files, [['name', /(^|\/)scormdriver\/indexAPI\.html$/i, 0.9], ['text', /\bstrContentLocation\b/, 0.8], ['name', /scormdriver\.js$/i, 0.6], ['text', /scormdriver|Rustici/i, 0.3]]),
  staticRules({ analysis: a, files }) {
    const out = [], m = a.manifest
    for (const n of named(files, /(^|\/)scormdriver[^/]*\.js$/i)) {
      const t = textOf(files, n), s = /\bstrLMSStandard\s*=\s*["']([^"']*)["']/.exec(t)
      if (s && m) {
        const v = /2004/.test(s[1]) ? '2004' : /^scorm$/i.test(s[1]) ? '1.2' : null
        if (v !== m.version) out.push({ sev: 'info', basis: 'pattern', title: v ? `strLMSStandard is "${s[1]}" (read as SCORM ${v}), but the manifest says SCORM ${m.version}` : `strLMSStandard is "${s[1]}", and the manifest says SCORM ${m.version}`,
          detail: v ? 'The driver looks for the API of the standard it is set to, so a mismatch could mean it finds nothing in an LMS that offers the manifest’s version. The reading of the value ("SCORM" as 1.2, "SCORM2004" as 2004) is not from the vendor docs read for these notes.'
            : 'SCORM Lab does not know what this value selects, so it can only point out that it is not one it reads as SCORM 1.2 or 2004.',
          evidence: [`${n}:${lineOf(t, s.index)}  ${s[0]}`, `imsmanifest.xml: SCORM ${m.version}`],
          fix: 'Check the driver’s configuration against the SCORM version you published; run it to see which API it looks for.' })
        break
      }
    }
    for (const n of named(files, /(^|\/)indexAPI\.html$/i)) {
      const t = textOf(files, n), s = /\bstrContentLocation\s*=\s*["']([^"']+)["']/.exec(t)
      const to = s && resolve(dirOf(n), s[1])
      if (to !== null && s && !files.has(to) && !new Set([...files.keys()].map(k => k.toLowerCase())).has(to.toLowerCase()))
        out.push({ sev: 'warn', basis: 'package', title: 'indexAPI.html points to a start page that isn’t in the package',
          detail: 'The driver loads the course from strContentLocation. With no file there it shows a blank frame.',
          evidence: [`${n}:${lineOf(t, s.index)}  ${s[0]}`, `${to} is not in the package`], fix: 'Point strContentLocation at the real start page (or name the start page index.html).' })
    }
    return out
  },
  runRules({ analysis: a }, trace) {
    const asked = (trace.requests ?? []).some(r => /scormdriver\.js|indexAPI\.html/i.test(r.url) && r.status < 400)
    return asked && !apiCalls(trace).length && !lookups(trace).length ? [{ sev: 'info', basis: 'run', title: 'the driver loaded but nothing looked for the LMS',
      detail: 'The driver’s files were requested, yet no API lookup or call happened. The driver may be set not to use an LMS, or it stopped before it got there.',
      evidence: ['scormdriver.js or indexAPI.html was requested; no API lookup or call'], fix: 'Check strLMSStandard in the driver’s configuration, and the uncaught errors in this run.' }] : []
  },
  notes: 'docs/packs/scormdriver.md',
  sources: ['https://docs.rusticisoftware.com/driver/index.html', 'https://rusticisoftware.com/products/rustici-driver/', 'https://rusticisoftware.com/resource-product-type/rustici-driver/'],
}
