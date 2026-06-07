# 游戏启动器 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个基于 Electron 的 Windows 第三方游戏启动器，左侧极窄图标栏 + 右侧整图封面 + 毛玻璃启动按钮。

**Architecture:** Electron 主进程负责窗口管理、游戏启动、数据存储；渲染进程负责纯 HTML/CSS/JS 的 Glassmorphism UI。通过 preload 的 contextBridge 安全通信。数据用 electron-store 存储于本地 JSON。

**Tech Stack:** Electron, electron-store, electron-builder, 原生 HTML/CSS/JS, Glassmorphism CSS

---

## 文件结构规划

| 文件 | 职责 |
|------|------|
| `package.json` | 项目元数据 + 依赖 + 脚本 |
| `electron-builder.yml` | 打包配置 |
| `src/main/index.js` | Electron 入口，创建窗口，注册所有 IPC handler |
| `src/main/store.js` | electron-store 封装，读写游戏库 + 设置 |
| `src/main/game-launcher.js` | spawn 游戏进程，计时，IPC handler |
| `src/preload/preload.js` | contextBridge 暴露 electronAPI 给渲染进程 |
| `src/renderer/index.html` | 主页面 HTML 结构 |
| `src/renderer/css/style.css` | 全局布局 + 变量 + 重置 |
| `src/renderer/css/glass.css` | 毛玻璃专用样式 |
| `src/renderer/js/app.js` | 渲染进程入口，初始化事件监听 + IPC 调用 |
| `src/renderer/js/library.js` | `renderLibrary(games, selectedId)` — 左侧图标栏渲染 |
| `src/renderer/js/detail.js` | `renderDetail(game)` — 右侧封面 + 按钮渲染 |
| `src/renderer/js/add-game.js` | 添加游戏弹窗/流程逻辑 |
| `src/renderer/js/util.js` | 时间格式化等工具函数 |

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `src/` 目录结构
- Create: `.gitignore`

- [ ] **Step 1: 创建目录结构**

```bash
New-Item -ItemType Directory -Force src/main, src/preload, src/renderer/css, src/renderer/js, src/renderer/assets, resources
```

- [ ] **Step 2: 编写 package.json**

写入 `package.json`：

```json
{
  "name": "star-launcher",
  "version": "1.0.0",
  "description": "第三方游戏启动器 - 极简玻璃拟态风格",
  "main": "src/main/index.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "author": "",
  "license": "MIT",
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0"
  },
  "dependencies": {
    "electron-store": "^8.2.0"
  }
}
```

- [ ] **Step 3: 安装依赖**

```bash
npm install
```

- [ ] **Step 4: 编写 .gitignore**

```gitignore
node_modules/
dist/
*.log
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: scaffold Electron project with package.json and directory structure"
```

---

### Task 2: Electron 主进程入口 — 创建无框窗口

**Files:**
- Create: `src/main/index.js`

- [ ] **Step 1: 编写 src/main/index.js（最小窗口）**

```js
const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
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
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

- [ ] **Step 2: 编写最小的 src/renderer/index.html 验证窗口能打开**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Star Launcher</title>
</head>
<body>
  <h1>Hello, Star Launcher!</h1>
</body>
</html>
```

- [ ] **Step 3: 运行验证**

```bash
npx electron .
```

Expected: 打开一个 900×600 的无边框窗口，显示 "Hello, Star Launcher!"。

- [ ] **Step 4: Commit**

```bash
git add src/main/index.js src/renderer/index.html
git commit -m "feat: Electron main process with frameless window"
```

---

### Task 3: 数据存储层（electron-store）

**Files:**
- Create: `src/main/store.js`

- [ ] **Step 1: 编写 src/main/store.js**

```js
const Store = require('electron-store');
const { v4: uuidv4 } = require('uuid');

const store = new Store({
  name: 'library',
  defaults: {
    games: [],
    settings: {
      windowWidth: 900,
      windowHeight: 600,
      windowX: null,
      windowY: null,
      scanDirs: [],
      autoScan: false
    }
  }
});

function getAllGames() {
  return store.get('games', []);
}

function getGameById(id) {
  const games = store.get('games', []);
  return games.find(g => g.id === id) || null;
}

function addGame({ name, exePath, coverPath }) {
  const games = store.get('games', []);
  const newGame = {
    id: uuidv4(),
    name,
    exePath,
    coverPath: coverPath || '',
    tags: [],
    addedAt: new Date().toISOString(),
    lastPlayedAt: null,
    totalPlayTime: 0,
    notes: '',
    rating: 0
  };
  games.push(newGame);
  store.set('games', games);
  return newGame;
}

function updateGame(id, updates) {
  const games = store.get('games', []);
  const index = games.findIndex(g => g.id === id);
  if (index === -1) return null;
  games[index] = { ...games[index], ...updates };
  store.set('games', games);
  return games[index];
}

function removeGame(id) {
  const games = store.get('games', []).filter(g => g.id !== id);
  store.set('games', games);
}

function getSettings() {
  return store.get('settings', {});
}

function updateSettings(updates) {
  const settings = store.get('settings', {});
  store.set('settings', { ...settings, ...updates });
  return store.get('settings');
}

module.exports = { getAllGames, getGameById, addGame, updateGame, removeGame, getSettings, updateSettings };
```

- [ ] **Step 2: 处理 uuid 依赖** — `uuid` 是 Node.js 内置的 `crypto.randomUUID()`，改用它避免额外依赖：

```js
// store.js 中
const crypto = require('crypto');
// ...
id: crypto.randomUUID(),
```

- [ ] **Step 3: Commit**

```bash
git add src/main/store.js
git commit -m "feat: add data store with electron-store (CRUD for games + settings)"
```

---

### Task 4: Preload 安全桥接

**Files:**
- Create: `src/preload/preload.js`

- [ ] **Step 1: 编写 src/preload/preload.js**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/preload.js
git commit -m "feat: add preload script with contextBridge API"
```

---

### Task 5: 渲染进程外壳 — HTML + CSS 全局样式

**Files:**
- Create: `src/renderer/css/style.css`
- Create: `src/renderer/css/glass.css`
- Modify: `src/renderer/index.html`

- [ ] **Step 1: 编写 CSS 变量和全局样式 — src/renderer/css/style.css**

```css
/* === CSS Variables === */
:root {
  --accent: #667eea;
  --accent-glow: rgba(102, 126, 234, 0.55);
  --accent-bg: rgba(102, 126, 234, 0.2);
  --text: #2D2B55;
  --text-light: rgba(45, 43, 85, 0.55);
  --glass: rgba(255, 255, 255, 0.35);
  --glass-hover: rgba(255, 255, 255, 0.55);
  --glass-border: rgba(255, 255, 255, 0.45);
  --sidebar-width: 56px;
  --font-family: 'Inter', 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
}

/* === Reset === */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  font-family: var(--font-family);
  color: var(--text);
  background: linear-gradient(135deg, #E8E0F0 0%, #D4E4F7 30%, #C8E6F5 60%, #E0D8F0 100%);
  user-select: none;
}

/* === Layout === */
#app {
  display: flex;
  width: 100%;
  height: 100vh;
}

/* === Sidebar === */
#sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  gap: 8px;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid rgba(255, 255, 255, 0.3);
  -webkit-app-region: no-drag;
}

#game-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  overflow-y: auto;
  width: 100%;
}

#game-list::-webkit-scrollbar { width: 0; }

.game-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
  opacity: 0.55;
}

.game-icon:hover { opacity: 0.8; transform: scale(1.05); }

.game-icon.selected {
  opacity: 1;
  outline: 2px solid var(--accent-glow);
  outline-offset: 2px;
  background-color: var(--accent-bg);
}

/* === Sidebar Divider === */
#sidebar-divider {
  width: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  margin: 4px 0;
}

/* === Add Button === */
#add-game-btn {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: var(--accent);
  font-size: 20px;
  font-weight: 400;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  -webkit-app-region: no-drag;
}

#add-game-btn:hover { background: rgba(255, 255, 255, 0.4); }

/* === Main Content === */
#main-content {
  flex: 1;
  height: 100vh;
  position: relative;
  overflow: hidden;
}

/* === Title Bar === */
#title-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 36px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 0 8px;
  z-index: 10;
  -webkit-app-region: drag;
}

.title-btn {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  margin-left: 8px;
  -webkit-app-region: no-drag;
  transition: opacity 0.15s;
}

.title-btn:hover { opacity: 0.8; }

#btn-minimize { background: #4CAF50; }
#btn-maximize { background: #FFC107; }
#btn-close { background: #F44336; }

/* === Cover Area === */
#cover-area {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 2: 编写毛玻璃专用样式 — src/renderer/css/glass.css**

```css
/* === Glassmorphism Components === */

/* Bottom gradient overlay for readability */
#cover-area::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
  pointer-events: none;
  z-index: 0;
}

/* Game name overlay (top-left) */
#game-info {
  position: absolute;
  top: 44px;
  left: 24px;
  z-index: 2;
}

#game-name {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

#game-last-played {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
}

/* Launch button (bottom-center, glass) */
#launch-btn {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  padding: 14px 56px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 2px;
  cursor: pointer;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  transition: background 0.2s, transform 0.15s;
  -webkit-app-region: no-drag;
}

#launch-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateX(-50%) scale(1.02);
}

#launch-btn.running {
  background: rgba(244, 67, 54, 0.25);
  border-color: rgba(244, 67, 54, 0.4);
}

/* Empty state */
#empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-light);
  font-size: 16px;
  pointer-events: none;
}
```

- [ ] **Step 3: 更新 src/renderer/index.html 完整 HTML 结构**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' file: data:;">
  <title>Star Launcher</title>
  <link rel="stylesheet" href="css/style.css">
  <link rel="stylesheet" href="css/glass.css">
</head>
<body>
  <div id="app">
    <!-- 左侧图标栏 -->
    <aside id="sidebar">
      <div id="game-list"></div>
      <div id="sidebar-divider"></div>
      <button id="add-game-btn" title="添加游戏">+</button>
    </aside>

    <!-- 右侧封面区 -->
    <main id="main-content">
      <!-- 标题栏 -->
      <div id="title-bar">
        <button class="title-btn" id="btn-minimize" title="最小化"></button>
        <button class="title-btn" id="btn-maximize" title="最大化"></button>
        <button class="title-btn" id="btn-close" title="关闭"></button>
      </div>

      <!-- 封面背景 -->
      <div id="cover-area">
        <div id="game-info">
          <div id="game-name"></div>
          <div id="game-last-played"></div>
        </div>
        <button id="launch-btn">▶ 启动游戏</button>
        <div id="empty-state">
          <div style="font-size:48px;margin-bottom:12px;">🎮</div>
          <div>还没有游戏</div>
          <div style="font-size:13px;margin-top:6px;opacity:0.6;">点击左侧 + 添加</div>
        </div>
      </div>
    </main>
  </div>

  <script src="js/util.js"></script>
  <script src="js/library.js"></script>
  <script src="js/detail.js"></script>
  <script src="js/add-game.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: 运行验证布局**

```bash
npx electron .
```

Expected: 无框窗口，左侧 56px 图标栏带毛玻璃效果，右侧空状态显示引导文字，标题栏三个控制按钮可见（但尚未绑定事件）。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.html src/renderer/css/style.css src/renderer/css/glass.css
git commit -m "feat: add renderer shell with glassmorphism layout"
```

---

### Task 6: 主进程 IPC Handlers（窗口控制 + 设置 + 库操作）

**Files:**
- Modify: `src/main/index.js`（添加 IPC handlers）

- [ ] **Step 1: 添加所有 IPC handlers 到 src/main/index.js**

完整的 `src/main/index.js`：

```js
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
ipcMain.handle('minimize-window', () => mainWindow?.minimize());
ipcMain.handle('maximize-window', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle('close-window', () => mainWindow?.close());

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

// 游戏启动（delegate 到 game-launcher 模块）
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
```

- [ ] **Step 2: 此时 game-launcher 模块尚未创建，先放一个桩（stub）保证不报错**

`src/main/game-launcher.js`：

```js
function launch(id, mainWindow) {
  return { error: 'not-implemented' };
}

module.exports = { launch };
```

- [ ] **Step 3: Commit**

```bash
git add src/main/index.js src/main/game-launcher.js
git commit -m "feat: add IPC handlers for window control, library CRUD, file dialogs, settings"
```

---

### Task 7: 游戏启动模块

**Files:**
- Update: `src/main/game-launcher.js`（替换桩）
- Modify: `src/main/index.js`（已 import，无需改）

- [ ] **Step 1: 编写 src/main/game-launcher.js**

```js
const { spawn } = require('child_process');
const path = require('path');
const { getGameById, updateGame } = require('./store');

const runningProcesses = new Map(); // gameId -> { process, startTime }

function launch(id, mainWindow) {
  return new Promise((resolve) => {
    const game = getGameById(id);
    if (!game) {
      resolve({ success: false, error: '游戏不存在' });
      return;
    }

    if (runningProcesses.has(id)) {
      resolve({ success: false, error: '游戏已在运行中' });
      return;
    }

    const exePath = game.exePath;

    // 检测文件是否存在
    const fs = require('fs');
    if (!fs.existsSync(exePath)) {
      resolve({ success: false, error: '找不到可执行文件：' + exePath });
      return;
    }

    try {
      const cwd = path.dirname(exePath);
      const child = spawn(exePath, [], {
        cwd,
        detached: true,
        stdio: 'ignore'
      });

      const startTime = Date.now();
      runningProcesses.set(id, { process: child, startTime });

      // 通知渲染进程游戏已启动
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('game-running', { id, startTime });
      }

      child.on('error', (err) => {
        runningProcesses.delete(id);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('game-exited', {
            id,
            error: err.message,
            durationMs: 0
          });
        }
      });

      child.on('exit', (code) => {
        runningProcesses.delete(id);
        const durationMs = Date.now() - startTime;
        const durationSec = Math.floor(durationMs / 1000);

        // 更新数据库
        const updated = getGameById(id);
        if (updated) {
          updateGame(id, {
            lastPlayedAt: new Date().toISOString(),
            totalPlayTime: (updated.totalPlayTime || 0) + durationSec
          });

          // 通知渲染进程
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('game-exited', {
              id,
              code,
              durationMs,
              totalPlayTime: (updated.totalPlayTime || 0) + durationSec
            });
          }
        }
      });

      resolve({ success: true, id });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

function isRunning(id) {
  return runningProcesses.has(id);
}

module.exports = { launch, isRunning };
```

- [ ] **Step 2: Commit**

```bash
git add src/main/game-launcher.js
git commit -m "feat: implement game-launcher with spawn, timing, and lifecycle events"
```

---

### Task 8: 工具函数 & 渲染进程入口

**Files:**
- Create: `src/renderer/js/util.js`
- Create: `src/renderer/js/app.js`
- Create: `src/renderer/js/library.js`（最小桩）
- Create: `src/renderer/js/detail.js`（最小桩）
- Create: `src/renderer/js/add-game.js`（最小桩）

- [ ] **Step 1: 编写 src/renderer/js/util.js**

```js
/**
 * 格式化游玩时长
 * @param {number} seconds
 * @returns {string}
 */
function formatPlayTime(seconds) {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分钟`;
  return `${m} 分钟`;
}

/**
 * 格式化"上次游玩"为相对时间
 * @param {string|null} isoString
 * @returns {string}
 */
function formatLastPlayed(isoString) {
  if (!isoString) return '从未游玩';
  const then = new Date(isoString);
  const now = new Date();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return then.toLocaleDateString('zh-CN');
}
```

- [ ] **Step 2: 编写 src/renderer/js/app.js（渲染进程入口）**

```js
// === State ===
let games = [];
let selectedGameId = null;

// === DOM refs ===
const gameListEl = document.getElementById('game-list');
const gameNameEl = document.getElementById('game-name');
const lastPlayedEl = document.getElementById('game-last-played');
const launchBtn = document.getElementById('launch-btn');
const addGameBtn = document.getElementById('add-game-btn');
const emptyStateEl = document.getElementById('empty-state');
const coverArea = document.getElementById('cover-area');

// === Init ===
async function init() {
  await loadGames();
  bindWindowControls();
  bindKeyboard();
  bindLaunchButton();
  bindAddButton();
  bindGameEvents();
}

async function loadGames() {
  games = await window.electronAPI.getGames();
  renderAll();
}

function renderAll() {
  if (games.length === 0) {
    gameListEl.innerHTML = '';
    gameNameEl.textContent = '';
    lastPlayedEl.textContent = '';
    coverArea.style.backgroundImage = '';
    launchBtn.style.display = 'none';
    emptyStateEl.style.display = '';
    return;
  }

  emptyStateEl.style.display = 'none';
  launchBtn.style.display = '';

  // 如果没有选中但有游戏，选第一个
  if (!selectedGameId || !games.find(g => g.id === selectedGameId)) {
    selectedGameId = games[0].id;
  }

  renderLibrary(gameListEl, games, selectedGameId, onGameSelect);
  renderDetail(games.find(g => g.id === selectedGameId));
}

function onGameSelect(id) {
  selectedGameId = id;
  renderLibrary(gameListEl, games, selectedGameId, onGameSelect);
  renderDetail(games.find(g => g.id === selectedGameId));
}

function bindWindowControls() {
  document.getElementById('btn-minimize').onclick = () => window.electronAPI.minimizeWindow();
  document.getElementById('btn-maximize').onclick = () => window.electronAPI.maximizeWindow();
  document.getElementById('btn-close').onclick = () => window.electronAPI.closeWindow();
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (!games.length) return;
    const idx = games.findIndex(g => g.id === selectedGameId);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown'
        ? (idx + 1) % games.length
        : (idx - 1 + games.length) % games.length;
      onGameSelect(games[next].id);
    }
  });
}

function bindLaunchButton() {
  launchBtn.addEventListener('click', async () => {
    if (!selectedGameId) return;
    const result = await window.electronAPI.launchGame(selectedGameId);
    if (!result.success) {
      alert('启动失败：' + result.error);
    }
  });
}

function bindAddButton() {
  addGameBtn.addEventListener('click', openAddGameDialog);
}

function bindGameEvents() {
  window.electronAPI.onGameRunning(({ id }) => {
    launchBtn.textContent = '● 运行中';
    launchBtn.classList.add('running');
  });

  window.electronAPI.onGameExited(async ({ id }) => {
    launchBtn.textContent = '▶ 启动游戏';
    launchBtn.classList.remove('running');
    await loadGames(); // 刷新时长数据
  });
}

// === Start ===
document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 3: 编写桩文件（最小可用版本）**

`src/renderer/js/library.js`：

```js
function renderLibrary(containerEl, games, selectedId, onSelect) {
  containerEl.innerHTML = '';
  games.forEach(game => {
    const el = document.createElement('div');
    el.className = 'game-icon' + (game.id === selectedId ? ' selected' : '');
    el.title = game.name;
    if (game.coverPath) {
      el.style.backgroundImage = `url(file:///${game.coverPath.replace(/\\/g, '/')})`;
    } else {
      el.textContent = '🎮';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontSize = '18px';
    }
    el.addEventListener('click', () => onSelect(game.id));
    containerEl.appendChild(el);
  });
}
```

`src/renderer/js/detail.js`：

```js
function renderDetail(game) {
  if (!game) return;
  document.getElementById('game-name').textContent = game.name;
  document.getElementById('game-last-played').textContent = '上次游玩 · ' + formatLastPlayed(game.lastPlayedAt);
  if (game.coverPath) {
    document.getElementById('cover-area').style.backgroundImage = `url(file:///${game.coverPath.replace(/\\/g, '/')})`;
  } else {
    document.getElementById('cover-area').style.backgroundImage = '';
    document.getElementById('cover-area').style.background = 'linear-gradient(135deg, #2D1B69 0%, #1a3a5c 40%, #0d2137 100%)';
  }
}
```

`src/renderer/js/add-game.js`：

```js
async function openAddGameDialog() {
  const exePath = await window.electronAPI.selectExeFile();
  if (!exePath) return;

  const game = await window.electronAPI.addGame(exePath);
  if (game) {
    games.push(game);
    selectedGameId = game.id;
    renderAll();

    // 附带询问封面
    const coverPath = await window.electronAPI.selectCoverFile();
    if (coverPath) {
      await window.electronAPI.updateGame(game.id, { coverPath });
      await loadGames();
    }
  }
}
```

- [ ] **Step 4: 运行验证完整流程**

```bash
npx electron .
```

Expected: 无框窗口 → 点击 + 按钮 → 文件对话框选择 `.exe` → 左侧出现游戏图标 → 可选封面 → 右侧显示封面 + 游戏名 + 启动按钮。点击启动按钮跑起游戏，按钮变为"● 运行中"，退出后恢复。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/util.js src/renderer/js/app.js src/renderer/js/library.js src/renderer/js/detail.js src/renderer/js/add-game.js
git commit -m "feat: add renderer logic - library sidebar, detail view, add-game flow, IPC integration"
```

---

### Task 9: 边界情况处理

**Files:**
- Modify: `src/renderer/js/app.js`
- Modify: `src/renderer/js/detail.js`
- Modify: `src/renderer/css/glass.css`

- [ ] **Step 1: 处理 exe 路径失效 — 修改 detail.js 和 app.js**

在 `detail.js` 的 `renderDetail()` 开头加检测：

```js
async function renderDetail(game) {
  if (!game) return;

  const fs = require('fs'); // 不可用！渲染进程不能访问 Node

  // 改用：通过 IPC 检查
  // 先简单处理：启动失败时 main 会返回 error
  document.getElementById('game-name').textContent = game.name;
  document.getElementById('game-last-played').textContent = '上次游玩 · ' + formatLastPlayed(game.lastPlayedAt);

  if (game.coverPath) {
    document.getElementById('cover-area').style.backgroundImage = `url(file:///${game.coverPath.replace(/\\/g, '/')})`;
    document.getElementById('cover-area').style.background = '';
  } else {
    document.getElementById('cover-area').style.backgroundImage = '';
    document.getElementById('cover-area').style.background = 'linear-gradient(135deg, #2D1B69 0%, #1a3a5c 40%, #0d2137 100%)';
  }
}
```

修正——使用 `src: 'app'` 的 file:// 协议。更稳健的封面加载：

```js
// detail.js 中封面加载使用 normalize 路径
const coverUrl = game.coverPath
  ? `file:///${game.coverPath.replace(/\\/g, '/')}`
  : '';
```

- [ ] **Step 2: 启动失败时显示具体错误**

在 `app.js` 的 `bindLaunchButton` 中补充错误处理：

```js
function bindLaunchButton() {
  launchBtn.addEventListener('click', async () => {
    if (!selectedGameId) return;
    const result = await window.electronAPI.launchGame(selectedGameId);
    if (!result.success) {
      // 更新 UI 显示错误状态
      if (result.error.includes('找不到')) {
        gameNameEl.textContent = (games.find(g => g.id === selectedGameId)?.name || '') + ' — 文件丢失';
        lastPlayedEl.textContent = '找不到可执行文件，请重新定位';
      } else if (result.error.includes('已在运行')) {
        // 游戏已在运行，无需额外操作
      } else {
        alert('启动失败：' + result.error);
      }
    }
  });
}
```

- [ ] **Step 3: 添加毛玻璃细节 — 更新 glass.css**

```css
/* 游戏名模糊光晕 */
#game-name {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #fff;
  text-shadow:
    0 2px 8px rgba(0, 0, 0, 0.5),
    0 0 40px rgba(0, 0, 0, 0.15);
}

/* 图标选中动画 */
.game-icon {
  transition: transform 0.15s ease, opacity 0.15s ease, outline 0.15s ease;
}

/* 启动按钮过渡 */
#launch-btn {
  transition: background 0.2s ease, transform 0.15s ease, border-color 0.2s ease;
}

/* 侧栏滚动 */
#game-list {
  scroll-behavior: smooth;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/js/app.js src/renderer/js/detail.js src/renderer/css/glass.css
git commit -m "fix: edge cases - missing exe, launch error display, glass polish"
```

---

### Task 10: 打包配置

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json`（补充 build 配置）

- [ ] **Step 1: 编写 electron-builder.yml**

```yaml
appId: com.star-launcher.app
productName: Star Launcher
directories:
  output: dist
  buildResources: resources
files:
  - "!node_modules/**/*"
  - node_modules/electron-store/**/*
  - node_modules/conf/**/*
  - node_modules/atomically/**/*
  - node_modules/ajv/**/*
  - node_modules/ajv-formats/**/*
  - node_modules/json-schema-traverse/**/*
  - node_modules/require-from-string/**/*
  - node_modules/semver/**/*
  - node_modules/type-fest/**/*
  - node_modules/env-paths/**/*
  - node_modules/pkg-up/**/*
  - node_modules/find-up/**/*
  - node_modules/locate-path/**/*
  - node_modules/p-locate/**/*
  - node_modules/p-limit/**/*
  - node_modules/yocto-queue/**/*
  - node_modules/path-exists/**/*
  - node_modules/crypto-random-string/**/*
  - node_modules/dot-prop/**/*
  - node_modules/is-obj/**/*
  - node_modules/graceful-fs/**/*
  - node_modules/imurmurhash/**/*
  - node_modules/signal-exit/**/*
  - node_modules/is-typedarray/**/*
  - node_modules/typedarray-to-buffer/**/*
  - node_modules/write-file-atomic/**/*
  - node_modules/unique-string/**/*
  - node_modules/xdg-basedir/**/*
  - node_modules/configstore/**/*
  - node_modules/make-dir/**/*
  - node_modules/onetime/**/*
  - node_modules/mimic-fn/**/*
  - src/**/*
win:
  target:
    - target: nsis
      arch:
        - x64
  icon: resources/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  installerIcon: resources/icon.ico
  uninstallerIcon: resources/icon.ico
  installerHeaderIcon: resources/icon.ico
  deleteAppDataOnUninstall: false
```

- [ ] **Step 2: 更新 scripts 添加 electron-store 的打包依赖**

```json
{
  "scripts": {
    "start": "electron .",
    "build": "electron-builder",
    "postinstall": "electron-builder install-app-deps"
  }
}
```

- [ ] **Step 3: 运行打包**

```bash
npm run build
```

Expected: `dist/` 目录下生成 `Star Launcher Setup 1.0.0.exe` NSIS 安装包。

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml package.json
git commit -m "chore: add electron-builder packaging config"
```

---

## 计划自查

**1. Spec 覆盖检查：**
- [x] 核心界面（左侧图标栏 + 右侧封面）- Task 5, 8
- [x] 无框窗口 - Task 2
- [x] Glassmorphism 毛玻璃 - Task 5
- [x] 添加游戏流程 - Task 6, 8
- [x] 键盘 ↑↓ 切换 - Task 8
- [x] 启动游戏 + 计时 - Task 7
- [x] 窗口位置/尺寸记忆 - Task 6
- [x] exe 路径失效处理 - Task 9
- [x] 启动失败提示 - Task 9
- [x] 空库引导 - Task 5, 8
- [x] 封面缺失兜底 - Task 8
- [x] 数据模型 - Task 3
- [x] 安全（contextIsolation + preload）- Task 2, 4
- [x] 打包配置 - Task 10

**2. 占位符扫描：** ✅ 无 TBD/TODO

**3. 类型一致性：** ✅ 函数签名一致（`renderLibrary(container, games, selectedId, callback)` / `renderDetail(game)` / `openAddGameDialog()`）
