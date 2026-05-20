import { useEffect, useMemo, useRef, useState } from 'react';
import { storyPoints } from '../lib/issues.js';

const CARDS_PER_PAGE = 12;
const CARDS_PER_ROW = 4;
const ROWS_PER_FULL_PAGE = 3;

const PRIORITY_COLORS = {
  highest: '#F15B50',
  blocker: '#F15B50',
  high: '#E06C00',
  medium: '#E06C00',
  low: '#4688EC',
  lowest: '#4688EC',
  trivial: '#4688EC',
};

const PUBLIC_ICON_BASE = `${import.meta.env.BASE_URL}icons/`;

const PRIORITY_ICON_FILES = {
  highest: 'highest.svg',
  blocker: 'highest.svg',
  high: 'high.svg',
  medium: 'medium.svg',
  low: 'low.svg',
  lowest: 'lowest.svg',
  trivial: 'lowest.svg',
};

function priorityKey(priorityName) {
  return priorityName ? priorityName.trim().toLowerCase() : '';
}

function priorityIconUrl(priorityName) {
  const fileName = PRIORITY_ICON_FILES[priorityKey(priorityName)];
  return fileName ? `${PUBLIC_ICON_BASE}${fileName}` : null;
}

function priorityColor(priorityName) {
  return PRIORITY_COLORS[priorityKey(priorityName)] ?? 'var(--border)';
}

function groupByStatus(issues) {
  const order = [];
  const map = new Map();
  for (const issue of issues) {
    const key = issue.fields.status?.name || 'Unbekannt';
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(issue);
  }
  return order.map(name => ({ name, issues: map.get(name) }));
}

function pageCount(issues) {
  return Math.max(1, Math.ceil(issues.length / CARDS_PER_PAGE));
}

function pagedGroups(groups) {
  return groups.map(group => ({
    ...group,
    pages: Array.from({ length: pageCount(group.issues) }, (_, pageIndex) => (
      group.issues.slice(
        pageIndex * CARDS_PER_PAGE,
        pageIndex * CARDS_PER_PAGE + CARDS_PER_PAGE,
      )
    )),
  }));
}

function visibleRows(issues) {
  return Math.max(1, Math.ceil(issues.length / CARDS_PER_ROW));
}

function cardRowSize(issues) {
  return visibleRows(issues) >= ROWS_PER_FULL_PAGE ? 'minmax(0, 1fr)' : '172px';
}

function filenamePart(value) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'status';
}

function BacklogCard({ issue }) {
  const sp = storyPoints(issue);
  const priority = issue.fields.priority;
  const priorityIcon = priorityIconUrl(priority?.name);
  const assignee = issue.fields.assignee;
  const summary = issue.fields.summary || '-';
  const issueType = issue.fields.issuetype;

  return (
    <div
      className="backlog-card"
      style={{ '--priority-color': priorityColor(priority?.name) }}
    >
      <div className="backlog-card-top">
        <div className="backlog-card-top-left">
          {issueType?.iconUrl && (
            <>
              <img
                className="issue-type-icon"
                src={issueType.iconUrl}
                alt={issueType.name}
                title={issueType.name}
              />
              <span className="backlog-issue-type-label">{issueType.name}</span>
            </>
          )}
        </div>
        {priority?.name && priorityIcon && (
          <img
            className="priority-icon"
            src={priorityIcon}
            alt={priority.name}
            title={priority.name}
          />
        )}
      </div>
      <div className="backlog-card-summary">{summary}</div>
      {(assignee || sp != null) && (
        <div className="backlog-card-footer">
          {assignee && (
            <span className="backlog-assignee" title={assignee.displayName}>
              {assignee.displayName}
            </span>
          )}
          {sp != null && <span className="backlog-sp">{sp} SP</span>}
        </div>
      )}
    </div>
  );
}

function BacklogStatePage({ group, pageIssues, pageIndex, pages, onPageChange, exportMode = false }) {
  return (
    <div className="backlog-state">
      <div className="backlog-state-header">
        <div className="backlog-section-title">
          {group.name}
          <span className="backlog-section-count">
            {pageIssues.length === group.issues.length ? group.issues.length : `${pageIssues.length}/${group.issues.length}`}
          </span>
        </div>
        {!exportMode && pages > 1 && (
          <div className="backlog-page-controls" data-screenshot-exclude>
            <button
              className="ghost backlog-page-button"
              type="button"
              aria-label={`Vorherige ${group.name}-Seite`}
              disabled={pageIndex === 0}
              onClick={() => onPageChange(pageIndex - 1)}
            >
              ←
            </button>
            <span className="backlog-page-status">
              Seite {pageIndex + 1}/{pages}
            </span>
            <button
              className="ghost backlog-page-button"
              type="button"
              aria-label={`Nächste ${group.name}-Seite`}
              disabled={pageIndex === pages - 1}
              onClick={() => onPageChange(pageIndex + 1)}
            >
              →
            </button>
          </div>
        )}
      </div>
      <div className="backlog-canvas-scroll">
        <div className="backlog-canvas">
          <div
            className="backlog-section-cards"
            style={{
              '--visible-card-rows': visibleRows(pageIssues),
              '--card-row-size': cardRowSize(pageIssues),
            }}
          >
            {pageIssues.map(issue => (
              <BacklogCard key={issue.key} issue={issue} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BacklogCanvas({ issues, captureRef, onExport, exporting, showSubtasks, onShowSubtasksChange }) {
  const exportRefs = useRef(new Map());
  const [pageIndexes, setPageIndexes] = useState({});

  const groups = useMemo(() => pagedGroups(groupByStatus(issues)), [issues]);
  const canToggleSubtasks = typeof onShowSubtasksChange === 'function';

  useEffect(() => {
    setPageIndexes({});
  }, [issues]);

  if (!issues.length) return null;

  function pageIndexFor(group) {
    return Math.min(pageIndexes[group.name] ?? 0, group.pages.length - 1);
  }

  function setGroupPage(groupName, pageIndex) {
    setPageIndexes(indexes => ({
      ...indexes,
      [groupName]: pageIndex,
    }));
  }

  function exportKey(groupName, pageIndex) {
    return `${groupName}-${pageIndex}`;
  }

  function setExportRef(groupName, pageIndex, node) {
    const key = exportKey(groupName, pageIndex);
    if (node) {
      exportRefs.current.set(key, node);
    } else {
      exportRefs.current.delete(key);
    }
  }

  function exportSections() {
    const entries = groups.flatMap(group => (
      group.pages.map((_, pageIndex) => ({
        node: exportRefs.current.get(exportKey(group.name, pageIndex)),
        filename: [
          'jira-backlog-vorgaenge',
          filenamePart(group.name),
          `seite-${pageIndex + 1}`,
        ].join('-') + '.png',
      }))
    )).filter(entry => entry.node);

    return onExport(entries);
  }

  return (
    <div className="canvas-wrap">
      {onExport && (
        <div className="chart-header">
          <div className="chart-title">Vorgänge</div>
          <div className="toolbar-inline">
            {canToggleSubtasks ? (
              <label className="toolbar-checkbox" data-screenshot-exclude>
                <input
                  type="checkbox"
                  checked={Boolean(showSubtasks)}
                  onChange={e => onShowSubtasksChange(e.target.checked)}
                />
                Unteraufgaben anzeigen
              </label>
            ) : null}
            <button
              className="ghost"
              type="button"
              data-screenshot-exclude
              disabled={exporting}
              onClick={exportSections}
            >
              {exporting ? 'Exportiert…' : 'Alle Seiten exportieren'}
            </button>
          </div>
        </div>
      )}
      <div ref={captureRef} className="backlog-states">
        {groups.map(group => {
          const pageIndex = pageIndexFor(group);
          const pageIssues = group.pages[pageIndex] ?? [];

          return (
            <BacklogStatePage
              key={group.name}
              group={group}
              pageIssues={pageIssues}
              pageIndex={pageIndex}
              pages={group.pages.length}
              onPageChange={nextPage => setGroupPage(group.name, nextPage)}
            />
          );
        })}
      </div>
      <div className="backlog-export-pool" aria-hidden="true">
        {groups.flatMap(group => (
          group.pages.map((pageIssues, pageIndex) => (
            <div
              key={`${group.name}-${pageIndex}`}
              ref={node => setExportRef(group.name, pageIndex, node)}
              className="backlog-export-page"
            >
              <BacklogStatePage
                group={group}
                pageIssues={pageIssues}
                pageIndex={pageIndex}
                pages={group.pages.length}
                exportMode
              />
            </div>
          ))
        ))}
      </div>
    </div>
  );
}
