// Rule packs (P3.2): one synthetic package per tool, built here from the notes' layouts (docs/packs), and hand-made
// traces for the run rules. Pure: no Electron. Imported by test.js.
import assert from 'node:assert/strict'
import { analyze } from '../src/analyze.js'
import { staticFindings, runFindings } from '../src/rules.js'
import { PACKS, detectPacks, packRun } from '../src/packs/index.js'
import { normaliseOptions, cliCommand } from '../src/options.js'
import { readFileSync } from 'node:fs'

const man = (version = '1.2', ...hrefs) => `<?xml version="1.0"?><manifest identifier="m" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
<metadata><schema>ADL SCORM</schema><schemaversion>${version === '2004' ? '2004 4th Edition' : '1.2'}</schemaversion></metadata>
<organizations default="o"><organization identifier="o"><title>t</title>${hrefs.map((h, i) => `<item identifier="i${i}" identifierref="r${i}"><title>t${i}</title></item>`).join('')}</organization></organizations>
<resources>${hrefs.map((h, i) => `<resource identifier="r${i}" type="webcontent" adlcp:scormtype="sco" href="${h}"><file href="${h}"/></resource>`).join('')}</resources></manifest>`
const pkg = o => new Map(Object.entries(o).map(([k, v]) => [k, Buffer.from(v)]))
const page = (script = '') => `<!doctype html><html><body><script>${script}</script></body></html>`

// [pack id, files, a title that must come out]
const cases = {
  xyleme: [{ 'imsmanifest.xml': man('1.2', 'index.html'), 'index.html': page('fetch("/api/player/config"); // Xyleme player') }, /^Xyleme: the content expects its platform at the server root/],
  storyline: [{ 'imsmanifest.xml': man('1.2', 'story.html'), 'story.html': page(), 'story_content/data.js': 'var a=1' }, /^Articulate Storyline: story\.html is here but there is no scormdriver\.js/],
  rise: [{ 'tincan.xml': '<tincan/>', 'scormcontent/index.html': page(), 'scormcontent/assets/a.png': 'x' }, /^Articulate Rise: this looks like an xAPI export/],
  captivate: [{ 'imsmanifest.xml': man('1.2', 'index_scorm.html'), 'index_scorm.html': page(), 'assets/CPM.js': 'var cp={}', 'scorm_support.js': 'var x' }, /^Adobe Captivate: the package has an older Captivate SCORM support file/],
  ispring: [{ 'imsmanifest.xml': man('1.2', 'res/a.html', 'res/b.html'), 'res/a.html': page('// iSpring'), 'res/b.html': page() }, /^iSpring: the manifest has 2 SCOs/],
  lectora: [{ 'imsmanifest.xml': man('1.2', 'a001index.html'), 'a001index.html': page(), 'course.awt': 'x' }, /^Lectora: the ZIP holds a Lectora source project/],
  adapt: [{ 'imsmanifest.xml': man('2004', 'index.html'), 'index.html': page(), 'course/config.json': JSON.stringify({ _spoor: { _isEnabled: false, _advancedSettings: { _scormVersion: '1.2' } } }) }, /^Adapt: tracking is off/],
  dominknow: [{ 'index.html': page('// dominKnow ONE') }, /^dominKnow: there is no imsmanifest\.xml/],
  evolve: [{ 'imsmanifest.xml': man('2004', 'index.html'), 'index.html': page('var evolveauthoring = 1') }, /^Evolve: the package is SCORM 2004/],
  scormdriver: [{ 'imsmanifest.xml': man('2004', 'scormdriver/indexAPI.html'), 'scormdriver/indexAPI.html': page('var strContentLocation = "../scormcontent/index.html"'), 'scormdriver/scormdriver.js': 'var strLMSStandard = "SCORM"' }, /^SCORM Driver \(Rustici\): strLMSStandard is "SCORM" \(read as SCORM 1\.2\), but the manifest says SCORM 2004/],
  pipwerks: [{ 'imsmanifest.xml': man('1.2', 'index.html'), 'index.html': page(), 'js/SCORM_API_wrapper.js': 'var pipwerks = {}; pipwerks.SCORM = {}' }, /^pipwerks SCORM wrapper: the wrapper is in the package, but no script calls SCORM\.init/],
}
assert.deepEqual(Object.keys(cases).sort(), PACKS.map(p => p.id).sort(), 'packs: a fixture for every pack')
for (const p of PACKS) assert.ok(p.name && p.notes && p.sources.length && typeof p.detect === 'function' && typeof p.staticRules === 'function' && typeof p.runRules === 'function', 'packs: shape of ' + p.id)
for (const [id, [files, title]] of Object.entries(cases)) {
  const m = pkg(files), a = analyze(m), pack = PACKS.find(p => p.id === id)
  assert.ok(a.packs.some(d => d.id === id && d.confidence > 0 && d.confidence <= 1), 'packs: detected ' + id + ': ' + JSON.stringify(a.packs))
  assert.ok(a.fingerprints.includes(pack.name), 'packs: fingerprint ' + id)
  const f = staticFindings(a).find(x => title.test(x.title))
  assert.ok(f, `packs: ${id} rule: ` + staticFindings(a).map(x => x.title))
  assert.equal(f.pack, id); assert.ok(/Confidence: /.test(f.detail), 'packs: says how sure')
  if (f.basis === 'pattern') assert.equal(f.sev, 'info', 'packs: a pattern rule is info: ' + id)
}
assert.deepEqual(detectPacks({ manifest: null, scan: {} }, pkg({ 'imsmanifest.xml': 'x', 'a.html': page('document.querySelectorAll("a")') })), [], 'packs: nothing found in a plain package')

// Adapt: the config rules in turn.
const adaptTitles = (version, spoor) => staticFindings(analyze(pkg({ 'imsmanifest.xml': man(version, 'index.html'), 'index.html': page(), 'build/course/config.json': JSON.stringify({ _spoor: spoor }) }))).filter(f => f.pack === 'adapt')
const at = adaptTitles('2004', {})
assert.ok(at.some(f => /config\.json says SCORM 1\.2, but the manifest says SCORM 2004/.test(f.title) && f.sev === 'warn' && f.basis === 'package'), 'adapt: default 1.2 against a 2004 manifest')
assert.ok(adaptTitles('1.2', { _advancedSettings: { _scormVersion: '2004' } }).some(f => /says SCORM 2004, but the manifest says SCORM 1\.2/.test(f.title)), 'adapt: 2004 against a 1.2 manifest')
assert.ok(adaptTitles('1.2', { _advancedSettings: { _showDebugWindow: true } }).some(f => /debug window/.test(f.title)), 'adapt: debug window')
assert.equal(adaptTitles('1.2', { _isEnabled: true }).length, 0, 'adapt: a good config has no findings')

// SCORM Driver: strLMSStandard that matches, and a start page that isn't there.
const sd = (std, version, loc) => staticFindings(analyze(pkg({ 'imsmanifest.xml': man(version, 'scormdriver/indexAPI.html'), 'scormdriver/indexAPI.html': page(`var strContentLocation = "${loc}"`), 'scormdriver/scormdriver.js': `var strLMSStandard = "${std}"` }))).filter(f => f.pack === 'scormdriver')
assert.equal(sd('SCORM2004', '2004', '../scormcontent/index.html').length, 1, 'driver: matching standard; only the missing start page')
assert.ok(sd('SCORM2004', '2004', '../scormcontent/index.html')[0].title.includes('start page that isn’t in the package') && sd('SCORM2004', '2004', 'x')[0].sev === 'warn', 'driver: missing start page')
const aicc = sd('AICC', '1.2', 'x.html').find(f => /strLMSStandard is "AICC", and the manifest/.test(f.title))
assert.ok(aicc && aicc.sev === 'info' && /does not know what this value selects/.test(aicc.detail), 'driver: an unknown value is reported neutrally, as info')
assert.equal(staticFindings(analyze(pkg({ 'imsmanifest.xml': man('2004', 'a.html'), 'a.html': page('var strLMSStandard = "SCORM"') }))).filter(f => f.pack === 'scormdriver' && /strLMSStandard/.test(f.title)).length, 0, 'driver: strLMSStandard only read in scormdriver-named files')

// Run rules, from hand-made traces.
const trace = (o = {}) => ({ requests: [], scripts: [], exceptions: [], caught: [], log: [], probe: [], coverage: [], ...o })
const pk = { kind: 'package', itemType: 'sco' }
const run = (id, a, t, launch = pk) => runFindings(t, launch, analyze(pkg({ ...cases[id][0], ...a }))).filter(f => f.pack === id)
const req = (url, o = {}) => ({ t: 1, url, method: 'GET', status: 200, type: 'Fetch', ...o })
const xyTrace = host => trace({ requests: [req('lab://run/api/player/config', { status: 404, from: [{ url: 'lab://run/pkg/index.html', line: 1 }] }), req(host)],
  probe: [{ type: 'assign', name: 'API', kind: 'object', keys: [], frame: 'lab://run/pkg/index.html', stack: [] }] })
let r = run('xyleme', {}, xyTrace('https://cdn.example.test/c/1.json'))
assert.deepEqual(r.map(f => f.title).sort(), ['Xyleme: the content asked its host for data outside the package', 'Xyleme: the content built its own SCORM API in this run', 'Xyleme: the content fetches from another site'], 'xyleme: run rules')
assert.ok(r.every(f => f.basis === 'run' && f.sev === 'info' && /confirmed in this run/.test(f.detail) && /Discover|pins/.test(f.fix) && /platform-hosted export/.test(f.detail)), 'xyleme: generic behaviour is info, worded as a pattern, and points to Discover')
r = run('xyleme', {}, xyTrace('https://acme.xyleme.example/c/1.json'))
assert.ok(r.some(f => f.sev === 'warn') && r.length === 3, 'xyleme: warnings only when the requests name a Xyleme host')
assert.equal(run('xyleme', {}, trace(), { kind: 'reference' }).length, 0, 'xyleme: only in package runs')
const plain = analyze(pkg({ 'imsmanifest.xml': man('1.2', 'index.html'), 'index.html': page() }))
assert.ok(packRun(plain, trace({ requests: [req('https://acme.xyleme.example/x')] }), pk).some(f => /^Xyleme: the content fetches/.test(f.title)), 'xyleme: detected from the run')
assert.equal(packRun(plain, trace({ requests: [req('https://other.example/x')] }), pk).length, 0, 'xyleme: not guessed from other hosts')
assert.equal(analyze(pkg({ 'imsmanifest.xml': man('1.2', 'index.html'), 'index.html': page('// Syndicate') })).packs.length, 0, 'xyleme: a bare "syndicate" is no signal')
// The Authoring tool option forces a pack: static (analyze) and run (launch.options.tool).
const forced = analyze(pkg({ 'imsmanifest.xml': man('1.2', 'index.html'), 'index.html': page('fetch("/api/x")') }), { tool: 'xyleme' })
assert.deepEqual(forced.packs.map(p => [p.id, p.chosen]), [['xyleme', true]], 'tool: chosen pack is listed')
assert.ok(staticFindings(forced).some(f => /^Xyleme: the content expects/.test(f.title) && /chosen by you/.test(f.detail)), 'tool: static rules run and say so')
assert.ok(packRun(plain, xyTrace('https://cdn.example.test/c'), { ...pk, options: { tool: 'xyleme' } }).some(f => /^Xyleme:/.test(f.title) && /chosen by you/.test(f.detail)), 'tool: run rules follow launch.options.tool')
assert.equal(normaliseOptions({}).tool, null); assert.equal(normaliseOptions({ tool: 'adapt' }).tool, 'adapt')
assert.throws(() => normaliseOptions({ tool: 'nope' }), /tool/, 'tool: validated against the pack ids')
assert.match(cliCommand({ tool: 'xyleme' }), /--tool xyleme/, 'tool: in the CLI line')
const html = readFileSync(new URL('../src/ui/index.html', import.meta.url), 'utf8')
for (const p of PACKS) assert.ok(html.includes(`<option value="${p.id}">`), 'tool: the UI select lists ' + p.id)
// A pack's detect that throws is skipped.
const dk = PACKS.find(p => p.id === 'dominknow'), det = dk.detect
dk.detect = () => { throw new Error('boom') }
assert.doesNotThrow(() => detectPacks(plain, pkg({})), 'packs: a throwing detect is skipped')
dk.detect = det
// Xyleme's static rule on the cloud-player style launch page.
const cloud = staticFindings(analyze(pkg({ 'imsmanifest.xml': man('1.2', 'index.html'), 'index.html': '<html><script>/* Xyleme */ var u = "https://player.example.test/c/1"; location = u</script></html>' })))
assert.ok(cloud.some(f => /Xyleme: the launch page is small and points to another site/.test(f.title) && f.sev === 'info'), 'xyleme: cloud-player launch: ' + cloud.map(f => f.title))

r = run('storyline', {}, trace({ requests: [req('lab://run/pkg/story.html')] }))
assert.ok(r.some(f => /story\.html loaded, nothing looked for the LMS/.test(f.title) && f.sev === 'info' && f.basis === 'run'), 'storyline: states the run fact, as info')
assert.ok(run('captivate', {}, trace({ exceptions: [{ t: 1, text: 'ReferenceError: cp is not defined', url: 'lab://run/pkg/assets/CPM.js', line: 3, at: [] }] })).some(f => /cp is not defined/.test(f.title) && f.basis === 'run'), 'captivate: cp is not defined')
assert.ok(run('pipwerks', { 'index.html': page('SCORM.init()') }, trace({ probe: [{ type: 'lookup', name: 'API', found: false, frame: 'lab://run/pkg/index.html' }] })).some(f => /SCORM\.API\.find found no API/.test(f.title)), 'pipwerks: no API found')
assert.ok(run('scormdriver', {}, trace({ requests: [req('lab://run/pkg/scormdriver/indexAPI.html')] })).some(f => /nothing looked for the LMS/.test(f.title) && f.sev === 'info'), 'scormdriver: loaded, no lookup (info)')
assert.equal(run('scormdriver', {}, trace({ requests: [req('lab://run/pkg/scormdriver/indexAPI.html')], probe: [{ type: 'lookup', name: 'API', found: true, frame: 'x' }] })).length, 0, 'scormdriver: quiet when it looked')

// A broken pack never breaks an analysis.
const bad = PACKS.find(p => p.id === 'rise'), keep = bad.staticRules
bad.staticRules = () => { throw new Error('boom') }
assert.doesNotThrow(() => analyze(pkg(cases.rise[0])), 'packs: a throwing rule is skipped')
bad.staticRules = keep

// Xyleme static export built for the server-side player (P3.2 follow-up): finding, autofix, and the generic document.domain finding.
{
  const { correct } = await import('../src/fixes.js')
  const idx = `<!doctype html><html><body><script>
    document.domain = document.location.href.match(/https?:\\/\\/[^\\/]*\\.([^\\/:\\.]*\\.[^\\/:\\.]*).[^\\/:]*\\//)[1];

    var PLAYER_TYPE = 'Server-side';
</script><script>window.Xyleme = { environment: { LMS: 'SF', SCORM_TYPE: 'Static SCORM 1.2' } }; require.config({ waitSeconds: 0 })</script></body></html>`
  const one = html => pkg({ 'imsmanifest.xml': man('1.2', 'index.html'), 'index.html': html })
  const files = one(idx)
  const f = staticFindings(analyze(files)).find(x => /server-side player/.test(x.title))
  assert.ok(f && f.sev === 'error' && f.autofix?.id === 'xyleme-player-type' && f.evidence.some(e => /^index\.html:4 /.test(e)), 'xyleme: server-side player finding: ' + JSON.stringify(f))
  const r = correct(files, { only: 'xyleme-player-type' }), out = r.files.get('index.html').toString()
  assert.ok(!/PLAYER_TYPE/.test(out) && /document\.domain =/.test(out) && out.split('\n').length === idx.split('\n').length, 'xyleme fix: only the assignment goes, lines stay')
  assert.ok(r.proof.gone.some(t => /server-side player/.test(t)) && !r.proof.added.length, 'xyleme fix: prove() clears it: ' + JSON.stringify(r.proof))
  for (const s of [`PLAYER_TYPE="server-side"`, `window.PLAYER_TYPE = \`Server-Side\`;`]) assert.ok(correct(one(page(`x(); ${s}`)), { only: 'xyleme-player-type' }).applied.length, 'xyleme fix: tolerates ' + s)
  assert.ok(!correct(one(page(`var PLAYER_TYPE = 'Client-side'`)), { only: 'xyleme-player-type' }).applied.length, 'xyleme fix: other values are left')
  // document.domain: an assignment is flagged (with file:line), a read or a comparison is not.
  const dd = staticFindings(analyze(files)).find(x => x.title === 'Scripts set document.domain')
  assert.ok(dd && dd.sev === 'warn' && !dd.autofix && /^index\.html:2 /.test(dd.evidence[0]), 'document.domain: assignment flagged: ' + JSON.stringify(dd))
  for (const s of ['var d = document.domain', 'if (document.domain == "x") {}', 'if (document.domain === "x") {}']) assert.ok(!staticFindings(analyze(one(page(s)))).some(x => x.title === 'Scripts set document.domain'), 'document.domain: not flagged: ' + s)
}
