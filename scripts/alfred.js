// Builds dist/SCORM Lab.alfredworkflow and opens it, so Alfred offers to import it. The workflow calls this repo's
// CLI with the Node that ran this script, so rebuild it (npm run alfred) if either moves. The shell it runs is in
// alfred-scripts.js. See docs/alfred.md.
//   scormlab            open SCORM Lab
//   scorm <name>        find SCORM packages (.zip) by name: ↩ open in SCORM Lab, ⌘↩ check it (report from the files),
//                       ⇧↩ the standard experiment and its report, ⌥↩ run it and report
//   scormweb            start the web interface on this Mac (if it isn't running) and open it in the browser
//   File Actions on a .zip: Open in SCORM Lab · Check with SCORM Lab · Run and report with SCORM Lab · Fix with SCORM Lab
//   File Action on a folder: Check SCORM packages in folder (a batch report, opened in the browser)
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { OPEN, CHECK, RUN, EXPERIMENT, FIX, BATCH, WEB } from './alfred-scripts.js'

const root = new URL('..', import.meta.url).pathname, dist = join(root, 'dist'), dir = join(dist, 'alfred')
const cli = join(root, 'bin', 'scorm-lab.js')
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })

const uid = () => randomUUID().toUpperCase()
const objects = [], connections = {}, uidata = {}
const add = (type, config, version, x, y) => { const id = uid(); objects.push({ type, uid: id, version, config }); uidata[id] = { xpos: x, ypos: y }; return id }
const link = (from, to, modifiers = 0, modifiersubtext = '') => (connections[from] ??= []).push({ destinationuid: to, modifiers, modifiersubtext, vitoclose: false })
// Bash scripts get the file as $1; node and the CLI come from the workflow's variables.
const script = (body, x, y) => add('alfred.workflow.action.script', { concurrently: true, escaping: 0, script: body, scriptargtype: 1, scriptfile: '', type: 0 }, 2, x, y)
const notify = (x, y) => add('alfred.workflow.output.notification', { lastpathcomponent: false, onlyshowifquerypopulated: true, removeextension: false, text: '{query}', title: 'SCORM Lab' }, 1, x, y)
const action = (name, x, y, filetypes = ['public.zip-archive']) => add('alfred.workflow.trigger.action', { acceptsmulti: 0, filetypes, name }, 1, x, y)

// Keyword: open the app.
const kwApp = add('alfred.workflow.input.keyword', { argumenttype: 2, keyword: 'scormlab', subtext: 'Open the desktop app', text: 'SCORM Lab', withspace: false }, 1, 30, 30)
link(kwApp, script(`if [ -d "/Applications/SCORM Lab.app" ]; then open -a "SCORM Lab"; else "$node" "$cli" open; fi`, 300, 30))
// Keyword: web interface.
const kwWeb = add('alfred.workflow.input.keyword', { argumenttype: 2, keyword: 'scormweb', subtext: 'Start the web interface on this Mac and open it', text: 'SCORM Lab web interface', withspace: false }, 1, 30, 150)
link(kwWeb, script(WEB, 300, 150))
// File filter: find packages, then open / check / experiment / run.
const filter = add('alfred.workflow.input.filefilter', { anchorfields: true, argumenttrimmode: 0, argumenttype: 0, daterange: 0, fields: [], includesystem: false, keyword: 'scorm', limit: 0,
  runningsubtext: 'Looking for SCORM packages…', scopes: [], sortmode: 0, subtext: '↩ open in SCORM Lab · ⌘↩ check it · ⇧↩ standard experiment report · ⌥↩ run it and report', title: 'Find a SCORM package', types: ['public.zip-archive'], withspace: true }, 2, 30, 270)
const open = script(OPEN, 300, 270), check = script(CHECK, 300, 390), runIt = script(RUN, 300, 510), n1 = notify(520, 390), n2 = notify(520, 510)
const experimentIt = script(EXPERIMENT, 300, 1230), n3 = notify(520, 1230)
link(filter, open); link(filter, check, 1048576, 'Check it from its files and open the report'); link(filter, runIt, 524288, 'Run it and open the report')
link(filter, experimentIt, 131072, 'Run the standard experiment and open its report')
link(check, n1); link(runIt, n2); link(experimentIt, n3)
// File Actions.
link(action('Open in SCORM Lab', 30, 630), open)
link(action('Check with SCORM Lab', 30, 750), check)
link(action('Run and report with SCORM Lab', 30, 870), runIt)
const fixIt = script(FIX, 300, 1350)
link(action('Fix with SCORM Lab', 30, 1350), fixIt)
link(fixIt, notify(520, 1350))
const batchIt = script(BATCH, 300, 990)
link(action('Check SCORM packages in folder', 30, 990, ['public.folder']), batchIt)
link(batchIt, notify(520, 990))

const info = {
  bundleid: 'com.sylumer.scorm-lab.alfred', name: 'SCORM Lab', createdby: 'SCORM Lab', category: 'Tools', webaddress: '',
  description: 'Open, check, fix and run SCORM packages with SCORM Lab',
  readme: `Keywords: scormlab (open the app), scorm <name> (find a package: ↩ open, ⌘↩ check, ⇧↩ standard experiment report, ⌥↩ run and report), scormweb (web interface).\nFile Actions on .zip files: Open in, Check with, Run and report with, Fix with SCORM Lab (a corrected copy next to the original, never overwriting). On folders: Check SCORM packages in folder.\n\nBuilt from ${root} by npm run alfred. Rebuild it if the repo or Node moves.`,
  objects, connections, uidata, variablesdontexport: [],
  variables: { node: process.execPath, cli, wait: '20' },
  version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
}
writeFileSync(join(dir, 'info.json'), JSON.stringify(info))
execFileSync('plutil', ['-convert', 'xml1', join(dir, 'info.json'), '-o', join(dir, 'info.plist')])
rmSync(join(dir, 'info.json'))
if (existsSync(join(root, 'build', 'icon.png'))) copyFileSync(join(root, 'build', 'icon.png'), join(dir, 'icon.png'))
const out = join(dist, 'SCORM Lab.alfredworkflow')
rmSync(out, { force: true })
execFileSync('zip', ['-qj', out, ...['info.plist', 'icon.png'].filter(f => existsSync(join(dir, f))).map(f => join(dir, f))])
console.log(`Built ${out}`)
if (!process.argv.includes('--no-open')) execFileSync('open', [out])
