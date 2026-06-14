const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getGameById, updateGame } = require('./store');

const runningProcesses = new Map(); // gameId -> { exeName, startTime, pid }

// 从 exe 路径提取文件名
function getExeName(exePath) {
  return path.basename(exePath);
}

// 查找指定 exe 名的进程是否在运行
function findProcess(exeName) {
  try {
    const result = execSync(
      `tasklist /FI "IMAGENAME eq ${exeName}" /FO CSV /NH`,
      { encoding: 'utf8', timeout: 3000, windowsHide: true }
    );
    if (!result.trim()) return null;
    // 解析 "Endfield.exe","20512","Console","1","129,096 K"
    const match = result.match(/"([^"]+)","(\d+)"/);
    if (match) {
      return { name: match[1], pid: parseInt(match[2]) };
    }
    return null;
  } catch (_) {
    return null;
  }
}

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
      const exeName = getExeName(exePath);
      const startTime = Date.now();

      // 使用 cmd /c start 启动（ShellExecuteEx，等同于在资源管理器中双击）
      // 这能正确处理含空格的路径，并且不会被反作弊系统拦截 CreateProcess
      const child = spawn('cmd', ['/c', 'start', '', exePath], {
        cwd,
        stdio: 'ignore',
        windowsHide: true
      });

      child.on('error', (err) => {
        resolve({ success: false, error: '启动失败：' + err.message });
      });

      child.on('exit', (cmdExitCode) => {
        if (cmdExitCode !== 0) {
          resolve({ success: false, error: '启动失败（系统错误码 ' + cmdExitCode + '）' });
          return;
        }

        // cmd /c start 成功执行后，等待游戏进程出现
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          const proc = findProcess(exeName);

          if (proc) {
            clearInterval(checkInterval);
            runningProcesses.set(id, { exeName, startTime, pid: proc.pid });

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('game-running', { id, startTime });
            }

            resolve({ success: true, id });

            // 开始轮询等待游戏退出
            const exitCheck = setInterval(() => {
              if (!findProcess(exeName)) {
                clearInterval(exitCheck);
                runningProcesses.delete(id);
                const durationMs = Date.now() - startTime;
                const durationSec = Math.floor(durationMs / 1000);

                const updated = getGameById(id);
                if (updated && durationMs >= 2000) {
                  updateGame(id, {
                    lastPlayedAt: new Date().toISOString(),
                    totalPlayTime: (updated.totalPlayTime || 0) + durationSec
                  });

                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('game-exited', {
                      id,
                      durationMs,
                      totalPlayTime: (updated.totalPlayTime || 0) + durationSec
                    });
                  }
                }
              }
            }, 3000); // 每3秒检查一次

          } else if (attempts >= 10) {
            // 10秒后仍未找到进程，视为失败
            clearInterval(checkInterval);
            resolve({ success: false, error: '游戏启动后立即退出（可能需要通过游戏平台启动）' });
          }
        }, 1000);
      });

    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

function isRunning(id) {
  if (!runningProcesses.has(id)) return false;
  const { exeName } = runningProcesses.get(id);
  return !!findProcess(exeName);
}

module.exports = { launch, isRunning };
