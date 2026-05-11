const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

contextBridge.exposeInMainWorld('api', {
  send: (channel, data) => {
    if (channel === 'toMain') ipcRenderer.send(channel, data);
  },
  receive: (channel, func) => {
    if (channel === 'fromMain') {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  joinPath: (...args) => path.join(...args),
  toFileUrl: (p) => { const fwd = p.replace(/\\/g, '/'); return fwd.startsWith('/') ? 'file://' + fwd : 'file:///' + fwd; }
});
