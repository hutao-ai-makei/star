const fs = require('fs');
const path = require('path');
const { getGameById, updateGame } = require('./store');

/**
 * Recursively copy a directory.
 */
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively delete a directory.
 */
function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Extract a zip file using PowerShell (available on all Windows 10+).
 * @param {string} zipPath
 * @param {string} destDir
 * @returns {Promise<void>}
 */
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const ps = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
    ], { stdio: 'pipe', windowsHide: true });

    let stderr = '';
    ps.stderr.on('data', d => stderr += d.toString());

    ps.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Extract failed with code ${code}: ${stderr}`));
      }
    });

    ps.on('error', reject);
  });
}

/**
 * Install an update from a downloaded zip file.
 * @param {string} gameId
 * @returns {Promise<void>}
 */
async function install(gameId) {
  const game = getGameById(gameId);
  if (!game) throw new Error('Game not found');

  const installDir = game.installDir || path.dirname(game.exePath);
  const downloadDir = path.join(installDir, '.downloads');
  const zipPath = path.join(downloadDir, 'update.zip');

  if (!fs.existsSync(zipPath)) {
    throw new Error('Downloaded update file not found. Please download again.');
  }

  updateGame(gameId, { updateStatus: 'installing' });

  try {
    // Backup old version
    const oldVersion = game.currentVersion || 'unknown';
    const backupDir = path.join(installDir, '.backup', oldVersion);

    if (fs.existsSync(backupDir)) {
      removeDir(backupDir);
    }
    fs.mkdirSync(backupDir, { recursive: true });

    // Copy current files to backup (exclude .downloads and .backup dirs)
    const entries = fs.readdirSync(installDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.downloads' || entry.name === '.backup') continue;
      const srcPath = path.join(installDir, entry.name);
      const destPath = path.join(backupDir, entry.name);
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }

    // Extract update zip
    await extractZip(zipPath, installDir);

    // Update version
    const targetVersion = game.targetVersion || 'unknown';
    updateGame(gameId, {
      currentVersion: targetVersion,
      targetVersion: '',
      updateStatus: 'idle',
      isPreDownload: false,
    });

    // Clean up downloads
    removeDir(downloadDir);

  } catch (err) {
    // Rollback on failure
    const oldVersion = game.currentVersion || 'unknown';
    const backupDir = path.join(installDir, '.backup', oldVersion);

    if (fs.existsSync(backupDir)) {
      const entries = fs.readdirSync(backupDir, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(backupDir, entry.name);
        const destPath = path.join(installDir, entry.name);
        if (entry.isDirectory()) {
          if (fs.existsSync(destPath)) removeDir(destPath);
          copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    updateGame(gameId, { updateStatus: 'error' });
    throw err;
  }
}

/**
 * Rollback to a previous version from backup.
 * @param {string} gameId
 */
async function rollback(gameId) {
  const game = getGameById(gameId);
  if (!game) throw new Error('Game not found');

  const installDir = game.installDir || path.dirname(game.exePath);
  const backupDir = path.join(installDir, '.backup');

  if (!fs.existsSync(backupDir)) {
    throw new Error('No backup available for rollback');
  }

  const backups = fs.readdirSync(backupDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()
    .reverse();

  if (backups.length === 0) {
    throw new Error('No backup versions found');
  }

  const versionDir = path.join(backupDir, backups[0]);

  const entries = fs.readdirSync(versionDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(versionDir, entry.name);
    const destPath = path.join(installDir, entry.name);
    if (entry.isDirectory()) {
      if (fs.existsSync(destPath)) removeDir(destPath);
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  updateGame(gameId, {
    currentVersion: backups[0],
    updateStatus: 'idle',
  });
}

module.exports = { install, rollback, extractZip, sha256File: require('./download-manager').sha256File };
