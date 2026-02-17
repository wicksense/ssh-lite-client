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
const closeFileBtn = document.getElementById('closeFileBtn');
const currentFileEl = document.getElementById('currentFile');
const editorTabBtn = document.getElementById('editorTabBtn');
const terminalTabBtn = document.getElementById('terminalTabBtn');
const terminalPane = document.getElementById('terminalPane');
const startTermBtn = document.getElementById('startTermBtn');
const stopTermBtn = document.getElementById('stopTermBtn');
const terminalOutput = document.getElementById('terminalOutput');
const terminalInput = document.getElementById('terminalInput');
const sendTermBtn = document.getElementById('sendTermBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const themeSelect = document.getElementById('themeSelect');
const workspaceMain = document.getElementById('workspaceMain');
const sidebarResizeHandle = document.getElementById('sidebarResizeHandle');

let currentPath = '.';
let currentFile = '';
let profiles = [];
let terminalStarted = false;
let isDirty = false;

function updateCurrentFileLabel() {
  if (!currentFile) {
    currentFileEl.textContent = 'No file open';
    return;
  }
  currentFileEl.textContent = isDirty ? `${currentFile} *` : currentFile;
}

function confirmDiscardUnsaved(actionLabel = 'continue') {
  if (!isDirty) return true;
  return window.confirm(`You have unsaved changes. Discard them and ${actionLabel}?`);
}

function applyTheme(theme) {
  const safeTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', safeTheme);
  themeSelect.value = safeTheme;
  localStorage.setItem('ssh-lite-theme', safeTheme);
}

function loadThemePreference() {
  const savedTheme = localStorage.getItem('ssh-lite-theme') || 'dark';
  applyTheme(savedTheme);
}

function openSettings() {
  settingsModal.classList.remove('hidden');
}

function closeSettings() {
  settingsModal.classList.add('hidden');
}

function closeCurrentFile() {
  currentFile = '';
  isDirty = false;
  updateCurrentFileLabel();
  editor.value = '';
  setStatus('Closed file');
}

function setSidebarWidth(px) {
  const min = 220;
  const max = Math.max(320, window.innerWidth * 0.55);
  const width = Math.min(max, Math.max(min, px));
  workspaceMain.style.gridTemplateColumns = `${width}px 8px minmax(0, 1fr)`;
  localStorage.setItem('ssh-lite-sidebar-width', String(Math.round(width)));
}

function loadSidebarWidthPreference() {
  const saved = Number(localStorage.getItem('ssh-lite-sidebar-width'));
  if (!Number.isFinite(saved) || saved <= 0) {
    return;
  }
  setSidebarWidth(saved);
}

function setupSidebarResize() {
  let dragging = false;

  sidebarResizeHandle.addEventListener('mousedown', () => {
    dragging = true;
    document.body.classList.add('resizing');
  });

  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    const rect = workspaceMain.getBoundingClientRect();
    setSidebarWidth(event.clientX - rect.left);
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
  });
}

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

      if (!confirmDiscardUnsaved('open another file')) {
        return;
      }

      const fileRes = await window.api.readFile(fullPath);
      if (!fileRes.ok) {
        setStatus(fileRes.error || 'Failed opening file', true);
        return;
      }

      currentFile = fullPath;
      isDirty = false;
      updateCurrentFileLabel();
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
  if (!confirmDiscardUnsaved('disconnect')) {
    return;
  }

  if (terminalStarted) {
    await window.api.stopTerminal();
    terminalStarted = false;
  }
  await window.api.disconnect();
  setStatus('Disconnected');
  fileList.innerHTML = '';
  closeCurrentFile();
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

  isDirty = false;
  updateCurrentFileLabel();
  setStatus(`Saved ${currentFile}`);
};

closeFileBtn.onclick = () => {
  if (!currentFile) {
    setStatus('No file open', true);
    return;
  }
  if (!confirmDiscardUnsaved('close this file')) {
    return;
  }
  closeCurrentFile();
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

settingsBtn.onclick = () => openSettings();
closeSettingsBtn.onclick = () => closeSettings();

settingsModal.onclick = (event) => {
  if (event.target === settingsModal) {
    closeSettings();
  }
};

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSettings();
  }
});

themeSelect.onchange = () => {
  applyTheme(themeSelect.value);
};

editor.addEventListener('input', () => {
  if (!currentFile) return;
  if (!isDirty) {
    isDirty = true;
    updateCurrentFileLabel();
  }
});

document.addEventListener('keydown', (event) => {
  const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
  if (!isSaveShortcut) return;
  event.preventDefault();
  void saveBtn.onclick();
});

window.addEventListener('beforeunload', (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = '';
});

window.api.onTerminalData((text) => {
  appendTerminalOutput(text);
});

loadThemePreference();
loadSidebarWidthPreference();
setupSidebarResize();
showEditorView();
updateCurrentFileLabel();
void refreshProfiles();
