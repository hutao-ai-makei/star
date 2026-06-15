const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const DATA_DIR = path.join(app.getPath('userData'), 'data');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 读取数据
function readData() {
  ensureDataDir();
  if (!fs.existsSync(LIBRARY_FILE)) {
    const defaults = {
      games: [],
      settings: {
        windowWidth: 900,
        windowHeight: 600,
        windowX: null,
        windowY: null,
        scanDirs: [],
        autoScan: false,
        // === Update system settings ===
        defaultApiBase: '',
        autoCheckUpdate: true,
        preDownloadPollMinutes: 30,
        maxConcurrentChunks: 4,
      }
    };
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify(defaults, null, 2), 'utf-8');
    return defaults;
  }
  const raw = fs.readFileSync(LIBRARY_FILE, 'utf-8');
  return JSON.parse(raw);
}

// 写入数据
function writeData(data) {
  ensureDataDir();
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// === Game CRUD ===

function getAllGames() {
  const data = readData();
  const games = data.games || [];
  // Sort by sortOrder, then by addedAt for games without sortOrder
  return games.sort((a, b) => {
    const ao = a.sortOrder ?? Infinity;
    const bo = b.sortOrder ?? Infinity;
    if (ao !== bo) return ao - bo;
    return (a.addedAt || '').localeCompare(b.addedAt || '');
  });
}

function getGameById(id) {
  const games = getAllGames();
  return games.find(g => g.id === id) || null;
}

function addGame({ name, exePath, coverPath }) {
  const data = readData();
  const newGame = {
    id: crypto.randomUUID(),
    name,
    exePath,
    coverPath: coverPath || '',
    iconPath: '',
    backgroundPath: '',
    videoPath: '',
    mediaDir: '',
    tags: [],
    addedAt: new Date().toISOString(),
    lastPlayedAt: null,
    totalPlayTime: 0,
    sortOrder: data.games.length,
    notes: '',
    rating: 0,
    // === Update system fields ===
    packageId: '',
    apiBase: '',
    currentVersion: '',
    targetVersion: '',
    updateStatus: 'idle',
    updateMode: 'full',
    downloadProgress: {
      totalBytes: 0,
      downloadedBytes: 0,
      speed: 0,
      chunks: []
    },
    updateLog: '',
    installDir: '',
    isPreDownload: false,
  };
  data.games.push(newGame);
  writeData(data);
  return newGame;
}

function updateGame(id, updates) {
  const data = readData();
  const index = data.games.findIndex(g => g.id === id);
  if (index === -1) return null;
  data.games[index] = { ...data.games[index], ...updates };
  writeData(data);
  return data.games[index];
}

function removeGame(id) {
  const data = readData();
  data.games = data.games.filter(g => g.id !== id);
  writeData(data);
}

function reorderGames(orderedIds) {
  const data = readData();
  // Assign sequential sortOrder based on new order
  orderedIds.forEach((id, idx) => {
    const game = data.games.find(g => g.id === id);
    if (game) game.sortOrder = idx;
  });
  writeData(data);
}

// === Settings ===

function getSettings() {
  const data = readData();
  return data.settings || {};
}

function updateSettings(updates) {
  const data = readData();
  data.settings = { ...data.settings, ...updates };
  writeData(data);
  return data.settings;
}

module.exports = { getAllGames, getGameById, addGame, updateGame, removeGame, reorderGames, getSettings, updateSettings };
