const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 游戏库操作
  getGames: () => ipcRenderer.invoke('get-games'),
  getGame: (id) => ipcRenderer.invoke('get-game', id),
  addGame: (exePath) => ipcRenderer.invoke('add-game', exePath),
  updateGame: (id, updates) => ipcRenderer.invoke('update-game', id, updates),
  removeGame: (id) => ipcRenderer.invoke('remove-game', id),

  // 游戏启动
  launchGame: (id) => ipcRenderer.invoke('launch-game', id),

  // 文件对话框
  selectExeFile: () => ipcRenderer.invoke('select-exe-file'),
  selectCoverFile: () => ipcRenderer.invoke('select-cover-file'),
  selectBackgroundFile: () => ipcRenderer.invoke('select-background-file'),
  selectVideoFile: () => ipcRenderer.invoke('select-video-file'),
  selectMediaDir: () => ipcRenderer.invoke('select-media-dir'),
  scanMediaDir: (dirPath) => ipcRenderer.invoke('scan-media-dir', dirPath),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolderExe: (folderPath) => ipcRenderer.invoke('scan-folder-exe', folderPath),

  // 图标提取
  extractExeIcon: (gameId, exePath) => ipcRenderer.invoke('extract-exe-icon', gameId, exePath),

  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (updates) => ipcRenderer.invoke('update-settings', updates),

  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // 事件监听
  onGameExited: (callback) => {
    ipcRenderer.on('game-exited', (_event, data) => callback(data));
  },
  onGameRunning: (callback) => {
    ipcRenderer.on('game-running', (_event, data) => callback(data));
  }
});
