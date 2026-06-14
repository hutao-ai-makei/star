/**
 * 设置面板：管理游戏项目（编辑、删除）
 */

let settingsGames = [];
let expandedGameId = null;
let onSettingsClose = null; // 关闭回调，由 app.js 注册

// === DOM 缓存 ===
let panelEl, overlayEl, closeBtnEl, gameListPanelEl;

/**
 * 打开设置面板
 * @param {Array} games - 当前游戏列表
 * @param {Function} onClose - 关闭回调
 */
async function openSettingsPanel(games, onClose) {
  settingsGames = [...games];
  onSettingsClose = onClose;
  expandedGameId = null;

  ensurePanelDOM();
  overlayEl.style.display = '';
  panelEl.style.display = '';
  renderSettingsGames();
}

function closeSettingsPanel() {
  if (overlayEl) overlayEl.style.display = 'none';
  if (panelEl) panelEl.style.display = 'none';
  if (onSettingsClose) onSettingsClose();
}

function ensurePanelDOM() {
  if (panelEl) return;
  panelEl = document.getElementById('settings-panel');
  overlayEl = document.getElementById('settings-overlay');
  closeBtnEl = document.getElementById('settings-close-btn');
  gameListPanelEl = document.getElementById('settings-game-list');

  overlayEl.addEventListener('click', closeSettingsPanel);
  closeBtnEl.addEventListener('click', closeSettingsPanel);
}

// === 渲染游戏列表 ===
function renderSettingsGames() {
  if (!gameListPanelEl) return;
  if (!settingsGames.length) {
    gameListPanelEl.innerHTML =
      '<div style="text-align:center;padding:32px;color:var(--text-light);">还没有游戏，请先在主界面添加</div>';
    return;
  }

  gameListPanelEl.innerHTML = '';
  settingsGames.forEach(game => {
    const item = document.createElement('div');
    item.className = 'settings-game-item' + (game.id === expandedGameId ? ' expanded' : '');

    // 封面缩略图
    const cover = document.createElement('div');
    cover.className = 'settings-game-cover';
    if (game.coverPath) {
      cover.style.backgroundImage = `url(file:///${game.coverPath.replace(/\\/g, '/')})`;
    } else if (game.iconPath) {
      cover.style.backgroundImage = `url(file:///${game.iconPath.replace(/\\/g, '/')})`;
    } else {
      cover.textContent = '🎮';
      cover.style.display = 'flex';
      cover.style.alignItems = 'center';
      cover.style.justifyContent = 'center';
      cover.style.fontSize = '20px';
    }

    // 游戏信息
    const info = document.createElement('div');
    info.className = 'settings-game-info';
    info.innerHTML = `
      <div class="settings-game-name">${escapeHTML(game.name)}</div>
      <div class="settings-game-meta">${formatPlayTime(game.totalPlayTime) || '尚未游玩'} · ${formatLastPlayed(game.lastPlayedAt)}</div>
    `;

    // 操作按钮
    const actions = document.createElement('div');
    actions.className = 'settings-game-actions';
    actions.innerHTML = `<span class="settings-expand-hint">编辑 ▸</span>`;

    item.appendChild(cover);
    item.appendChild(info);
    item.appendChild(actions);

    // 点击展开/折叠
    item.addEventListener('click', (e) => {
      if (e.target.closest('.settings-delete-btn') || e.target.closest('.settings-browse-btn') || e.target.closest('.settings-scan-btn')) return;
      if (expandedGameId === game.id) {
        expandedGameId = null;
      } else {
        expandedGameId = game.id;
      }
      renderSettingsGames();
    });

    // 编辑区域（展开时显示）
    const editArea = document.createElement('div');
    editArea.className = 'settings-edit-area';
    if (game.id === expandedGameId) {
      editArea.innerHTML = buildEditFormHTML(game);
    }

    const wrapper = document.createElement('div');
    wrapper.appendChild(item);
    wrapper.appendChild(editArea);
    gameListPanelEl.appendChild(wrapper);
  });

  // 绑定编辑区域事件
  if (expandedGameId) {
    bindEditEvents(expandedGameId);
  }
}

// === 编辑表单（精简版：仅名称、exe路径、封面） ===
function buildEditFormHTML(game) {
  return `
    <div class="settings-edit-form">
      <div class="settings-field">
        <label>游戏名称</label>
        <input type="text" id="edit-name-${game.id}" value="${escapeAttr(game.name)}" class="settings-input">
      </div>
      <div class="settings-field">
        <label>可执行文件路径</label>
        <div class="settings-path-row">
          <input type="text" id="edit-exe-${game.id}" value="${escapeAttr(game.exePath)}" class="settings-input" readonly>
          <button class="settings-browse-btn" data-target="exe-${game.id}">浏览</button>
          <button class="settings-scan-btn" data-target="exe-${game.id}">扫描文件夹</button>
        </div>
      </div>
      <div class="settings-field">
        <label>游戏图标</label>
        <div class="settings-path-row">
          <input type="text" id="edit-cover-${game.id}" value="${escapeAttr(game.coverPath || '')}" class="settings-input" readonly placeholder="未设置">
          <button class="settings-browse-btn" data-target="cover-${game.id}" data-game-id="${game.id}">浏览</button>
          <button class="settings-icon-btn" data-game-id="${game.id}" data-exe-path="${escapeAttr(game.exePath)}">提取图标</button>
        </div>
      </div>
      <div class="settings-field">
        <label>游戏背景</label>
        <div class="settings-path-row">
          <input type="text" id="edit-bg-${game.id}" value="${escapeAttr(game.backgroundPath || '')}" class="settings-input" readonly placeholder="未设置">
          <button class="settings-browse-btn" data-target="bg-${game.id}">浏览</button>
        </div>
      </div>
      <div class="settings-field">
        <label>背景视频</label>
        <div class="settings-path-row">
          <input type="text" id="edit-video-${game.id}" value="${escapeAttr(game.videoPath || '')}" class="settings-input" readonly placeholder="未设置（可播放 MP4/WebM）">
          <button class="settings-browse-btn" data-target="video-${game.id}">浏览</button>
        </div>
      </div>
      <div class="settings-field">
        <label>媒体目录（可循环切换）</label>
        <div class="settings-path-row">
          <input type="text" id="edit-media-${game.id}" value="${escapeAttr(game.mediaDir || '')}" class="settings-input" readonly placeholder="设置后，该目录下的图片/视频可左右箭头切换">
          <button class="settings-browse-btn" data-target="media-${game.id}">浏览</button>
        </div>
      </div>
      <div class="settings-field">
        <label>游戏信息</label>
        <div class="settings-stats">
          <span>添加于 ${new Date(game.addedAt).toLocaleDateString('zh-CN')}</span>
          <span>总游玩时长 ${formatPlayTime(game.totalPlayTime) || '无'}</span>
          <span>上次游玩 ${formatLastPlayed(game.lastPlayedAt)}</span>
        </div>
      </div>
      <div class="settings-edit-actions">
        <button class="settings-save-btn" data-game-id="${game.id}">保存修改</button>
        <button class="settings-delete-btn" data-game-id="${game.id}">删除游戏</button>
      </div>
    </div>
  `;
}

function bindEditEvents(gameId) {
  // 浏览按钮
  document.querySelectorAll(`.settings-browse-btn`).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const field = btn.dataset.target;
      if (field.startsWith('exe-')) {
        const path = await window.electronAPI.selectExeFile();
        if (path) document.getElementById(`edit-exe-${gameId}`).value = path;
      } else if (field.startsWith('cover-')) {
        const path = await window.electronAPI.selectCoverFile();
        if (path) document.getElementById(`edit-cover-${gameId}`).value = path;
      } else if (field.startsWith('bg-')) {
        const path = await window.electronAPI.selectBackgroundFile();
        if (path) document.getElementById(`edit-bg-${gameId}`).value = path;
      } else if (field.startsWith('video-')) {
        const path = await window.electronAPI.selectVideoFile();
        if (path) document.getElementById(`edit-video-${gameId}`).value = path;
      } else if (field.startsWith('media-')) {
        const path = await window.electronAPI.selectMediaDir();
        if (path) document.getElementById(`edit-media-${gameId}`).value = path;
      }
    });
  });

  // 提取图标按钮
  document.querySelectorAll(`.settings-icon-btn[data-game-id="${gameId}"]`).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.gameId;
      const exePath = btn.dataset.exePath;
      btn.textContent = '提取中...';
      btn.disabled = true;
      const iconPath = await window.electronAPI.extractExeIcon(id, exePath);
      btn.disabled = false;
      btn.textContent = iconPath ? '✓ 已提取' : '提取失败';
      if (iconPath) {
        await window.electronAPI.updateGame(id, { iconPath });
        const idx = settingsGames.findIndex(g => g.id === id);
        if (idx !== -1) settingsGames[idx].iconPath = iconPath;
        renderSettingsGames();
      }
      setTimeout(() => { btn.textContent = '提取图标'; }, 2000);
    });
  });

  // 扫描文件夹按钮 → 选择文件夹 → 扫描 exe → 自动填充
  document.querySelectorAll(`.settings-scan-btn`).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const folderPath = await window.electronAPI.selectFolder();
      if (!folderPath) return;

      const result = await window.electronAPI.scanFolderExe(folderPath);
      if (result.error) {
        alert('扫描失败：' + result.error);
        return;
      }

      const exes = result.exes || [];
      if (exes.length === 0) {
        alert('未在文件夹中找到 .exe 文件');
        return;
      }

      let exePath;
      if (exes.length === 1) {
        exePath = exes[0];
      } else {
        exePath = await showExePickerDialog(exes);
        if (!exePath) return;
      }

      document.getElementById(`edit-exe-${gameId}`).value = exePath;
    });
  });

  // 保存按钮
  const saveBtn = document.querySelector(`.settings-save-btn[data-game-id="${gameId}"]`);
  if (saveBtn) {
    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await saveGameEdit(gameId);
    });
  }

  // 删除按钮
  document.querySelectorAll(`.settings-delete-btn[data-game-id="${gameId}"]`).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteGame(gameId);
    });
  });
}

// === 保存 ===
async function saveGameEdit(gameId) {
  const nameEl = document.getElementById(`edit-name-${gameId}`);
  const exeEl = document.getElementById(`edit-exe-${gameId}`);
  const coverEl = document.getElementById(`edit-cover-${gameId}`);
  const bgEl = document.getElementById(`edit-bg-${gameId}`);
  const videoEl = document.getElementById(`edit-video-${gameId}`);
  const mediaEl = document.getElementById(`edit-media-${gameId}`);

  const updates = {};
  if (nameEl) updates.name = nameEl.value.trim() || '未命名游戏';
  if (exeEl) updates.exePath = exeEl.value.trim();
  if (coverEl) updates.coverPath = coverEl.value.trim();
  if (bgEl) updates.backgroundPath = bgEl.value.trim();
  if (videoEl) updates.videoPath = videoEl.value.trim();
  if (mediaEl) updates.mediaDir = mediaEl.value.trim();

  await window.electronAPI.updateGame(gameId, updates);

  const idx = settingsGames.findIndex(g => g.id === gameId);
  if (idx !== -1) {
    settingsGames[idx] = { ...settingsGames[idx], ...updates };
  }

  expandedGameId = null;
  renderSettingsGames();
}

// === 删除 ===
async function deleteGame(gameId) {
  const game = settingsGames.find(g => g.id === gameId);
  if (!game) return;

  const confirmed = confirm(`确认删除游戏「${game.name}」？\n\n这将移除该游戏的所有数据（不会删除游戏文件本身）。`);
  if (!confirmed) return;

  await window.electronAPI.removeGame(gameId);
  settingsGames = settingsGames.filter(g => g.id !== gameId);
  expandedGameId = null;
  renderSettingsGames();

  if (!settingsGames.length) {
    setTimeout(() => closeSettingsPanel(), 400);
  }
}

// === 工具函数 ===
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
