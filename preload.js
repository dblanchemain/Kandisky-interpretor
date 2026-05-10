const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  send: (channel, data) => {
    if (channel === 'toMain') ipcRenderer.send(channel, data);
  },
  receive: (channel, func) => {
    if (channel === 'fromMain') {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  }
});
