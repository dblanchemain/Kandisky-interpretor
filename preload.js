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

  // Audios
  readAudioFile:  (partitionPath, filename)              => ipcRenderer.invoke('audiosReadFile', partitionPath, filename),
  saveAudioFile:  (partitionPath, subfolder, filename, data) => ipcRenderer.invoke('audiosSaveFile', partitionPath, subfolder, filename, data),

  // NSM – signaler dirty/clean au gestionnaire de session
  nsmDirty: (dirty) => ipcRenderer.send('nsmDirty', dirty),
});
