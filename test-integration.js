// Integration test for the update system
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

// Stub electron app before requiring store
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain) {
  if (request === 'electron') {
    return path.join(__dirname, 'test-electron-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain);
};

fs.writeFileSync(path.join(__dirname, 'test-electron-stub.js'), `
module.exports = {
  app: {
    getPath: () => path.join(process.cwd(), 'test-userdata')
  },
  BrowserWindow: class {},
  ipcMain: { handle: () => {} },
  dialog: {},
  nativeImage: {}
};
const path = require('path');
`);

const { checkForUpdate, compareVersions } = require('./src/main/update-checker');
const { UpdateTask, buildTaskFiles, getDownloadFiles } = require('./src/main/update-task');
const { addGame, getGameById, updateGame } = require('./src/main/store');
const { downloadParallel } = require('./src/main/download-engine');
const { spawn } = require('child_process');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Create a real zip file using PowerShell Compress-Archive.
 */
async function createZip(outputPath, files) {
  const tmpDir = path.join(path.dirname(outputPath), `zip-input-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  const ps = spawn('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Compress-Archive -Path '${tmpDir.replace(/'/g, "''")}\\*' -DestinationPath '${outputPath.replace(/'/g, "''")}' -Force`
  ], { stdio: 'pipe', windowsHide: true });

  let stderr = '';
  ps.stderr.on('data', d => { stderr += d.toString(); });

  const code = await new Promise((resolve, reject) => {
    ps.on('close', resolve);
    ps.on('error', reject);
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (code !== 0) {
    throw new Error(`createZip failed: ${stderr}`);
  }
}

async function testBuildTaskFiles() {
  console.log('Testing buildTaskFiles...');

  const cacheDir = path.join(__dirname, 'test-tmp', 'cache');
  const checkResult = {
    isPreDownload: false,
    targetVersion: '1.1.0',
    manifest: {
      update: {
        version: '1.1.0',
        url: 'http://example.com/update.zip',
        size: 1000,
        sha256: 'abc',
      }
    }
  };

  const { taskFiles, deleteFiles } = buildTaskFiles(checkResult, cacheDir);
  assert(taskFiles.length === 1, 'expected 1 task file');
  assert(taskFiles[0].mode === 'SingleFile', 'expected SingleFile mode');
  assert(taskFiles[0].fullPath.startsWith(cacheDir), 'expected cache dir');

  const downloads = getDownloadFiles(taskFiles);
  assert(downloads.length === 1, 'expected 1 download');
  assert(downloads[0].url === 'http://example.com/update.zip', 'url mismatch');

  console.log('buildTaskFiles OK');
}

async function testUpdateTaskLifecycle() {
  console.log('Testing UpdateTask lifecycle...');

  // Add a mock game
  const game = addGame({
    name: 'Test Game',
    exePath: path.join(__dirname, 'test-tmp', 'game', 'game.exe'),
    coverPath: '',
  });

  updateGame(game.id, {
    currentVersion: '1.0.0',
    packageId: 'test-pkg',
    apiBase: '',
    installDir: path.join(__dirname, 'test-tmp', 'game'),
  });

  const checkResult = {
    hasUpdate: true,
    isPreDownload: false,
    forceUpdate: false,
    targetVersion: '1.1.0',
    manifest: {
      update: {
        version: '1.1.0',
        url: 'http://127.0.0.1:PORT/update.zip',
        size: 0,
        sha256: '',
      }
    }
  };

  // Create a simple zip file via mock server
  const zipContent = Buffer.from('PK'); // minimal zip header
  checkResult.manifest.update.size = zipContent.length;
  checkResult.manifest.update.sha256 = crypto.createHash('sha256').update(zipContent).digest('hex');

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Length': zipContent.length });
    res.end(zipContent);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  checkResult.manifest.update.url = `http://127.0.0.1:${port}/update.zip`;

  try {
    const events = [];
    const task = new UpdateTask(game.id, checkResult, {
      onStatusChange: (data) => events.push({ type: 'status', data }),
      onProgress: (data) => events.push({ type: 'progress', data }),
      onError: (data) => events.push({ type: 'error', data }),
    });

    await task.prepare();
    assert(task.state === 'pending', 'expected pending state');

    // Create install dir
    fs.mkdirSync(task.installDir, { recursive: true });

    await task.start().catch(err => {
      // zip is malformed so install will fail, but download should succeed
      console.log('Expected install error:', err.message);
    });

    const gameAfter = getGameById(game.id);
    console.log('Final game status:', gameAfter.updateStatus);

    console.log('UpdateTask lifecycle OK');
  } finally {
    server.close();
  }
}

async function testDownloadParallel() {
  console.log('Testing downloadParallel result ordering...');

  const files = [
    { id: 'a', content: Buffer.from('AAAA') },
    { id: 'b', content: Buffer.from('BBBBBBBBBB') },
    { id: 'c', content: Buffer.from('CCC') },
  ];

  const server = http.createServer((req, res) => {
    const match = files.find(f => req.url === `/${f.id}.bin`);
    if (!match) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Length': match.content.length });
    res.end(match.content);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const tmpDir = path.join(__dirname, 'test-tmp', 'parallel');
  fs.mkdirSync(tmpDir, { recursive: true });

  const tasks = files.map((f, i) => ({
    id: f.id,
    url: `http://127.0.0.1:${port}/${f.id}.bin`,
    destPath: path.join(tmpDir, `${f.id}.bin`),
    size: f.content.length,
    hash: sha256(f.content),
    hashAlgo: 'sha256',
  }));

  try {
    const results = await downloadParallel(tasks, { concurrency: 2 });
    assert(Array.isArray(results) && results.length === tasks.length, 'result count mismatch');
    assert(results.every(r => r && r.verified), 'not all downloads verified');
    assert(results[0].destPath === tasks[0].destPath, 'result order mismatch for a');
    assert(results[1].destPath === tasks[1].destPath, 'result order mismatch for b');
    assert(results[2].destPath === tasks[2].destPath, 'result order mismatch for c');
    console.log('downloadParallel OK');
  } finally {
    server.close();
  }
}

async function testPreDownloadDoesNotInstall() {
  console.log('Testing pre-download does not install...');

  const game = addGame({
    name: 'PreDownload Game',
    exePath: path.join(__dirname, 'test-tmp', 'pd-game', 'game.exe'),
    coverPath: '',
  });

  const installDir = path.join(__dirname, 'test-tmp', 'pd-game');
  fs.mkdirSync(installDir, { recursive: true });
  fs.writeFileSync(path.join(installDir, 'version.txt'), '1.0.0');

  updateGame(game.id, {
    currentVersion: '1.0.0',
    packageId: 'pd-pkg',
    apiBase: '',
    installDir,
  });

  const zipPath = path.join(__dirname, 'test-tmp', 'pd-update.zip');
  await createZip(zipPath, { 'version.txt': '1.1.0' });
  const zipBuf = fs.readFileSync(zipPath);

  const checkResult = {
    hasUpdate: false,
    isPreDownload: true,
    forceUpdate: false,
    targetVersion: '1.1.0',
    manifest: {
      preDownload: {
        version: '1.1.0',
        url: 'http://127.0.0.1:PORT/pd-update.zip',
        size: zipBuf.length,
        sha256: sha256(zipBuf),
      }
    }
  };

  const server = http.createServer((req, res) => {
    if (req.url === '/pd-update.zip') {
      res.writeHead(200, { 'Content-Length': zipBuf.length });
      res.end(zipBuf);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  checkResult.manifest.preDownload.url = `http://127.0.0.1:${port}/pd-update.zip`;

  try {
    const task = new UpdateTask(game.id, checkResult, {});
    await task.prepare();
    await task.start();

    const installedVersion = fs.readFileSync(path.join(installDir, 'version.txt'), 'utf-8');
    assert(installedVersion === '1.0.0', 'pre-download should not install files');

    const gameAfter = getGameById(game.id);
    assert(gameAfter.predownloadInfo && gameAfter.predownloadInfo.predownloadVersion === '1.1.0', 'predownload mark missing');

    console.log('pre-download behavior OK');
  } finally {
    server.close();
  }
}

async function testRollbackRestoresVersion() {
  console.log('Testing rollback restores version...');

  const game = addGame({
    name: 'Rollback Game',
    exePath: path.join(__dirname, 'test-tmp', 'rb-game', 'game.exe'),
    coverPath: '',
  });

  const installDir = path.join(__dirname, 'test-tmp', 'rb-game');
  fs.mkdirSync(installDir, { recursive: true });
  fs.writeFileSync(path.join(installDir, 'version.txt'), '1.0.0');

  updateGame(game.id, {
    currentVersion: '1.0.0',
    packageId: 'rb-pkg',
    apiBase: '',
    installDir,
  });

  const zipPath = path.join(__dirname, 'test-tmp', 'rb-update.zip');
  await createZip(zipPath, { 'version.txt': '1.1.0' });
  const zipBuf = fs.readFileSync(zipPath);

  const checkResult = {
    hasUpdate: true,
    isPreDownload: false,
    forceUpdate: false,
    targetVersion: '1.1.0',
    manifest: {
      update: {
        version: '1.1.0',
        url: 'http://127.0.0.1:PORT/rb-update.zip',
        size: zipBuf.length,
        sha256: sha256(zipBuf),
      }
    }
  };

  const server = http.createServer((req, res) => {
    if (req.url === '/rb-update.zip') {
      res.writeHead(200, { 'Content-Length': zipBuf.length });
      res.end(zipBuf);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  checkResult.manifest.update.url = `http://127.0.0.1:${port}/rb-update.zip`;

  try {
    const task = new UpdateTask(game.id, checkResult, {});
    await task.prepare();
    await task.start();

    const installedVersion = fs.readFileSync(path.join(installDir, 'version.txt'), 'utf-8');
    assert(installedVersion === '1.1.0', 'update did not install new version');

    const gameAfterUpdate = getGameById(game.id);
    assert(gameAfterUpdate.currentVersion === '1.1.0', 'currentVersion not updated after install');

    await task.rollback();

    const rolledBackVersion = fs.readFileSync(path.join(installDir, 'version.txt'), 'utf-8');
    assert(rolledBackVersion === '1.0.0', 'rollback did not restore old file');

    const gameAfterRollback = getGameById(game.id);
    assert(gameAfterRollback.currentVersion === '1.0.0', 'rollback did not restore currentVersion');

    console.log('rollback version restore OK');
  } finally {
    server.close();
  }
}

async function main() {
  try {
    await testBuildTaskFiles();
    await testDownloadParallel();
    await testPreDownloadDoesNotInstall();
    await testRollbackRestoresVersion();
    await testUpdateTaskLifecycle();
    console.log('\nIntegration tests passed!');
  } catch (err) {
    console.error('\nIntegration test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    const testDir = path.join(__dirname, 'test-tmp');
    const userData = path.join(__dirname, 'test-userdata');
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    if (fs.existsSync(userData)) fs.rmSync(userData, { recursive: true, force: true });
    if (fs.existsSync(path.join(__dirname, 'test-electron-stub.js'))) {
      fs.unlinkSync(path.join(__dirname, 'test-electron-stub.js'));
    }
  }
}

main();
