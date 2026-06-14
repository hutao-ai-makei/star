/**
 * 添加游戏流程：选择文件夹 → 自动扫描 exe → 添加游戏 → 可选封面
 */
async function openAddGameDialog() {
  // 1. 选择游戏文件夹
  const folderPath = await window.electronAPI.selectFolder();
  if (!folderPath) return;

  // 2. 扫描文件夹中的 exe 文件
  const result = await window.electronAPI.scanFolderExe(folderPath);
  if (result.error) {
    alert('扫描文件夹失败：' + result.error);
    return;
  }

  const exes = result.exes || [];

  let exePath;
  if (exes.length === 0) {
    // 没有找到 exe，手动选择
    alert('未在文件夹中找到 .exe 文件，请手动选择');
    exePath = await window.electronAPI.selectExeFile();
    if (!exePath) return;
  } else if (exes.length === 1) {
    // 只有一个 exe，直接使用
    exePath = exes[0];
  } else {
    // 多个 exe，让用户选择
    exePath = await showExePickerDialog(exes);
    if (!exePath) return;
  }

  // 3. 添加游戏
  const game = await window.electronAPI.addGame(exePath);
  if (!game) return;

  // 用文件夹名作为游戏名
  const folderName = folderPath.split(/[\\/]/).pop() || game.name;
  await window.electronAPI.updateGame(game.id, { name: folderName });

  // 自动提取 exe 图标
  const iconPath = await window.electronAPI.extractExeIcon(game.id, exePath);
  if (iconPath) {
    await window.electronAPI.updateGame(game.id, { iconPath });
  }

  games.push(game);
  games[games.length - 1].name = folderName;
  if (iconPath) games[games.length - 1].iconPath = iconPath;
  selectedGameId = game.id;
  renderAll();
}

/**
 * 多 exe 选择弹窗
 * @param {string[]} exePaths
 * @returns {string|null} 选中的 exe 路径
 */
function showExePickerDialog(exePaths) {
  return new Promise((resolve) => {
    // 创建遮罩
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0,0,0,0.4); backdrop-filter: blur(6px);
      display: flex; align-items: center; justify-content: center;
    `;

    // 创建弹窗
    const items = exePaths.map((exe, i) => {
      const fileName = exe.split(/[\\/]/).pop();
      return `
        <div class="exe-pick-item" data-path="${escapeAttr(exe)}" style="
          padding: 10px 14px; border-radius: 8px; cursor: pointer;
          margin-bottom: 6px; transition: background 0.15s;
          color: var(--text); font-size: 13px;
        ">
          ${escapeHTML(fileName)}
          <div style="font-size:11px;color:var(--text-light);margin-top:2px;">${escapeHTML(exe)}</div>
        </div>`;
    }).join('');

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: rgba(255,255,255,0.85); backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.5); border-radius: 14px;
      padding: 20px; width: 420px; max-height: 360px; overflow-y: auto;
      box-shadow: 0 12px 48px rgba(0,0,0,0.3);
    `;
    dialog.innerHTML = `
      <div style="font-weight:700;font-size:15px;margin-bottom:12px;color:var(--text);">
        找到 ${exePaths.length} 个可执行文件，请选择启动程序
      </div>
      ${items}
      <button id="exe-pick-cancel" style="
        margin-top: 8px; padding: 8px 16px; border: 1px solid rgba(0,0,0,0.1);
        border-radius: 8px; background: transparent; color: var(--text-light);
        font-size: 13px; cursor: pointer; width: 100%;
      ">取消</button>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 绑定事件
    dialog.querySelectorAll('.exe-pick-item').forEach(item => {
      item.addEventListener('mouseenter', () => { item.style.background = 'rgba(102,126,234,0.12)'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(item.dataset.path);
      });
    });

    dialog.querySelector('#exe-pick-cancel').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(null);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(null);
      }
    });
  });
}

// 从 util.js 复用（add-game.js 在 util.js 之后加载）
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
