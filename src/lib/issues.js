export function storyPoints(issue) {
  const fields = issue.fields || {};
  return fields.customfield_10016 ?? fields.customfield_10004 ?? null;
}

export function statusCategory(issue) {
  const key = issue.fields?.status?.statusCategory?.key;
  return key === 'done' ? 'done' : key === 'indeterminate' ? 'progress' : 'todo';
}

export function statusClass(cat) {
  return cat === 'done' ? 'status-done' : cat === 'progress' ? 'status-progress' : 'status-todo';
}

export function completionDate(issue) {
  const fields = issue.fields || {};
  const value = fields.statuscategorychangedate || fields.resolutiondate;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}
