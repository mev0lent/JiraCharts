# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # Vite dev server at http://localhost:5173
npm run build        # build to dist/
npm run preview      # preview the production build
node proxy.js        # start the production HTTP proxy at http://localhost:7070
```

No test or lint commands exist in this project.

For development without the proxy, set `jiraBase` in `public/config.js` to point at a running proxy, or allow CORS from localhost in Jira.

## Architecture overview

JiraCharts is a Jira Cloud visualization tool — two separate SPAs sharing the same source tree. The UI is entirely German (`de-DE` locale throughout). No TypeScript, no test framework, no linting.

| Entry | HTML | Purpose |
|-------|------|---------|
| `src/main.jsx` | `index.html` | Sprint burndown charts (main app) |
| `src/main-backlog.jsx` | `backlog.html` | Backlog canvas view |

**`proxy.js`** is a Node.js HTTP server (no framework) that:
- Proxies Jira REST API calls to bypass CORS (routes `GET /rest/*` to Jira)
- Serves `dist/` as static files
- Injects runtime config from `proxy.config.json` as `window.__JIRA_CONFIG__` via `/config.js`
- Accepts CLI overrides: `node proxy.js <jiraUrl> <port>`

## Source layout

```
src/
  pages/
    BurndownPage.jsx    # Main orchestrator: state, fetching, metrics computation (~900 lines)
    BurndownChart.jsx   # Chart.js line chart (ideal vs actual SP)
    BacklogPage.jsx     # Backlog orchestrator (~216 lines)
    BacklogCanvas.jsx   # Kanban card grid grouped by status (~303 lines)
  components/
    AppHeader.jsx       # Title bar with UpdateChecker + nav links
    JiraConfigForm.jsx  # Credentials form (proxy-aware)
    SprintSelector.jsx  # Sprint list with checkboxes/radios and bulk actions
    BurndownMetrics.jsx # KPI cards: progress bar, throughput, forecast
    BoardMetrics.jsx    # Doughnut chart + cumulative sprint progress chart
    StatusMessage.jsx   # Inline error/info banner
    Legend.jsx          # Colored dot legend
    UpdateChecker.jsx   # GitHub Releases version badge
  lib/
    jira.js             # All Jira REST API calls (paginated)
    issues.js           # Issue data transforms (story points, status category, completion date)
    date.js             # Date math (workday filtering, formatting)
    runtime.js          # Reads window.__JIRA_CONFIG__, exposes ON_PROXY flag
    screenshot.js       # PNG export via html-to-image with font embedding
    theme.js            # CSS variable reader, font detection
    updates.js          # GitHub Release version comparison logic
  styles/
    app.css             # All component styles, CSS variables (~800 lines)
    burndown-colors.scss # SCSS theme variable definitions
public/
  config.js             # Dev-mode runtime config (sets window.__JIRA_CONFIG__)
  theme-apply.js        # Client-side CSS variable loader (runs before React)
```

## State management

Pages own all state (`useState` / `useMemo`) and pass everything down as props. No context, no global store, no custom hooks. Credentials and preferences are persisted to `localStorage` (all keys prefixed `bd_`).

### localStorage keys

```
bd_jiraUrl, bd_email, bd_token, bd_boardId, bd_projectKey  # config
bd_saveToken        # boolean: whether to cache the API token
bd_burndownScope    # 'selection' | 'board'
bd_skipWeekends     # boolean
bd_burndownProjectEnd  # ISO date string or ''
bd_showScopeSizeLine   # boolean (board scope chart)
jiraCharts:update-check:<REPO>  # update check result (4h TTL)
```

## Data flow

1. `runtime.js` reads `window.__JIRA_CONFIG__` → sets `ON_PROXY` and `jiraBase`
2. `jira.js` calls Jira using HTTP Basic auth (`btoa(email:token)`), paginates at 50 items
3. Story points: `customfield_10016` preferred, falls back to `customfield_10004`
4. `issues.js` enriches raw issues → tagged issues with `sp`, `cat`, `doneDate`
5. `BurndownPage` computes burndown state (for Chart.js) and metrics model (for KPI cards)
6. Chart.js renders charts; `BurndownMetrics` / `BoardMetrics` display KPIs

## Key data structures

### Raw issue (from Jira API)
```javascript
{
  key: 'PAC-123',
  fields: {
    summary: string,
    status: { name: string, statusCategory: { key: 'todo' | 'indeterminate' | 'done' } },
    customfield_10016: number | null,   // story points (preferred)
    customfield_10004: number | null,   // story points (fallback)
    statuscategorychangedate: ISO8601,
    resolutiondate: ISO8601 | null,
    priority: { name: 'Highest'|'High'|'Medium'|'Low'|'Lowest'|'Trivial' },
    assignee: { displayName: string } | null,
    created: ISO8601
  }
}
```

### Tagged issue (enriched, internal)
```javascript
{
  ...rawIssue,          // all Jira fields preserved
  sp: number,           // story points (defaults to 1 if null)
  cat: 'done' | 'progress' | 'todo',
  _sprint: sprintObject | null,
  doneDate: Date | null
}
```

### Sprint (from Jira Agile API)
```javascript
{ id: number, name: string, state: 'active'|'future'|'closed', startDate: ISO8601, endDate: ISO8601 }
```

### Burndown state (for BurndownChart)
```javascript
{
  labels: string[],       // formatted date strings for x-axis
  ideal: number[],        // remaining SP per day on ideal line
  actual: number[],       // remaining SP per day (null for future days)
  boundaries: [{ idx: number, name: string }]  // sprint boundary markers
}
```

### Metrics model (for BurndownMetrics / BoardMetrics)
```javascript
{
  totalSP: string, completedSP: string, remainingSP: string,
  totalIssues: number, completedIssues: number, inProgressIssues: number, todoIssues: number,
  percent: number,                 // 0–100
  scope: 'board' | 'selection',
  throughput: {
    value: string,                 // e.g. "2.1 SP/Tag"
    rate: number | null,
    targetRate: number | null,
    deltaLabel: string,            // e.g. "+0.5 SP/Tag vs Soll"
    detail: string                 // e.g. "3 Arbeitstage vergangen"
  },
  forecast: {
    value: string,                 // e.g. "15. Jan" or "Erledigt"
    note: string,                  // e.g. "Im Zeitplan"
    tone: 'good' | 'risk' | 'neutral',
    bufferLabel: string            // e.g. "5 Arbeitstage Puffer"
  },
  sprintCumulative: [{ name: string, cumCompleted: number, scopeSize: number }],
  showScopeSizeLine: boolean
}
```

## Pages in detail

### BurndownPage (`src/pages/BurndownPage.jsx`)
The main page. Two distinct scope modes controlled by `burndownScope` state:

- **`'selection'` scope**: User picks specific sprints. Shows `BurndownChart` with sprint boundaries, `BurndownMetrics` (progress bar + throughput + forecast), and a sorted issue list table. Lazy-loads subtasks on demand via JQL.
- **`'board'` scope**: Fetches all dated sprints + backlog. Shows `BoardMetrics` (doughnut chart + cumulative line chart). No sprint boundaries or individual issue table.

Key internal functions:
- `loadBoard()` — fetches board ID via `getBoardId(projectKey)`, then all sprints
- `viewSelected()` — fetches issues for selected sprints, tags them, calls both build functions
- `buildBurndownState()` — computes `labels`, `ideal[]`, `actual[]`, `boundaries[]` for Chart.js
- `buildBurndownMetricsModel()` — computes throughput rate, forecast date, percent complete
- `exportScreenshot()` — orchestrates PNG export (metrics panel, chart, or canvas)

Two view modes for the metrics panel (`kennzahlenView`):
- `'zwischenstand'` — progress bar + Gesamtumfang + Restarbeit only
- `'sprintende'` — adds throughput rate bars and forecast panels

### BacklogPage (`src/pages/BacklogPage.jsx`)
Simplified page. Fetches backlog issues via `getBacklogIssues()`, passes them to `BacklogCanvas`. Supports subtask loading and multi-page PNG export.

### BacklogCanvas (`src/pages/BacklogCanvas.jsx`)
Groups issues by `status.name`, paginates at 12 cards per page (4 per row). Each status group is paginated independently. Export creates one PNG per page per status group, named `jira-backlog-vorgaenge-<status>-seite-<n>.png`.

## Components in detail

### JiraConfigForm
Proxy-aware: when `ON_PROXY` is true the Jira URL field is hidden (proxy already knows the URL). Exposes a "Token speichern" checkbox to opt into localStorage persistence.

### SprintSelector
Sorts sprints: active → future → closed, then by date descending within each group. Supports `singleSelect` mode (radio buttons) and `boardScopeMode` (read-only display). Backlog shown as a separate row at the bottom.

### BurndownMetrics
Renders a `MetricPanel` + `RateBar` for each KPI. Which panels are visible depends on the `view` prop (`'zwischenstand'` vs `'sprintende'`). `captureRef` and `progressCaptureRef` are used for targeted PNG export.

### BoardMetrics
Manages two Chart.js instances (doughnut + line) in `useEffect`. The line chart optionally shows a scope-size trend line controlled by `model.showScopeSizeLine`.

### UpdateChecker
Fetches GitHub Releases API on mount, caches for 4 hours. Shows a colored dot: green = current, orange = update available, gray = unavailable. Provides a manual refresh button.

## Jira API calls (`src/lib/jira.js`)

| Function | Endpoint | Notes |
|----------|----------|-------|
| `getBoardId(projectKey, config)` | `GET /rest/agile/1.0/board?projectKeyOrId={key}` | Returns first board ID |
| `fetchAllSprints(boardId, config)` | `GET /rest/agile/1.0/board/{id}/sprint` | Paginated, sorted by startDate desc |
| `getSprintIssues(boardId, sprintId, config, fields)` | `GET /rest/agile/1.0/board/{id}/sprint/{sprintId}/issue` | Paginated at 50 |
| `getBacklogIssues(boardId, config, fields)` | `GET /rest/agile/1.0/board/{id}/backlog` | Paginated at 50 |
| `searchIssues(jql, config, fields)` | `GET /rest/api/3/search/jql` | Uses nextPageToken pagination |

Field lists used:
- Sprint issues: `summary,status,statuscategorychangedate,customfield_10016,customfield_10004,resolutiondate,issuetype,priority,assignee,created`
- Backlog canvas: `summary,status,customfield_10016,customfield_10004,priority,assignee,issuetype`

## Theming

Four base theme keys drive the default visual theme:

| Key | Role |
|----------|------|
| `brand` | Primary brand colour and derived chart defaults |
| `paper` | Background surfaces |
| `ink` | Primary text |
| `earth` | Muted text, borders, derived supporting colours |

Set via `theme` key in `proxy.config.json` (production) or `public/config.js` (dev). `theme-apply.js` applies them to `:root` before React mounts. Supported fonts: `manrope`, `space-grotesk`, `fraunces`, `bricolage`. `theme-builder.html` is a live preview tool (open with `npm run dev`).

Optional override keys: `accent`, `accent2`, `chartActual`, `chartIdeal`, `chartScopeSize`, `todo`, `progress`, `done`. These map to CSS variables including `--accent`, `--accent2`, `--chart-ideal`, `--chart-actual`, `--chart-actual-fill`, `--chart-scope-size`, `--todo`, `--progress`, and `--done`.

## PNG export (`src/lib/screenshot.js`)

- Uses `html-to-image` (`toCanvas()`)
- Elements marked `[data-screenshot-exclude]` are hidden during capture
- Chart.js canvases are snapshotted to data URLs first (Chart.js clears them during DOM serialization)
- Google Fonts are fetched and inlined as base64 data URLs (cached in memory for 4 hours)
- Output is 3× pixel ratio by default, padded by 32px
- Triggered by "Exportieren" buttons in `BurndownPage` and `BacklogPage`

## proxy.config.json structure

```json
{
  "jiraUrl": "https://your-org.atlassian.net",
  "port": 7070,
  "theme": {
    "font": "space-grotesk",
    "brand": "#7491F1",
    "paper": "#FFF",
    "ink": "#100e0e",
    "earth": "#4f63a5"
  }
}
```
