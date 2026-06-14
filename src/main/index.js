const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { getAllGames, getGameById, addGame, updateGame, removeGame, reorderGame, getSettings, updateSettings } = require('./store');
const gameLauncher = require('./game-launcher');
const { checkForUpdate, pollPreDownloads } = require('./update-checker');
const { download, pause, cancel } = require('./download-manager');
const { install, rollback } = require('./install-manager');

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
    icon: path.join(__dirname, '..', '..', 'resources', 'icon.png'),
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

  // Start pre-download polling if enabled
  if (settings.autoCheckUpdate) {
    startPreDownloadPolling();
  }

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
ipcMain.handle('reorder-game', (_e, id, direction) => { reorderGame(id, direction); });

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

// === Pre-download polling ===
let preDownloadTimer = null;

function startPreDownloadPolling() {
  const settings = getSettings();
  const minutes = settings.preDownloadPollMinutes || 30;

  if (preDownloadTimer) clearInterval(preDownloadTimer);

  doPreDownloadPoll();

  preDownloadTimer = setInterval(doPreDownloadPoll, minutes * 60 * 1000);
}

async function doPreDownloadPoll() {
  try {
    const results = await pollPreDownloads();
    for (const { gameId, manifest } of results) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('predownload-ready', {
          gameId,
          version: manifest.preDownload.version,
          manifest
        });
      }
    }
  } catch (err) {
    console.error('Pre-download poll error:', err.message);
  }
}

// === Update System ===

// Check for updates
ipcMain.handle('check-update', async (_e, gameId) => {
  try {
    return await checkForUpdate(gameId);
  } catch (err) {
    console.error('check-update error:', err.message);
    return { hasUpdate: false, isPreDownload: false, forceUpdate: false, manifest: null, currentVersion: '' };
  }
});

// Start download
ipcMain.handle('start-download', async (_e, gameId, mode) => {
  const game = require('./store').getGameById(gameId);
  if (!game) return { success: false, error: 'Game not found' };

  try {
    const check = await checkForUpdate(gameId);
    if (!check.hasUpdate && !check.isPreDownload) {
      return { success: false, error: 'No update available' };
    }

    const manifest = check.manifest;
    let downloadOptions;

    if (check.isPreDownload) {
      const pd = manifest.preDownload;
      downloadOptions = { url: pd.url, chunks: pd.chunks, totalSize: pd.size, sha256: pd.sha256, mode: 'full' };
    } else if (mode === 'delta' && manifest.update.delta) {
      const delta = manifest.update.delta;
      downloadOptions = { url: delta.url, chunks: delta.chunks, totalSize: delta.size, sha256: delta.sha256, mode: 'delta' };
    } else {
      const upd = manifest.update;
      downloadOptions = { url: upd.url, chunks: upd.chunks, totalSize: upd.size, sha256: upd.sha256, mode: 'full' };
    }

    const targetVer = check.isPreDownload ? manifest.preDownload.version : manifest.update.version;
    require('./store').updateGame(gameId, {
      targetVersion: targetVer,
      updateMode: downloadOptions.mode,
      updateLog: manifest.updateLog || '',
      isPreDownload: check.isPreDownload,
    });

    const result = await download(gameId, downloadOptions, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-progress', { gameId, ...progress });
      }
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status-change', {
        gameId,
        status: 'done',
        message: check.isPreDownload ? 'Pre-download complete' : 'Download complete'
      });
    }

    return { success: true, ...result };
  } catch (err) {
    console.error('start-download error:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', { gameId, error: err.message });
    }
    return { success: false, error: err.message };
  }
});

// Pause download
ipcMain.handle('pause-download', (_e, gameId) => {
  pause(gameId);
  return true;
});

// Cancel download
ipcMain.handle('cancel-download', (_e, gameId) => {
  cancel(gameId);
  return true;
});

// Start install
ipcMain.handle('start-install', async (_e, gameId) => {
  try {
    await install(gameId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status-change', {
        gameId,
        status: 'idle',
        message: 'Install complete'
      });
    }
    return { success: true };
  } catch (err) {
    console.error('start-install error:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', { gameId, error: err.message });
    }
    return { success: false, error: err.message };
  }
});

// Rollback
ipcMain.handle('rollback-game', async (_e, gameId) => {
  try {
    await rollback(gameId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status-change', {
        gameId,
        status: 'idle',
        message: 'Rollback complete'
      });
    }
    return { success: true };
  } catch (err) {
    console.error('rollback-game error:', err.message);
    return { success: false, error: err.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
