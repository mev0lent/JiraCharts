import { statusCategory, statusClass, storyPoints } from '../lib/issues.js';

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

function BacklogCard({ issue }) {
  const sp = storyPoints(issue);
  const cat = statusCategory(issue);
  const priority = issue.fields.priority;
  const assignee = issue.fields.assignee;
  const summary = issue.fields.summary || '-';

  return (
    <div
      className="backlog-card"
      style={{ borderLeftColor: priorityColor(priority?.name) }}
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

export function BacklogCanvas({ issues, captureRef, onExport, exporting }) {
  if (!issues.length) return null;

  const groups = groupByStatus(issues);

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
              onClick={onExport}
            >
              {exporting ? 'Exportiert…' : 'Exportieren'}
            </button>
          </div>
        </div>
      )}
      <div className="backlog-canvas-scroll">
        <div ref={captureRef} className="backlog-canvas">
          {groups.map(group => (
            <div key={group.name} className="backlog-section">
              <div className="backlog-section-title">
                {group.name}
                <span className="backlog-section-count">{group.issues.length}</span>
              </div>
              <div className="backlog-section-cards">
                {group.issues.map(issue => (
                  <BacklogCard key={issue.key} issue={issue} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
