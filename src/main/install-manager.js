const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getGameById, updateGame } = require('./store');
const { hashFile } = require('./download-engine');

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
 * Ensure a file's parent directory exists.
 */
function ensureParent(filePath) {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
}

/**
 * Get a list of entries inside a zip file using PowerShell.
 * @param {string} zipPath
 * @returns {Promise<Array<{fullName:string}>>}
 */
function listZipEntries(zipPath) {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}').Entries | ForEach-Object { $_.FullName }`
    ], { stdio: 'pipe', windowsHide: true });

    let stdout = '';
    let stderr = '';

    ps.stdout.on('data', d => { stdout += d.toString(); });
    ps.stderr.on('data', d => { stderr += d.toString(); });

    ps.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`List zip failed: ${stderr}`));
        return;
      }
      const entries = stdout
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(fullName => ({ fullName }));
      resolve(entries);
    });

    ps.on('error', reject);
  });
}

/**
 * Extract a zip file using PowerShell Expand-Archive.
 * @param {string} zipPath
 * @param {string} destDir
 * @returns {Promise<void>}
 */
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const ps = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
    ], { stdio: 'pipe', windowsHide: true });

    let stderr = '';
    ps.stderr.on('data', d => { stderr += d.toString(); });

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
 * Combine multiple files into one file.
 */
function combineFiles(inputPaths, outputPath) {
  const out = fs.createWriteStream(outputPath);
  for (const p of inputPaths) {
    const data = fs.readFileSync(p);
    out.write(data);
  }
  out.end();
  return new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

/**
 * Backup a list of relative paths from installDir to backupDir.
 */
function backupFiles(installDir, relativePaths, backupDir) {
  for (const relPath of relativePaths) {
    const src = path.join(installDir, relPath);
    const dest = path.join(backupDir, relPath);
    if (fs.existsSync(src)) {
      ensureParent(dest);
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        copyDir(src, dest);
      } else {
        fs.copyFileSync(src, dest);
      }
    }
  }
}

/**
 * Restore files from backupDir to installDir.
 */
function restoreFiles(backupDir, installDir) {
  if (!fs.existsSync(backupDir)) return;

  const entries = fs.readdirSync(backupDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(backupDir, entry.name);
    const dest = path.join(installDir, entry.name);

    if (entry.isDirectory()) {
      if (fs.existsSync(dest)) removeDir(dest);
      copyDir(src, dest);
    } else {
      ensureParent(dest);
      fs.copyFileSync(src, dest);
    }
  }
}

/**
 * Delete a list of relative paths inside installDir.
 */
function deleteFiles(installDir, relativePaths) {
  for (const relPath of relativePaths) {
    const full = path.join(installDir, relPath);
    if (fs.existsSync(full)) {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        removeDir(full);
      } else {
        fs.unlinkSync(full);
      }
    }
  }
}

/**
 * Install an update from a prepared UpdateTask.
 *
 * @param {UpdateTask} task
 * @param {object} options — { onProgress?(percent:number) }
 */
async function installUpdate(task, options = {}) {
  const { gameId, installDir, cacheDir, deleteFiles: filesToDelete } = task;
  const game = getGameById(gameId);
  if (!game) throw new Error('Game not found');

  if (!fs.existsSync(installDir)) {
    fs.mkdirSync(installDir, { recursive: true });
  }

  const backupDir = path.join(installDir, '.backup', task.id);
  if (fs.existsSync(backupDir)) {
    removeDir(backupDir);
  }

  const allBackupPaths = new Set();

  try {
    for (let i = 0; i < task.taskFiles.length; i++) {
      const taskFile = task.taskFiles[i];
      const progressBase = i / task.taskFiles.length;

      if (taskFile.mode === 'SingleFile') {
        await installSingleFile(taskFile, installDir, backupDir, allBackupPaths);
      } else if (taskFile.mode === 'CompressedPackage') {
        await installCompressedPackage(taskFile, installDir, backupDir, allBackupPaths, (p) => {
          if (options.onProgress) {
            options.onProgress(progressBase + p / task.taskFiles.length);
          }
        });
      }
    }

    // Delete obsolete files listed in the manifest
    if (filesToDelete && filesToDelete.length > 0) {
      deleteFiles(installDir, filesToDelete);
    }

    // Clean up cache
    if (fs.existsSync(cacheDir)) {
      removeDir(cacheDir);
    }

    // Clear backup on success
    if (fs.existsSync(backupDir)) {
      removeDir(backupDir);
    }
  } catch (err) {
    // Rollback on failure
    restoreFiles(backupDir, installDir);
    throw err;
  }
}

/**
 * Install a single file task item.
 */
async function installSingleFile(taskFile, installDir, backupDir, allBackupPaths) {
  const isZip = taskFile.fullPath.toLowerCase().endsWith('.zip');

  if (isZip) {
    // Verify downloaded file if hash provided
    if (taskFile.sha256 || taskFile.md5) {
      const algo = taskFile.sha256 ? 'sha256' : 'md5';
      const expected = taskFile.sha256 || taskFile.md5;
      const actual = await hashFile(taskFile.fullPath, algo);
      if (actual.toLowerCase() !== expected.toLowerCase()) {
        throw new Error(`Hash mismatch for ${taskFile.fullPath}`);
      }
    }

    const entries = await listZipEntries(taskFile.fullPath);
    const relativePaths = entries.map(e => e.fullName).filter(p => !p.endsWith('/'));

    for (const relPath of relativePaths) {
      if (!allBackupPaths.has(relPath)) {
        allBackupPaths.add(relPath);
      }
    }
    backupFiles(installDir, relativePaths, backupDir);

    await extractZip(taskFile.fullPath, installDir);
    return;
  }

  // Plain file: copy to install dir with the same basename
  const targetName = path.basename(taskFile.fullPath);
  const targetPath = path.join(installDir, targetName);

  if (fs.existsSync(targetPath)) {
    allBackupPaths.add(targetName);
  }
  backupFiles(installDir, [targetName], backupDir);

  ensureParent(targetPath);
  fs.copyFileSync(taskFile.fullPath, targetPath);
}

/**
 * Install a compressed package task item.
 */
async function installCompressedPackage(taskFile, installDir, backupDir, allBackupPaths, onProgress) {
  // Combine packages if there are multiple
  let zipPath = taskFile.compressedPackages[0].fullPath;

  if (taskFile.compressedPackages.length > 1) {
    zipPath = path.join(path.dirname(zipPath), 'combined_update.zip');
    await combineFiles(taskFile.compressedPackages.map(p => p.fullPath), zipPath);
  }

  // Verify combined/downloaded file if the top-level hash is provided
  if (taskFile.sha256 || taskFile.md5) {
    const algo = taskFile.sha256 ? 'sha256' : 'md5';
    const expected = taskFile.sha256 || taskFile.md5;
    const actual = await hashFile(zipPath, algo);
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`Hash mismatch for combined package`);
    }
  }

  const entries = await listZipEntries(zipPath);
  const relativePaths = entries.map(e => e.fullName).filter(p => !p.endsWith('/'));

  for (const relPath of relativePaths) {
    if (!allBackupPaths.has(relPath)) {
      allBackupPaths.add(relPath);
    }
  }
  backupFiles(installDir, relativePaths, backupDir);

  if (onProgress) onProgress(0.1);
  await extractZip(zipPath, installDir);
  if (onProgress) onProgress(0.9);

  // Apply hdiff if present (simplified: only handle hdifffiles.txt)
  await applyHdiffIfPresent(installDir);
  if (onProgress) onProgress(1);
}

/**
 * Apply hdiff patches if the package contains hdiff metadata.
 * This is a lightweight placeholder; full HPatch support requires external tools.
 */
async function applyHdiffIfPresent(installDir) {
  const hdiffMapPath = path.join(installDir, 'hdiffmap.json');
  const hdiffFilesPath = path.join(installDir, 'hdifffiles.txt');

  if (fs.existsSync(hdiffMapPath)) {
    // Placeholder: in a full implementation this would call hpatchz for each item.
    fs.unlinkSync(hdiffMapPath);
  }

  if (fs.existsSync(hdiffFilesPath)) {
    fs.unlinkSync(hdiffFilesPath);
  }
}

/**
 * Roll back an update using the task backup.
 */
async function rollbackUpdate(task) {
  const { installDir } = task;
  const backupDir = path.join(installDir, '.backup', task.id);

  if (!fs.existsSync(backupDir)) {
    throw new Error('No backup available for rollback');
  }

  restoreFiles(backupDir, installDir);
  removeDir(backupDir);
}

module.exports = {
  installUpdate,
  rollbackUpdate,
  extractZip,
  listZipEntries,
  copyDir,
  removeDir,
};
