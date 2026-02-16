const hostEl = document.getElementById('host');
const portEl = document.getElementById('port');
const userEl = document.getElementById('username');
const passEl = document.getElementById('password');
const keyEl = document.getElementById('privateKey');
const passphraseEl = document.getElementById('passphrase');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusEl = document.getElementById('status');
const pathInput = document.getElementById('pathInput');
const loadBtn = document.getElementById('loadBtn');
const fileList = document.getElementById('fileList');
const editor = document.getElementById('editor');
const saveBtn = document.getElementById('saveBtn');
const currentFileEl = document.getElementById('currentFile');

let currentPath = '.';
let currentFile = '';

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#dc2626' : '#667085';
}

function parentPath(remotePath) {
  if (remotePath === '/' || remotePath === '.') return remotePath;
  const clean = remotePath.replace(/\/$/, '');
  const idx = clean.lastIndexOf('/');
  if (idx <= 0) return '/';
  return clean.slice(0, idx);
}

function joinPath(base, name) {
  if (base === '.' || base === '') return name;
  if (base.endsWith('/')) return `${base}${name}`;
  return `${base}/${name}`;
}

async function loadDir(path) {
  const res = await window.api.listDir(path);
  if (!res.ok) {
    setStatus(res.error || 'Failed loading dir', true);
    return;
  }

  currentPath = path;
  pathInput.value = path;
  fileList.innerHTML = '';

  if (path !== '/' && path !== '.') {
    const up = document.createElement('li');
    up.textContent = '..';
    up.className = 'dir';
    up.onclick = () => loadDir(parentPath(path));
    fileList.appendChild(up);
  }

  for (const entry of res.entries) {
    const li = document.createElement('li');
    li.textContent = entry.name;
    li.className = entry.type === 'directory' ? 'dir' : 'file';

    li.onclick = async () => {
      const fullPath = joinPath(path, entry.name);
      if (entry.type === 'directory') {
        await loadDir(fullPath);
        return;
      }

      const fileRes = await window.api.readFile(fullPath);
      if (!fileRes.ok) {
        setStatus(fileRes.error || 'Failed opening file', true);
        return;
      }

      currentFile = fullPath;
      currentFileEl.textContent = currentFile;
      editor.value = fileRes.content || '';
      setStatus(`Opened ${fullPath}`);
    };

    fileList.appendChild(li);
  }

  setStatus(`Loaded ${path}`);
}

connectBtn.onclick = async () => {
  setStatus('Connecting...');
  const res = await window.api.connect({
    host: hostEl.value.trim(),
    port: portEl.value.trim(),
    username: userEl.value.trim(),
    password: passEl.value,
    privateKey: keyEl.value,
    passphrase: passphraseEl.value
  });

  if (!res.ok) {
    setStatus(res.error || 'Connection failed', true);
    return;
  }

  setStatus('Connected');
  await loadDir(pathInput.value.trim() || '.');
};

disconnectBtn.onclick = async () => {
  await window.api.disconnect();
  setStatus('Disconnected');
  fileList.innerHTML = '';
  editor.value = '';
  currentFile = '';
  currentFileEl.textContent = 'No file open';
};

loadBtn.onclick = async () => {
  await loadDir(pathInput.value.trim() || '.');
};

saveBtn.onclick = async () => {
  if (!currentFile) {
    setStatus('No file selected', true);
    return;
  }

  const res = await window.api.writeFile(currentFile, editor.value);
  if (!res.ok) {
    setStatus(res.error || 'Save failed', true);
    return;
  }

  setStatus(`Saved ${currentFile}`);
};
