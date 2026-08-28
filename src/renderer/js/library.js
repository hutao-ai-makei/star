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

    // 图标优先使用 exe 提取的 iconPath；其次自定义 coverPath；最后兜底 emoji
    if (game.iconPath) {
      const iconUrl = game.iconPath.replace(/\\/g, '/');
      el.style.backgroundImage = `url(file:///${iconUrl})`;
    } else if (game.coverPath) {
      const coverUrl = game.coverPath.replace(/\\/g, '/');
      el.style.backgroundImage = `url(file:///${coverUrl})`;
    } else {
      el.textContent = '🎮';
    }

    // 更新中（下载/暂停/解压/校验等）显示角标
    const updating = ['downloading', 'pending', 'decompressing', 'merging', 'verifying', 'paused'].includes(game.updateStatus);
    if (updating) {
      const dot = document.createElement('span');
      dot.className = 'badge-dot';
      dot.title = '有更新可用';
      el.appendChild(dot);
    }

    el.addEventListener('click', () => onSelect(game.id));
    containerEl.appendChild(el);
  });
}
