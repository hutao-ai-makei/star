// === State ===
let games = [];
let selectedGameId = null;

// === DOM refs ===
const gameListEl = document.getElementById('game-list');
const gameNameEl = document.getElementById('game-name');
const metaLastEl = document.getElementById('meta-last');
const metaHoursEl = document.getElementById('meta-hours');
const versionChipEl = document.getElementById('version-chip');
const statusTextEl = document.getElementById('status-text');
const launchBtn = document.getElementById('launch-btn');
const launchIcon = document.getElementById('launch-icon');
const launchText = document.getElementById('launch-text');
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
  UpdatePanel.init();
  bindActionButtons();
}

async function loadGames() {
  games = await window.electronAPI.getGames();
  renderAll();
}

function renderAll() {
  if (games.length === 0) {
    gameListEl.innerHTML = '';
    gameNameEl.textContent = '';
    metaLastEl.textContent = '从未游玩';
    metaHoursEl.textContent = '尚未游玩';
    versionChipEl.textContent = '';
    statusTextEl.textContent = '未安装';
    coverArea.style.backgroundImage = '';
    coverArea.style.background = 'linear-gradient(135deg, #2D1B69 0%, #1a3a5c 40%, #0d2137 100%)';
    launchBtn.style.display = 'none';
    emptyStateEl.style.display = '';
    UpdatePanel.hide();
    return;
  }

  emptyStateEl.style.display = 'none';
  launchBtn.style.display = '';

  if (!selectedGameId || !games.find(g => g.id === selectedGameId)) {
    selectedGameId = games[0].id;
  }

  renderLibrary(gameListEl, games, selectedGameId, onGameSelect);
  renderDetail(games.find(g => g.id === selectedGameId));

  window._currentGame = games.find(g => g.id === selectedGameId);

  const selGame = games.find(g => g.id === selectedGameId);
  if (selGame) {
    if (selGame.updateStatus === 'downloading') {
      UpdatePanel.show('downloading', { gameId: selGame.id, ...selGame.downloadProgress });
    } else if (selGame.updateStatus === 'error') {
      UpdatePanel.show('error', { gameId: selGame.id, error: '上次更新失败，请重试' });
    } else if (selGame.updateStatus === 'done') {
      UpdatePanel.show('done', { gameId: selGame.id, version: selGame.targetVersion, isPreDownload: selGame.isPreDownload });
    }
  }
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
    const game = games.find(g => g.id === selectedGameId);
    window._currentGame = game;

    if (game.packageId) {
      try {
        const check = await window.electronAPI.checkUpdate(selectedGameId);
        if (check.hasUpdate) {
          UpdatePanel.show(check.forceUpdate ? 'force' : 'available', {
            gameId: selectedGameId,
            manifest: check.manifest,
            forceUpdate: check.forceUpdate,
          });

          window._pendingLaunch = () => doLaunch(selectedGameId);
          return;
        }
      } catch (err) {
        console.error('Update check failed:', err);
      }
    }

    doLaunch(selectedGameId);
  });
}

/**
 * 详情 / 打开目录 按钮
 */
function bindActionButtons() {
  const detailBtn = document.getElementById('detail-btn');
  const folderBtn = document.getElementById('folder-btn');
  if (detailBtn) {
    detailBtn.addEventListener('click', () => {
      openSettingsPanel(games, async () => {
        games = await window.electronAPI.getGames();
        selectedGameId = games.length > 0 ? games[0].id : null;
        renderAll();
      });
    });
  }
  if (folderBtn) {
    folderBtn.addEventListener('click', async () => {
      const game = games.find(g => g.id === selectedGameId);
      if (!game || !game.exePath) return;
      const dir = game.installDir || game.exePath.split(/[\\/]/).slice(0, -1).join('\\');
      await window.electronAPI.openPath(dir);
    });
  }
}

/**
 * Actually launch the game (update check already done).
 */
async function doLaunch(gameId) {
  const result = await window.electronAPI.launchGame(gameId);
  if (!result.success) {
    if (result.needsUpdate) return;
    alert('启动失败：' + (result.error || '未知错误'));
  }
}

function bindAddButton() {
  addGameBtn.addEventListener('click', openAddGameDialog);

  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn.addEventListener('click', () => {
    openSettingsPanel(games, async () => {
      games = await window.electronAPI.getGames();
      selectedGameId = games.length > 0 ? games[0].id : null;
      renderAll();
    });
  });
}

function bindGameEvents() {
  window.electronAPI.onGameRunning(({ id }) => {
    launchIcon.textContent = '■';
    launchText.textContent = '停止';
    launchBtn.classList.add('running');
  });

  window.electronAPI.onGameExited(async ({ id }) => {
    launchIcon.textContent = '▶';
    launchText.textContent = '启动游戏';
    launchBtn.classList.remove('running');
    await loadGames();
  });
}

// === Start ===
document.addEventListener('DOMContentLoaded', init);
