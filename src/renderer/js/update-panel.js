/**
 * Update Panel Component
 * Manages the update notification panel in the game detail area.
 */

let updatePanelEl = null;
let updateTitleEl = null;
let updateBodyEl = null;
let updateActionsEl = null;

function initUpdatePanel() {
  updatePanelEl = document.getElementById('update-panel');
  updateTitleEl = document.getElementById('update-title');
  updateBodyEl = document.getElementById('update-body');
  updateActionsEl = document.getElementById('update-actions');

  window.electronAPI.onUpdateStatusChange((data) => {
    handleStatusChange(data);
  });

  window.electronAPI.onDownloadProgress((data) => {
    handleProgress(data);
  });

  window.electronAPI.onUpdateError((data) => {
    handleError(data);
  });

  window.electronAPI.onPreDownloadReady((data) => {
    handlePreDownloadReady(data);
  });
}

function showUpdatePanel(state, data) {
  if (!updatePanelEl) return;
  updatePanelEl.classList.add('visible');

  switch (state) {
    case 'force': renderForceUpdate(data); break;
    case 'available': renderNormalUpdate(data); break;
    case 'downloading': renderDownloading(data); break;
    case 'done': renderDone(data); break;
    case 'error': renderError(data); break;
  }
}

function hideUpdatePanel() {
  if (!updatePanelEl) return;
  updatePanelEl.classList.remove('visible');
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatTime(seconds) {
  if (!seconds || seconds < 0) return '...';
  if (seconds < 60) return Math.round(seconds) + ' 秒';
  if (seconds < 3600) return Math.round(seconds / 60) + ' 分钟';
  return (seconds / 3600).toFixed(1) + ' 小时';
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// === State Renderers ===

function renderForceUpdate(data) {
  const m = data.manifest;
  const game = window._currentGame;
  const currentVer = game?.currentVersion || '未知';
  const newVer = m?.update?.version || '';
  const size = m?.update?.size || 0;
  const deltaSize = m?.update?.delta?.size || 0;
  const log = m?.updateLog || '';

  updateTitleEl.innerHTML = `⚠️ ${game?.name || ''} 需要强制更新后才可以启动`;
  updateBodyEl.innerHTML = `
    <div class="update-version-row">
      <span>当前版本 ${escapeHTML(currentVer)}</span>
      <span class="update-arrow">→</span>
      <span class="update-new-ver">新版本 ${escapeHTML(newVer)}</span>
    </div>
    ${log ? `<div class="update-log">${escapeHTML(log)}</div>` : ''}
    <div class="update-size">更新大小：${formatSize(size)}${deltaSize > 0 ? `（增量包 ${formatSize(deltaSize)}）` : ''}</div>
  `;
  updateActionsEl.innerHTML = `
    <button class="update-btn update-btn-primary" data-action="download-full">📥 完整更新</button>
    ${deltaSize > 0 ? `<button class="update-btn update-btn-secondary" data-action="download-delta">📦 增量更新</button>` : ''}
    <div class="update-force-hint">（必须更新，不可跳过）</div>
  `;
  bindActionButtons(data);
}

function renderNormalUpdate(data) {
  const m = data.manifest;
  const game = window._currentGame;
  const currentVer = game?.currentVersion || '未知';
  const newVer = m?.update?.version || '';
  const size = m?.update?.size || 0;
  const deltaSize = m?.update?.delta?.size || 0;
  const log = m?.updateLog || '';

  updateTitleEl.innerHTML = `🌟 ${game?.name || ''} 有可用更新`;
  updateBodyEl.innerHTML = `
    <div class="update-version-row">
      <span>当前版本 ${escapeHTML(currentVer)}</span>
      <span class="update-arrow">→</span>
      <span class="update-new-ver">新版本 ${escapeHTML(newVer)}</span>
    </div>
    ${log ? `<div class="update-log">${escapeHTML(log)}</div>` : ''}
    <div class="update-size">更新大小：${formatSize(size)}${deltaSize > 0 ? `（增量包 ${formatSize(deltaSize)}）` : ''}</div>
  `;
  updateActionsEl.innerHTML = `
    <button class="update-btn update-btn-primary" data-action="download-full">📥 完整更新</button>
    ${deltaSize > 0 ? `<button class="update-btn update-btn-secondary" data-action="download-delta">📦 增量更新</button>` : ''}
    <button class="update-btn update-btn-skip" data-action="skip">⏭ 跳过</button>
  `;
  bindActionButtons(data);
}

function renderDownloading(data) {
  const total = data.totalBytes || 0;
  const downloaded = data.downloadedBytes || 0;
  const speed = data.speed || 0;
  const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
  const remaining = speed > 0 ? (total - downloaded) / speed : 0;

  updateTitleEl.textContent = '📥 正在下载更新...';
  updateBodyEl.innerHTML = `
    <div class="update-progress-container">
      <div class="update-progress-bar" style="width:${percent}%"></div>
      <span class="update-progress-text">${percent}%</span>
    </div>
    <div class="update-progress-stats">
      已下载 ${formatSize(downloaded)} / ${formatSize(total)}
    </div>
    <div class="update-progress-speed">
      速度 ${formatSize(speed)}/s · 剩余约 ${formatTime(remaining)}
    </div>
  `;
  updateActionsEl.innerHTML = `
    <button class="update-btn update-btn-secondary" data-action="pause">⏸ 暂停</button>
    <button class="update-btn update-btn-skip" data-action="cancel">✕ 取消</button>
  `;
  bindActionButtons(data);
}

function renderDone(data) {
  updateTitleEl.textContent = '📦 下载完成！';
  updateBodyEl.innerHTML = `
    <div class="update-done-message">
      ${data.isPreDownload
        ? `版本 ${data.version || ''} 已准备就绪，等待版本上线后即可安装`
        : `版本 ${data.version || ''} 下载完成，可以安装了`
      }
    </div>
  `;
  updateActionsEl.innerHTML = `
    <button class="update-btn update-btn-primary" data-action="install">🔧 安装</button>
    <button class="update-btn update-btn-skip" data-action="cancel">🗑 删除</button>
  `;
  bindActionButtons(data);
}

function renderError(data) {
  const error = data.error || '未知错误';
  updateTitleEl.textContent = '❌ 更新失败';
  updateBodyEl.innerHTML = `
    <div class="update-error-message">错误：${escapeHTML(error)}</div>
  `;
  updateActionsEl.innerHTML = `
    <button class="update-btn update-btn-primary" data-action="retry">🔄 重试</button>
    <button class="update-btn update-btn-secondary" data-action="rollback">↩ 回滚到旧版本</button>
  `;
  bindActionButtons(data);
}

// === Action Handling ===

function bindActionButtons(data) {
  if (!updateActionsEl) return;

  updateActionsEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const gameId = data.gameId || (window._currentGame?.id);

      switch (action) {
        case 'download-full':
          await window.electronAPI.startDownload(gameId, 'full');
          break;
        case 'download-delta':
          await window.electronAPI.startDownload(gameId, 'delta');
          break;
        case 'pause':
          await window.electronAPI.pauseDownload(gameId);
          break;
        case 'cancel':
          await window.electronAPI.cancelDownload(gameId);
          hideUpdatePanel();
          break;
        case 'skip':
          hideUpdatePanel();
          if (window._pendingLaunch) window._pendingLaunch();
          break;
        case 'install':
          await window.electronAPI.startInstall(gameId);
          hideUpdatePanel();
          break;
        case 'retry':
          await window.electronAPI.startDownload(gameId, data.mode || 'full');
          break;
        case 'rollback':
          await window.electronAPI.rollbackGame(gameId);
          hideUpdatePanel();
          break;
      }
    });
  });
}

// === Event Handlers ===

function handleStatusChange(data) {
  const gameId = data.gameId;
  const game = window._currentGame;
  if (!game || game.id !== gameId) return;

  if (data.manifest && (data.manifest.update || data.manifest.preDownload)) {
    const forceUpdate = data.forceUpdate || data.manifest.forceUpdate;
    showUpdatePanel(forceUpdate ? 'force' : 'available', {
      gameId,
      manifest: data.manifest,
      forceUpdate,
    });
  } else if (data.status === 'done') {
    showUpdatePanel('done', {
      gameId,
      version: data.message?.replace('Pre-download complete', '') || '',
      isPreDownload: data.message?.includes('pre-download') || data.message?.includes('Pre-download'),
    });
  }
}

function handleProgress(data) {
  const game = window._currentGame;
  if (!game || game.id !== data.gameId) return;
  showUpdatePanel('downloading', data);
}

function handleError(data) {
  const game = window._currentGame;
  if (!game || game.id !== data.gameId) return;
  showUpdatePanel('error', data);
}

function handlePreDownloadReady(data) {
  const game = window._currentGame;
  if (game && game.id === data.gameId) {
    showUpdatePanel('done', { gameId: data.gameId, version: data.version, isPreDownload: true });
  }
}

// Export for app.js
window.UpdatePanel = {
  init: initUpdatePanel,
  show: showUpdatePanel,
  hide: hideUpdatePanel,
};
