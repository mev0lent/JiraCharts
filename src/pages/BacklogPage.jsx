import { useRef, useState } from 'react';
import { AppHeader } from '../components/AppHeader.jsx';
import { JiraConfigForm } from '../components/JiraConfigForm.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { fetchAllSprints, getBacklogIssues, getBoardId, networkMsg, searchIssues } from '../lib/jira.js';
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
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [subtaskIssues, setSubtaskIssues] = useState([]);
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
    setSubtaskIssues([]);
    setShowSubtasks(false);
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

  async function handleShowSubtasks(show) {
    setShowSubtasks(show);
    console.info(
      '[subtasks] checkbox toggled:',
      show,
      'backlogIssues count:',
      backlogIssues.length,
      'cached subtasks:',
      subtaskIssues.length,
    );

    if (!show) {
      setStatus({ message: '', type: 'info' });
      return;
    }

    if (subtaskIssues.length > 0) {
      console.info('[subtasks] using cached subtasks:', subtaskIssues.length);
      setStatus({ message: '', type: 'info' });
      return;
    }

    const parentKeys = backlogIssues.map(issue => issue.key).filter(Boolean);
    if (!parentKeys.length) {
      console.info('[subtasks] no parent issue keys available for subtask search');
      setStatus({ message: 'Keine Vorgänge für Unteraufgaben-Suche vorhanden.', type: 'info' });
      return;
    }

    setStatus({ message: 'Unteraufgaben werden geladen...', type: 'info' });
    try {
      const parentList = parentKeys.join(',');
      console.info('[subtasks] fetching for parents:', parentList.slice(0, 200));
      const issues = await searchIssues(
        `parent in (${parentList})`,
        config,
        BACKLOG_CANVAS_FIELDS,
      );
      console.info('[subtasks] fetched:', issues.length, 'issues', issues.slice(0, 3).map(issue => issue.key));
      setSubtaskIssues(issues);
      setStatus({
        message: issues.length
          ? `${issues.length} Unteraufgabe${issues.length === 1 ? '' : 'n'} geladen.`
          : 'Keine Unteraufgaben gefunden.',
        type: 'info',
      });
    } catch (err) {
      console.info('[subtasks] fetch failed:', networkMsg(err));
      setStatus({ message: `Unteraufgaben konnten nicht geladen werden: ${networkMsg(err)}`, type: 'error' });
      setShowSubtasks(false);
    }
  }

  async function exportCanvas(entries) {
    const targets = entries?.length
      ? entries
      : [{ node: canvasRef.current, filename: 'jira-backlog-canvas.png' }];
    if (!targets.length || targets.some(target => !target.node)) return;

    setExporting('canvas');
    try {
      for (const target of targets) {
        await exportNodeAsPng(target.node, target.filename);
      }
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
            issues={showSubtasks ? [...backlogIssues, ...subtaskIssues] : backlogIssues}
            captureRef={canvasRef}
            onExport={exportCanvas}
            exporting={exporting === 'canvas'}
            showSubtasks={showSubtasks}
            onShowSubtasksChange={handleShowSubtasks}
          />
        ) : hasLoaded && !loading ? (
          <div className="empty">Keine Vorgänge im Backlog gefunden.</div>
        ) : null}
      </main>
    </>
  );
}
