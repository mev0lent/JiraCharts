export const runtimeConfig = window.__JIRA_CONFIG__ || {};
export const JIRA_BASE = (runtimeConfig.jiraBase || '').replace(/\/$/, '');
export const ON_PROXY = Boolean(JIRA_BASE);
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0';
export const APP_COMMIT = import.meta.env.VITE_APP_COMMIT || 'unknown';
export const GITHUB_REPOSITORY = import.meta.env.VITE_GITHUB_REPOSITORY || 'Niclassslua/JiraCharts';

export const SKIP_WEEKENDS_KEY = 'bd_skipWeekends';
export const BURNDOWN_SCOPE_KEY = 'bd_burndownScope';
export const BURNDOWN_PROJECT_END_KEY = 'bd_burndownProjectEnd';
export const BURNDOWN_SCOPE_SIZE_KEY = 'bd_showScopeSizeLine';
export const EXCLUDED_RANGES_KEY = 'bd_excludedRanges';
export const SMOOTH_BURNDOWN_KEY = 'bd_smoothBurndown';

export function readStorage(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures so the charts still work in restricted browsers.
  }
}

export function readBooleanStorage(key, fallback) {
  const value = readStorage(key, null);
  return value === null ? fallback : value === '1';
}

export function writeBooleanStorage(key, value) {
  writeStorage(key, value ? '1' : '0');
}
