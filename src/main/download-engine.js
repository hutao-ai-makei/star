const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRY_DELAY = 1000;

/**
 * Compute hash of a file.
 * @param {string} filePath
 * @param {string} algorithm — 'sha256' | 'md5'
 * @returns {Promise<string>} hex hash
 */
function hashFile(filePath, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
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
 * Simple token-bucket rate limiter.
 */
class RateLimiter {
  /**
   * @param {number} bytesPerSecond — 0 means unlimited
   * @param {number} maxBucketSize
   */
  constructor(bytesPerSecond = 0, maxBucketSize = 1024 * 1024) {
    this.bytesPerSecond = bytesPerSecond || 0;
    this.maxBucketSize = maxBucketSize;
    this.tokens = maxBucketSize;
    this.lastTime = Date.now();
  }

  /**
   * Acquire permission to send/receive `bytes`.
   * Returns a promise that resolves when allowed.
   */
  async acquire(bytes) {
    if (this.bytesPerSecond <= 0) return;

    while (true) {
      const now = Date.now();
      const elapsed = (now - this.lastTime) / 1000;
      this.tokens = Math.min(this.maxBucketSize, this.tokens + elapsed * this.bytesPerSecond);
      this.lastTime = now;

      if (this.tokens >= bytes) {
        this.tokens -= bytes;
        return;
      }

      // If a single request is larger than the bucket, wait for its full worth.
      if (bytes > this.maxBucketSize) {
        const waitMs = Math.max(10, (bytes / this.bytesPerSecond) * 1000);
        await sleep(waitMs);
        this.tokens = 0;
        this.lastTime = Date.now();
        return;
      }

      const need = bytes - this.tokens;
      const waitMs = Math.max(10, (need / this.bytesPerSecond) * 1000);
      await sleep(waitMs);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Download a file with resume support.
 *
 * Uses fs.open/fs.write so we can correctly seek to the resume offset.
 *
 * @param {string} url
 * @param {string} destPath
 * @param {number} expectedSize
 * @param {object} options — { signal?, timeout?, rateLimiter?, onProgress?(bytes) }
 * @returns {Promise<void>}
 */
function downloadResumable(url, destPath, expectedSize, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const signal = options.signal;
    const rateLimiter = options.rateLimiter;
    const onProgress = options.onProgress;

    ensureDir(path.dirname(destPath));

    let startSize = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;

    if (startSize > expectedSize) {
      // Existing file is larger than expected; truncate and restart.
      fs.truncateSync(destPath, 0);
      startSize = 0;
    }

    if (startSize === expectedSize) {
      // Already complete
      resolve();
      return;
    }

    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const headers = {};
    if (startSize > 0) {
      headers['Range'] = `bytes=${startSize}-`;
    }

    const req = client.get(url, { timeout, headers }, async (res) => {
      try {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow one redirect
          await downloadResumable(
            new URL(res.headers.location, url).toString(),
            destPath,
            expectedSize,
            options
          );
          resolve();
          return;
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const isResuming = res.statusCode === 206 && startSize > 0;
        // If we asked for a range but server returned 200, discard partial data and restart.
        if (!isResuming && startSize > 0) {
          fs.truncateSync(destPath, 0);
        }
        const openFlags = isResuming ? 'r+' : 'w';

        fs.open(destPath, openFlags, async (err, fd) => {
          if (err) {
            reject(err);
            return;
          }

          let writeOffset = isResuming ? startSize : 0;
          let receivedThisSession = 0;
          let aborted = false;
          let pendingWrites = 0;
          let endReceived = false;

          function finish() {
            fs.close(fd, (closeErr) => {
              if (closeErr) {
                reject(closeErr);
              } else {
                resolve();
              }
            });
          }

          function cleanup(err) {
            if (aborted) return;
            aborted = true;
            fs.close(fd, () => {});
            req.destroy();
            reject(err);
          }

          if (signal) {
            signal.addEventListener('abort', () => {
              cleanup(new Error('Aborted'));
            }, { once: true });
          }

          res.on('data', async (chunk) => {
            if (aborted || signal?.aborted) return;

            if (rateLimiter) {
              try {
                await rateLimiter.acquire(chunk.length);
              } catch (rateErr) {
                cleanup(rateErr);
                return;
              }
            }

            if (aborted) return;
            pendingWrites++;

            fs.write(fd, chunk, 0, chunk.length, writeOffset, (writeErr, written) => {
              pendingWrites--;
              if (writeErr) {
                cleanup(writeErr);
                return;
              }
              writeOffset += written;
              receivedThisSession += written;
              if (onProgress) onProgress(written);

              if (endReceived && pendingWrites === 0) {
                finish();
              }
            });
          });

          res.on('end', () => {
            if (aborted) return;
            endReceived = true;
            if (pendingWrites === 0) {
              finish();
            }
          });

          res.on('error', cleanup);
        });
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Download a file with retry and hash verification.
 *
 * @param {object} task — { id?, url, destPath, size, hash?, hashAlgo? }
 * @param {object} options — { retries?, retryDelay?, signal?, rateLimiter?, onProgress?(bytes) }
 * @returns {Promise<{destPath:string, verified:boolean}>}
 */
async function downloadWithRetry(task, options = {}) {
  const {
    retries = 3,
    retryDelay = DEFAULT_RETRY_DELAY,
    signal,
    rateLimiter,
    onProgress,
  } = options;

  const { url, destPath, size, hash, hashAlgo = 'sha256' } = task;

  if (signal?.aborted) {
    throw new Error('Aborted');
  }

  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await downloadResumable(url, destPath, size, {
        signal,
        rateLimiter,
        onProgress,
      });

      const actualSize = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
      if (actualSize !== size) {
        throw new Error(`Size mismatch: expected ${size}, got ${actualSize}`);
      }

      if (hash) {
        const actualHash = await hashFile(destPath, hashAlgo);
        if (!equalsIgnoreCase(actualHash, hash)) {
          fs.unlinkSync(destPath);
          throw new Error(`Hash mismatch: expected ${hash}, got ${actualHash}`);
        }
      }

      return { destPath, verified: true };
    } catch (err) {
      lastErr = err;
      if (signal?.aborted || err.message === 'Aborted') {
        throw err;
      }

      // Remove corrupt/partial file before retry (except when the user explicitly paused).
      if (attempt < retries) {
        try {
          if (fs.existsSync(destPath) && fs.statSync(destPath).size !== size) {
            fs.unlinkSync(destPath);
          }
        } catch (_) {}

        const delay = retryDelay * Math.pow(2, attempt);
        console.warn(`Download retry ${attempt + 1}/${retries} for ${url}: ${err.message}`);
        await sleep(delay);
      }
    }
  }

  throw lastErr || new Error(`Download failed: ${url}`);
}

/**
 * Download multiple files in parallel with a concurrency limit.
 *
 * @param {Array<object>} tasks — list of { id, url, destPath, size, hash?, hashAlgo? }
 * @param {object} options — { concurrency?, retries?, retryDelay?, signal?, rateLimiter?, onProgress?(downloadedBytes) }
 * @returns {Promise<Array<{destPath:string, verified:boolean}>>}
 */
async function downloadParallel(tasks, options = {}) {
  const concurrency = options.concurrency || 4;
  const signal = options.signal;
  const rateLimiter = options.rateLimiter;
  const onProgress = options.onProgress;

  let totalDownloaded = 0;

  async function runTask(task) {
    if (signal?.aborted) throw new Error('Aborted');

    const result = await downloadWithRetry(task, {
      retries: options.retries,
      retryDelay: options.retryDelay,
      signal,
      rateLimiter,
      onProgress: (bytes) => {
        totalDownloaded += bytes;
        if (onProgress) onProgress(totalDownloaded, bytes);
      },
    });

    return result;
  }

  const results = new Map();
  const executing = new Set();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const promise = runTask(task).then(result => {
      results.set(i, result);
      executing.delete(promise);
      return result;
    });

    executing.add(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);

  // Return results in the original task order.
  return tasks.map((_, i) => results.get(i));
}

/**
 * Ensure directory exists.
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Case-insensitive hex string comparison.
 */
function equalsIgnoreCase(a, b) {
  return a && b && a.toLowerCase() === b.toLowerCase();
}

module.exports = {
  hashFile,
  formatBytes,
  RateLimiter,
  downloadResumable,
  downloadWithRetry,
  downloadParallel,
};
