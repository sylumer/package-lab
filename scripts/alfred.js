// Builds dist/SCORM Lab.alfredworkflow and opens it, so Alfred offers to import it. The workflow calls this repo's
// CLI with the Node that ran this script, so rebuild it (npm run alfred) if either moves. See docs/alfred.md.
//   scormlab            open SCORM Lab
//   scorm <name>        find SCORM packages (.zip) by name: ↩ open in SCORM Lab, ⌘↩ check it (report from the files),
//                       ⌥↩ run it and report
//   scormweb            start the web interface on this Mac (if it isn't running) and open it in the browser
//   File Actions on a .zip: Open in SCORM Lab · Check with SCORM Lab · Run and report with SCORM Lab
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

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
const action = (name, x, y) => add('alfred.workflow.trigger.action', { acceptsmulti: 0, filetypes: ['public.zip-archive'], name }, 1, x, y)

const OPEN = `if [ -d "/Applications/SCORM Lab.app" ]; then open -a "SCORM Lab" "$1"; else "$node" "$cli" open "$1"; fi`
const CHECK = `"$node" "$cli" report "$1" --open >/dev/null 2>/tmp/scorm-lab-alfred.log && echo "Checked $(basename "$1")" || echo "Couldn’t check it: $(tail -1 /tmp/scorm-lab-alfred.log)"`
const RUN = `echo "Running $(basename "$1") for $wait seconds…" >&2
"$node" "$cli" report "$1" --run --wait "$wait" --open >/dev/null 2>/tmp/scorm-lab-alfred.log && echo "Report ready: $(basename "$1")" || echo "The run failed: $(tail -1 /tmp/scorm-lab-alfred.log)"`
const WEB = `port=4880
if ! /usr/sbin/lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
  nohup "$node" "$cli" serve --port $port >/tmp/scorm-lab-web.log 2>&1 &
  for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1; grep -q 'http://' /tmp/scorm-lab-web.log && break; done
fi
open "$("$node" "$cli" serve --url --port $port)"`

// Keyword: open the app.
const kwApp = add('alfred.workflow.input.keyword', { argumenttype: 2, keyword: 'scormlab', subtext: 'Open the desktop app', text: 'SCORM Lab', withspace: false }, 1, 30, 30)
link(kwApp, script(`if [ -d "/Applications/SCORM Lab.app" ]; then open -a "SCORM Lab"; else "$node" "$cli" open; fi`, 300, 30))
// Keyword: web interface.
const kwWeb = add('alfred.workflow.input.keyword', { argumenttype: 2, keyword: 'scormweb', subtext: 'Start the web interface on this Mac and open it', text: 'SCORM Lab web interface', withspace: false }, 1, 30, 150)
link(kwWeb, script(WEB, 300, 150))
// File filter: find packages, then open / check / run.
const filter = add('alfred.workflow.input.filefilter', { anchorfields: true, argumenttrimmode: 0, argumenttype: 0, daterange: 0, fields: [], includesystem: false, keyword: 'scorm', limit: 0,
  runningsubtext: 'Looking for SCORM packages…', scopes: [], sortmode: 0, subtext: '↩ open in SCORM Lab · ⌘↩ check it · ⌥↩ run it and report', title: 'Find a SCORM package', types: ['public.zip-archive'], withspace: true }, 2, 30, 270)
const open = script(OPEN, 300, 270), check = script(CHECK, 300, 390), runIt = script(RUN, 300, 510), n1 = notify(520, 390), n2 = notify(520, 510)
link(filter, open); link(filter, check, 1048576, 'Check it from its files and open the report'); link(filter, runIt, 524288, 'Run it and open the report')
link(check, n1); link(runIt, n2)
// File Actions.
link(action('Open in SCORM Lab', 30, 630), open)
link(action('Check with SCORM Lab', 30, 750), check)
link(action('Run and report with SCORM Lab', 30, 870), runIt)

const info = {
  bundleid: 'com.sylumer.scorm-lab.alfred', name: 'SCORM Lab', createdby: 'SCORM Lab', category: 'Tools', webaddress: '',
  description: 'Open, check and run SCORM packages with SCORM Lab',
  readme: `Keywords: scormlab (open the app), scorm <name> (find a package: ↩ open, ⌘↩ check, ⌥↩ run and report), scormweb (web interface).\nFile Actions on .zip files: Open in, Check with, Run and report with SCORM Lab.\n\nBuilt from ${root} by npm run alfred. Rebuild it if the repo or Node moves.`,
  objects, connections, uidata, variablesdontexport: [],
  variables: { node: process.execPath, cli, wait: '20' },
  version: JSON.parse((await import('node:fs')).readFileSync(join(root, 'package.json'), 'utf8')).version,
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
