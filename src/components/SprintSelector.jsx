import { fmtRange } from '../lib/date.js';

const stateOrder = { active: 0, future: 1, closed: 2 };
const stateLabels = {
  active: 'aktiv',
  future: 'geplant',
  closed: 'geschlossen',
};

export function SprintSelector({
  sprints,
  selectedIds,
  onSelectedIdsChange,
  includeBacklog = false,
  onIncludeBacklogChange,
  actions,
  primaryAction,
  requireDates = false,
  /** When true, sprint rows are read-only; dated sprints show checked (board scope). */
  boardScopeMode = false,
  hideBulkSprintToggles = false,
  helperText = '',
  disabled = false,
}) {
  const sorted = [...sprints].sort(
    (a, b) =>
      (stateOrder[a.state] ?? 3) - (stateOrder[b.state] ?? 3) ||
      new Date(b.startDate || 0) - new Date(a.startDate || 0),
  );

  function toggleSprint(id, checked) {
    const next = checked ? [...selectedIds, id] : selectedIds.filter(selectedId => selectedId !== id);
    onSelectedIdsChange([...new Set(next)]);
  }

  function toggleAll(on) {
    const ids = on ? sorted.map(sprint => sprint.id) : [];
    onSelectedIdsChange(ids);
    if (onIncludeBacklogChange) onIncludeBacklogChange(on);
  }

  return (
    <div className="sprint-selector">
      <div className="sprint-selector-header">
        <div className="sprint-selector-header-text">
          <div className="config-title">Sprints auswählen</div>
          {helperText ? <p className="sprint-selector-hint">{helperText}</p> : null}
        </div>
        <div className="btn-row">
          {actions}
          {hideBulkSprintToggles ? null : (
            <>
              <button className="ghost" type="button" disabled={disabled} onClick={() => toggleAll(true)}>
                Alle
              </button>
              <button className="ghost" type="button" disabled={disabled} onClick={() => toggleAll(false)}>
                Keine
              </button>
            </>
          )}
          {primaryAction}
        </div>
      </div>
      <div className="sprint-list">
        {sorted.map(sprint => {
          const hasDates = sprint.startDate && sprint.endDate;
          const checked = boardScopeMode ? Boolean(hasDates) : selectedIds.includes(sprint.id);
          return (
            <label className={`sprint-item${boardScopeMode ? ' sprint-item-readonly' : ''}`} key={sprint.id}>
              <input
                type="checkbox"
                value={sprint.id}
                checked={checked}
                disabled={boardScopeMode || disabled}
                onChange={event => toggleSprint(sprint.id, event.target.checked)}
              />
              <span className="sprint-name">{sprint.name}</span>
              <span className="sprint-dates">{hasDates ? fmtRange(sprint.startDate, sprint.endDate) : 'keine Termine'}</span>
              <span className={`sprint-state state-${sprint.state}`}>{stateLabels[sprint.state] || sprint.state}</span>
            </label>
          );
        })}
        {onIncludeBacklogChange ? (
          <label className="sprint-item sprint-item-backlog">
            <input
              type="checkbox"
              checked={includeBacklog}
              disabled={disabled}
              onChange={event => onIncludeBacklogChange(event.target.checked)}
            />
            <span className="sprint-name">Backlog</span>
            <span className="sprint-dates">{requireDates ? '' : 'nicht geplant'}</span>
            <span className="sprint-state state-backlog">Backlog</span>
          </label>
        ) : null}
      </div>
    </div>
  );
}
