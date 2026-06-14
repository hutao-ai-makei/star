const https = require('https');
const http = require('http');
const { getGameById, getSettings, updateGame } = require('./store');

/**
 * Fetch JSON from a URL. Returns parsed JSON or null on failure.
 * @param {string} url
 * @returns {Promise<object|null>}
 */
function fetchJSON(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        resolve(null);
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * Build the API URL for checking game packages.
 * @param {string} apiBase
 * @param {string[]} packageIds
 * @returns {string}
 */
function buildApiUrl(apiBase, packageIds) {
  const base = apiBase.replace(/\/+$/, '');
  return `${base}/api/game-packages?package_ids=${packageIds.join(',')}`;
}

/**
 * Compare two semantic version strings.
 * @param {string} a — version string like "5.3.0"
 * @param {string} b — version string like "5.2.0"
 * @returns {number} positive if a > b, negative if a < b, 0 if equal
 */
function compareVersions(a, b) {
  if (!a || !b) return 0;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * Check if an update or pre-download is available for a game.
 * @param {string} gameId
 * @returns {Promise<{hasUpdate: boolean, isPreDownload: boolean, forceUpdate: boolean, manifest: object|null, currentVersion: string}>}
 */
async function checkForUpdate(gameId) {
  const game = getGameById(gameId);
  if (!game) return { hasUpdate: false, isPreDownload: false, forceUpdate: false, manifest: null, currentVersion: '' };

  const settings = getSettings();
  const apiBase = game.apiBase || settings.defaultApiBase;
  const packageId = game.packageId;

  if (!apiBase || !packageId) {
    return { hasUpdate: false, isPreDownload: false, forceUpdate: false, manifest: null, currentVersion: game.currentVersion || '' };
  }

  const url = buildApiUrl(apiBase, [packageId]);
  const data = await fetchJSON(url);

  if (!data || !data.packages || !data.packages.length) {
    return { hasUpdate: false, isPreDownload: false, forceUpdate: false, manifest: null, currentVersion: game.currentVersion || '' };
  }

  const pkg = data.packages.find(p => p.packageId === packageId);
  if (!pkg) {
    return { hasUpdate: false, isPreDownload: false, forceUpdate: false, manifest: null, currentVersion: game.currentVersion || '' };
  }

  const current = game.currentVersion || '0.0.0';
  const result = {
    hasUpdate: false,
    isPreDownload: false,
    forceUpdate: !!pkg.forceUpdate,
    manifest: pkg,
    currentVersion: current,
  };

  if (pkg.preDownload && pkg.preDownload.available) {
    if (compareVersions(pkg.preDownload.version, current) > 0) {
      result.isPreDownload = true;
      result.hasUpdate = false;
      return result;
    }
  }

  if (pkg.update && pkg.update.version) {
    if (compareVersions(pkg.update.version, current) > 0) {
      result.hasUpdate = true;
    }
  }

  return result;
}

/**
 * Poll for pre-downloads across all games.
 */
async function pollPreDownloads() {
  const { getAllGames } = require('./store');
  const games = getAllGames();
  const results = [];

  for (const game of games) {
    if (!game.apiBase && !getSettings().defaultApiBase) continue;
    if (!game.packageId) continue;

    const check = await checkForUpdate(game.id);
    if (check.isPreDownload) {
      results.push({ gameId: game.id, manifest: check.manifest });
    }
  }

  return results;
}

module.exports = { checkForUpdate, pollPreDownloads, compareVersions, fetchJSON };
