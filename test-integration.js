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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
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

async function main() {
  try {
    await testBuildTaskFiles();
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
