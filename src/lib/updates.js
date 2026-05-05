import { APP_VERSION, GITHUB_REPOSITORY, readStorage, writeStorage } from './runtime.js';

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const CACHE_KEY = `jiraCharts:update-check:${GITHUB_REPOSITORY}`;
const RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases?per_page=10`;
const RELEASES_URL = `https://github.com/${GITHUB_REPOSITORY}/releases`;

let inFlightCheck = null;

export function normalizeVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
  if (!match) return null;

  const parts = match.slice(1, 4).map(Number);
  return {
    raw: value,
    normalized: parts.join('.'),
    parts,
  };
}

export function compareVersions(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] > b.parts[index]) return 1;
    if (a.parts[index] < b.parts[index]) return -1;
  }
  return 0;
}

function baseResult(overrides = {}) {
  return {
    status: 'unavailable',
    currentVersion: APP_VERSION,
    latestVersion: null,
    releaseUrl: RELEASES_URL,
    checkedAt: Date.now(),
    reason: null,
    fromCache: false,
    ...overrides,
  };
}

function readCachedResult() {
  const cached = readStorage(CACHE_KEY, null);
  if (!cached) return null;

  try {
    const result = JSON.parse(cached);
    const isFresh = Date.now() - result.checkedAt < CACHE_TTL_MS;
    const isSameAppVersion = result.currentVersion === APP_VERSION;
    return isFresh && isSameAppVersion ? { ...result, fromCache: true } : null;
  } catch {
    return null;
  }
}

function writeCachedResult(result) {
  const cacheableReasons = new Set([null, 'no-release']);
  if (!cacheableReasons.has(result.reason)) return;
  writeStorage(CACHE_KEY, JSON.stringify({ ...result, fromCache: false }));
}

async function fetchLatestRelease() {
  const response = await fetch(RELEASES_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (response.status === 403 || response.status === 429) {
    return baseResult({ reason: 'rate-limited' });
  }

  if (!response.ok) {
    return baseResult({ reason: 'github-error' });
  }

  const releases = await response.json();
  const release = Array.isArray(releases)
    ? releases.find(item => !item.draft && !item.prerelease)
    : null;

  if (!release) {
    return baseResult({ reason: 'no-release' });
  }

  const current = normalizeVersion(APP_VERSION);
  if (!current) {
    return baseResult({ reason: 'current-version-invalid' });
  }

  const latest = normalizeVersion(release.tag_name);
  if (!latest) {
    return baseResult({
      reason: 'latest-version-invalid',
      releaseUrl: release.html_url || RELEASES_URL,
    });
  }

  const hasUpdate = compareVersions(latest, current) > 0;
  return baseResult({
    status: hasUpdate ? 'available' : 'current',
    currentVersion: current.normalized,
    latestVersion: latest.normalized,
    releaseUrl: release.html_url || RELEASES_URL,
  });
}

export async function checkForUpdates({ force = false } = {}) {
  if (!force) {
    const cached = readCachedResult();
    if (cached) return cached;
    if (inFlightCheck) return inFlightCheck;
  }

  inFlightCheck = fetchLatestRelease()
    .catch(() => baseResult({ reason: 'network-error' }))
    .then(result => {
      writeCachedResult(result);
      return result;
    })
    .finally(() => {
      inFlightCheck = null;
    });

  return inFlightCheck;
}
