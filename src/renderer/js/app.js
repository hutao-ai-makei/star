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
    coverArea.style.background = 'linear-gradient(135deg, #2D1B69 0%, #1a3a5c 40%, #0d2137 100%)';
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
      const game = games.find(g => g.id === selectedGameId);
      if (result.error && result.error.includes('找不到')) {
        gameNameEl.textContent = (game?.name || '') + ' — 文件丢失';
        lastPlayedEl.textContent = '找不到可执行文件，请重新定位';
      } else if (!result.error.includes('已在运行')) {
        alert('启动失败：' + result.error);
      }
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
