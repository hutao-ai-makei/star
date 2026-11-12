const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getGameById, updateGame } = require('./store');

const runningProcesses = new Map(); // gameId -> { exeName, startTime, pid }

// 从 exe 路径提取文件名
function getExeName(exePath) {
  return path.basename(exePath);
}

// 查找指定 exe 名的进程是否在运行
// 使用 spawnSync 数组参数（不经 shell），避免 exeName 被当作 cmd 指令注入
function findProcess(exeName) {
  try {
    const r = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${exeName}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true
    });
    const result = r.stdout || '';
    if (!result.trim()) return null;
    // 按行解析 CSV，精确匹配进程名（/FI 过滤可能不精确，避免误判同名进程）
    const lower = exeName.toLowerCase();
    for (const line of result.split(/\r?\n/)) {
      const m = line.match(/^"([^"]+)","(\d+)"/);
      if (m && m[1].toLowerCase() === lower) {
        return { name: m[1], pid: parseInt(m[2]) };
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}

function launch(id, mainWindow) {
  return new Promise(async (resolve) => {
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

    // 校验路径不含 cmd 特殊字符（避免 spawn('cmd',['/c','start','',exePath]) 被解释）
    if (/[&|<>^]/.test(exePath)) {
      resolve({ success: false, error: '可执行文件路径含不安全字符，已拒绝启动' });
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
