const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  send:    (channel, data) => { if (channel === 'toMain') ipcRenderer.send(channel, data); },
  receive: (channel, func) => { if (channel === 'fromMain') ipcRenderer.on(channel, (_, ...a) => func(...a)); },
  joinPath:  (...args) => args.reduce((a, b) => a.replace(/[/\\]$/, '') + '/' + b.replace(/^[/\\]/, '')),
  toFileUrl: (p) => { const fwd = p.replace(/\\/g, '/'); return fwd.startsWith('/') ? 'file://' + fwd : 'file:///' + fwd; },

  // Spatialisation
  listLayouts:    ()     => ipcRenderer.invoke('spatListLayouts'),
  readLayoutJSON: (name) => ipcRenderer.invoke('spatReadLayout', name),
  getSpatPaths:   ()     => ipcRenderer.invoke('spatGetPaths'),
});
