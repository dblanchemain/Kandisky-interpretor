const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path   = require('path');
const fs     = require('fs');
const net    = require('net');
const dgram  = require('dgram');
const { spawn } = require('child_process');

// ══════════════════════════════════════════════════════════
//  NSM – Non Session Manager protocol (Ray Session, Catia…)
// ══════════════════════════════════════════════════════════
let nsmSocket   = null;
let nsmHost     = null;
let nsmPort     = null;
let nsmSavePath = null;   // chemin de session fourni par NSM

function oscPad4(buf) {
  const rem = buf.length % 4;
  return rem ? Buffer.concat([buf, Buffer.alloc(4 - rem)]) : buf;
}

function buildOsc(address, ...args) {
  const bufs = [oscPad4(Buffer.from(address + '\0'))];
  let tags = ',';
  const argBufs = [];
  for (const a of args) {
    if (typeof a === 'string') {
      tags += 's';
      argBufs.push(oscPad4(Buffer.from(a + '\0')));
    } else if (Number.isInteger(a)) {
      tags += 'i';
      const b = Buffer.alloc(4); b.writeInt32BE(a); argBufs.push(b);
    }
  }
  bufs.push(oscPad4(Buffer.from(tags + '\0')));
  return Buffer.concat([...bufs, ...argBufs]);
}

function parseOsc(buf) {
  let off = 0;
  const readStr = () => {
    let end = off;
    while (end < buf.length && buf[end] !== 0) end++;
    const s = buf.toString('utf8', off, end);
    off = Math.ceil((end + 1) / 4) * 4;
    return s;
  };
  const address = readStr();
  const tags    = readStr();
  const args = [];
  for (let i = 1; i < tags.length; i++) {
    if      (tags[i] === 's') args.push(readStr());
    else if (tags[i] === 'i') { args.push(buf.readInt32BE(off)); off += 4; }
    else if (tags[i] === 'f') { args.push(buf.readFloatBE(off)); off += 4; }
  }
  return { address, args };
}

function nsmSend(...oscArgs) {
  if (!nsmSocket) return;
  const msg = buildOsc(...oscArgs);
  nsmSocket.send(msg, nsmPort, nsmHost);
}

function nsmLoadState() {
  if (!nsmSavePath) return;
  const stateFile = nsmSavePath + '.json';
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    if (state.filePath && fs.existsSync(state.filePath)) {
      const data = fs.readFileSync(state.filePath, 'utf-8');
      currentFilePath  = state.filePath;
      interpCurrentDir = path.dirname(currentFilePath);
      win?.webContents.send('fromMain', 'owLoaded;' + currentFilePath + '\n' + data);
    }
  } catch(e) { /* pas de state existant */ }
}

function nsmSaveState() {
  if (!nsmSavePath) return;
  try {
    fs.mkdirSync(path.dirname(nsmSavePath), { recursive: true });
    fs.writeFileSync(nsmSavePath + '.json',
      JSON.stringify({ filePath: currentFilePath }), 'utf-8');
  } catch(e) { console.error('[NSM] saveState:', e); }
}

function initNSM() {
  const nsmUrl = process.env.NSM_URL;
  if (!nsmUrl) return;
  const m = nsmUrl.match(/osc\.udp:\/\/([\w.]+):(\d+)\//);
  if (!m) { console.warn('[NSM] URL invalide :', nsmUrl); return; }
  nsmHost = m[1];
  nsmPort = parseInt(m[2]);

  nsmSocket = dgram.createSocket('udp4');
  nsmSocket.bind(() => {
    console.log('[NSM] Connexion →', nsmHost, nsmPort);
    nsmSend('/nsm/server/announce',
      'kandisky-interpretor',   // nom affiché
      ':dirty:switch:',          // capacités
      'kandisky-interpretor',   // nom exécutable
      1, 2,                      // version API NSM
      process.pid
    );
  });

  nsmSocket.on('message', buf => {
    const { address, args } = parseOsc(buf);
    console.log('[NSM] ←', address, args);

    if (address === '/reply' && args[0] === '/nsm/server/announce') {
      console.log('[NSM] Annoncé. ID client :', args[2]);

    } else if (address === '/nsm/client/open') {
      nsmSavePath = args[0];
      nsmLoadState();
      nsmSend('/reply', '/nsm/client/open', 'opened');

    } else if (address === '/nsm/client/save') {
      nsmSaveState();
      nsmSend('/reply', '/nsm/client/save', 'saved');

    } else if (address === '/nsm/client/session_is_loaded') {
      console.log('[NSM] Session chargée');

    } else if (address === '/nsm/client/show_optional_gui') {
      win?.show();
    } else if (address === '/nsm/client/hide_optional_gui') {
      win?.hide();
    } else if (address === '/nsm/client/quit') {
      app.quit();
    }
  });

  nsmSocket.on('error', e => console.error('[NSM] Erreur socket :', e.message));
}

// Signaler les modifications non sauvegardées au gestionnaire de session
ipcMain.on('nsmDirty', (_, dirty) => {
  nsmSend(dirty ? '/nsm/client/is_dirty' : '/nsm/client/is_clean');
});

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
  win.webContents.openDevTools();
  win.removeMenu();
  win.on('closed', () => { win = null; });
}

// ── Spatialisation : accès aux layouts et à faustwasm ──────────────────────
const DSP_DIR   = path.join(__dirname, 'Dsp');
const FAUST_DIR = path.join(__dirname, 'faustwasm');

ipcMain.handle('spatListLayouts', () => {
  try {
    return fs.readdirSync(DSP_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5))
      .sort();
  } catch(e) { return []; }
});

ipcMain.handle('spatReadLayout', (_, name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DSP_DIR, name + '.json'), 'utf-8'));
  } catch(e) { return null; }
});

ipcMain.handle('spatGetPaths', () => ({
  basedir:   __dirname,
  faustWasm: FAUST_DIR
}));

// ── Audios : lecture / écriture des fichiers audio du groupe ──────────────────
ipcMain.handle('audiosReadFile', (_, partitionPath, filename) => {
  if (!partitionPath) return null;
  const filePath = path.join(path.dirname(partitionPath), 'Audios', filename);
  try { return fs.readFileSync(filePath); }
  catch(e) { return null; }
});

ipcMain.handle('audiosSaveFile', (_, partitionPath, subfolder, filename, data) => {
  if (!partitionPath) return false;
  const dir = path.join(path.dirname(partitionPath), 'Audios', subfolder);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), Buffer.from(data));
    return true;
  } catch(e) { console.error('audiosSaveFile:', e); return false; }
});

// ── Binaires embarqués (resources/bin/<os>/) ──────────────────────────────────
function findBundledBin(name) {
  const sub = process.platform === 'win32' ? 'win'
             : process.platform === 'darwin' ? 'mac' : 'linux';
  const ext = process.platform === 'win32' ? '.exe' : '';
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'resources');
  const bin  = path.join(base, 'bin', sub, name + ext);
  return fs.existsSync(bin) ? bin : null;
}

// ── Serveur audio Python (audio_server.py) ────────────────────────────────────
let audioServerProc = null;

function findFreePort(start) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(start, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
    srv.on('error', () => {
      if (start >= 9999) reject(new Error('Aucun port libre entre 9876 et 9999'));
      else findFreePort(start + 1).then(resolve).catch(reject);
    });
  });
}

function spawnAudioServer() {
  const pyScript = path.join(__dirname, 'audio_server.py');
  if (!fs.existsSync(pyScript)) {
    console.warn('[AudioServer] audio_server.py introuvable');
    return;
  }
  findFreePort(9876).then(port => {
    const rubberbandPath = findBundledBin('rubberband');
    const extraEnv = rubberbandPath ? { RUBBERBAND_PATH: rubberbandPath } : {};
    audioServerProc = spawn('python3', [pyScript, '--port', String(port)], {
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let buf = '';
    audioServerProc.stdout.on('data', chunk => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line === 'AUDIO_SERVER_READY') {
          console.log('[AudioServer] Prêt sur port', port);
          win?.webContents.send('fromMain', 'audioServerReady;' + port);
        } else if (line) {
          process.stdout.write('[AudioServer] ' + line + '\n');
        }
      }
    });
    audioServerProc.stderr.on('data', d => process.stderr.write('[AudioServer] ' + d.toString()));
    audioServerProc.on('exit', (code, sig) => {
      console.log('[AudioServer] Terminé (code=' + code + ', signal=' + sig + ')');
      audioServerProc = null;
    });
  }).catch(err => console.error('[AudioServer] findFreePort:', err.message));
}

// ── Résolution du chemin absolu d'un fichier audio ────────────────────────────
ipcMain.handle('resolveAudioPath', (_, partitionPath, filename) => {
  if (!partitionPath) return null;
  const audiosDir = path.join(path.dirname(partitionPath), 'Audios');
  const p1 = path.join(audiosDir, 'interprete', filename);
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(audiosDir, filename);
  if (fs.existsSync(p2)) return p2;
  return null;
});

app.whenReady().then(() => { createWindow(); initNSM(); spawnAudioServer(); });
app.on('window-all-closed', () => {
  if (audioServerProc) { try { audioServerProc.kill('SIGTERM'); } catch(e) {} audioServerProc = null; }
  if (process.platform !== 'darwin') app.quit();
});
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
      if (!grpName) break;
      const candidates = [];
      if (grpDir) candidates.push(path.join(grpDir, grpName));
      if (interpCurrentDir) candidates.push(path.join(interpCurrentDir, 'Groupes', grpName));
      let xmlFound = null;
      for (const f of candidates) {
        try { xmlFound = fs.readFileSync(f, 'utf-8'); break; }
        catch(e) {}
      }
      if (!xmlFound) break;
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
