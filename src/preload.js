const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  connect: (config) => ipcRenderer.invoke('ssh:connect', config),
  disconnect: () => ipcRenderer.invoke('ssh:disconnect'),
  getPendingHostKey: () => ipcRenderer.invoke('ssh:getPendingHostKey'),
  trustHostKey: (hostKey) => ipcRenderer.invoke('ssh:trustHostKey', hostKey),
  pickPrivateKey: () => ipcRenderer.invoke('ssh:pickPrivateKey'),
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfile: (profile) => ipcRenderer.invoke('profiles:save', profile),
  deleteProfile: (profileName) => ipcRenderer.invoke('profiles:delete', profileName),
  getProfileSecret: (profile) => ipcRenderer.invoke('profiles:getSecret', profile),
  saveProfileSecret: (profile, secret) => ipcRenderer.invoke('profiles:saveSecret', profile, secret),
  deleteProfileSecret: (profile) => ipcRenderer.invoke('profiles:deleteSecret', profile),
  startTerminal: () => ipcRenderer.invoke('terminal:start'),
  sendTerminal: (data) => ipcRenderer.invoke('terminal:send', data),
  resizeTerminal: (cols, rows) => ipcRenderer.invoke('terminal:resize', cols, rows),
  stopTerminal: () => ipcRenderer.invoke('terminal:stop'),
  onTerminalData: (handler) => {
    const wrapped = (_event, text) => handler(text);
    ipcRenderer.on('terminal:data', wrapped);
    return () => ipcRenderer.removeListener('terminal:data', wrapped);
  },
  listDir: (remotePath) => ipcRenderer.invoke('sftp:list', remotePath),
  readFile: (remotePath) => ipcRenderer.invoke('sftp:readFile', remotePath),
  writeFile: (remotePath, content) => ipcRenderer.invoke('sftp:writeFile', remotePath, content),
  uploadTo: (remoteDir) => ipcRenderer.invoke('sftp:uploadTo', remoteDir),
  downloadFrom: (remotePath) => ipcRenderer.invoke('sftp:downloadFrom', remotePath),
  downloadManyFrom: (remotePaths) => ipcRenderer.invoke('sftp:downloadManyFrom', remotePaths)
});
