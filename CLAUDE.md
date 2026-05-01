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

## Architecture

JiraCharts is a Jira Cloud visualization tool with two separate single-page apps sharing the same source tree:

| Entry | HTML | Purpose |
|-------|------|---------|
| `src/main.jsx` | `index.html` | Sprint burndown charts |
| `src/main-backlog.jsx` | `backlog.html` | Backlog canvas view |

**`proxy.js`** is a Node.js HTTP server (no framework) that:
- Forwards all Jira REST API calls server-side to avoid CORS
- Serves `dist/` as static files
- Injects runtime config from `proxy.config.json` as `window.__JIRA_CONFIG__` via `/config.js`
- Accepts CLI overrides: `node proxy.js <jiraUrl> <port>`

### Source layout

```
src/
  pages/      # Page-level components: state ownership, data fetching orchestration
  components/ # Presentational React components
  lib/        # Pure logic modules (no React)
    jira.js       # All Jira REST API calls (paginated, uses proxy or direct)
    issues.js     # Issue data transformations and burndown calculations
    date.js       # Date math (workday filtering, ISO normalization)
    runtime.js    # Reads window.__JIRA_CONFIG__, determines API base URL
    screenshot.js # PNG export via html-to-image
  styles/     # SCSS with CSS variable theming
```

Pages own all state (React `useState`/`useMemo`) and pass data down as props — no context or global store. Credentials and user preferences are persisted to `localStorage` (keys prefixed `bd_`).

### Data flow

1. `runtime.js` reads `window.__JIRA_CONFIG__` to determine the API base URL (proxy or direct Jira)
2. `jira.js` functions fetch from that base using Basic auth (email + API token) with 50-item pagination
3. Story points are read from `customfield_10016` (falls back to `customfield_10004`)
4. Issue data flows into `issues.js` for burndown/metrics calculations
5. Chart.js renders the burndown line chart; `BurndownMetrics`/`BoardMetrics` display KPIs

### Theming

Four CSS variables (`--brand`, `--paper`, `--ink`, `--earth`) drive the entire visual theme. They can be set via the `theme` key in `proxy.config.json` or `public/config.js`. `theme-builder.html` (open via `npm run dev`) is a live preview tool for building themes. Supported fonts: `manrope`, `space-grotesk`, `fraunces`, `bricolage`.
