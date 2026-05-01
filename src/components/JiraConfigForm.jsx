import { ON_PROXY, JIRA_BASE } from '../lib/runtime.js';

export function JiraConfigForm({ config, onChange, onSubmit, buttonLabel, loading, children, hint, saveToken, onSaveTokenChange }) {
  function update(name, value) {
    onChange({ ...config, [name]: value });
  }

  return (
    <form className={`config ${ON_PROXY ? 'config--proxy' : 'config--direct'}`} onSubmit={onSubmit}>
      <div className="config-header">
        <div className="config-title">Jira-Konfiguration</div>
      </div>

      <div className="config-body">
        <div className="config-grid">
          {!ON_PROXY ? (
            <div className="field field--wide">
              <label>Jira-Basis-URL</label>
              <input
                type="text"
                value={config.jiraUrl}
                onChange={event => update('jiraUrl', event.target.value)}
                placeholder="https://deinefirma.atlassian.net"
              />
            </div>
          ) : null}
          <div className="field">
            <label>E-Mail</label>
            <input
              type="text"
              value={config.email}
              onChange={event => update('email', event.target.value)}
              placeholder="du@firma.de"
            />
          </div>
          <div className="field">
            <label>API-Token</label>
            <input
              type="password"
              value={config.token}
              onChange={event => update('token', event.target.value)}
              placeholder="Dein Jira-API-Token"
            />
            {config.token && onSaveTokenChange ? (
              <label className="save-token-label">
                <input
                  type="checkbox"
                  checked={saveToken}
                  onChange={event => onSaveTokenChange(event.target.checked)}
                />
                {' '}Token speichern
              </label>
            ) : null}
          </div>
        </div>
        {children}

        <div className="config-actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Lädt...' : buttonLabel}
          </button>
        </div>
      </div>

      <p className="hint">
        {ON_PROXY ? (
          <>
            Proxy zu <strong>{JIRA_BASE}</strong> - E-Mail und API-Token eingeben. {hint}{' '}
            API-Token:{' '}
            <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">
              id.atlassian.com - API-Token
            </a>
          </>
        ) : (
          <>
            Über den Proxy starten, um CORS zu vermeiden: <code>node proxy.js https://deinefirma.atlassian.net</code>
            <br />
            {hint}{' '}
            API-Token:{' '}
            <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">
              id.atlassian.com - API-Token
            </a>
          </>
        )}
      </p>
    </form>
  );
}
