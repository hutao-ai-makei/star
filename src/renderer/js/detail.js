/**
 * 渲染右侧封面 + 游戏信息
 * @param {Object} game - 游戏对象
 */
async function renderDetail(game) {
  const nameEl = document.getElementById('game-name');
  const enEl = document.getElementById('game-name-en');
  const lastEl = document.getElementById('meta-last');
  const hoursEl = document.getElementById('meta-hours');
  const verEl = document.getElementById('version-chip');
  const chip = document.getElementById('status-chip');
  const chipText = document.getElementById('status-text');

  if (!game) {
    nameEl.textContent = '';
    enEl.textContent = '';
    lastEl.textContent = '从未游玩';
    hoursEl.textContent = '尚未游玩';
    verEl.textContent = '';
    chipText.textContent = '未安装';
    chip.classList.remove('updating');
    await setBackground(null);
    return;
  }

  nameEl.textContent = game.name;
  enEl.textContent = game.enName || '';   // 数据中暂无英文名，留空则自动隐藏
  lastEl.textContent = formatLastPlayed(game.lastPlayedAt);
  hoursEl.textContent = formatPlayTime(game.totalPlayTime) || '尚未游玩';
  verEl.textContent = game.currentVersion || '';

  const updating = ['downloading', 'pending', 'decompressing', 'merging', 'verifying', 'paused'].includes(game.updateStatus);
  chip.classList.toggle('updating', updating);
  chipText.textContent = updating ? '更新中' : '已安装';

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

  removeBgVideo();

  area.style.backgroundImage = '';
  area.style.background = '';
  area.style.backgroundSize = '';
  area.style.backgroundRepeat = '';
  area.style.backgroundPosition = '';

  showArrows(false);
  renderMediaDots();

  if (!game) {
    mediaFiles = [];
    mediaIndex = 0;
    area.style.background = 'linear-gradient(135deg, #2D1B69 0%, #1a3a5c 40%, #0d2137 100%)';
    return;
  }

  // 1. 媒体目录优先
  if (game.mediaDir) {
    const result = await window.electronAPI.scanMediaDir(game.mediaDir);
    if (version !== bgVersion) return;
    if (result && result.files && result.files.length > 0) {
      mediaFiles = result.files;
      mediaIndex = 0;
      showMediaFile(mediaFiles[0]);
      if (mediaFiles.length > 1) {
        showArrows(true);
        renderMediaDots();
      }
      return;
    }
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
  renderMediaDots();
}

/** 渲染媒体指示点 */
function renderMediaDots() {
  const dotsEl = document.getElementById('media-dots');
  if (!dotsEl) return;
  dotsEl.innerHTML = '';
  if (!mediaFiles.length || mediaFiles.length < 2) return;
  mediaFiles.forEach((_, i) => {
    const d = document.createElement('span');
    d.className = 'dot' + (i === mediaIndex ? ' active' : '');
    d.addEventListener('click', () => { mediaIndex = i; showMediaFile(mediaFiles[i]); });
    dotsEl.appendChild(d);
  });
}

function prevMedia() {
  if (!mediaFiles.length) return;
  mediaIndex = (mediaIndex - 1 + mediaFiles.length) % mediaFiles.length;
  showMediaFile(mediaFiles[mediaIndex]);
}

function nextMedia() {
  if (!mediaFiles.length) return;
  mediaIndex = (mediaIndex + 1) % mediaFiles.length;
  showMediaFile(mediaFiles[mediaIndex]);
}

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
    position: absolute; inset: 0; z-index: 1;
    width: 100%; height: 100%;
    object-fit: cover;
    pointer-events: none;
  `;
  video.addEventListener('error', () => video.remove());
  area.insertBefore(video, area.firstChild);
}

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

document.addEventListener('DOMContentLoaded', bindMediaArrows);

document.addEventListener('keydown', (e) => {
  if (!mediaFiles.length) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') prevMedia();
  else if (e.key === 'ArrowRight') nextMedia();
});
