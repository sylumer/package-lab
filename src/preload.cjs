// The UI's bridge to the main process. Only the UI window gets it; content windows don't.
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('lab', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, fn) => ipcRenderer.on(channel, (_e, data) => fn(data)),
})
