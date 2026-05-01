import { useRef, useState } from 'react';
import { AppHeader } from '../components/AppHeader.jsx';
import { JiraConfigForm } from '../components/JiraConfigForm.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { fetchAllSprints, getBacklogIssues, getBoardId, networkMsg } from '../lib/jira.js';
import { JIRA_BASE, ON_PROXY, readBooleanStorage, readStorage, writeBooleanStorage, writeStorage } from '../lib/runtime.js';
import { exportNodeAsPng } from '../lib/screenshot.js';
import { BacklogCanvas } from './BacklogCanvas.jsx';

const BACKLOG_CANVAS_FIELDS = 'summary,status,customfield_10016,customfield_10004,priority,assignee,issuetype';

function initialConfig() {
  return {
    jiraUrl: readStorage('bd_jiraUrl', ''),
    email: readStorage('bd_email', ''),
    token: readBooleanStorage('bd_saveToken', false) ? readStorage('bd_token', '') : '',
    boardId: readStorage('bd_boardId', ''),
    projectKey: readStorage('bd_projectKey', ''),
  };
}

function saveConfig(config, saveToken) {
  const keys = ON_PROXY ? ['email', 'boardId', 'projectKey'] : ['jiraUrl', 'email', 'boardId', 'projectKey'];
  keys.forEach(key => writeStorage(`bd_${key}`, config[key].trim()));
  writeBooleanStorage('bd_saveToken', saveToken);
  writeStorage('bd_token', saveToken ? config.token.trim() : '');
}

export function BacklogPage() {
  const [config, setConfig] = useState(initialConfig);
  const [saveToken, setSaveToken] = useState(() => readBooleanStorage('bd_saveToken', false));
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ message: '', type: 'info' });
  const [backlogIssues, setBacklogIssues] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [exporting, setExporting] = useState(null);
  const canvasRef = useRef(null);

  function requireCredentials() {
    const missingJira = !ON_PROXY && !config.jiraUrl.trim();
    if (missingJira || !config.email.trim() || !config.token.trim()) {
      setStatus({
        message: `Bitte ${missingJira ? 'Jira-URL, ' : ''}E-Mail und API-Token ausfüllen.`,
        type: 'error',
      });
      return false;
    }
    return true;
  }

  async function loadBacklog(event) {
    event.preventDefault();
    if (!requireCredentials()) return;

    saveConfig(config, saveToken);
    setLoading(true);
    setBacklogIssues([]);
    setHasLoaded(false);

    try {
      setStatus({ message: 'Board wird gesucht...', type: 'info' });
      let boardId = config.boardId.trim();
      if (!boardId) {
        const projectKey = config.projectKey.trim().toUpperCase();
        if (!projectKey) throw new Error('Projektschlüssel oder Board-ID eingeben.');
        boardId = await getBoardId(projectKey, config);
      }

      setStatus({ message: 'Backlog wird geladen...', type: 'info' });
      await fetchAllSprints(boardId, config);
      const issues = await getBacklogIssues(boardId, config, BACKLOG_CANVAS_FIELDS);
      setBacklogIssues(issues);
      setHasLoaded(true);
      setStatus({ message: '', type: 'info' });
    } catch (err) {
      setStatus({ message: `Fehler: ${networkMsg(err)}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function exportCanvas() {
    if (!canvasRef.current) return;
    setExporting('canvas');
    try {
      await exportNodeAsPng(canvasRef.current, 'jira-backlog-canvas.png');
    } catch (err) {
      setStatus({ message: `Export fehlgeschlagen: ${networkMsg(err)}`, type: 'error' });
    } finally {
      setExporting(null);
    }
  }

  const browseBase = ON_PROXY ? JIRA_BASE : config.jiraUrl.trim().replace(/\/$/, '');

  return (
    <>
      <AppHeader title="Backlog Canvas">
        <a href="/" className="nav-link">Sprint-Burndown</a>
      </AppHeader>

      <main className="main page-backlog">
        <JiraConfigForm
          config={config}
          onChange={setConfig}
          onSubmit={loadBacklog}
          buttonLabel="Backlog laden"
          loading={loading}
          hint=""
          saveToken={saveToken}
          onSaveTokenChange={setSaveToken}
        >
          <div className="config-extra">
            <div className="field">
              <label>Projektschlüssel (für Board-Auto-Erkennung)</label>
              <input
                type="text"
                value={config.projectKey}
                onChange={event => setConfig({ ...config, projectKey: event.target.value.toUpperCase() })}
                placeholder="z. B. PAC"
              />
            </div>
            <div className="field">
              <label>Board-ID (überschreibt Auto-Erkennung)</label>
              <input
                type="text"
                value={config.boardId}
                onChange={event => setConfig({ ...config, boardId: event.target.value })}
                placeholder="z. B. 42"
              />
            </div>
          </div>
        </JiraConfigForm>

        <StatusMessage message={status.message} type={status.type} />

        {backlogIssues.length > 0 ? (
          <BacklogCanvas
            issues={backlogIssues}
            captureRef={canvasRef}
            onExport={exportCanvas}
            exporting={exporting === 'canvas'}
          />
        ) : hasLoaded && !loading ? (
          <div className="empty">Keine Vorgänge im Backlog gefunden.</div>
        ) : null}
      </main>
    </>
  );
}
