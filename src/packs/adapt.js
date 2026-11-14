// Adapt (adapt-contrib-spoor). The config keys and defaults come from the plugin's README (docs/packs/adapt.md):
// _spoor._isEnabled (true), _advancedSettings._scormVersion ("1.2"), _showDebugWindow (false).
import { score, named, textOf, jsonOf } from './util.js'

// The first config.json that has a "_spoor" key: { name, spoor }.
function adaptConfig(files) {
  for (const name of named(files, /(^|\/)config\.json$/i)) if (/"_spoor"/.test(textOf(files, name))) { const j = jsonOf(files, name); if (j?._spoor && typeof j._spoor === 'object') return { name, spoor: j._spoor } }
  return null
}
const ver = v => String(v ?? '1.2').startsWith('2004') ? '2004' : '1.2'

export default {
  id: 'adapt', name: 'Adapt',
  detect: (a, files) => Math.max(adaptConfig(files) ? 0.9 : 0, score(files, [['name', /adapt\/js\/|adapt-contrib/i, 0.7], ['name', /scorm_test_harness\.html$/i, 0.7], ['text', /adapt-contrib|adaptlearning|"_manifestIdentifier"\s*:\s*"adapt_manifest"/, 0.6]])),
  staticRules({ analysis: a, files }) {
    const out = [], c = adaptConfig(files), m = a.manifest
    if (!c) return out
    const { name, spoor } = c, adv = spoor._advancedSettings ?? {}
    if (spoor._isEnabled === false)
      out.push({ sev: 'warn', basis: 'package', title: 'tracking is off (_spoor._isEnabled is false)',
        detail: 'With spoor disabled, Adapt still builds a valid SCORM package but sends nothing to the LMS: no status, no score, no suspend data.',
        evidence: [`${name}: "_spoor": { "_isEnabled": false }`], fix: `Set "_isEnabled": true in ${name} and build the course again.` })
    const cv = ver(adv._scormVersion)
    if (m && cv !== m.version)
      out.push({ sev: 'warn', basis: 'package', title: `config.json says SCORM ${cv}, but the manifest says SCORM ${m.version}`,
        detail: `Spoor uses _scormVersion (${adv._scormVersion === undefined ? 'default "1.2"' : `"${adv._scormVersion}"`}) to choose the API it looks for. An LMS that offers only SCORM ${m.version} finds no API.`,
        evidence: [`${name}: _advancedSettings._scormVersion ${adv._scormVersion === undefined ? 'is not set' : '= ' + JSON.stringify(adv._scormVersion)}`, `imsmanifest.xml: SCORM ${m.version}`],
        fix: `Make them agree: set "_scormVersion" in ${name} to "${m.version === '2004' ? '2004' : '1.2'}", or change the manifest. Then build again.` })
    if (cv === '2004')
      out.push({ sev: 'info', basis: 'pattern', title: 'SCORM 2004 is not officially supported by spoor',
        detail: 'The plugin’s README says it officially supports SCORM 1.2 only, though it bundles 2004 4th Edition files. 2004 may work, but test it.', evidence: [`${name}: _scormVersion is "2004"`], fix: 'If tracking is wrong in the LMS, try "1.2".' })
    if (adv._showDebugWindow === true)
      out.push({ sev: 'warn', basis: 'package', title: 'the debug window is on (_showDebugWindow)',
        detail: 'Learners will see the SCORM debug window.', evidence: [`${name}: _advancedSettings._showDebugWindow = true`], fix: 'Set it to false for the production build.' })
    return out
  },
  runRules() { return [] },
  notes: 'docs/packs/adapt.md',
  sources: [
    'https://github.com/adaptlearning/adapt-contrib-spoor',
    'https://github.com/adaptlearning/adapt_framework/wiki/Tracking-in-the-Framework---xAPI-and-SCORM-and-others',
    'https://github.com/adaptlearning/adapt-contrib-assessment/wiki/Restore-assessment-state',
    'https://community.adaptlearning.org/mod/forum/discuss.php?d=2690',
  ],
}
