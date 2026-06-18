const https = require('https');
const http = require('http');
const { URL } = require('url');
const { getGameById, getSettings, getAllGames } = require('./store');

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_RETRIES = 2;

/**
 * Fetch JSON from a URL with optional retries.
 * @param {string} url
 * @param {object} options — { retries?, timeout? }
 * @returns {Promise<object|null>}
 */
async function fetchJSON(url, options = {}) {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await fetchJSONOnce(url, timeout);
      if (data !== null) return data;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(500 * Math.pow(2, attempt));
      }
    }
  }

  if (lastErr) {
    console.warn(`fetchJSON failed after ${retries + 1} attempts: ${url}`, lastErr.message);
  }
  return null;
}

function fetchJSONOnce(url, timeout) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(url, { timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow one redirect
        fetchJSONOnce(new URL(res.headers.location, url).toString(), timeout)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        resolve(null);
        return;
      }

      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          resolve(null);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build the API URL for checking game packages.
 * @param {string} apiBase
 * @param {string[]} packageIds
 * @returns {string}
 */
function buildApiUrl(apiBase, packageIds) {
  const base = apiBase.replace(/\/+$/, '');
  const ids = Array.isArray(packageIds) ? packageIds : [packageIds];
  return `${base}/api/game-packages?package_ids=${ids.map(encodeURIComponent).join(',')}`;
}

/**
 * Parse a semantic version string into comparable parts.
 * Supports: "1.2.3", "1.2.3-beta", "1.2.3-beta.2"
 * @param {string} version
 * @returns {{major:number, minor:number, patch:number, prerelease:string[]}|null}
 */
function parseVersion(version) {
  if (!version) return null;
  const trimmed = version.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(.+))?$/);
  if (!match) return null;

  const [, major, minor, patch, pre] = match;
  return {
    major: Number(major || 0),
    minor: Number(minor || 0),
    patch: Number(patch || 0),
    prerelease: pre ? pre.split('.') : []
  };
}

/**
 * Compare two semantic version strings.
 * @param {string} a
 * @param {string} b
 * @returns {number} positive if a > b, negative if a < b, 0 if equal
 */
function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return 0;

  for (const key of ['major', 'minor', 'patch']) {
    if (va[key] !== vb[key]) return va[key] - vb[key];
  }

  // No prerelease > has prerelease
  if (va.prerelease.length === 0 && vb.prerelease.length > 0) return 1;
  if (va.prerelease.length > 0 && vb.prerelease.length === 0) return -1;

  // Compare prerelease segments
  const len = Math.max(va.prerelease.length, vb.prerelease.length);
  for (let i = 0; i < len; i++) {
    const pa = va.prerelease[i];
    const pb = vb.prerelease[i];
    if (pa === undefined) return -1;
    if (pb === undefined) return 1;

    const na = Number(pa);
    const nb = Number(pb);
    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else {
      if (pa !== pb) return pa < pb ? -1 : 1;
    }
  }

  return 0;
}

/**
 * Check if an update or pre-download is available for a game.
 * @param {string} gameId
 * @returns {Promise<{hasUpdate: boolean, isPreDownload: boolean, forceUpdate: boolean, manifest: object|null, currentVersion: string, targetVersion: string, reason: string|null}>}
 */
async function checkForUpdate(gameId) {
  const emptyResult = {
    hasUpdate: false,
    isPreDownload: false,
    forceUpdate: false,
    manifest: null,
    currentVersion: '',
    targetVersion: '',
    reason: null,
  };

  const game = getGameById(gameId);
  if (!game) return emptyResult;

  const settings = getSettings();
  const apiBase = game.apiBase || settings.defaultApiBase;
  const packageId = game.packageId;

  if (!apiBase || !packageId) {
    return { ...emptyResult, currentVersion: game.currentVersion || '' };
  }

  const url = buildApiUrl(apiBase, [packageId]);
  const data = await fetchJSON(url);

  if (!data || !data.packages || !Array.isArray(data.packages) || data.packages.length === 0) {
    return { ...emptyResult, currentVersion: game.currentVersion || '' };
  }

  const pkg = data.packages.find(p => p.packageId === packageId);
  if (!pkg) {
    return { ...emptyResult, currentVersion: game.currentVersion || '' };
  }

  const current = game.currentVersion || '0.0.0';
  const ignoreVersion = game.ignoreVersion || '';
  const forceUpdate = !!pkg.forceUpdate;

  const result = {
    hasUpdate: false,
    isPreDownload: false,
    forceUpdate,
    manifest: pkg,
    currentVersion: current,
    targetVersion: '',
    reason: null,
  };

  // Formal update takes precedence over pre-download
  const updateInfo = pkg.update;
  if (updateInfo && updateInfo.version) {
    const cmp = compareVersions(updateInfo.version, current);
    if (cmp > 0) {
      // A newer version exists
      if (forceUpdate) {
        result.hasUpdate = true;
        result.targetVersion = updateInfo.version;
        result.reason = 'force';
      } else if (!ignoreVersion || compareVersions(updateInfo.version, ignoreVersion) > 0) {
        result.hasUpdate = true;
        result.targetVersion = updateInfo.version;
        result.reason = 'new-version';
      } else {
        result.reason = 'ignored';
      }
    }
  }

  // If no formal update, check pre-download
  if (!result.hasUpdate) {
    const preInfo = pkg.preDownload;
    if (preInfo && preInfo.available && preInfo.version) {
      if (compareVersions(preInfo.version, current) > 0) {
        result.isPreDownload = true;
        result.targetVersion = preInfo.version;
        result.reason = 'pre-download';
      }
    }
  }

  return result;
}

/**
 * Poll for pre-downloads across all games.
 * @returns {Promise<Array<{gameId:string, version:string, manifest:object}>>}
 */
async function pollPreDownloads() {
  const games = getAllGames();
  const results = [];

  for (const game of games) {
    if (!game.packageId) continue;
    if (!game.apiBase && !getSettings().defaultApiBase) continue;

    try {
      const check = await checkForUpdate(game.id);
      if (check.isPreDownload) {
        results.push({
          gameId: game.id,
          version: check.targetVersion,
          manifest: check.manifest,
        });
      }
    } catch (err) {
      console.error(`pollPreDownloads failed for ${game.id}:`, err.message);
    }
  }

  return results;
}

module.exports = {
  fetchJSON,
  buildApiUrl,
  compareVersions,
  parseVersion,
  checkForUpdate,
  pollPreDownloads,
};
