const hostEl = document.getElementById('host');
const portEl = document.getElementById('port');
const userEl = document.getElementById('username');
const passEl = document.getElementById('password');
const keyEl = document.getElementById('privateKey');
const pickKeyBtn = document.getElementById('pickKeyBtn');
const passphraseEl = document.getElementById('passphrase');
const startPathEl = document.getElementById('startPath');
const profileSelectEl = document.getElementById('profileSelect');
const profileNameEl = document.getElementById('profileName');
const loadProfileBtn = document.getElementById('loadProfileBtn');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const deleteProfileBtn = document.getElementById('deleteProfileBtn');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusEl = document.getElementById('status');
const pathInput = document.getElementById('pathInput');
const loadBtn = document.getElementById('loadBtn');
const fileList = document.getElementById('fileList');
const editor = document.getElementById('editor');
const saveBtn = document.getElementById('saveBtn');
const currentFileEl = document.getElementById('currentFile');
const editorTabBtn = document.getElementById('editorTabBtn');
const terminalTabBtn = document.getElementById('terminalTabBtn');
const terminalPane = document.getElementById('terminalPane');
const startTermBtn = document.getElementById('startTermBtn');
const stopTermBtn = document.getElementById('stopTermBtn');
const terminalOutput = document.getElementById('terminalOutput');
const terminalInput = document.getElementById('terminalInput');
const sendTermBtn = document.getElementById('sendTermBtn');

let currentPath = '.';
let currentFile = '';
let profiles = [];
let terminalStarted = false;

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

function showEditorView() {
  editor.classList.remove('hidden');
  terminalPane.classList.add('hidden');
  editorTabBtn.classList.add('active');
  terminalTabBtn.classList.remove('active');
}

function showTerminalView() {
  editor.classList.add('hidden');
  terminalPane.classList.remove('hidden');
  terminalTabBtn.classList.add('active');
  editorTabBtn.classList.remove('active');
}

function appendTerminalOutput(text) {
  terminalOutput.textContent += text;
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
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

function applyProfile(profile) {
  if (!profile) return;
  profileNameEl.value = profile.name || '';
  hostEl.value = profile.host || '';
  portEl.value = String(profile.port || 22);
  userEl.value = profile.username || '';
  startPathEl.value = profile.startPath || '.';
}

async function refreshProfiles() {
  const res = await window.api.listProfiles();
  if (!res.ok) {
    setStatus(res.error || 'Failed loading profiles', true);
    return;
  }
  profiles = res.profiles || [];
  profileSelectEl.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select profile';
  profileSelectEl.appendChild(placeholder);

  for (const profile of profiles) {
    const opt = document.createElement('option');
    opt.value = profile.name;
    opt.textContent = `${profile.name} (${profile.username}@${profile.host}:${profile.port})`;
    profileSelectEl.appendChild(opt);
  }
}

async function connectWithHostTrustRetry() {
  const connectPayload = {
    host: hostEl.value.trim(),
    port: portEl.value.trim(),
    username: userEl.value.trim(),
    password: passEl.value,
    privateKey: keyEl.value,
    passphrase: passphraseEl.value
  };

  let res = await window.api.connect(connectPayload);
  if (res.ok) {
    return res;
  }

  if (res.code !== 'HOST_UNTRUSTED') {
    return res;
  }

  let hostKey = res.hostKey;
  if (!hostKey) {
    const pendingRes = await window.api.getPendingHostKey();
    hostKey = pendingRes.hostKey;
  }

  if (!hostKey) {
    return { ok: false, error: 'Host key not trusted and no fingerprint found' };
  }

  const shouldTrust = window.confirm(
    `Unknown host key for ${hostKey.host}:${hostKey.port}\n` +
      `Fingerprint: ${hostKey.fingerprint}\n\n` +
      'Trust this host and continue?'
  );
  if (!shouldTrust) {
    return { ok: false, error: 'Connection canceled: host key not trusted' };
  }

  const trustRes = await window.api.trustHostKey(hostKey);
  if (!trustRes.ok) {
    return { ok: false, error: trustRes.error || 'Failed to trust host key' };
  }

  res = await window.api.connect({ ...connectPayload, trustOnFirstUse: true });
  return res;
}

connectBtn.onclick = async () => {
  setStatus('Connecting...');
  const res = await connectWithHostTrustRetry();

  if (!res.ok) {
    setStatus(res.error || 'Connection failed', true);
    return;
  }

  setStatus('Connected');
  await loadDir(startPathEl.value.trim() || pathInput.value.trim() || '.');
};

disconnectBtn.onclick = async () => {
  if (terminalStarted) {
    await window.api.stopTerminal();
    terminalStarted = false;
  }
  await window.api.disconnect();
  setStatus('Disconnected');
  fileList.innerHTML = '';
  editor.value = '';
  currentFile = '';
  currentFileEl.textContent = 'No file open';
  terminalOutput.textContent = '';
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

pickKeyBtn.onclick = async () => {
  const res = await window.api.pickPrivateKey();
  if (!res.ok) {
    if (!res.canceled) {
      setStatus(res.error || 'Failed to load key file', true);
    }
    return;
  }

  keyEl.value = res.keyContent || '';
  setStatus(`Loaded key from ${res.filePath}`);
};

loadProfileBtn.onclick = async () => {
  const selectedName = profileSelectEl.value;
  const profile = profiles.find((p) => p.name === selectedName);
  if (!profile) {
    setStatus('Select a profile first', true);
    return;
  }
  applyProfile(profile);
  setStatus(`Loaded profile ${selectedName}`);
};

saveProfileBtn.onclick = async () => {
  const payload = {
    name: profileNameEl.value.trim(),
    host: hostEl.value.trim(),
    port: Number(portEl.value.trim() || 22),
    username: userEl.value.trim(),
    startPath: startPathEl.value.trim() || '.'
  };
  const res = await window.api.saveProfile(payload);
  if (!res.ok) {
    setStatus(res.error || 'Failed to save profile', true);
    return;
  }
  await refreshProfiles();
  profileSelectEl.value = payload.name;
  setStatus(`Saved profile ${payload.name}`);
};

deleteProfileBtn.onclick = async () => {
  const target = profileSelectEl.value || profileNameEl.value.trim();
  if (!target) {
    setStatus('Choose a profile to delete', true);
    return;
  }
  const confirmed = window.confirm(`Delete profile "${target}"?`);
  if (!confirmed) {
    return;
  }
  const res = await window.api.deleteProfile(target);
  if (!res.ok) {
    setStatus(res.error || 'Failed to delete profile', true);
    return;
  }
  await refreshProfiles();
  setStatus(`Deleted profile ${target}`);
};

editorTabBtn.onclick = () => showEditorView();
terminalTabBtn.onclick = () => showTerminalView();

startTermBtn.onclick = async () => {
  const res = await window.api.startTerminal();
  if (!res.ok) {
    setStatus(res.error || 'Failed to start terminal', true);
    return;
  }
  terminalStarted = true;
  setStatus('Terminal started');
  showTerminalView();
};

stopTermBtn.onclick = async () => {
  const res = await window.api.stopTerminal();
  if (!res.ok) {
    setStatus(res.error || 'Failed to stop terminal', true);
    return;
  }
  terminalStarted = false;
  setStatus('Terminal stopped');
};

async function sendTerminalInput() {
  if (!terminalInput.value.trim()) return;
  if (!terminalStarted) {
    const startRes = await window.api.startTerminal();
    if (!startRes.ok) {
      setStatus(startRes.error || 'Failed to start terminal', true);
      return;
    }
    terminalStarted = true;
  }

  const cmd = `${terminalInput.value}\n`;
  const res = await window.api.sendTerminal(cmd);
  if (!res.ok) {
    setStatus(res.error || 'Failed sending command', true);
    return;
  }
  terminalInput.value = '';
}

sendTermBtn.onclick = () => {
  void sendTerminalInput();
};

terminalInput.onkeydown = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void sendTerminalInput();
  }
};

window.api.onTerminalData((text) => {
  appendTerminalOutput(text);
});

showEditorView();
void refreshProfiles();
