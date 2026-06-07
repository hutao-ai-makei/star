/**
 * 格式化游玩时长
 * @param {number} seconds
 * @returns {string}
 */
function formatPlayTime(seconds) {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分钟`;
  return `${m} 分钟`;
}

/**
 * 格式化"上次游玩"为相对时间
 * @param {string|null} isoString
 * @returns {string}
 */
function formatLastPlayed(isoString) {
  if (!isoString) return '从未游玩';
  const then = new Date(isoString);
  const now = new Date();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return then.toLocaleDateString('zh-CN');
}
