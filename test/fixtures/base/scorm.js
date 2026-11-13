// A minimal SCORM 1.2 wrapper: finds the LMS's API (in a parent frame or the window that opened this one) and keeps
// track of the session's time.
var scorm = (function () {
  var api = null, started = new Date(), live = false
  function find(w) {
    for (var i = 0; w && i < 20; i++) { if (w.API) return w.API; if (w.parent === w) break; w = w.parent }
    return null
  }
  function pad(n, size) { n = String(n); while (n.length < size) n = '0' + n; return n }
  // HHHH:MM:SS.SS, as SCORM 1.2's cmi.core.session_time wants it.
  function span(ms) {
    var s = ms / 1000, h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60)
    return pad(h, 4) + ':' + pad(m, 2) + ':' + pad((s % 60).toFixed(2), 5)
  }
  return {
    start: function () {
      api = find(window) || (window.opener && find(window.opener))
      live = !!api && api.LMSInitialize('') === 'true'
      return live
    },
    get: function (el) { return live ? api.LMSGetValue(el) : '' },
    set: function (el, value) { return live && api.LMSSetValue(el, String(value)) === 'true' },
    save: function () { return live && api.LMSCommit('') === 'true' },
    finish: function (exit) {
      if (!live) return
      api.LMSSetValue('cmi.core.session_time', span(new Date() - started))
      api.LMSSetValue('cmi.core.exit', exit)
      api.LMSFinish('')
      live = false
    },
    live: function () { return live }
  }
})()
