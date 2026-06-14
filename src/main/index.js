const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
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
    title: '选择游戏图标',
    filters: [
      { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-background-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择游戏背景图片',
    filters: [
      { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-video-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择游戏背景视频',
    filters: [
      { name: '视频文件', extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// 选择游戏文件夹
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择游戏文件夹',
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// 选择媒体文件夹
ipcMain.handle('select-media-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择背景媒体文件夹（图片和视频）',
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// 扫描媒体目录中的图片和视频文件
ipcMain.handle('scan-media-dir', (_e, dirPath) => {
  const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.gif']);
  const VID_EXTS = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov']);
  const files = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (IMG_EXTS.has(ext)) {
        files.push({ path: path.join(dirPath, entry.name), type: 'image' });
      } else if (VID_EXTS.has(ext)) {
        files.push({ path: path.join(dirPath, entry.name), type: 'video' });
      }
    }
    // 按文件名排序
    files.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
  } catch (e) {
    return { error: e.message };
  }
  return { files };
});

// 扫描文件夹中的 exe 文件（顶层 + 一层子目录）
ipcMain.handle('scan-folder-exe', (_e, folderPath) => {
  const exes = [];
  try {
    // 扫描顶层
    const topFiles = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of topFiles) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
        exes.push(path.join(folderPath, entry.name));
      }
    }
    // 扫描一层子目录
    for (const entry of topFiles) {
      if (entry.isDirectory()) {
        const subDir = path.join(folderPath, entry.name);
        try {
          const subFiles = fs.readdirSync(subDir, { withFileTypes: true });
          for (const subEntry of subFiles) {
            if (subEntry.isFile() && subEntry.name.toLowerCase().endsWith('.exe')) {
              exes.push(path.join(subDir, subEntry.name));
            }
          }
        } catch (_) { /* 跳过无法读取的子目录 */ }
      }
    }
  } catch (e) {
    return { error: e.message };
  }
  return { exes };
});

// 提取 exe 图标
ipcMain.handle('extract-exe-icon', async (_e, gameId, exePath) => {
  try {
    const iconDir = path.join(app.getPath('userData'), 'icons');
    if (!fs.existsSync(iconDir)) {
      fs.mkdirSync(iconDir, { recursive: true });
    }
    const nativeImage = await app.getFileIcon(exePath, { size: 'large' });
    const pngPath = path.join(iconDir, `${gameId}.png`);
    fs.writeFileSync(pngPath, nativeImage.toPNG());
    return pngPath;
  } catch (err) {
    console.error('提取图标失败:', exePath, err.message);
    return null;
  }
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
