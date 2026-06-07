/**
 * 渲染左侧图标栏
 * @param {HTMLElement} containerEl - #game-list 元素
 * @param {Array} games - 游戏列表
 * @param {string} selectedId - 当前选中的游戏 ID
 * @param {Function} onSelect - 选中回调 (id) => void
 */
function renderLibrary(containerEl, games, selectedId, onSelect) {
  containerEl.innerHTML = '';
  games.forEach(game => {
    const el = document.createElement('div');
    el.className = 'game-icon' + (game.id === selectedId ? ' selected' : '');
    el.title = game.name;

    if (game.coverPath) {
      const coverUrl = game.coverPath.replace(/\\/g, '/');
      el.style.backgroundImage = `url(file:///${coverUrl})`;
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
