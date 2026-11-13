// In the desktop window, preload.cjs provides window.lab over IPC. In a browser (the web interface) there is no
// preload, so this provides the same window.lab over HTTP: invoke is a POST to /api/invoke/<name>, on listens to
// server-sent events from /api/events. It also adds what only the web interface needs: upload, live and web.
if (!window.lab) {
  const events = new EventSource('/api/events')
  events.onerror = () => { const s = document.getElementById('status'); if (s) s.textContent = 'Lost the connection to SCORM Lab: reconnecting…' }
  window.lab = {
    web: true,
    async invoke(channel, arg) {
      const r = await fetch('/api/invoke/' + channel, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(arg ?? {}), credentials: 'same-origin' })
      const d = await r.json().catch(() => ({ error: `${r.status} ${r.statusText}` }))
      if (d.error) throw new Error(d.error)
      return d.value
    },
    on(channel, fn) { events.addEventListener(channel, e => fn(JSON.parse(e.data))) },
    // Sends a .zip to the Mac (XHR rather than fetch, for upload progress).
    upload(file, progress) {
      return new Promise((resolve, reject) => {
        const x = new XMLHttpRequest()
        x.open('POST', '/api/upload?name=' + encodeURIComponent(file.name))
        x.setRequestHeader('Content-Type', 'application/zip')
        x.upload.onprogress = e => e.lengthComputable && progress?.(e.loaded / e.total)
        x.onload = () => { let d; try { d = JSON.parse(x.responseText) } catch { return reject(new Error(`${x.status} ${x.statusText}`)) } d.error ? reject(new Error(d.error)) : resolve(d.value) }
        x.onerror = () => reject(new Error('The upload failed.'))
        x.send(file)
      })
    },
    // Frames of the running content, until the returned function is called.
    live(fn) {
      const s = new EventSource('/api/live')
      s.addEventListener('frame', e => fn(JSON.parse(e.data)))
      return () => s.close()
    },
  }
}
