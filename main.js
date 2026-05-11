const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

let win = null;
let currentFilePath = '';
let interpCurrentDir = '';

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
  win.webContents.openDevTools();
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
        defaultPath: app.getPath('documents'),
        filters: [{ name: 'OpenWork XML', extensions: ['xml'] }, { name: 'Tous', extensions: ['*'] }]
      }).then(result => {
        if (result.canceled || !result.filePaths[0]) return;
        const data = fs.readFileSync(result.filePaths[0], 'utf-8');
        if (!/<openwork\b/i.test(data) || !/\bversion\s*=/i.test(data)) {
          dialog.showErrorBox('Fichier invalide', 'Ce fichier n\'est pas une partition OpenWork valide.');
          return;
        }
        currentFilePath  = result.filePaths[0];
        interpCurrentDir = path.dirname(currentFilePath);
        win.webContents.send('fromMain', 'owLoaded;' + currentFilePath + '\n' + data);
      }).catch(err => console.error('interpOpen:', err));
      break;
    }

    case 'interpLoadGrp': {
      const p1      = rest.indexOf(';');
      const p2      = p1 > -1 ? rest.indexOf(';', p1 + 1) : -1;
      const grpId   = p1 > -1 ? rest.substring(0, p1) : rest;
      const grpName = p1 > -1 ? (p2 > -1 ? rest.substring(p1 + 1, p2) : rest.substring(p1 + 1)) : '';
      const grpDir  = p2 > -1 ? rest.substring(p2 + 1) : '';
      console.log('[interpLoadGrp] id='+grpId+' name='+grpName+' dir='+grpDir+' currentDir='+interpCurrentDir);
      if (!grpName) break;
      const candidates = [];
      if (grpDir) candidates.push(path.join(grpDir, grpName));
      if (interpCurrentDir) candidates.push(path.join(interpCurrentDir, 'Groupes', grpName));
      let xmlFound = null;
      for (const f of candidates) {
        try { xmlFound = fs.readFileSync(f, 'utf-8'); console.log('[interpLoadGrp] lu:', f); break; }
        catch(e) { console.log('[interpLoadGrp] absent:', f); }
      }
      if (!xmlFound) { console.error('[interpLoadGrp] introuvable', grpName); break; }
      const imgDir = interpCurrentDir ? path.join(interpCurrentDir, 'Images') : (grpDir || '');
      const b64 = Buffer.from(xmlFound, 'utf-8').toString('base64');
      win.webContents.send('fromMain', 'interpGrpLoaded;' + grpId + ';' + imgDir + ';' + b64);
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
