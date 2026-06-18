const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { getAllGames, getGameById, addGame, updateGame, removeGame, reorderGames, getSettings, updateSettings } = require('./store');
const gameLauncher = require('./game-launcher');
const { checkForUpdate, pollPreDownloads } = require('./update-checker');
const { UpdateTask } = require('./update-task');

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
ipcMain.handle('reorder-games', (_e, orderedIds) => { reorderGames(orderedIds); });

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

const activeTasks = new Map(); // gameId -> UpdateTask

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function cleanupActiveTask(gameId, terminalStatus) {
  const task = activeTasks.get(gameId);
  if (task && (terminalStatus === 'finish' || terminalStatus === 'stop' || terminalStatus === 'error')) {
    activeTasks.delete(gameId);
  }
}

function createUpdateTask(gameId, check, { resume = false } = {}) {
  const existing = activeTasks.get(gameId);

  // If the user is resuming a paused task, reuse it so cached partial files survive.
  if (resume && existing && existing.state === 'paused') {
    return existing;
  }

  // Otherwise cancel any existing task and start fresh.
  if (existing) {
    try { existing.cancel(); } catch (_) {}
    activeTasks.delete(gameId);
  }

  const task = new UpdateTask(gameId, check, {
    onStatusChange: (data) => {
      cleanupActiveTask(data.gameId, data.status);
      sendToRenderer('update-status-change', data);
    },
    onProgress: (data) => {
      sendToRenderer('download-progress', data);
    },
    onError: (data) => {
      cleanupActiveTask(data.gameId, 'error');
      sendToRenderer('update-error', data);
    },
  });

  activeTasks.set(gameId, task);
  return task;
}

// Check for updates
ipcMain.handle('check-update', async (_e, gameId) => {
  try {
    return await checkForUpdate(gameId);
  } catch (err) {
    console.error('check-update error:', err.message);
    return { hasUpdate: false, isPreDownload: false, forceUpdate: false, manifest: null, currentVersion: '', targetVersion: '', reason: null };
  }
});

// Start download (and install)
ipcMain.handle('start-download', async (_e, gameId, mode) => {
  const game = require('./store').getGameById(gameId);
  if (!game) return { success: false, error: 'Game not found' };

  try {
    const check = await checkForUpdate(gameId);
    if (!check.hasUpdate && !check.isPreDownload) {
      return { success: false, error: 'No update available' };
    }

    // Use delta package if requested and available
    if (!check.isPreDownload && mode === 'delta' && check.manifest?.update?.delta) {
      check.manifest = {
        ...check.manifest,
        update: check.manifest.update.delta,
      };
    }

    // Persist update metadata
    require('./store').updateGame(gameId, {
      targetVersion: check.targetVersion,
      updateMode: mode === 'delta' ? 'delta' : 'full',
      updateLog: check.manifest?.updateLog || '',
      isPreDownload: check.isPreDownload,
    });

    const task = createUpdateTask(gameId, check, { resume: true });
    if (task.state === 'paused') {
      // Resume the paused task instead of re-preparing it.
      task.start().catch((err) => {
        console.error('start-download resume error:', err.message);
      });
      return { success: true, taskId: task.id };
    }

    await task.prepare();

    // Start download+install in background so the IPC call returns immediately
    task.start().catch((err) => {
      console.error('start-download task error:', err.message);
    });

    return { success: true, taskId: task.id };
  } catch (err) {
    console.error('start-download error:', err.message);
    sendToRenderer('update-error', { gameId, error: err.message });
    return { success: false, error: err.message };
  }
});

// Pause download
ipcMain.handle('pause-download', (_e, gameId) => {
  const task = activeTasks.get(gameId);
  if (task) {
    task.pause();
    return { success: true };
  }
  return { success: false, error: 'No active download' };
});

// Cancel download
ipcMain.handle('cancel-download', (_e, gameId) => {
  const task = activeTasks.get(gameId);
  if (task) {
    task.cancel();
    activeTasks.delete(gameId);
    return { success: true };
  }

  // Also clear persisted update state if no active task
  require('./store').updateGame(gameId, {
    updateStatus: 'idle',
    targetVersion: '',
    downloadProgress: { totalBytes: 0, downloadedBytes: 0, speed: 0, chunks: [] },
  });

  return { success: true };
});

// Start install (used when the user clicks install after a pre-download or retry)
ipcMain.handle('start-install', async (_e, gameId) => {
  try {
    const check = await checkForUpdate(gameId);

    // Pre-download has not become a formal update yet; installing now would be premature.
    if (check.isPreDownload) {
      return { success: false, error: '该版本尚未正式上线，请等待维护结束后再安装' };
    }

    if (!check.hasUpdate) {
      return { success: false, error: 'No update available' };
    }

    const task = createUpdateTask(gameId, check);
    await task.prepare();

    task.start().catch((err) => {
      console.error('start-install task error:', err.message);
    });

    return { success: true, taskId: task.id };
  } catch (err) {
    console.error('start-install error:', err.message);
    sendToRenderer('update-error', { gameId, error: err.message });
    return { success: false, error: err.message };
  }
});

// Rollback
ipcMain.handle('rollback-game', async (_e, gameId) => {
  const task = activeTasks.get(gameId);

  try {
    let oldVersion = '';

    if (task) {
      oldVersion = await task.rollback();
      activeTasks.delete(gameId);
    } else {
      // No active task: roll back using the latest backup if any
      const { rollbackUpdate, listBackups } = require('./install-manager');
      const game = require('./store').getGameById(gameId);
      if (!game) throw new Error('Game not found');

      const installDir = game.installDir || path.dirname(game.exePath);
      const backups = listBackups(installDir);

      if (backups.length === 0) {
        throw new Error('No backup available for rollback');
      }

      const latest = backups[0];
      oldVersion = await rollbackUpdate({ installDir, backupDir: latest.dir });
    }

    // Restore the recorded current version so update detection stays consistent.
    if (oldVersion) {
      require('./store').updateGame(gameId, {
        currentVersion: oldVersion,
        targetVersion: '',
        updateStatus: 'idle',
        isPreDownload: false,
        predownloadInfo: null,
      });
    }

    sendToRenderer('update-status-change', {
      gameId,
      status: 'idle',
      message: 'Rollback complete'
    });

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
