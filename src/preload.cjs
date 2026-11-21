// The UI's bridge to the main process. Only the UI window gets it; content windows don't.
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('lab', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  accent: () => ipcRenderer.invoke('accent'),   // the system accent colour, '#rrggbb' (or '')
  onAccent: fn => ipcRenderer.on('accent', (_e, c) => fn(c)),
  on: (channel, fn) => ipcRenderer.on(channel, (_e, data) => fn(data)),
})
