const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  connect: (config) => ipcRenderer.invoke('ssh:connect', config),
  disconnect: () => ipcRenderer.invoke('ssh:disconnect'),
  listDir: (remotePath) => ipcRenderer.invoke('sftp:list', remotePath),
  readFile: (remotePath) => ipcRenderer.invoke('sftp:readFile', remotePath),
  writeFile: (remotePath, content) => ipcRenderer.invoke('sftp:writeFile', remotePath, content)
});
