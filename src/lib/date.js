export function fmtDate(iso) {
  if (!iso) return '?';
  return new Date(iso).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' });
}

export function fmtRange(start, end) {
  return `${fmtDate(start)} bis ${fmtDate(end)}`;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function atMidnight(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysBetween(a, b) {
  const days = [];
  const cur = atMidnight(a);
  const end = atMidnight(b);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function isWeekday(d) {
  return d.getDay() !== 0 && d.getDay() !== 6;
}

export function isExcluded(d, excludedRanges) {
  if (!excludedRanges?.length) return false;
  const ts = atMidnight(d).getTime();
  return excludedRanges.some(({ from, to }) => {
    if (!from || !to) return false;
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    return ts >= new Date(fy, fm - 1, fd).getTime() && ts <= new Date(ty, tm - 1, td).getTime();
  });
}

export function addWorkdays(date, n) {
  const d = new Date(date);
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isWeekday(d)) remaining -= 1;
  }
  return d;
}
