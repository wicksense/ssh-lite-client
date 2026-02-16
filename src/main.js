const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { Client } = require('ssh2');

let mainWindow;
let sshClient = null;
let sftp = null;
let connected = false;

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

ipcMain.handle('ssh:connect', async (_event, cfg) => {
  if (connected) {
    return { ok: true };
  }

  return new Promise((resolve) => {
    sshClient = new Client();

    sshClient.on('ready', () => {
      sshClient.sftp((err, sftpClient) => {
        if (err) {
          connected = false;
          resolve({ ok: false, error: `SFTP init failed: ${err.message}` });
          return;
        }
        sftp = sftpClient;
        connected = true;
        resolve({ ok: true });
      });
    });

    sshClient.on('error', (err) => {
      connected = false;
      resolve({ ok: false, error: err.message });
    });

    sshClient.on('close', () => {
      connected = false;
      sftp = null;
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

    sshClient.connect(connectConfig);
  });
});

ipcMain.handle('ssh:disconnect', async () => {
  if (sshClient) {
    sshClient.end();
  }
  connected = false;
  sftp = null;
  sshClient = null;
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
