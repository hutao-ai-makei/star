const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { getAllGames, getGameById, addGame, updateGame, removeGame, getSettings, updateSettings } = require('./store');
const gameLauncher = require('./game-launcher');

let mainWindow = null;

function createWindow() {
  const settings = getSettings();

  mainWindow = new BrowserWindow({
    width: settings.windowWidth || 900,
    height: settings.windowHeight || 600,
    x: settings.windowX ?? undefined,
    y: settings.windowY ?? undefined,
    minWidth: 640,
    minHeight: 420,
    frame: false,
    backgroundColor: '#E8E0F0',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // 保存窗口状态
  mainWindow.on('close', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      updateSettings({
        windowWidth: bounds.width,
        windowHeight: bounds.height,
        windowX: bounds.x,
        windowY: bounds.y
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// === IPC Handlers ===

// 窗口控制
ipcMain.handle('minimize-window', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.handle('maximize-window', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.handle('close-window', () => { if (mainWindow) mainWindow.close(); });

// 游戏库操作
ipcMain.handle('get-games', () => getAllGames());
ipcMain.handle('get-game', (_e, id) => getGameById(id));

ipcMain.handle('add-game', async (_e, exePath) => {
  const name = path.basename(exePath, path.extname(exePath));
  return addGame({ name, exePath, coverPath: '' });
});

ipcMain.handle('update-game', (_e, id, updates) => updateGame(id, updates));
ipcMain.handle('remove-game', (_e, id) => removeGame(id));

// 文件选择
ipcMain.handle('select-exe-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择游戏可执行文件',
    filters: [
      { name: '可执行文件', extensions: ['exe', 'bat', 'lnk'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-cover-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择游戏封面',
    filters: [
      { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// 设置
ipcMain.handle('get-settings', () => getSettings());
ipcMain.handle('update-settings', (_e, updates) => updateSettings(updates));

// 游戏启动
ipcMain.handle('launch-game', (_e, id) => gameLauncher.launch(id, mainWindow));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
