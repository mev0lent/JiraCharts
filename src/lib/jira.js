import { ON_PROXY } from './runtime.js';

export function networkMsg(err) {
  const message = err.message || String(err);
  return message === 'Failed to fetch' || message.includes('NetworkError') || message.includes('Load failed')
    ? 'Netzwerkfehler - bitte prüfen, ob der Proxy läuft und die Zugangsdaten korrekt sind.'
    : message;
}

function authHeaders(email, token) {
  const creds = btoa(`${email.trim()}:${token.trim()}`);
  return { Authorization: `Basic ${creds}`, Accept: 'application/json' };
}

export async function jira(path, config) {
  const base = ON_PROXY ? '' : config.jiraUrl.trim().replace(/\/$/, '');
  const res = await fetch(base + path, { headers: authHeaders(config.email, config.token) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.errorMessages?.[0] || body.message || res.statusText || 'error';
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return res.json();
}

export async function getBoardId(projectKey, config) {
  const data = await jira(`/rest/agile/1.0/board?projectKeyOrId=${projectKey}&maxResults=1`, config);
  if (!data.values?.length) throw new Error(`Kein Board für Projekt "${projectKey}" gefunden.`);
  return data.values[0].id;
}

export async function fetchAllSprints(boardId, config) {
  let start = 0;
  let sprints = [];
  for (;;) {
    const data = await jira(`/rest/agile/1.0/board/${boardId}/sprint?startAt=${start}&maxResults=50`, config);
    const page = data.values || [];
    sprints = sprints.concat(page);
    if (!page.length || sprints.length >= (data.total || 0)) break;
    start += 50;
  }
  return sprints.sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
}

export async function getSprintIssues(boardId, sprintId, config, fields) {
  let start = 0;
  let issues = [];
  for (;;) {
    const data = await jira(
      `/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue?startAt=${start}&maxResults=50&fields=${fields}`,
      config,
    );
    issues = issues.concat(data.issues || []);
    if (issues.length >= (data.total || 0)) break;
    start += 50;
  }
  return issues;
}

const DEFAULT_BACKLOG_FIELDS = 'summary,status,statuscategorychangedate,customfield_10016,customfield_10004,resolutiondate,issuetype';

export async function searchIssues(jql, config, fields) {
  let issues = [];
  let nextPageToken = null;
  for (;;) {
    const params = new URLSearchParams({
      jql,
      maxResults: '50',
    });
    if (fields) params.set('fields', fields);
    if (nextPageToken) params.set('nextPageToken', nextPageToken);

    const data = await jira(
      `/rest/api/3/search/jql?${params.toString()}`,
      config,
    );
    issues = issues.concat(data.issues || []);
    if (data.isLast || !data.nextPageToken) break;
    nextPageToken = data.nextPageToken;
  }
  return issues;
}

export async function getBacklogIssues(boardId, config, fields = DEFAULT_BACKLOG_FIELDS) {
  let start = 0;
  let issues = [];
  for (;;) {
    const data = await jira(
      `/rest/agile/1.0/board/${boardId}/backlog?startAt=${start}&maxResults=50&fields=${fields}`,
      config,
    );
    issues = issues.concat(data.issues || []);
    if (issues.length >= (data.total || 0)) break;
    start += 50;
  }
  return issues;
}
