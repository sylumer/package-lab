// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// Renders build/icon.svg to build/icon.png (1024 px) with Electron's own renderer: electron scripts/icon.cjs
const { app, BrowserWindow, nativeImage } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const ico = require('./ico.cjs')
app.dock?.hide()
app.whenReady().then(async () => {
  // --ico: only turn the existing icon.png into icon.ico (16, 32, 48 and 256 px), for the Windows build.
  if (process.argv.includes('--ico')) {
    const png = nativeImage.createFromPath(join(__dirname, '..', 'build', 'icon.png'))
    writeFileSync(join(__dirname, '..', 'build', 'icon.ico'), ico([16, 32, 48, 256].map(size => ({ size, data: png.resize({ width: size, height: size, quality: 'best' }).toPNG() }))))
    return app.exit(0)
  }
  const svg = readFileSync(join(__dirname, '..', 'build', 'icon.svg'), 'utf8')
  const w = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } })
  w.webContents.setZoomFactor(1)
  await w.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`))
  await new Promise(r => setTimeout(r, 300))
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  writeFileSync(join(__dirname, '..', 'build', 'icon.png'), img.resize({ width: 1024, height: 1024 }).toPNG())
  app.exit(0)
})
