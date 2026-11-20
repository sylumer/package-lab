// The shell that the Alfred workflow's script actions run (scripts/alfred.js puts them in the workflow). Each gets the file or
// folder as $1; node, cli and wait are the workflow's variables, exported to the script. Every variable is quoted. Each action
// keeps its CLI's standard error in a log file made with mktemp in $TMPDIR (the system clears it); the notification shows its
// last line. Exported so the tests can run them (test/test.js). See docs/alfred.md.

export const OPEN = `if [ -d "/Applications/Package Lab.app" ]; then open -a "Package Lab" "$1"; else "$node" "$cli" open "$1"; fi`

export const CHECK = `log="$(mktemp "\${TMPDIR:-/tmp}/package-lab-alfred.XXXXXX")"
if "$node" "$cli" report "$1" --open >/dev/null 2>"$log"; then echo "Checked $(basename "$1")"; else echo "Couldn’t check it: $(tail -1 "$log")"; fi`

export const RUN = `log="$(mktemp "\${TMPDIR:-/tmp}/package-lab-alfred.XXXXXX")"
echo "Running $(basename "$1") for $wait seconds…" >&2
if "$node" "$cli" report "$1" --run --wait "$wait" --open >/dev/null 2>"$log"; then echo "Report ready: $(basename "$1")"; else echo "The run failed: $(tail -1 "$log")"; fi`

// ⇧↩: the standard experiment (every API and frame variant), its report in a temporary folder, opened in the browser.
export const EXPERIMENT = `log="$(mktemp "\${TMPDIR:-/tmp}/package-lab-alfred.XXXXXX")"
dir="$(mktemp -d "\${TMPDIR:-/tmp}/package-lab-experiment.XXXXXX")"
if "$node" "$cli" experiment "$1" --preset standard --wait "$wait" --out "$dir" >/dev/null 2>"$log"; then
  if open "$dir/report.html"; then echo "Experiment report ready: $(basename "$1")"; else echo "Couldn’t open the report in $dir"; fi
else echo "The experiment failed: $(tail -1 "$log")"; fi`

// File Action: a corrected copy next to the original, named <name>-fixed.zip, then <name>-fixed-2.zip, -3…: never overwritten.
// fix writes into a temporary file in the package's folder; it is then hard-linked to the first free name. ln refuses a name that
// exists (a file, or a symlink, which it never follows), so nothing is overwritten. fix writes nothing when there is nothing to
// change, which the empty temporary file shows.
export const FIX = `log="$(mktemp "\${TMPDIR:-/tmp}/package-lab-alfred.XXXXXX")"
dir="$(dirname "$1")"
name="$(basename "$1" .zip)"
tmp="$(mktemp "$dir/.package-lab-fix.XXXXXX")" || { echo "Couldn’t write next to $(basename "$1")"; exit 0; }
if ! "$node" "$cli" fix "$1" --out "$tmp" >/dev/null 2>"$log"; then
  rm -f "$tmp"; echo "Couldn’t fix it: $(tail -1 "$log")"
elif [ ! -s "$tmp" ]; then
  rm -f "$tmp"; echo "Nothing to fix in $(basename "$1")"
else
  n=1; out="$dir/$name-fixed.zip"; placed=""
  while [ "$n" -le 100 ]; do
    if ln "$tmp" "$out" 2>/dev/null; then placed=1; break; fi
    n=$((n + 1)); out="$dir/$name-fixed-$n.zip"
  done
  rm -f "$tmp"
  if [ -n "$placed" ]; then echo "Wrote $(basename "$out")"; else echo "Couldn’t save the fix: no free name"; fi
fi`

// A folder: the batch check's report goes to a temporary folder and opens in the browser (like Check).
export const BATCH = `log="$(mktemp "\${TMPDIR:-/tmp}/package-lab-alfred.XXXXXX")"
out="$(mktemp -d "\${TMPDIR:-/tmp}/package-lab-batch.XXXXXX")/batch.html"
if "$node" "$cli" batch "$1" --out "$out" >/dev/null 2>"$log"; then
  if open "$out"; then echo "Checked the packages in $(basename "$1")"; else echo "Checked, but couldn’t open $out"; fi
else echo "Couldn’t check the folder: $(tail -1 "$log")"; fi`

// packageweb: the server's log is a temporary file too; it is read only to see that the server has started.
export const WEB = `port="$("$node" "$cli" settings port 2>/dev/null)" || port=4880
[ -n "$port" ] || port=4880
log="$(mktemp "\${TMPDIR:-/tmp}/package-lab-web.XXXXXX")"
if ! /usr/sbin/lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  nohup "$node" "$cli" serve --port "$port" >"$log" 2>&1 &
  for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1; grep -q 'http://' "$log" && break; done
fi
if url="$("$node" "$cli" serve --url --port "$port")"; then open "$url" || echo "Couldn’t open $url"; else echo "Couldn’t find the web interface's address"; fi`
