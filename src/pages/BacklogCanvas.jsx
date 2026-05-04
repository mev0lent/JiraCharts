import { useEffect, useMemo, useRef, useState } from 'react';
import { storyPoints } from '../lib/issues.js';

const CARDS_PER_PAGE = 12;
const CARDS_PER_ROW = 4;
const ROWS_PER_FULL_PAGE = 3;

const PRIORITY_COLORS = {
  highest: '#e84d4d',
  blocker: '#e84d4d',
  high: '#f79232',
  medium: '#f0c518',
  low: '#2684ff',
  lowest: '#57d9a3',
  trivial: '#57d9a3',
};

function svg(color, shape) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="${color}" d="${shape}"/></svg>`)}`;
}

const PRIORITY_ICONS = {
  highest: svg('#e84d4d', 'M8 1 L14 8 H10 V11 H6 V8 H2 Z M8 9 L14 16 H10 V19 H6 V16 H2 Z'),
  blocker:  svg('#e84d4d', 'M8 1 L14 8 H10 V11 H6 V8 H2 Z M8 9 L14 16 H10 V19 H6 V16 H2 Z'),
  high:     svg('#f79232', 'M8 1 L15 12 H1 Z'),
  medium:   svg('#f0c518', 'M1 4 H15 V7 H1 Z M1 9 H15 V12 H1 Z'),
  low:      svg('#2684ff', 'M8 15 L1 4 H15 Z'),
  lowest:   svg('#57d9a3', 'M8 8 L1 1 H15 Z M8 15 L1 8 H15 Z'),
  trivial:  svg('#57d9a3', 'M8 8 L1 1 H15 Z M8 15 L1 8 H15 Z'),
};

function priorityIconUrl(priorityName) {
  return priorityName ? (PRIORITY_ICONS[priorityName.toLowerCase()] ?? null) : null;
}

function priorityColor(priorityName) {
  if (!priorityName) return 'var(--border)';
  return PRIORITY_COLORS[priorityName.toLowerCase()] ?? 'var(--border)';
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
  const assignee = issue.fields.assignee;
  const summary = issue.fields.summary || '-';

  return (
    <div
      className="backlog-card"
      style={{ '--priority-color': priorityColor(priority?.name) }}
    >
      <div className="backlog-card-top">
        <div className="backlog-card-top-left">
          {priority?.name && priorityIconUrl(priority.name) && (
            <>
              <img
                className="priority-icon"
                src={priorityIconUrl(priority.name)}
                alt={priority.name}
                title={priority.name}
              />
              <span className="backlog-priority-label">{priority.name}</span>
            </>
          )}
        </div>
        {sp != null && <span className="backlog-sp">{sp}</span>}
      </div>
      <div className="backlog-card-summary">{summary}</div>
      {assignee && (
        <div className="backlog-card-footer">
          <span className="backlog-assignee" title={assignee.displayName}>
            {assignee.displayName}
          </span>
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

export function BacklogCanvas({ issues, captureRef, onExport, exporting }) {
  const groups = useMemo(() => pagedGroups(groupByStatus(issues)), [issues]);
  const exportRefs = useRef(new Map());
  const [pageIndexes, setPageIndexes] = useState({});

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
