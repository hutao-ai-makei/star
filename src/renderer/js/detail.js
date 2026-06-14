/**
 * 渲染右侧封面 + 游戏信息
 * @param {Object} game - 游戏对象
 */
async function renderDetail(game) {
  if (!game) {
    document.getElementById('game-name').textContent = '';
    document.getElementById('game-last-played').textContent = '';
    await setBackground(null);
    return;
  }

  document.getElementById('game-name').textContent = game.name;
  document.getElementById('game-last-played').textContent = '上次游玩 · ' + formatLastPlayed(game.lastPlayedAt);

  // 右侧主背景：mediaDir > videoPath > backgroundPath > 默认渐变
  await setBackground(game);
}

// === 媒体轮播状态 ===
let mediaFiles = [];       // [{path, type}, ...]
let mediaIndex = 0;
let bgVersion = 0;        // 防止快速切换时的竞态条件

/**
 * 设置右侧背景
 * 优先级：媒体目录（可轮播）> 单视频 > 单图片 > 默认渐变
 * @param {Object|null} game
 */
async function setBackground(game) {
  const version = ++bgVersion;
  const area = document.getElementById('cover-area');

  // 清理旧视频
  removeBgVideo();

  // 重置背景样式
  area.style.backgroundImage = '';
  area.style.background = '';
  area.style.backgroundSize = '';
  area.style.backgroundRepeat = '';
  area.style.backgroundPosition = '';

  // 隐藏箭头
  showArrows(false);

  if (!game) {
    mediaFiles = [];
    mediaIndex = 0;
    area.style.background = 'linear-gradient(135deg, #2D1B69 0%, #1a3a5c 40%, #0d2137 100%)';
    return;
  }

  // 1. 媒体目录优先
  if (game.mediaDir) {
    const result = await window.electronAPI.scanMediaDir(game.mediaDir);
    // 竞态检查：如果在等待期间又触发了新的 setBackground，放弃本次结果
    if (version !== bgVersion) return;
    if (result && result.files && result.files.length > 0) {
      mediaFiles = result.files;
      mediaIndex = 0;
      showMediaFile(mediaFiles[0]);
      if (mediaFiles.length > 1) {
        showArrows(true);
      }
      return;
    }
    // 目录为空或无文件，继续 fallback
    mediaFiles = [];
  }

  // 2. 单视频
  if (game.videoPath) {
    insertBgVideo(game.videoPath);
    return;
  }

  // 3. 单图片
  if (game.backgroundPath) {
    const bgUrl = game.backgroundPath.replace(/\\/g, '/');
    area.style.backgroundImage = `url(file:///${bgUrl})`;
    return;
  }

  // 4. 默认渐变
  area.style.background = 'linear-gradient(135deg, #2D1B69 0%, #1a3a5c 40%, #0d2137 100%)';
}

/**
 * 显示单个媒体文件（图片或视频）
 */
function showMediaFile(file) {
  const area = document.getElementById('cover-area');
  removeBgVideo();

  area.style.backgroundImage = '';
  area.style.background = '';
  area.style.backgroundSize = '';
  area.style.backgroundRepeat = '';
  area.style.backgroundPosition = '';

  if (file.type === 'video') {
    insertBgVideo(file.path);
  } else {
    const url = file.path.replace(/\\/g, '/');
    area.style.backgroundImage = `url(file:///${url})`;
  }
}

/**
 * 切换到上一个媒体
 */
function prevMedia() {
  if (!mediaFiles.length) return;
  mediaIndex = (mediaIndex - 1 + mediaFiles.length) % mediaFiles.length;
  showMediaFile(mediaFiles[mediaIndex]);
}

/**
 * 切换到下一个媒体
 */
function nextMedia() {
  if (!mediaFiles.length) return;
  mediaIndex = (mediaIndex + 1) % mediaFiles.length;
  showMediaFile(mediaFiles[mediaIndex]);
}

/**
 * 插入背景视频元素
 */
function insertBgVideo(videoPath) {
  const area = document.getElementById('cover-area');
  const videoUrl = videoPath.replace(/\\/g, '/');
  const video = document.createElement('video');
  video.className = 'bg-video';
  video.src = 'file:///' + videoUrl;
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.style.cssText = `
    position: absolute; inset: 0; z-index: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    pointer-events: none;
  `;
  video.addEventListener('error', () => video.remove());
  area.insertBefore(video, area.firstChild);
}

/**
 * 移除背景视频元素
 */
function removeBgVideo() {
  const area = document.getElementById('cover-area');
  const video = area.querySelector('.bg-video');
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}

/**
 * 显示/隐藏左右箭头
 */
function showArrows(visible) {
  const left = document.getElementById('media-arrow-left');
  const right = document.getElementById('media-arrow-right');
  const display = visible ? '' : 'none';
  if (left) left.style.display = display;
  if (right) right.style.display = display;
}

// === 箭头点击事件 ===
function bindMediaArrows() {
  const left = document.getElementById('media-arrow-left');
  const right = document.getElementById('media-arrow-right');
  if (left) left.addEventListener('click', (e) => { e.stopPropagation(); prevMedia(); });
  if (right) right.addEventListener('click', (e) => { e.stopPropagation(); nextMedia(); });
}

// 页面加载时绑定
document.addEventListener('DOMContentLoaded', bindMediaArrows);

// 键盘左右键切换
document.addEventListener('keydown', (e) => {
  if (!mediaFiles.length) return;
  if (e.key === 'ArrowLeft') {
    // 不拦截已经在输入框的情况
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    prevMedia();
  } else if (e.key === 'ArrowRight') {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    nextMedia();
  }
});
