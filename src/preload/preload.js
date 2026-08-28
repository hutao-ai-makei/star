const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 游戏库操作
  getGames: () => ipcRenderer.invoke('get-games'),
  getGame: (id) => ipcRenderer.invoke('get-game', id),
  addGame: (exePath) => ipcRenderer.invoke('add-game', exePath),
  updateGame: (id, updates) => ipcRenderer.invoke('update-game', id, updates),
  removeGame: (id) => ipcRenderer.invoke('remove-game', id),
  reorderGames: (orderedIds) => ipcRenderer.invoke('reorder-games', orderedIds),

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

  // 在资源管理器中打开路径
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),

  // 事件监听（均返回 unsubscribe 函数，避免重复注册导致监听器累积）
  onGameExited: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('game-exited', listener);
    return () => ipcRenderer.removeListener('game-exited', listener);
  },
  onGameRunning: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('game-running', listener);
    return () => ipcRenderer.removeListener('game-running', listener);
  },

  // === Update system ===
  checkUpdate: (gameId) => ipcRenderer.invoke('check-update', gameId),
  startDownload: (gameId, mode) => ipcRenderer.invoke('start-download', gameId, mode),
  pauseDownload: (gameId) => ipcRenderer.invoke('pause-download', gameId),
  cancelDownload: (gameId) => ipcRenderer.invoke('cancel-download', gameId),
  startInstall: (gameId) => ipcRenderer.invoke('start-install', gameId),
  rollbackGame: (gameId) => ipcRenderer.invoke('rollback-game', gameId),

  // === Update events ===
  onUpdateStatusChange: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('update-status-change', listener);
    return () => ipcRenderer.removeListener('update-status-change', listener);
  },
  onDownloadProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },
  onUpdateError: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('update-error', listener);
    return () => ipcRenderer.removeListener('update-error', listener);
  },
  onPreDownloadReady: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('predownload-ready', listener);
    return () => ipcRenderer.removeListener('predownload-ready', listener);
  }
});
