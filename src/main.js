const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { Client } = require('ssh2');

let mainWindow;
let sshClient = null;
let sftp = null;
let shellStream = null;
let connected = false;
let pendingHostKey = null;

const profilesFile = () => path.join(app.getPath('userData'), 'profiles.json');
const knownHostsFile = () => path.join(app.getPath('userData'), 'known-hosts.json');

async function readJsonFile(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_err) {
    return fallbackValue;
  }
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function setupApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About SSH Lite Client',
          click: async () => {
            await dialog.showMessageBox({
              type: 'info',
              title: 'About SSH Lite Client',
              message: `SSH Lite Client v${app.getVersion()}`,
              detail: 'Lightweight SSH + SFTP editor for fast remote Linux maintenance.\n\nBuilt for quick config and script edits without full IDE overhead.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  setupApplicationMenu();
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function toEntry(item) {
  return {
    name: item.filename,
    longname: item.longname,
    type: item.longname.startsWith('d') ? 'directory' : 'file',
    size: item.attrs.size,
    mtime: item.attrs.mtime
  };
}

function emitTerminalData(text) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:data', text || '');
  }
}

function closeShellStream() {
  if (shellStream) {
    try {
      shellStream.end('exit\n');
    } catch (_err) {
      // ignore
    }
    shellStream = null;
  }
}

ipcMain.handle('ssh:connect', async (_event, cfg) => {
  if (connected) {
    return { ok: true };
  }

  const trustedHosts = await readJsonFile(knownHostsFile(), {});

  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    sshClient = new Client();
    pendingHostKey = null;

    sshClient.on('ready', () => {
      sshClient.sftp((err, sftpClient) => {
        if (err) {
          connected = false;
          settle({ ok: false, error: `SFTP init failed: ${err.message}` });
          return;
        }
        sftp = sftpClient;
        connected = true;
        settle({ ok: true });
      });
    });

    sshClient.on('error', (err) => {
      connected = false;
      if (pendingHostKey) {
        settle({ ok: false, code: 'HOST_UNTRUSTED', hostKey: pendingHostKey });
        return;
      }
      settle({ ok: false, error: err.message });
    });

    sshClient.on('close', () => {
      connected = false;
      sftp = null;
      shellStream = null;
      sshClient = null;
    });

    const connectConfig = {
      host: cfg.host,
      port: Number(cfg.port || 22),
      username: cfg.username,
      readyTimeout: 12000
    };

    if (cfg.privateKey && cfg.privateKey.trim()) {
      connectConfig.privateKey = cfg.privateKey;
      if (cfg.passphrase) {
        connectConfig.passphrase = cfg.passphrase;
      }
    } else {
      connectConfig.password = cfg.password;
    }

    connectConfig.hostHash = 'sha256';
    connectConfig.hostVerifier = (hashedKey) => {
      const hostPort = `${connectConfig.host}:${connectConfig.port}`;
      const fingerprint = `SHA256:${hashedKey}`;
      const trustedFingerprint = trustedHosts[hostPort];

      if (trustedFingerprint && trustedFingerprint === fingerprint) {
        return true;
      }

      if (cfg.trustOnFirstUse === true) {
        pendingHostKey = null;
        trustedHosts[hostPort] = fingerprint;
        void writeJsonFile(knownHostsFile(), trustedHosts);
        return true;
      }

      pendingHostKey = {
        host: connectConfig.host,
        port: connectConfig.port,
        fingerprint
      };
      return false;
    };

    sshClient.connect(connectConfig);
  });
});

ipcMain.handle('ssh:disconnect', async () => {
  closeShellStream();
  if (sshClient) {
    sshClient.end();
  }
  connected = false;
  sftp = null;
  shellStream = null;
  sshClient = null;
  return { ok: true };
});

ipcMain.handle('ssh:getPendingHostKey', async () => {
  return { ok: true, hostKey: pendingHostKey };
});

ipcMain.handle('ssh:trustHostKey', async (_event, hostKey) => {
  if (!hostKey || !hostKey.host || !hostKey.port || !hostKey.fingerprint) {
    return { ok: false, error: 'Invalid host key payload' };
  }
  const trustedHosts = await readJsonFile(knownHostsFile(), {});
  trustedHosts[`${hostKey.host}:${hostKey.port}`] = hostKey.fingerprint;
  await writeJsonFile(knownHostsFile(), trustedHosts);
  pendingHostKey = null;
  return { ok: true };
});

ipcMain.handle('profiles:list', async () => {
  const value = await readJsonFile(profilesFile(), { profiles: [] });
  if (!Array.isArray(value.profiles)) {
    return { ok: true, profiles: [] };
  }
  return { ok: true, profiles: value.profiles };
});

ipcMain.handle('profiles:save', async (_event, profile) => {
  if (!profile || !profile.name || !profile.host || !profile.username) {
    return { ok: false, error: 'Profile needs name, host, and username' };
  }

  const value = await readJsonFile(profilesFile(), { profiles: [] });
  const profiles = Array.isArray(value.profiles) ? value.profiles : [];
  const normalized = {
    name: profile.name,
    host: profile.host,
    port: Number(profile.port || 22),
    username: profile.username,
    startPath: profile.startPath || '.'
  };
  const idx = profiles.findIndex((p) => p.name === normalized.name);
  if (idx >= 0) {
    profiles[idx] = normalized;
  } else {
    profiles.push(normalized);
  }
  await writeJsonFile(profilesFile(), { profiles });
  return { ok: true, profiles };
});

ipcMain.handle('profiles:delete', async (_event, profileName) => {
  const value = await readJsonFile(profilesFile(), { profiles: [] });
  const profiles = Array.isArray(value.profiles) ? value.profiles : [];
  const next = profiles.filter((p) => p.name !== profileName);
  await writeJsonFile(profilesFile(), { profiles: next });
  return { ok: true, profiles: next };
});

ipcMain.handle('ssh:pickPrivateKey', async () => {
  const response = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Select Private Key',
    filters: [{ name: 'Private Key', extensions: ['pem', 'key', 'ppk', '*'] }]
  });

  if (response.canceled || response.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }

  const filePath = response.filePaths[0];
  const keyContent = await fs.readFile(filePath, 'utf8');
  return { ok: true, filePath, keyContent };
});

ipcMain.handle('terminal:start', async () => {
  if (!connected || !sshClient) {
    return { ok: false, error: 'Not connected' };
  }
  if (shellStream) {
    return { ok: true };
  }

  return new Promise((resolve) => {
    sshClient.shell(
      {
        term: 'xterm-256color',
        cols: 120,
        rows: 30
      },
      (err, stream) => {
        if (err) {
          resolve({ ok: false, error: err.message });
          return;
        }

        shellStream = stream;
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => emitTerminalData(chunk));
        stream.on('close', () => {
          emitTerminalData('\n[terminal closed]\n');
          shellStream = null;
        });
        stream.stderr?.on('data', (chunk) => emitTerminalData(chunk));

        resolve({ ok: true });
      }
    );
  });
});

ipcMain.handle('terminal:send', async (_event, data) => {
  if (!shellStream) {
    return { ok: false, error: 'Terminal not started' };
  }
  shellStream.write(data);
  return { ok: true };
});

ipcMain.handle('terminal:resize', async (_event, cols, rows) => {
  if (!shellStream) {
    return { ok: false, error: 'Terminal not started' };
  }

  try {
    const safeCols = Math.max(20, Number(cols || 120));
    const safeRows = Math.max(8, Number(rows || 30));
    shellStream.setWindow(safeRows, safeCols, 0, 0);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('terminal:stop', async () => {
  closeShellStream();
  return { ok: true };
});

ipcMain.handle('sftp:list', async (_event, remotePath) => {
  if (!connected || !sftp) {
    return { ok: false, error: 'Not connected' };
  }

  return new Promise((resolve) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) {
        resolve({ ok: false, error: err.message });
        return;
      }
      const entries = list.map(toEntry).sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      resolve({ ok: true, entries });
    });
  });
});

ipcMain.handle('sftp:readFile', async (_event, remotePath) => {
  if (!connected || !sftp) {
    return { ok: false, error: 'Not connected' };
  }

  return new Promise((resolve) => {
    const chunks = [];
    const stream = sftp.createReadStream(remotePath, { encoding: 'utf8' });

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', (err) => resolve({ ok: false, error: err.message }));
    stream.on('end', () => resolve({ ok: true, content: chunks.join('') }));
  });
});

ipcMain.handle('sftp:writeFile', async (_event, remotePath, content) => {
  if (!connected || !sftp) {
    return { ok: false, error: 'Not connected' };
  }

  return new Promise((resolve) => {
    const stream = sftp.createWriteStream(remotePath, { encoding: 'utf8' });
    stream.on('error', (err) => resolve({ ok: false, error: err.message }));
    stream.on('close', () => resolve({ ok: true }));
    stream.end(content);
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
