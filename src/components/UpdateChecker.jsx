import { useEffect, useState } from 'react';
import { APP_COMMIT, APP_VERSION } from '../lib/runtime.js';
import { checkForUpdates } from '../lib/updates.js';

const initialState = {
  status: 'checking',
  currentVersion: APP_VERSION,
  latestVersion: null,
  releaseUrl: null,
  checkedAt: null,
  reason: null,
  fromCache: false,
};

function labelFor(result, refreshing) {
  if (refreshing || result.status === 'checking') return 'Prüfe Updates';
  if (result.status === 'available') return `Update ${result.latestVersion}`;
  if (result.status === 'current') return `v${result.currentVersion} aktuell`;
  if (result.reason === 'no-release') return `v${result.currentVersion} - kein Release`;
  return `v${result.currentVersion} - Check offen`;
}

function titleFor(result, refreshing) {
  if (refreshing || result.status === 'checking') return 'GitHub Releases werden geprüft.';
  if (result.status === 'available') return `Version ${result.latestVersion} ist als GitHub Release verfügbar.`;
  if (result.status === 'current') return `Version ${result.currentVersion} ist aktuell. Build ${APP_COMMIT}.`;

  const reasons = {
    'no-release': 'Noch kein GitHub Release veröffentlicht.',
    'rate-limited': 'GitHub API-Limit erreicht. Später erneut prüfen.',
    'github-error': 'GitHub Releases konnten nicht geladen werden.',
    'network-error': 'Update-Check fehlgeschlagen.',
    'latest-version-invalid': 'Das neueste Release hat kein Semver-Tag.',
    'current-version-invalid': 'Die App-Version ist nicht als Semver gesetzt.',
  };

  return reasons[result.reason] || 'Update-Status ist nicht verfügbar.';
}

export function UpdateChecker() {
  const [result, setResult] = useState(initialState);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;

    checkForUpdates().then(nextResult => {
      if (active) setResult(nextResult);
    });

    return () => {
      active = false;
    };
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      setResult(await checkForUpdates({ force: true }));
    } finally {
      setRefreshing(false);
    }
  }

  const label = labelFor(result, refreshing);
  const title = titleFor(result, refreshing);
  const status = refreshing ? 'checking' : result.status;

  return (
    <div className={`update-checker update-checker--${status}`} title={title}>
      <span className="update-checker__dot" aria-hidden="true" />
      {status === 'available' && result.releaseUrl ? (
        <a href={result.releaseUrl} target="_blank" rel="noreferrer" className="update-checker__label">
          {label}
        </a>
      ) : (
        <span className="update-checker__label">{label}</span>
      )}
      <button
        type="button"
        className="update-checker__refresh"
        onClick={refresh}
        disabled={refreshing}
        aria-label="Update erneut prüfen"
        title="Update erneut prüfen"
      >
        Prüfen
      </button>
    </div>
  );
}
