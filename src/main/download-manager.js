const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getGameById, updateGame } = require('./store');

// Active downloads: gameId -> { controllers: AbortController[], paused: boolean }
const activeDownloads = new Map();

/**
 * Download a single chunk with range support.
 * @param {string} url — base URL for chunks (chunk index appended)
 * @param {number} chunkIndex
 * @param {string} destDir — directory to save chunk files
 * @param {AbortSignal} signal
 * @returns {Promise<string>} path to downloaded chunk file
 */
function downloadChunk(url, chunkIndex, destDir, signal) {
  return new Promise((resolve, reject) => {
    const chunkUrl = `${url.replace(/\/+$/, '')}/chunk_${String(chunkIndex).padStart(4, '0')}`;
    const chunkPath = path.join(destDir, `chunk_${String(chunkIndex).padStart(4, '0')}`);
    const file = fs.createWriteStream(chunkPath);

    const client = chunkUrl.startsWith('https') ? https : http;
    const req = client.get(chunkUrl, { timeout: 30000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(chunkPath);
        const redirectUrl = res.headers.location;
        const redirectClient = redirectUrl.startsWith('https') ? https : http;
        const redirectReq = redirectClient.get(redirectUrl, { timeout: 30000 }, (redirectRes) => {
          redirectRes.pipe(file);
          file.on('finish', () => resolve(chunkPath));
          file.on('error', reject);
        });
        redirectReq.on('error', reject);
        signal.addEventListener('abort', () => redirectReq.destroy());
        return;
      }
      res.pipe(file);
      file.on('finish', () => resolve(chunkPath));
      file.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Chunk download timeout')); });
    signal.addEventListener('abort', () => {
      req.destroy();
      file.close();
      if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
    });
  });
}

/**
 * Download a full file (no chunks).
 * @param {string} url
 * @param {string} destPath
 * @param {AbortSignal} signal
 * @returns {Promise<string>}
 */
function downloadFull(url, destPath, signal) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = client.get(url, { timeout: 30000 }, (res) => {
      res.pipe(file);
      file.on('finish', () => resolve(destPath));
      file.on('error', reject);
    });
    req.on('error', reject);
    signal.addEventListener('abort', () => {
      req.destroy();
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    });
  });
}

/**
 * Compute SHA256 hash of a file.
 * @param {string} filePath
 * @returns {Promise<string>} hex hash
 */
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

/**
 * Main download function.
 * @param {string} gameId
 * @param {object} options — { url, chunks, totalSize, sha256, mode }
 * @param {Function} onProgress — (progressData) => void
 * @returns {Promise<{filePath: string, verified: boolean}>}
 */
async function download(gameId, options, onProgress) {
  const game = getGameById(gameId);
  if (!game) throw new Error('Game not found');

  const { url, totalSize, sha256 } = options;
  const chunks = options.chunks || 1;
  const installDir = game.installDir || path.dirname(game.exePath);
  const downloadDir = path.join(installDir, '.downloads');

  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  const controller = new AbortController();
  if (!activeDownloads.has(gameId)) {
    activeDownloads.set(gameId, { controllers: [], paused: false });
  }
  activeDownloads.get(gameId).controllers.push(controller);

  updateGame(gameId, {
    updateStatus: 'downloading',
    downloadProgress: { totalBytes: totalSize, downloadedBytes: 0, speed: 0, chunks: [] }
  });

  const startTime = Date.now();
  let totalDownloaded = 0;
  const chunkProgress = new Array(chunks).fill(0);

  try {
    if (chunks <= 1) {
      const destPath = path.join(downloadDir, 'update.zip');
      await downloadFull(url, destPath, controller.signal);

      totalDownloaded = fs.statSync(destPath).size;
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = elapsed > 0 ? totalDownloaded / elapsed : 0;

      if (onProgress) {
        onProgress({ totalBytes: totalSize, downloadedBytes: totalDownloaded, speed });
      }

      updateGame(gameId, {
        downloadProgress: { totalBytes: totalSize, downloadedBytes: totalDownloaded, speed, chunks: [] }
      });

      if (sha256) {
        const actualHash = await sha256File(destPath);
        if (actualHash !== sha256) {
          fs.unlinkSync(destPath);
          updateGame(gameId, { updateStatus: 'error' });
          throw new Error(`SHA256 mismatch: expected ${sha256}, got ${actualHash}`);
        }
      }

      updateGame(gameId, { updateStatus: 'done' });
      return { filePath: destPath, verified: true };

    } else {
      const maxConcurrent = require('./store').getSettings().maxConcurrentChunks || 4;
      const chunkFiles = [];

      for (let i = 0; i < chunks; i += maxConcurrent) {
        const batch = [];
        for (let j = i; j < Math.min(i + maxConcurrent, chunks); j++) {
          batch.push(
            downloadChunk(url, j, downloadDir, controller.signal)
              .then(chunkPath => {
                try {
                  const stat = fs.statSync(chunkPath);
                  chunkProgress[j] = stat.size;
                  totalDownloaded = chunkProgress.reduce((a, b) => a + b, 0);
                  const elapsed = (Date.now() - startTime) / 1000;
                  const speed = elapsed > 0 ? totalDownloaded / elapsed : 0;

                  if (onProgress) {
                    onProgress({ totalBytes: totalSize, downloadedBytes: totalDownloaded, speed });
                  }

                  updateGame(gameId, {
                    downloadProgress: {
                      totalBytes: totalSize,
                      downloadedBytes: totalDownloaded,
                      speed,
                      chunks: chunkProgress.map((s, idx) => ({ index: idx, downloaded: s, done: s > 0 }))
                    }
                  });
                } catch (_) { /* stat may fail */ }
                chunkFiles.push(chunkPath);
              })
              .catch(err => {
                if (err.name === 'AbortError') return;
                throw err;
              })
          );
        }
        await Promise.all(batch);
      }

      // Merge chunks
      const mergedPath = path.join(downloadDir, 'update.zip');
      const writeStream = fs.createWriteStream(mergedPath);
      for (let i = 0; i < chunks; i++) {
        const chunkPath = path.join(downloadDir, `chunk_${String(i).padStart(4, '0')}`);
        if (fs.existsSync(chunkPath)) {
          const data = fs.readFileSync(chunkPath);
          writeStream.write(data);
          fs.unlinkSync(chunkPath);
        }
      }
      writeStream.end();

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      if (sha256) {
        const actualHash = await sha256File(mergedPath);
        if (actualHash !== sha256) {
          fs.unlinkSync(mergedPath);
          updateGame(gameId, { updateStatus: 'error' });
          throw new Error(`SHA256 mismatch: expected ${sha256}, got ${actualHash}`);
        }
      }

      updateGame(gameId, { updateStatus: 'done' });
      return { filePath: mergedPath, verified: true };
    }
  } catch (err) {
    updateGame(gameId, { updateStatus: 'error' });
    throw err;
  } finally {
    activeDownloads.delete(gameId);
  }
}

/**
 * Pause an active download.
 */
function pause(gameId) {
  const entry = activeDownloads.get(gameId);
  if (entry) {
    entry.paused = true;
    entry.controllers.forEach(c => c.abort());
  }
}

/**
 * Cancel a download and clean up temp files.
 */
function cancel(gameId) {
  const entry = activeDownloads.get(gameId);
  if (entry) {
    entry.controllers.forEach(c => c.abort());
    activeDownloads.delete(gameId);
  }

  const game = getGameById(gameId);
  if (game) {
    const installDir = game.installDir || path.dirname(game.exePath);
    const downloadDir = path.join(installDir, '.downloads');
    if (fs.existsSync(downloadDir)) {
      fs.rmSync(downloadDir, { recursive: true, force: true });
    }
    updateGame(gameId, { updateStatus: 'idle' });
  }
}

module.exports = { download, pause, cancel, sha256File, formatBytes };
