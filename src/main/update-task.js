const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getGameById, getSettings, updateGame } = require('./store');
const { downloadParallel, RateLimiter } = require('./download-engine');
const { installUpdate, rollbackUpdate } = require('./install-manager');

const TaskState = {
  STOP: 'stop',
  PENDING: 'pending',
  DOWNLOADING: 'downloading',
  DECOMPRESSING: 'decompressing',
  MERGING: 'merging',
  VERIFYING: 'verifying',
  FINISH: 'finish',
  PAUSED: 'paused',
  ERROR: 'error',
};

const TaskMode = {
  SINGLE_FILE: 'SingleFile',
  COMPRESSED_PACKAGE: 'CompressedPackage',
  CHUNK: 'Chunk',
  PATCH: 'Patch',
};

/**
 * Generate a cache folder for a task based on game and target version.
 * This allows resuming across app restarts.
 */
function getTaskCacheDir(game, targetVersion) {
  const installDir = game.installDir || path.dirname(game.exePath);
  const safeVersion = (targetVersion || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(installDir, '.downloads', `update_${safeVersion}`);
}

/**
 * Make a safe file name from a URL.
 */
function fileNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const base = path.basename(parsed.pathname) || 'download';
    return base.replace(/[^a-zA-Z0-9._-]/g, '_');
  } catch (_) {
    return 'download';
  }
}

/**
 * Build TaskFiles from the simplified package manifest used by the current API.
 *
 * @param {object} checkResult — result from checkForUpdate
 * @param {string} cacheDir — directory to save downloaded files
 * @returns {{taskFiles:Array<object>, deleteFiles:Array<string>}}
 */
function buildTaskFiles(checkResult, cacheDir) {
  const { manifest, isPreDownload } = checkResult;
  const pkg = manifest;
  const section = isPreDownload ? pkg.preDownload : pkg.update;

  if (!section) {
    return { taskFiles: [], deleteFiles: [] };
  }

  const taskFiles = [];

  // Heuristic: if the section has compressedPackages, treat as CompressedPackage.
  if (section.compressedPackages && Array.isArray(section.compressedPackages) && section.compressedPackages.length > 0) {
    taskFiles.push({
      mode: TaskMode.COMPRESSED_PACKAGE,
      fullPath: path.join(cacheDir, section.fileName || 'update.zip'),
      size: section.totalSize || section.size || 0,
      md5: section.md5 || '',
      sha256: section.sha256 || '',
      compressedPackages: section.compressedPackages.map(p => ({
        fullPath: path.join(cacheDir, fileNameFromUrl(p.url)),
        url: p.url,
        size: p.size || 0,
        md5: p.md5 || '',
        sha256: p.sha256 || '',
        decompressedSize: p.decompressedSize || 0,
      })),
    });
  } else {
    // Single file (full zip or binary)
    taskFiles.push({
      mode: TaskMode.SINGLE_FILE,
      fullPath: path.join(cacheDir, section.fileName || fileNameFromUrl(section.url)),
      url: section.url,
      size: section.size || 0,
      md5: section.md5 || '',
      sha256: section.sha256 || '',
    });
  }

  // Audio packages if present
  if (section.audioPackages && Array.isArray(section.audioPackages)) {
    for (const audio of section.audioPackages) {
      taskFiles.push({
        mode: TaskMode.SINGLE_FILE,
        fullPath: path.join(cacheDir, audio.fileName || fileNameFromUrl(audio.url)),
        url: audio.url,
        size: audio.size || 0,
        md5: audio.md5 || '',
        sha256: audio.sha256 || '',
        audioLanguage: audio.language,
      });
    }
  }

  const deleteFiles = section.deleteFiles || [];
  return { taskFiles, deleteFiles };
}

/**
 * Convert TaskFiles into a flat list of downloadable items.
 *
 * @param {Array<object>} taskFiles
 * @returns {Array<object>}
 */
function getDownloadFiles(taskFiles) {
  const result = [];
  const seen = new Set();

  for (const file of taskFiles) {
    if (file.mode === TaskMode.SINGLE_FILE) {
      const key = file.url;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        id: key,
        url: file.url,
        destPath: file.fullPath,
        size: file.size,
        hash: file.sha256 || file.md5,
        hashAlgo: file.sha256 ? 'sha256' : 'md5',
      });
    } else if (file.mode === TaskMode.COMPRESSED_PACKAGE) {
      for (const pkg of file.compressedPackages) {
        const key = pkg.url;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          id: key,
          url: pkg.url,
          destPath: pkg.fullPath,
          size: pkg.size,
          hash: pkg.sha256 || pkg.md5,
          hashAlgo: pkg.sha256 ? 'sha256' : 'md5',
        });
      }
    }
  }

  return result;
}

/**
 * Calculate total download bytes from download list.
 */
function calculateTotalBytes(files) {
  return files.reduce((sum, f) => sum + (f.size || 0), 0);
}

class UpdateTask {
  /**
   * @param {string} gameId
   * @param {object} checkResult — from checkForUpdate
   * @param {object} options — { onStatusChange?, onProgress?, onError? }
   */
  constructor(gameId, checkResult, options = {}) {
    this.gameId = gameId;
    this.checkResult = checkResult;
    this.options = options;

    this.id = crypto.randomUUID();
    this.state = TaskState.PENDING;
    this.error = null;

    this.controller = new AbortController();
    this.totalBytes = 0;
    this.downloadedBytes = 0;
    this.progressPercent = 0;
    this.speed = 0;

    this.game = getGameById(gameId);
    this.installDir = this.game?.installDir || path.dirname(this.game?.exePath || '');
    this.cacheDir = getTaskCacheDir(this.game, checkResult.targetVersion);

    const { taskFiles, deleteFiles } = buildTaskFiles(checkResult, this.cacheDir);
    this.taskFiles = taskFiles;
    this.deleteFiles = deleteFiles;
    this.downloadFiles = getDownloadFiles(taskFiles);
    this.totalBytes = calculateTotalBytes(this.downloadFiles);

    this._lastProgressTime = Date.now();
    this._lastProgressBytes = 0;
  }

  /**
   * Prepare directories and persist task state.
   */
  async prepare() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    updateGame(this.gameId, {
      updateStatus: this.state,
      targetVersion: this.checkResult.targetVersion,
      isPreDownload: this.checkResult.isPreDownload,
      downloadProgress: this._buildProgress(),
    });

    this._emitStatusChange();
  }

  /**
   * Start the update task.
   */
  async start() {
    if (this.state === TaskState.FINISH) return;
    if (this.controller.signal.aborted) {
      this.controller = new AbortController();
    }

    try {
      this._setState(TaskState.DOWNLOADING);

      if (this.downloadFiles.length > 0) {
        await this._doDownload();
      }

      // Pre-download only fetches files to cache; formal update installs them.
      if (!this.checkResult.isPreDownload) {
        // Single-file updates do not need decompression
        const needsDecompress = this.taskFiles.some(f => f.mode === TaskMode.COMPRESSED_PACKAGE);

        if (needsDecompress) {
          this._setState(TaskState.DECOMPRESSING);
          this.progressPercent = 0;
        }

        await installUpdate(this, {
          onProgress: (percent) => {
            this.progressPercent = percent;
            this._emitProgress();
          },
        });
      }

      this._setState(TaskState.FINISH);

      if (this.checkResult.isPreDownload) {
        this._writePredownloadMark();
        updateGame(this.gameId, {
          updateStatus: 'idle',
          targetVersion: '',
          isPreDownload: false,
          downloadProgress: this._buildProgress(),
        });
      } else {
        // Formal update: bump current version and clear predownload mark
        updateGame(this.gameId, {
          currentVersion: this.checkResult.targetVersion,
          targetVersion: '',
          updateStatus: 'idle',
          isPreDownload: false,
          predownloadInfo: null,
          downloadProgress: this._buildProgress(),
        });
      }

      this._emitStatusChange();
    } catch (err) {
      if (this.state === TaskState.PAUSED) {
        // Pause requested while downloading; keep paused state for resume.
      } else if (err.message === 'Aborted' || this.controller.signal.aborted) {
        this._setState(TaskState.STOP);
      } else {
        this.error = err;
        this._setState(TaskState.ERROR);
      }

      updateGame(this.gameId, {
        updateStatus: this.state,
        downloadProgress: this._buildProgress(),
      });

      if (this.options.onError && this.state === TaskState.ERROR) {
        this.options.onError({ gameId: this.gameId, error: err.message });
      }

      this._emitStatusChange();
      throw err;
    }
  }

  /**
   * Pause the task (cancels active downloads, keeps cache for resume).
   */
  pause() {
    if (this.state === TaskState.DOWNLOADING) {
      this.controller.abort();
      this._setState(TaskState.PAUSED);
      updateGame(this.gameId, { updateStatus: this.state });
      this._emitStatusChange();
    }
  }

  /**
   * Cancel the task and clean up cache.
   */
  cancel() {
    this.controller.abort();
    this._setState(TaskState.STOP);

    try {
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('Failed to clean up cache:', err.message);
    }

    updateGame(this.gameId, {
      updateStatus: 'idle',
      targetVersion: '',
      downloadProgress: { totalBytes: 0, downloadedBytes: 0, speed: 0, chunks: [] },
    });

    this._emitStatusChange();
  }

  /**
   * Roll back to previous state.
   */
  async rollback() {
    this.controller.abort();
    const oldVersion = await rollbackUpdate(this);
    this._setState(TaskState.STOP);

    updateGame(this.gameId, {
      currentVersion: oldVersion || this.game?.currentVersion || '',
      targetVersion: '',
      updateStatus: 'idle',
      isPreDownload: false,
      predownloadInfo: null,
      downloadProgress: { totalBytes: 0, downloadedBytes: 0, speed: 0, chunks: [] },
    });

    this._emitStatusChange();
  }

  async _doDownload() {
    const settings = getSettings();
    const concurrency = settings.maxConcurrentDownloads
      || settings.maxConcurrentChunks
      || 4;
    const retries = settings.maxDownloadRetries ?? 3;
    const speedLimit = settings.downloadSpeedLimit || 0;

    const rateLimiter = speedLimit > 0 ? new RateLimiter(speedLimit) : null;

    const downloadOptions = {
      concurrency,
      retries,
      signal: this.controller.signal,
      rateLimiter,
      onProgress: (total, delta) => {
        this.downloadedBytes = total;
        this._updateSpeed(delta);
        this._emitProgress();
      },
    };

    await downloadParallel(this.downloadFiles, downloadOptions);
  }

  _updateSpeed(deltaBytes) {
    const now = Date.now();
    const elapsed = (now - this._lastProgressTime) / 1000;
    if (elapsed >= 1) {
      this.speed = Math.round((this.downloadedBytes - this._lastProgressBytes) / elapsed);
      this._lastProgressTime = now;
      this._lastProgressBytes = this.downloadedBytes;
    }
  }

  _setState(newState) {
    this.state = newState;
  }

  _buildProgress() {
    if (this.state === TaskState.DOWNLOADING) {
      return {
        totalBytes: this.totalBytes,
        downloadedBytes: this.downloadedBytes,
        speed: this.speed,
        chunks: [],
      };
    }

    return {
      totalBytes: this.totalBytes,
      downloadedBytes: this.downloadedBytes,
      speed: this.speed,
      percent: this.progressPercent,
      state: this.state,
    };
  }

  _emitProgress() {
    if (this.options.onProgress) {
      this.options.onProgress({
        gameId: this.gameId,
        ...this._buildProgress(),
      });
    }
  }

  _emitStatusChange() {
    if (this.options.onStatusChange) {
      this.options.onStatusChange({
        gameId: this.gameId,
        status: this.state,
        manifest: this.checkResult.manifest,
        forceUpdate: this.checkResult.forceUpdate,
        isPreDownload: this.checkResult.isPreDownload,
        targetVersion: this.checkResult.targetVersion,
        error: this.error?.message,
      });
    }
  }

  _writePredownloadMark() {
    if (!this.checkResult.isPreDownload) return;

    const game = getGameById(this.gameId);
    const localVersion = game?.currentVersion || '';
    const audioLanguage = 'default'; // Simplified API has no audio language list

    updateGame(this.gameId, {
      predownloadInfo: {
        localVersion,
        predownloadVersion: this.checkResult.targetVersion,
        audioLanguage,
      },
    });
  }
}

module.exports = {
  TaskState,
  TaskMode,
  UpdateTask,
  buildTaskFiles,
  getDownloadFiles,
};
