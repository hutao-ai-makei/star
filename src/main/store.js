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
        autoScan: false
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
  return data.games || [];
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
    notes: '',
    rating: 0
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

module.exports = { getAllGames, getGameById, addGame, updateGame, removeGame, getSettings, updateSettings };
