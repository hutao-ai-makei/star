/**
 * 渲染右侧封面 + 游戏信息
 * @param {Object} game - 游戏对象
 */
function renderDetail(game) {
  if (!game) {
    document.getElementById('game-name').textContent = '';
    document.getElementById('game-last-played').textContent = '';
    document.getElementById('cover-area').style.backgroundImage = '';
    document.getElementById('cover-area').style.background = 'linear-gradient(135deg, #2D1B69 0%, #1a3a5c 40%, #0d2137 100%)';
    return;
  }

  document.getElementById('game-name').textContent = game.name;
  document.getElementById('game-last-played').textContent = '上次游玩 · ' + formatLastPlayed(game.lastPlayedAt);

  if (game.coverPath) {
    const coverUrl = game.coverPath.replace(/\\/g, '/');
    document.getElementById('cover-area').style.backgroundImage = `url(file:///${coverUrl})`;
    document.getElementById('cover-area').style.background = '';
  } else {
    document.getElementById('cover-area').style.backgroundImage = '';
    document.getElementById('cover-area').style.background = 'linear-gradient(135deg, #2D1B69 0%, #1a3a5c 40%, #0d2137 100%)';
  }
}
