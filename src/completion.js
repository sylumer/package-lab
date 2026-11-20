// The command table (names, summaries, flags) and the zsh completion script (package-lab completion zsh). Pure. The
// CLI's HELP text is the long form; the test checks that every command and flag here appears in it.
import { PRESETS } from './experiments.js'
import { PROFILE_NAMES } from './profiles.js'
import { PACKS } from './packs/index.js'
import { VIEWPORTS } from './options.js'

// A flag: its help, and the value it takes (no kind: a switch). kind is a file kind (file, json, zip, csv, dir, text: a value
// with no completion) or a list of choices.
const F = {
  item: { help: 'The item to check or launch: a number from items, or its identifier', kind: 'text' },
  json: { help: 'Print JSON instead of text' },
  strict: { help: 'Exit with status 1 if the findings include an error' },
  tool: { help: 'Apply an authoring tool’s rule pack even if the package doesn’t show it', kind: PACKS.map(p => p.id) },
  api: { help: 'Which SCORM API the test LMS offers', kind: ['manifest', 'both', '1.2', '2004', 'none'] },
  depth: { help: 'Empty LMS frames between the API and the content (0 to 5)', kind: 'text' },
  window: { help: 'Open the content in a new window (serve: also open the desktop window)' },
  'resume-from': { help: 'Start with the data a previous run left', kind: 'json' },
  wait: { help: 'Seconds to let each run go', kind: 'text' },
  options: { help: 'Launch options as a JSON file', kind: 'json' },
  'options-from': { help: 'Use the launch options a saved run recorded', kind: 'json' },
  override: { help: 'Replace a package file: path=local file (repeatable)', kind: 'text' },
  pin: { help: 'Force a value the content reads: name=json (repeatable)', kind: 'text' },
  answer: { help: 'Answer matching requests: pattern=reply (repeatable)', kind: 'text' },
  'launch-params': { help: 'Extra query parameters on the launch address', kind: 'text' },
  profile: { help: 'Host the content the way an LMS does', kind: PROFILE_NAMES },
  'profile-file': { help: 'A custom profile from a JSON file', kind: 'json' },
  browser: { help: 'Chromium (default) or WebKit, Safari’s engine', kind: ['chromium', 'webkit'] },
  viewport: { help: 'A device size: a preset, or WIDTHxHEIGHT', kind: Object.keys(VIEWPORTS) },
  storage: { help: 'Storage in the content’s frames', kind: ['normal', 'blocked', 'partitioned'] },
  macro: { help: 'A JSON file of clicks, keys and typing to play in the run', kind: 'json' },
  'record-input': { help: 'Keep typed text in the run (never from password fields)' },
  trace: { help: 'Record which functions ran and which way each decision went' },
  out: { help: 'Where to keep the output', kind: 'file' },
  live: { help: 'A folder to write frames to and read input from', kind: 'dir' },
  'no-caught': { help: 'Don’t record errors the content catches' },
  show: { help: 'Show the content window while it runs' },
  port: { help: 'The port (default: the port in Settings, 4880 unless changed)', kind: 'text' },
  only: { help: 'Only these fixes, comma-separated', kind: 'text' },
  variants: { help: 'Your own variants, from a JSON file', kind: 'json' },
  preset: { help: 'The built-in variants', kind: Object.keys(PRESETS) },
  request: { help: 'The request to work on: a path, a glob or a /regex/', kind: 'text' },
  rounds: { help: 'Rounds of answering and watching (1 to 10)', kind: 'text' },
  run: { help: 'Run each package too' },
  recursive: { help: 'Look in the subfolders too' },
  jobs: { help: 'Packages checked at once', kind: 'text' },
  csv: { help: 'Also write the table as CSV', kind: 'csv' },
  open: { help: 'Open the report in the browser' },
  fragment: { help: 'An HTML fragment for embedding, not a whole page' },
  redact: { help: 'Take the course content out of the report' },
  'redact-names': { help: 'With --redact: hash the file names too' },
  'key-out': { help: 'Write the redaction key to this new file', kind: 'json' },
  key: { help: 'Reuse a redaction key file', kind: 'json' },
  host: { help: 'The address to listen on (default 127.0.0.1)', kind: 'text' },
  'show-runs': { help: 'Show content windows on this Mac while they run' },
  url: { help: 'Print the address (with its token) and exit' },
}

// The options a run takes (run, and the commands that run a package).
const RUN = ['api', 'depth', 'window', 'resume-from', 'wait', 'options', 'options-from', 'override', 'pin', 'answer', 'launch-params', 'profile', 'profile-file',
  'tool', 'browser', 'viewport', 'storage', 'macro', 'record-input', 'trace', 'out', 'live', 'no-caught', 'show']

// name, what it does, its positional argument (see POS), its flags, and the kind of --out when it isn't a file.
export const COMMANDS = [
  { name: 'analyze', summary: 'Check the package without running it', pos: 'zip', flags: ['item', 'tool', 'json', 'strict'] },
  { name: 'doctor', summary: 'Check this Mac can run Package Lab', flags: ['port', 'json'] },
  { name: 'fix', summary: 'Write a corrected copy of the package', pos: 'zip', flags: ['only', 'override', 'out', 'json'] },
  { name: 'items', summary: 'List the items that can be launched', pos: 'zip', flags: ['item', 'tool', 'json'] },
  { name: 'run', summary: 'Launch an item in a hidden browser and report what went wrong', pos: 'zip', flags: ['item', 'strict', 'json', ...RUN] },
  { name: 'experiment', summary: 'Run the same launch several ways and show how far each got', pos: 'zip', flags: ['item', 'variants', 'preset', 'json', ...RUN], kinds: { out: 'dir' } },
  { name: 'discover', summary: 'Work out what the content wants from its server', pos: 'zip', flags: ['item', 'request', 'rounds', 'json', ...RUN], kinds: { out: 'dir' } },
  { name: 'drill', summary: 'Why it stopped: the decisions that led to the dead end', pos: 'zip', flags: ['item', 'json', ...RUN], kinds: { out: 'dir' } },
  { name: 'cycle', summary: 'Test saving: leave like a learner, then resume', pos: 'zip', flags: ['item', 'strict', 'json', ...RUN], kinds: { out: 'dir' } },
  { name: 'diff', summary: 'What changed between two packages', pos: 'zip2', flags: ['item', 'run', 'json', ...RUN] },
  { name: 'batch', summary: 'Check every package in a folder, one row each', pos: 'zipdir', flags: ['run', 'recursive', 'jobs', 'csv', 'json', ...RUN] },
  { name: 'report', summary: 'Write an HTML report of a package or a run', pos: 'zipjson', flags: ['item', 'open', 'fragment', 'run', 'redact', 'redact-names', 'key-out', 'key', 'json', ...RUN] },
  { name: 'open', summary: 'Open the desktop app, optionally with a package', pos: 'zip', flags: ['json'] },
  { name: 'serve', summary: 'Start the web interface', flags: ['port', 'host', 'window', 'show-runs', 'url', 'json'] },
  { name: 'settings', summary: 'Show or change the settings (the web interface port)', pos: 'settings', flags: ['json'] },
  { name: 'completion', summary: 'Print a shell completion script (zsh)', pos: 'shell', flags: ['json'] },
  { name: 'help', summary: 'Show the help', flags: ['json'] },
  { name: 'version', summary: 'Show the version', flags: ['json'] },
].map(c => ({ ...c, flags: [...new Set(c.flags)] }))

// What a flag's value completes with, in zsh (_arguments actions).
const ACTION = { file: '_files', json: '_files -g "*.json"', zip: '_files -g "*.zip"', csv: '_files -g "*.csv"', dir: '_files -/', text: '' }
const POS = {
  zip: ['1:package:_files -g "*.zip"'],
  zip2: ['1:first package:_files -g "*.zip"', '2:second package:_files -g "*.zip"'],
  zipjson: ['1:package or saved run:_files'],
  zipdir: ['*:package or folder:_files'],
  shell: ['1:shell:(zsh)'],
  settings: ['1:setting:(port)'],
}
// The zsh script keeps descriptions simple: no brackets or quotes inside the _arguments specs.
const clean = s => String(s).replace(/[[\]'\\]/g, '')

function optionSpec(name, kind) {
  const f = F[name]
  if (!f) throw new Error(`No flag table entry for --${name}`)
  const k = kind ?? f.kind
  if (k === undefined) return `'--${name}[${clean(f.help)}]'`
  const action = Array.isArray(k) ? `(${k.join(' ')})` : ACTION[k]
  return `'--${name}[${clean(f.help)}]:${name}:${action}'`
}

// The zsh completion script. Source it, or save it as _package-lab in a folder on your fpath (~/.zfunc is a common one).
export function zshCompletion() {
  const list = COMMANDS.map(c => `    '${c.name}:${clean(c.summary)}'`).join('\n')
  const cases = COMMANDS.map(c => {
    const args = [...(c.pos ? POS[c.pos].map(p => `'${p}'`) : []), ...c.flags.map(n => optionSpec(n, c.kinds?.[n]))]
    return `    ${c.name})\n      shift words; (( CURRENT-- ))\n      _arguments \\\n${args.map(a => `        ${a}`).join(' \\\n')}\n      ;;`
  }).join('\n')
  return `#compdef package-lab
# zsh completion for package-lab, from package-lab completion zsh. Save it as _package-lab in a folder on your fpath, or source it.

_package_lab() {
  local -a commands
  commands=(
${list}
  )
  if (( CURRENT == 2 )); then
    _describe -t commands 'package-lab command' commands
    return
  fi
  case $words[2] in
${cases}
    *)
      _files
      ;;
  esac
}

if [[ $funcstack[1] == _package_lab ]]; then
  _package_lab "$@"
else
  compdef _package_lab package-lab
fi
`
}
