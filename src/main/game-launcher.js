const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
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
