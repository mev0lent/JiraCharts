import { useMemo, useRef, useState } from 'react';
import { AppHeader } from '../components/AppHeader.jsx';
import { BoardMetrics } from '../components/BoardMetrics.jsx';
import { BurndownMetrics } from '../components/BurndownMetrics.jsx';
import { JiraConfigForm } from '../components/JiraConfigForm.jsx';
import { Legend } from '../components/Legend.jsx';
import { SprintSelector } from '../components/SprintSelector.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { addDays, atMidnight, daysBetween, fmtDate, isWeekday } from '../lib/date.js';
import { completionDate, statusCategory, storyPoints } from '../lib/issues.js';
import {
  fetchAllSprints,
  getBacklogIssues,
  getBoardId,
  getSprintIssues,
  networkMsg,
} from '../lib/jira.js';
import {
  BURNDOWN_SCOPE_KEY,
  BURNDOWN_PROJECT_END_KEY,
  BURNDOWN_SCOPE_SIZE_KEY,
  JIRA_BASE,
  ON_PROXY,
  readBooleanStorage,
  readStorage,
  SKIP_WEEKENDS_KEY,
  writeBooleanStorage,
  writeStorage,
} from '../lib/runtime.js';
import { exportNodeAsPng } from '../lib/screenshot.js';
import { BurndownChart } from './BurndownChart.jsx';
import { BacklogCanvas } from './BacklogCanvas.jsx';

const SPRINT_FIELDS = 'summary,status,statuscategorychangedate,customfield_10016,customfield_10004,resolutiondate,issuetype,priority,assignee,created';

function readBurndownScope() {
  return readStorage(BURNDOWN_SCOPE_KEY, '') === 'board' ? 'board' : 'selection';
}

function parseDateOnly(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : atMidnight(date);
}

function readProjectEnd() {
  return readStorage(BURNDOWN_PROJECT_END_KEY, '');
}

function createdDate(issue) {
  const value = issue.fields?.created;
  if (!value) return null;
  const date = atMidnight(new Date(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function datedSprintsSorted(list) {
  return [...list]
    .filter(sprint => sprint.startDate && sprint.endDate)
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
}

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

function buildBurndownState(args, skipWeekends) {
  if (!args?.selSprints?.length) return null;

  const { selSprints, completedIssues, totalSP } = args;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const chartStart = new Date(selSprints[0].startDate);
  chartStart.setHours(0, 0, 0, 0);
  const sprintEnd = new Date(selSprints.at(-1).endDate);
  sprintEnd.setHours(0, 0, 0, 0);
  const overrideEnd = args?.endDateOverride ? atMidnight(args.endDateOverride) : null;
  const chartEnd = overrideEnd && overrideEnd > chartStart ? overrideEnd : sprintEnd;

  let days = daysBetween(chartStart, chartEnd);
  if (skipWeekends) days = days.filter(isWeekday);
  const n = Math.max(1, days.length - 1);
  const ideal = days.map((_, i) => Math.max(0, Math.round(totalSP - (totalSP * i) / n)));
  const actual = days.map(day => {
    if (day > today) return null;
    return totalSP - completedIssues.filter(issue => issue.doneDate && issue.doneDate <= day).reduce((sum, issue) => sum + issue.sp, 0);
  });
  const labels = days.map(day => day.toLocaleDateString('de-DE', { month: 'short', day: 'numeric' }));
  const boundaries = selSprints
    .slice(1)
    .map(sprint => {
      const start = new Date(sprint.startDate);
      start.setHours(0, 0, 0, 0);
      const idx = days.findIndex(day => day >= start);
      return idx >= 0 ? { idx, name: sprint.name } : null;
    })
    .filter(Boolean);

  return { labels, ideal, actual, boundaries };
}

function formatSP(value) {
  const rounded = Math.round((value || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatRate(value) {
  if (!Number.isFinite(value)) return '-';
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function plural(value, singular, pluralLabel = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

function countScheduleDays(start, end, skipWeekends) {
  if (!start || !end || end < start) return 0;
  const days = daysBetween(start, end);
  return skipWeekends ? days.filter(isWeekday).length : days.length;
}

function countScheduleDaysAfter(start, end, skipWeekends) {
  if (!start || !end || end <= start) return 0;
  const days = daysBetween(start, end).filter(day => day > start);
  return skipWeekends ? days.filter(isWeekday).length : days.length;
}

function addScheduleDaysInclusive(start, count, skipWeekends) {
  const days = Math.max(1, count);
  if (!skipWeekends) return addDays(start, days - 1);

  const date = atMidnight(start);
  let remaining = days;
  while (remaining > 0) {
    if (isWeekday(date)) remaining -= 1;
    if (remaining > 0) date.setDate(date.getDate() + 1);
  }
  return date;
}

function buildBurndownMetricsModel(args, skipWeekends) {
  if (!args?.issues?.length) return null;

  const { issues, selSprints } = args;
  const scope = args.scope === 'board' ? 'board' : 'selection';
  const isBoard = scope === 'board';
  const totalSPValue = issues.reduce((sum, issue) => sum + issue.sp, 0);
  const completed = issues.filter(issue => issue.cat === 'done');
  const completedSPValue = completed.reduce((sum, issue) => sum + issue.sp, 0);
  const remainingSPValue = Math.max(0, totalSPValue - completedSPValue);
  const totalIssues = issues.length;
  const completedIssues = completed.length;
  const inProgressIssues = args.inProgressIssues ?? issues.filter(i => i.cat === 'progress').length;
  const todoIssues = args.todoIssues ?? issues.filter(i => i.cat === 'todo').length;
  const remainingIssues = inProgressIssues + todoIssues;
  const sprintCumulative = args.sprintCumulative ?? null;
  const showScopeSizeLine = Boolean(args.showScopeSizeLine);

  // Board mode: task counts; selection mode: story points
  const workTotal = isBoard ? totalIssues : totalSPValue;
  const workCompleted = isBoard ? completedIssues : completedSPValue;
  const workRemaining = isBoard ? remainingIssues : remainingSPValue;
  const workUnit = isBoard ? 'T' : 'SP';
  const fmtWork = isBoard ? v => String(v) : formatSP;
  const percent = workTotal ? Math.round((workCompleted / workTotal) * 100) : 0;
  const dayTerms = skipWeekends
    ? { singular: 'Arbeitstag', plural: 'Arbeitstage', unit: 'Arbeitstag' }
    : { singular: 'Kalendertag', plural: 'Kalendertage', unit: 'Tag' };
  const hasSchedule = Boolean(selSprints?.length);

  let throughput = {
    value: '-',
    rate: null,
    rateLabel: '-',
    targetRate: null,
    targetLabel: '-',
    deltaLabel: '',
    unit: `${workUnit}/${dayTerms.unit}`,
    detail: 'Keine Sprint-Termine',
  };
  let forecast =
    workRemaining <= 0
      ? {
          value: 'Erledigt',
          detail: 'Kein Restumfang',
          note: `${fmtWork(workCompleted)} ${workUnit} abgeschlossen`,
          tone: 'good',
          stateLabel: 'Erledigt',
          bufferLabel: `0 ${workUnit} offen`,
          secondaryLabel: `${fmtWork(workCompleted)} ${workUnit} abgeschlossen`,
        }
      : {
          value: 'Keine Sprint-Termine',
          detail: '',
          note: 'Zeitplanwerte ausgeblendet',
          tone: 'neutral',
          stateLabel: 'Ohne Plan',
          bufferLabel: 'Keine Termine',
          secondaryLabel: 'Zeitplanwerte ausgeblendet',
        };

  if (hasSchedule) {
    const today = atMidnight(new Date());
    const chartStart = atMidnight(selSprints[0].startDate);
    const sprintEnd = atMidnight(selSprints.at(-1).endDate);
    const overrideEnd = args?.endDateOverride ? atMidnight(args.endDateOverride) : null;
    const chartEnd = overrideEnd && overrideEnd > chartStart ? overrideEnd : sprintEnd;
    const elapsedEnd = today < chartStart ? null : today > chartEnd ? chartEnd : today;
    const elapsedDays = elapsedEnd ? countScheduleDays(chartStart, elapsedEnd, skipWeekends) : 0;
    const remainingStart = today < chartStart ? chartStart : today;
    const remainingDays = today > chartEnd ? 0 : countScheduleDays(remainingStart, chartEnd, skipWeekends);
    const throughputRate = elapsedDays > 0 ? workCompleted / elapsedDays : null;
    const requiredRate = workRemaining > 0 && remainingDays > 0 ? workRemaining / remainingDays : null;

    throughput =
      elapsedDays > 0
        ? {
            value: `${formatRate(throughputRate)} ${workUnit}/${dayTerms.unit}`,
            rate: throughputRate,
            rateLabel: formatRate(throughputRate),
            targetRate: requiredRate,
            targetLabel: requiredRate === null ? '-' : formatRate(requiredRate),
            deltaLabel:
              requiredRate === null
                ? 'Kein Solltempo'
                : `${throughputRate >= requiredRate ? '+' : ''}${formatRate(throughputRate - requiredRate)} ${workUnit}/${dayTerms.unit} vs Soll`,
            unit: `${workUnit}/${dayTerms.unit}`,
            detail: `${plural(elapsedDays, dayTerms.singular, dayTerms.plural)} vergangen`,
          }
        : {
            value: '-',
            rate: null,
            rateLabel: '-',
            targetRate: requiredRate,
            targetLabel: requiredRate === null ? '-' : formatRate(requiredRate),
            deltaLabel: '',
            unit: `${workUnit}/${dayTerms.unit}`,
            detail: today < chartStart ? 'Sprint hat noch nicht begonnen' : `Keine vergangenen ${dayTerms.plural}`,
          };

    if (workRemaining <= 0) {
      forecast = {
        value: 'Erledigt',
        detail: 'Kein Restumfang',
        note: `${fmtWork(workCompleted)} ${workUnit} abgeschlossen`,
        tone: 'good',
        stateLabel: 'Erledigt',
        bufferLabel: `0 ${workUnit} offen`,
        secondaryLabel: `${fmtWork(workCompleted)} ${workUnit} abgeschlossen`,
      };
    } else {
      const requiredDetail =
        requiredRate === null
          ? 'Keine geplanten Tage übrig'
          : `${formatRate(requiredRate)} ${workUnit}/${dayTerms.unit} erforderlich`;

      if (workCompleted <= 0 || !throughputRate) {
        forecast = {
          value: 'Zu wenige Daten',
          detail: requiredDetail,
          note: `${plural(remainingDays, dayTerms.singular, dayTerms.plural)} verbleibend`,
          tone: 'neutral',
          stateLabel: 'Offen',
          bufferLabel: `${plural(remainingDays, dayTerms.singular, dayTerms.plural)} übrig`,
          secondaryLabel: 'Zu wenige Daten',
        };
      } else {
        const daysToFinish = Math.max(1, Math.ceil(workRemaining / throughputRate));
        const projectedDate = addScheduleDaysInclusive(today, daysToFinish, skipWeekends);
        const finishesOnTime = projectedDate <= chartEnd;
        const bufferDays = finishesOnTime
          ? countScheduleDaysAfter(projectedDate, chartEnd, skipWeekends)
          : countScheduleDaysAfter(chartEnd, projectedDate, skipWeekends);
        forecast = {
          value: fmtDate(projectedDate),
          detail: requiredDetail,
          note: finishesOnTime ? 'Im Zeitplan' : 'Im Verzug',
          tone: finishesOnTime ? 'good' : 'risk',
          stateLabel: finishesOnTime ? 'Im Zeitplan' : 'Im Verzug',
          bufferLabel: finishesOnTime
            ? `${plural(bufferDays, dayTerms.singular, dayTerms.plural)} Puffer`
            : `${plural(bufferDays, dayTerms.singular, dayTerms.plural)} nach Ende`,
          secondaryLabel: '',
        };
      }
    }
  }

  return {
    totalSP: formatSP(totalSPValue),
    completedSP: formatSP(completedSPValue),
    remainingSP: formatSP(remainingSPValue),
    totalIssues,
    completedIssues,
    inProgressIssues,
    todoIssues,
    remainingIssues,
    percent,
    throughput,
    forecast,
    scope,
    sprintCumulative,
    showScopeSizeLine,
  };
}

export function BurndownPage() {
  const [config, setConfig] = useState(initialConfig);
  const [saveToken, setSaveToken] = useState(() => readBooleanStorage('bd_saveToken', false));
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ message: '', type: 'info' });
  const [sprints, setSprints] = useState([]);
  const [activeBoardId, setActiveBoardId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [includeBacklog, setIncludeBacklog] = useState(false);
  const [burndownScope, setBurndownScope] = useState(readBurndownScope);
  const [projectEndDate, setProjectEndDate] = useState(readProjectEnd);
  const [showScopeSizeLine, setShowScopeSizeLine] = useState(() => readBooleanStorage(BURNDOWN_SCOPE_SIZE_KEY, false));
  const [skipWeekends, setSkipWeekends] = useState(() => readBooleanStorage(SKIP_WEEKENDS_KEY, true));
  const [sprintLabel, setSprintLabel] = useState('-');
  const [tableIssues, setTableIssues] = useState([]);
  const [latestMetricArgs, setLatestMetricArgs] = useState(null);
  const [latestChartArgs, setLatestChartArgs] = useState(null);
  const [hasViewed, setHasViewed] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [kennzahlenView, setKennzahlenView] = useState('zwischenstand');
  const metricsWrapRef = useRef(null);
  const progressPanelRef = useRef(null);
  const chartWrapRef = useRef(null);
  const canvasRef = useRef(null);

  const chartState = useMemo(
    () => buildBurndownState(latestChartArgs, skipWeekends),
    [latestChartArgs, skipWeekends],
  );
  const metricsModel = useMemo(
    () => buildBurndownMetricsModel(
      latestMetricArgs
        ? { ...latestMetricArgs, showScopeSizeLine: latestMetricArgs.scope === 'board' && showScopeSizeLine }
        : latestMetricArgs,
      skipWeekends,
    ),
    [latestMetricArgs, skipWeekends, showScopeSizeLine],
  );

  const datedSprintsOnBoard = useMemo(() => datedSprintsSorted(sprints), [sprints]);

  const canView =
    burndownScope === 'board'
      ? true
      : Boolean(selectedIds.length || includeBacklog);

  function setScope(next) {
    setBurndownScope(next);
    writeStorage(BURNDOWN_SCOPE_KEY, next);
    if (next === 'board') setTableIssues([]);
  }

  const projectEndOverride = useMemo(() => parseDateOnly(projectEndDate), [projectEndDate]);

  function updateProjectEndDate(value) {
    setProjectEndDate(value);
    writeStorage(BURNDOWN_PROJECT_END_KEY, value);
  }

  function updateShowScopeSizeLine(value) {
    setShowScopeSizeLine(value);
    writeBooleanStorage(BURNDOWN_SCOPE_SIZE_KEY, value);
  }

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

  async function loadBoard(event) {
    event.preventDefault();
    if (!requireCredentials()) return;

    saveConfig(config, saveToken);
    setLoading(true);
    setSprints([]);
    setSelectedIds([]);
    setIncludeBacklog(false);
    setTableIssues([]);
    setLatestMetricArgs(null);
    setLatestChartArgs(null);
    setHasViewed(false);

    try {
      setStatus({ message: 'Board wird gesucht...', type: 'info' });
      let boardId = config.boardId.trim();
      if (!boardId) {
        const projectKey = config.projectKey.trim().toUpperCase();
        if (!projectKey) throw new Error('Projektschlüssel oder Board-ID eingeben.');
        boardId = await getBoardId(projectKey, config);
      }

      setActiveBoardId(boardId);
      setStatus({ message: 'Sprints werden geladen...', type: 'info' });
      const fetchedSprints = await fetchAllSprints(boardId, config);
      setSprints(fetchedSprints);
      setSelectedIds(fetchedSprints.filter(sprint => sprint.state === 'active').map(sprint => sprint.id));
      setStatus({ message: '', type: 'info' });
    } catch (err) {
      setStatus({ message: `Fehler: ${networkMsg(err)}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function viewSelected() {
    setLoading(true);
    setHasViewed(true);
    setTableIssues([]);
    setLatestMetricArgs(null);
    setLatestChartArgs(null);

    try {
      const sprintMap = Object.fromEntries(sprints.map(sprint => [sprint.id, sprint]));
      const seen = new Set();
      const allTagged = [];

      const tag = (issue, sprint) => {
        if (seen.has(issue.key)) return;
        seen.add(issue.key);
        // First sprint wins for duplicates (same as sequential fetch order).
        allTagged.push({ ...issue, _sprint: sprint, sp: storyPoints(issue) ?? 1, cat: statusCategory(issue) });
      };

      if (burndownScope === 'board') {
        const ordered = datedSprintsSorted(sprints);
        const total = ordered.length;
        for (let i = 0; i < ordered.length; i++) {
          const sprint = ordered[i];
          setStatus({
            message: total ? `Sprint ${i + 1}/${total}: „${sprint.name}“ wird geladen…` : '',
            type: 'info',
          });
          const issues = await getSprintIssues(activeBoardId, sprint.id, config, SPRINT_FIELDS);
          issues.forEach(issue => tag(issue, sprint));
        }
      } else {
        for (const id of selectedIds) {
          setStatus({ message: `"${sprintMap[id]?.name}" wird geladen...`, type: 'info' });
          const issues = await getSprintIssues(activeBoardId, id, config, SPRINT_FIELDS);
          issues.forEach(issue => tag(issue, sprintMap[id]));
        }
      }

      if (includeBacklog || burndownScope === 'board') {
        setStatus({ message: 'Backlog wird geladen...', type: 'info' });
        const issues = await getBacklogIssues(activeBoardId, config, SPRINT_FIELDS);
        issues.forEach(issue => tag(issue, null));
      }

      if (!allTagged.length) {
        setStatus({ message: '', type: 'info' });
        setTableIssues([]);
        setLatestMetricArgs(null);
        return;
      }

      const selSprints =
        burndownScope === 'board'
          ? datedSprintsSorted(sprints)
          : selectedIds
              .map(id => sprintMap[id])
              .filter(sprint => sprint?.startDate && sprint?.endDate)
              .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

      setSprintLabel(
        burndownScope === 'board'
          ? selSprints.length
            ? `Gesamtes Board (${selSprints.length} ${selSprints.length === 1 ? 'Sprint' : 'Sprints'})`
            : includeBacklog
              ? 'Backlog'
              : '-'
          : selSprints.length === 1
            ? selSprints[0].name
            : selSprints.length > 1
              ? `${selSprints[0].name} - ${selSprints.at(-1).name}`
              : includeBacklog
                ? 'Backlog'
                : '-',
      );

      const totalSP = allTagged.reduce((sum, issue) => sum + issue.sp, 0);
      const inProgressIssues = allTagged.filter(i => i.cat === 'progress').length;
      const todoIssues = allTagged.filter(i => i.cat === 'todo').length;
      const today = atMidnight(new Date());
      const sprintCumulative = selSprints.map(sprint => {
        const sprintEnd = sprint.endDate ? atMidnight(new Date(sprint.endDate)) : today;
        const cutoff = sprintEnd > today ? today : sprintEnd;
        const cumCompleted = allTagged.filter(issue => {
          if (issue.cat !== 'done') return false;
          const doneDate = completionDate(issue);
          return doneDate !== null && doneDate <= cutoff;
        }).length;
        const scopeSize = allTagged.filter(issue => {
          const created = createdDate(issue);
          return created !== null && created <= cutoff;
        }).length;
        return { name: sprint.name, cumCompleted, scopeSize };
      });
      setLatestMetricArgs({
        issues: allTagged,
        selSprints,
        scope: burndownScope,
        endDateOverride: burndownScope === 'board' ? projectEndOverride : null,
        inProgressIssues,
        todoIssues,
        sprintCumulative,
      });

      if (selSprints.length > 0) {
        const completedIssues = allTagged
          .filter(issue => issue.cat === 'done')
          .map(issue => ({ sp: issue.sp, doneDate: completionDate(issue) }));
        setLatestChartArgs({
          selSprints,
          completedIssues,
          totalSP,
          endDateOverride: burndownScope === 'board' ? projectEndOverride : null,
        });
      }

      if (burndownScope === 'board') {
        setTableIssues([]);
      } else {
        const tableSorted = [...allTagged].sort((a, b) => {
          const sprintDelta = new Date(a._sprint?.startDate || '9999') - new Date(b._sprint?.startDate || '9999');
          if (sprintDelta !== 0) return sprintDelta;
          return ({ progress: 0, todo: 1, done: 2 }[a.cat] ?? 1) - ({ progress: 0, todo: 1, done: 2 }[b.cat] ?? 1);
        });
        setTableIssues(tableSorted);
      }
      setStatus({ message: '', type: 'info' });
    } catch (err) {
      setStatus({ message: `Fehler: ${networkMsg(err)}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function updateSkipWeekends(value) {
    setSkipWeekends(value);
    writeBooleanStorage(SKIP_WEEKENDS_KEY, value);
  }

  async function exportScreenshot(kind, entries) {
    const target =
      kind === 'metrics'
        ? { node: progressPanelRef.current, filename: 'jira-sprint-fortschritt.png' }
        : kind === 'canvas'
          ? { node: canvasRef.current, filename: 'jira-burndown-vorgaenge.png' }
          : { node: chartWrapRef.current, filename: 'jira-burndown-chart.png' };
    const targets = entries?.length ? entries : [target];

    if (!targets.length || targets.some(item => !item.node)) return;

    setExporting(kind);
    try {
      for (const item of targets) {
        await exportNodeAsPng(item.node, item.filename);
      }
    } catch (err) {
      setStatus({ message: `Screenshot konnte nicht erstellt werden: ${networkMsg(err)}`, type: 'error' });
    } finally {
      setExporting(null);
    }
  }

  const browseBase = ON_PROXY ? JIRA_BASE : config.jiraUrl.trim().replace(/\/$/, '');
  const hasIssueList = burndownScope !== 'board' && metricsModel?.scope !== 'board' && tableIssues.length > 0;
  const hasScreenshotTargets = Boolean(metricsModel || chartState || hasIssueList);

  return (
    <>
      <AppHeader title="Sprint-Burndown">
        <label className="switch">
          <input type="checkbox" checked={skipWeekends} onChange={event => updateSkipWeekends(event.target.checked)} />
          Nur Wochentage
        </label>
        <span>{sprintLabel}</span>
      </AppHeader>

      <main className="main page-burndown">
        <JiraConfigForm
          config={config}
          onChange={setConfig}
          onSubmit={loadBoard}
          buttonLabel="Board laden"
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

        {sprints.length ? (
          <>
            <div className="burndown-scope-panel" role="group" aria-label="Burndown-Umfang">
              <div className="burndown-scope-row">
                <div className="burndown-scope-toggle">
                  <button
                    type="button"
                    className="burndown-scope-option"
                    aria-pressed={burndownScope === 'selection'}
                    disabled={loading}
                    onClick={() => setScope('selection')}
                  >
                    Sprintsfortschritt
                  </button>
                  <button
                    type="button"
                    className="burndown-scope-option"
                    aria-pressed={burndownScope === 'board'}
                    disabled={loading}
                    onClick={() => setScope('board')}
                  >
                    Projektfortschritt
                  </button>
                </div>

                {burndownScope === 'board' ? (
                  <div className="burndown-board-options">
                    <div className="field burndown-project-end">
                      <label>Projekt-Enddatum</label>
                      <input
                        type="date"
                        value={projectEndDate}
                        onChange={event => updateProjectEndDate(event.target.value)}
                        disabled={loading}
                      />
                    </div>
                    <label className="switch burndown-scope-size-switch">
                      <input
                        type="checkbox"
                        checked={showScopeSizeLine}
                        onChange={event => updateShowScopeSizeLine(event.target.checked)}
                        disabled={loading}
                      />
                      Umfang anzeigen
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
            {burndownScope === 'board' ? (
              <div className="board-action-panel">
                <span className="board-action-info">
                  {datedSprintsOnBoard.length}{' '}
                  {datedSprintsOnBoard.length === 1 ? 'Sprint' : 'Sprints'} mit Terminen · inkl. Backlog
                </span>
                <button type="button" disabled={loading} onClick={viewSelected}>
                  Board anzeigen
                </button>
              </div>
            ) : (
              <SprintSelector
                sprints={sprints}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                includeBacklog={includeBacklog}
                onIncludeBacklogChange={setIncludeBacklog}
                disabled
                primaryAction={
                  <button type="button" disabled={!canView || loading} onClick={viewSelected}>
                    Auswahl anzeigen
                  </button>
                }
              />
            )}
          </>
        ) : null}

        <StatusMessage message={status.message} type={status.type} />

        {metricsModel ? (
          <div className="metrics-section">
            <div className="metrics-section-header">
              <span className="chart-title">Kennzahlen</span>
              <div className="toolbar-inline" data-screenshot-exclude>
                {metricsModel.scope !== 'board' && (
                  <div className="burndown-scope-toggle">
                    <button
                      type="button"
                      className="burndown-scope-option"
                      aria-pressed={kennzahlenView === 'zwischenstand'}
                      onClick={() => setKennzahlenView('zwischenstand')}
                    >
                      Zwischenstand
                    </button>
                    <button
                      type="button"
                      className="burndown-scope-option"
                      aria-pressed={kennzahlenView === 'sprintende'}
                      onClick={() => setKennzahlenView('sprintende')}
                    >
                      Sprintende
                    </button>
                  </div>
                )}
                <button
                  className="ghost"
                  type="button"
                  disabled={exporting !== null}
                  onClick={() => exportScreenshot('metrics')}
                >
                  {exporting === 'metrics' ? 'Exportiert…' : 'Exportieren'}
                </button>
              </div>
            </div>
            {metricsModel.scope === 'board' ? (
              <BoardMetrics model={metricsModel} captureRef={metricsWrapRef} />
            ) : (
              <BurndownMetrics
                model={metricsModel}
                captureRef={metricsWrapRef}
                progressCaptureRef={progressPanelRef}
                view={kennzahlenView}
              />
            )}
          </div>
        ) : null}

        {chartState && metricsModel?.scope !== 'board' ? (
          <div ref={chartWrapRef} className="chart-wrap">
            <div className="chart-header">
              <div className="chart-title">Burndown</div>
              <div className="toolbar-inline">
                <Legend
                  items={[
                    { label: 'Ideal', style: { background: 'var(--chart-ideal)', borderTop: '2px dashed var(--chart-ideal)' } },
                    { label: 'Ist', style: { background: 'var(--chart-actual)' } },
                  ]}
                />
                <button
                  className="ghost"
                  type="button"
                  data-screenshot-exclude
                  disabled={exporting !== null}
                  onClick={() => exportScreenshot('chart')}
                >
                  {exporting === 'chart' ? 'Exportiert…' : 'Exportieren'}
                </button>
              </div>
            </div>
            <div className="chart-canvas-wrap">
              <BurndownChart
                state={chartState}
                scope={metricsModel?.scope ?? 'selection'}
              />
            </div>
          </div>
        ) : null}

        {hasIssueList ? (
          <BacklogCanvas
            issues={tableIssues}
            captureRef={canvasRef}
            onExport={entries => exportScreenshot('canvas', entries)}
            exporting={exporting === 'canvas'}
          />
        ) : burndownScope !== 'board' && hasViewed && !loading && !metricsModel && !status.message ? (
          <div className="empty">Keine Vorgänge in dieser Auswahl gefunden.</div>
        ) : null}
      </main>
    </>
  );
}
