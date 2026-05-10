const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

let win = null;
let currentFilePath = '';

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile('index.html');
  win.removeMenu();
  win.on('closed', () => { win = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!win) createWindow(); });

ipcMain.on('toMain', (event, args) => {
  if (typeof args !== 'string') return;
  const sep  = args.indexOf(';');
  const cmd  = sep > -1 ? args.substring(0, sep) : args;
  const rest = sep > -1 ? args.substring(sep + 1) : '';

  switch (cmd) {

    case 'interpOpen': {
      dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'OpenWork XML', extensions: ['xml'] }, { name: 'Tous', extensions: ['*'] }]
      }).then(result => {
        if (result.canceled || !result.filePaths[0]) return;
        currentFilePath = result.filePaths[0];
        const data = fs.readFileSync(currentFilePath, 'utf-8');
        win.webContents.send('fromMain', 'owLoaded;' + data);
      }).catch(err => console.error('interpOpen:', err));
      break;
    }

    case 'owSave': {
      const semi      = rest.indexOf(';');
      const existing  = semi > -1 ? rest.substring(0, semi) : rest;
      const xmlData   = semi > -1 ? rest.substring(semi + 1) : '';
      if (existing && fs.existsSync(existing)) {
        fs.writeFileSync(existing, xmlData, 'utf-8');
        win.webContents.send('fromMain', 'owSaved;' + existing);
      } else {
        dialog.showSaveDialog(win, {
          defaultPath: currentFilePath || path.join(app.getPath('home'), 'projet.xml'),
          filters: [{ name: 'OpenWork XML', extensions: ['xml'] }]
        }).then(result => {
          if (result.canceled || !result.filePath) return;
          currentFilePath = result.filePath;
          fs.writeFileSync(currentFilePath, xmlData, 'utf-8');
          win.webContents.send('fromMain', 'owSaved;' + currentFilePath);
        }).catch(err => console.error('owSave:', err));
      }
      break;
    }

    case 'owSaveAs': {
      dialog.showSaveDialog(win, {
        defaultPath: currentFilePath || path.join(app.getPath('home'), 'projet.xml'),
        filters: [{ name: 'OpenWork XML', extensions: ['xml'] }]
      }).then(result => {
        if (result.canceled || !result.filePath) return;
        currentFilePath = result.filePath;
        fs.writeFileSync(currentFilePath, rest, 'utf-8');
        win.webContents.send('fromMain', 'owSaved;' + currentFilePath);
      }).catch(err => console.error('owSaveAs:', err));
      break;
    }

    case 'owExportInterp': {
      dialog.showSaveDialog(win, {
        defaultPath: path.join(app.getPath('home'), 'export_interpretor.xml'),
        filters: [{ name: 'OpenWork XML', extensions: ['xml'] }]
      }).then(result => {
        if (result.canceled || !result.filePath) return;
        fs.writeFileSync(result.filePath, rest, 'utf-8');
      }).catch(err => console.error('owExportInterp:', err));
      break;
    }
  }
});
