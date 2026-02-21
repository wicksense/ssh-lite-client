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
const connDetailsEl = document.getElementById('connDetails');
const loadProfileBtn = document.getElementById('loadProfileBtn');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const deleteProfileBtn = document.getElementById('deleteProfileBtn');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusEl = document.getElementById('status');
const pathInput = document.getElementById('pathInput');
const loadBtn = document.getElementById('loadBtn');
const fileList = document.getElementById('fileList');
const editorHost = document.getElementById('editorHost');
const saveBtn = document.getElementById('saveBtn');
const closeFileBtn = document.getElementById('closeFileBtn');
const currentFileEl = document.getElementById('currentFile');
const editorTabBtn = document.getElementById('editorTabBtn');
const terminalTabBtn = document.getElementById('terminalTabBtn');
const terminalPane = document.getElementById('terminalPane');
const startTermBtn = document.getElementById('startTermBtn');
const stopTermBtn = document.getElementById('stopTermBtn');
const clearTermBtn = document.getElementById('clearTermBtn');
const terminalStatusEl = document.getElementById('terminalStatus');
const terminalHost = document.getElementById('terminalHost');
const terminalContextMenu = document.getElementById('terminalContextMenu');
const termMenuCopyBtn = document.getElementById('termMenuCopyBtn');
const termMenuPasteBtn = document.getElementById('termMenuPasteBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const themeSelect = document.getElementById('themeSelect');
const workspaceMain = document.getElementById('workspaceMain');
const sidebarResizeHandle = document.getElementById('sidebarResizeHandle');
const discardModal = document.getElementById('discardModal');
const discardMessage = document.getElementById('discardMessage');
const discardCancelBtn = document.getElementById('discardCancelBtn');
const discardConfirmBtn = document.getElementById('discardConfirmBtn');
const hostTrustModal = document.getElementById('hostTrustModal');
const hostTrustMessage = document.getElementById('hostTrustMessage');
const hostTrustCancelBtn = document.getElementById('hostTrustCancelBtn');
const hostTrustConfirmBtn = document.getElementById('hostTrustConfirmBtn');
const deleteProfileModal = document.getElementById('deleteProfileModal');
const deleteProfileMessage = document.getElementById('deleteProfileMessage');
const deleteProfileCancelBtn = document.getElementById('deleteProfileCancelBtn');
const deleteProfileConfirmBtn = document.getElementById('deleteProfileConfirmBtn');

let currentPath = '.';
let currentFile = '';
let profiles = [];
let terminalStarted = false;
let terminalStarting = false;
let sshConnected = false;
let isDirty = false;
let discardResolver = null;
let hostTrustResolver = null;
let deleteProfileResolver = null;
let term = null;
let fitAddon = null;
let xtermReady = false;
let monacoApi = null;
let monacoEditor = null;
let monacoReady = false;
let monacoInitPromise = null;
let suppressDirtyTracking = false;

function updateCurrentFileLabel() {
  if (!currentFile) {
    currentFileEl.textContent = 'No file open';
    return;
  }
  currentFileEl.textContent = isDirty ? `${currentFile} *` : currentFile;
}

async function ensureMonacoReady() {
  if (monacoReady) return true;

  if (!monacoInitPromise) {
    monacoInitPromise = new Promise((resolve, reject) => {
      try {
        const amdRequire = window.require;
        if (!amdRequire) {
          reject(new Error('Monaco AMD loader not available'));
          return;
        }

        amdRequire.config({
          paths: {
            vs: '../../node_modules/monaco-editor/min/vs'
          }
        });

        amdRequire(['vs/editor/editor.main'], () => {
          const monaco = window.monaco;
          if (!monaco) {
            reject(new Error('Monaco failed to initialize'));
            return;
          }

          monacoApi = monaco;
          monacoEditor = monaco.editor.create(editorHost, {
            value: '',
            language: 'plaintext',
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 13,
            scrollBeyondLastLine: false,
            theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'vs' : 'vs-dark'
          });

          monacoEditor.onDidChangeModelContent(() => {
            if (!currentFile || suppressDirtyTracking) return;
            if (!isDirty) {
              isDirty = true;
              updateCurrentFileLabel();
            }
          });

          monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            void saveBtn.onclick();
          });

          monacoReady = true;
          resolve(true);
        }, (err) => reject(err));
      } catch (err) {
        reject(err);
      }
    });
  }

  try {
    await monacoInitPromise;
    return true;
  } catch (err) {
    setStatus(`Failed to initialize editor: ${err.message || err}`, true);
    monacoInitPromise = null;
    return false;
  }
}

function getEditorValue() {
  return monacoEditor ? monacoEditor.getValue() : '';
}

function setEditorValue(text) {
  if (!monacoEditor) return;
  suppressDirtyTracking = true;
  monacoEditor.setValue(text || '');
  suppressDirtyTracking = false;
}

function setEditorLanguageFromPath(filePath) {
  if (!monacoEditor) return;
  const model = monacoEditor.getModel();
  if (!model) return;

  const ext = (filePath.split('.').pop() || '').toLowerCase();
  const map = {
    js: 'javascript',
    ts: 'typescript',
    json: 'json',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    md: 'markdown',
    py: 'python',
    conf: 'ini',
    ini: 'ini',
    toml: 'ini',
    xml: 'xml',
    html: 'html',
    css: 'css'
  };

  const language = map[ext] || 'plaintext';
  monacoApi?.editor.setModelLanguage(model, language);
}

function updateEditorTheme() {
  if (!monacoReady) return;
  const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'vs' : 'vs-dark';
  monacoApi?.editor.setTheme(theme);
}

function focusEditorSoon() {
  const tryFocus = () => {
    document.body.classList.remove('resizing');
    window.focus();
    monacoEditor?.focus();
  };

  requestAnimationFrame(() => {
    tryFocus();
    setTimeout(tryFocus, 0);
    setTimeout(tryFocus, 80);
    setTimeout(tryFocus, 180);
  });
}

function updateTerminalUI() {
  const canStart = sshConnected && !terminalStarted && !terminalStarting;
  const canStop = terminalStarted && !terminalStarting;

  startTermBtn.disabled = !canStart;
  stopTermBtn.disabled = !canStop;

  if (!sshConnected) {
    terminalStatusEl.textContent = 'Shell: connect first';
  } else if (terminalStarting) {
    terminalStatusEl.textContent = 'Shell: starting...';
  } else if (terminalStarted) {
    terminalStatusEl.textContent = 'Shell: running';
  } else {
    terminalStatusEl.textContent = 'Shell: stopped';
  }
}

async function ensureTerminalStarted() {
  if (!sshConnected) {
    setStatus('Connect first to start terminal', true);
    updateTerminalUI();
    return false;
  }

  if (!(await ensureXtermReady())) {
    updateTerminalUI();
    return false;
  }

  if (terminalStarted) {
    fitAddon?.fit();
    void window.api.resizeTerminal(term.cols, term.rows);
    term.focus();
    updateTerminalUI();
    return true;
  }

  terminalStarting = true;
  updateTerminalUI();
  const res = await window.api.startTerminal();
  terminalStarting = false;

  if (!res.ok) {
    setStatus(res.error || 'Failed to start terminal', true);
    updateTerminalUI();
    return false;
  }

  terminalStarted = true;
  fitAddon?.fit();
  void window.api.resizeTerminal(term.cols, term.rows);
  term.focus();
  setStatus('Terminal started');
  updateTerminalUI();
  return true;
}

function hideDiscardModal(confirmed) {
  discardModal.classList.add('hidden');
  const resolver = discardResolver;
  discardResolver = null;
  if (resolver) resolver(confirmed);
}

async function confirmDiscardUnsaved(actionLabel = 'continue') {
  if (!isDirty) return true;

  discardMessage.textContent = `You have unsaved changes. Discard them and ${actionLabel}?`;
  discardModal.classList.remove('hidden');

  discardCancelBtn.focus();

  return new Promise((resolve) => {
    discardResolver = resolve;
  });
}

function hideHostTrustModal(confirmed) {
  hostTrustModal.classList.add('hidden');
  const resolver = hostTrustResolver;
  hostTrustResolver = null;
  if (resolver) resolver(confirmed);
}

async function confirmHostTrust(hostKey) {
  hostTrustMessage.textContent =
    `Unknown host key for ${hostKey.host}:${hostKey.port}\n` +
    `Fingerprint: ${hostKey.fingerprint}\n\nTrust this host and continue?`;

  hostTrustModal.classList.remove('hidden');
  hostTrustCancelBtn.focus();

  return new Promise((resolve) => {
    hostTrustResolver = resolve;
  });
}

function hideDeleteProfileModal(confirmed) {
  deleteProfileModal.classList.add('hidden');
  const resolver = deleteProfileResolver;
  deleteProfileResolver = null;
  if (resolver) resolver(confirmed);
}

async function confirmDeleteProfile(profileName) {
  deleteProfileMessage.textContent = `Delete profile \"${profileName}\"?`;
  deleteProfileModal.classList.remove('hidden');
  deleteProfileCancelBtn.focus();

  return new Promise((resolve) => {
    deleteProfileResolver = resolve;
  });
}

function hideTerminalContextMenu() {
  terminalContextMenu.classList.add('hidden');
}

function showTerminalContextMenu(x, y) {
  terminalContextMenu.style.left = `${x}px`;
  terminalContextMenu.style.top = `${y}px`;
  terminalContextMenu.classList.remove('hidden');
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
  setEditorValue('');
  setEditorLanguageFromPath('');
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

  const stopDragging = () => {
    dragging = false;
    document.body.classList.remove('resizing');
  };

  sidebarResizeHandle.addEventListener('mousedown', () => {
    dragging = true;
    document.body.classList.add('resizing');
  });

  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    const rect = workspaceMain.getBoundingClientRect();
    setSidebarWidth(event.clientX - rect.left);
  });

  window.addEventListener('mouseup', stopDragging);
  window.addEventListener('blur', stopDragging);
  window.addEventListener('pointerup', stopDragging);
  document.addEventListener('mouseleave', stopDragging);
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
  editorHost.classList.remove('hidden');
  terminalPane.classList.add('hidden');
  editorTabBtn.classList.add('active');
  terminalTabBtn.classList.remove('active');
  monacoEditor?.layout();
}

function showTerminalView() {
  editorHost.classList.add('hidden');
  terminalPane.classList.remove('hidden');
  terminalTabBtn.classList.add('active');
  editorTabBtn.classList.remove('active');
}

async function ensureXtermReady() {
  if (xtermReady) return true;

  try {
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('../../node_modules/@xterm/xterm/lib/xterm.mjs'),
      import('../../node_modules/@xterm/addon-fit/lib/addon-fit.mjs')
    ]);

    term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: '#0b0f1a',
        foreground: '#d5e4ff'
      },
      scrollback: 5000
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalHost);
    fitAddon.fit();

    term.onData((data) => {
      void sendTextToTerminal(data);
    });

    term.attachCustomKeyEventHandler((event) => {
      const key = event.key.toLowerCase();
      const isMeta = event.ctrlKey || event.metaKey;

      if (isMeta && key === 'c' && term.hasSelection()) {
        const selected = term.getSelection();
        if (selected) {
          void navigator.clipboard?.writeText(selected);
        }
        return false;
      }

      if (event.type === 'keydown' && isMeta && event.shiftKey && key === 'v') {
        void navigator.clipboard?.readText().then((text) => sendTextToTerminal(text));
        return false;
      }

      return true;
    });

    terminalHost.addEventListener('paste', (event) => {
      const text = event.clipboardData?.getData('text');
      if (!text) return;
      event.preventDefault();
      void sendTextToTerminal(text);
    });

    terminalHost.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showTerminalContextMenu(event.clientX, event.clientY);
    });

    termMenuCopyBtn.onclick = async () => {
      const selected = term?.getSelection?.() || '';
      if (selected) {
        await navigator.clipboard?.writeText(selected);
      }
      hideTerminalContextMenu();
    };

    termMenuPasteBtn.onclick = async () => {
      const text = await navigator.clipboard?.readText();
      if (text) {
        await sendTextToTerminal(text);
      }
      hideTerminalContextMenu();
    };

    document.addEventListener('click', () => hideTerminalContextMenu());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideTerminalContextMenu();
      }
    });

    term.onResize(({ cols, rows }) => {
      void window.api.resizeTerminal(cols, rows);
    });

    window.addEventListener('resize', () => {
      if (!fitAddon) return;
      fitAddon.fit();
      void window.api.resizeTerminal(term.cols, term.rows);
    });

    xtermReady = true;
    return true;
  } catch (err) {
    setStatus(`Failed to initialize terminal UI: ${err.message || err}`, true);
    return false;
  }
}

async function sendTextToTerminal(text) {
  if (!text) return;
  if (!(await ensureTerminalStarted())) return;
  const res = await window.api.sendTerminal(text);
  if (!res.ok) {
    setStatus(res.error || 'Failed sending terminal input', true);
  }
}

function appendTerminalOutput(text) {
  if (!term) return;
  term.write(text);
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

      if (!(await ensureMonacoReady())) {
        return;
      }

      if (!(await confirmDiscardUnsaved('open another file'))) {
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
      setEditorValue(fileRes.content || '');
      setEditorLanguageFromPath(fullPath);
      showEditorView();
      focusEditorSoon();
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

  // Credentials are intentionally not persisted in profiles.
  passEl.value = '';
  keyEl.value = '';
  passphraseEl.value = '';
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

  if (!hostKey || !hostKey.host || !hostKey.port || !hostKey.fingerprint) {
    return { ok: false, error: 'Host key details missing. Check host/username fields and try again.' };
  }

  const shouldTrust = await confirmHostTrust(hostKey);
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
  const host = hostEl.value.trim();
  const username = userEl.value.trim();

  if (!host || !username) {
    setStatus('Host and username are required (load/select a profile first)', true);
    return;
  }

  setStatus('Connecting...');
  const res = await connectWithHostTrustRetry();

  if (!res.ok) {
    setStatus(res.error || 'Connection failed', true);
    return;
  }

  sshConnected = true;
  updateTerminalUI();
  setStatus('Connected');
  connDetailsEl.open = false;
  await loadDir(startPathEl.value.trim() || pathInput.value.trim() || '.');
};

disconnectBtn.onclick = async () => {
  if (!(await confirmDiscardUnsaved('disconnect'))) {
    return;
  }

  if (terminalStarted) {
    await window.api.stopTerminal();
    terminalStarted = false;
  }
  terminalStarting = false;
  sshConnected = false;
  await window.api.disconnect();
  connDetailsEl.open = true;
  updateTerminalUI();
  setStatus('Disconnected');
  fileList.innerHTML = '';
  closeCurrentFile();
  term?.clear();
};

loadBtn.onclick = async () => {
  await loadDir(pathInput.value.trim() || '.');
};

saveBtn.onclick = async () => {
  if (!currentFile) {
    setStatus('No file selected', true);
    return;
  }

  const res = await window.api.writeFile(currentFile, getEditorValue());
  if (!res.ok) {
    setStatus(res.error || 'Save failed', true);
    return;
  }

  isDirty = false;
  updateCurrentFileLabel();
  setStatus(`Saved ${currentFile}`);
};

closeFileBtn.onclick = async () => {
  if (!currentFile) {
    setStatus('No file open', true);
    return;
  }
  if (!(await confirmDiscardUnsaved('close this file'))) {
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

profileSelectEl.onchange = () => {
  const selectedName = profileSelectEl.value;
  const profile = profiles.find((p) => p.name === selectedName);
  if (!profile) return;
  applyProfile(profile);
  setStatus('Profile loaded (password/private key are not stored in profiles)');
};

loadProfileBtn.onclick = async () => {
  const selectedName = profileSelectEl.value;
  const profile = profiles.find((p) => p.name === selectedName);
  if (!profile) {
    setStatus('Select a profile first', true);
    return;
  }
  applyProfile(profile);
  setStatus(`Loaded profile ${selectedName} (password/private key are not stored)`);
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
  const confirmed = await confirmDeleteProfile(target);
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
terminalTabBtn.onclick = async () => {
  showTerminalView();
  if (await ensureTerminalStarted()) {
    term?.focus();
  }
};

startTermBtn.onclick = async () => {
  await ensureTerminalStarted();
  showTerminalView();
};

stopTermBtn.onclick = async () => {
  if (!terminalStarted) {
    updateTerminalUI();
    return;
  }
  const res = await window.api.stopTerminal();
  if (!res.ok) {
    setStatus(res.error || 'Failed to stop terminal', true);
    return;
  }
  terminalStarted = false;
  updateTerminalUI();
  setStatus('Terminal stopped');
};

clearTermBtn.onclick = () => {
  if (!term) return;
  term.clear();
};

settingsBtn.onclick = () => openSettings();
closeSettingsBtn.onclick = () => closeSettings();

settingsModal.onclick = (event) => {
  if (event.target === settingsModal) {
    closeSettings();
  }
};

discardModal.onclick = (event) => {
  if (event.target === discardModal) {
    hideDiscardModal(false);
  }
};

hostTrustModal.onclick = (event) => {
  if (event.target === hostTrustModal) {
    hideHostTrustModal(false);
  }
};

deleteProfileModal.onclick = (event) => {
  if (event.target === deleteProfileModal) {
    hideDeleteProfileModal(false);
  }
};

discardCancelBtn.onclick = () => hideDiscardModal(false);
discardConfirmBtn.onclick = () => hideDiscardModal(true);
hostTrustCancelBtn.onclick = () => hideHostTrustModal(false);
hostTrustConfirmBtn.onclick = () => hideHostTrustModal(true);
deleteProfileCancelBtn.onclick = () => hideDeleteProfileModal(false);
deleteProfileConfirmBtn.onclick = () => hideDeleteProfileModal(true);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!discardModal.classList.contains('hidden')) {
      hideDiscardModal(false);
      return;
    }
    if (!hostTrustModal.classList.contains('hidden')) {
      hideHostTrustModal(false);
      return;
    }
    if (!deleteProfileModal.classList.contains('hidden')) {
      hideDeleteProfileModal(false);
      return;
    }
    closeSettings();
  }
});

themeSelect.onchange = () => {
  applyTheme(themeSelect.value);
  updateEditorTheme();
};

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

window.addEventListener('focus', () => {
  const inEditorView = !editorHost.classList.contains('hidden');
  if (currentFile && inEditorView) {
    focusEditorSoon();
  }
});

window.api.onTerminalData((text) => {
  appendTerminalOutput(text);
  if (typeof text === 'string' && text.includes('[terminal closed]')) {
    terminalStarted = false;
    terminalStarting = false;
    updateTerminalUI();
    setStatus('Shell closed. Use Start Shell to reconnect.');
  }
});

loadThemePreference();
loadSidebarWidthPreference();
setupSidebarResize();
showEditorView();
void ensureMonacoReady();
updateCurrentFileLabel();
updateTerminalUI();
void refreshProfiles();
