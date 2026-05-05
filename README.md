# JiraCharts

Sprint burndown charts and backlog visualisations for Jira Cloud.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- A Jira Cloud account with an [API token](https://id.atlassian.com/manage-profile/security/api-tokens)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Build the app

```bash
npm run build
```

This creates `dist/`, which is generated output and is intentionally ignored by Git.

### 3. Configure your Jira URL

Edit `proxy.config.json` and replace the placeholder with your organisation's Jira URL:

```json
{
  "jiraUrl": "https://yourorg.atlassian.net",
  "port": 7070
}
```

### 4. Start the proxy server

```bash
node proxy.js
```

The app opens at **http://localhost:7070**.

The proxy forwards Jira API calls server-side, so the browser never hits CORS issues.

### 5. Enter your credentials in the app

| Field | What to enter |
|-------|--------------|
| E-Mail | Your Jira account email |
| API-Token | Your Jira API token (see link below) |
| Projektschlüssel | Check screenshot |

Get an API token at:
**https://id.atlassian.com/manage-profile/security/api-tokens**

Check **"Token speichern"** next to the token field if you want it remembered across page reloads.

<img width="151" height="177" alt="image" src="https://github.com/user-attachments/assets/7496708d-5131-4400-a828-807765733e7b" />

"SCRUM" would be your Projektschlüssel

---

## Creating a custom theme

Use `theme-builder.html` to preview fonts and colours against the JiraCharts UI before applying them.

1. Start the dev server:

```bash
npm run dev
```

2. Open **http://localhost:5173/theme-builder.html**.
3. Pick a font pairing and adjust the four base colours:

| Token | Controls |
|-------|----------|
| `brand` | Primary chart line, highlights, active states |
| `paper` | Main surfaces and cards |
| `ink` | Primary text |
| `earth` | Muted text, borders, supporting chart colours |

4. Click **Copy to clipboard**.
5. Add those generated values as a `theme` property in `proxy.config.json`. Because `proxy.config.json` is JSON, quote the `theme` key as shown below.

Example:

```json
{
  "jiraUrl": "https://yourorg.atlassian.net",
  "port": 7070,
  "theme": {
    "font": "space-grotesk",
    "brand": "#8095ef",
    "paper": "#fffdf2",
    "ink": "#100e0e",
    "earth": "#6171b6"
  }
}
```

Restart `node proxy.js` after changing `proxy.config.json`.

For Vite development without the proxy, put the same object in `public/config.js` instead:

```js
window.__JIRA_CONFIG__ = {
  ...(window.__JIRA_CONFIG__ || {}),
  theme: {
    font: "space-grotesk",
    brand: "#8095ef",
    paper: "#fffdf2",
    ink: "#100e0e",
    earth: "#6171b6"
  }
};
```

Supported font values are `manrope`, `space-grotesk`, `fraunces`, and `bricolage`.

---

## Running multiple instances / overriding the config

CLI arguments always take precedence over `proxy.config.json`:

```bash
node proxy.js https://otherorg.atlassian.net 8080
```

This lets you run separate instances for different Jira organisations on different ports without touching the config file.

---

## Development

```bash
npm run dev
```

Starts the Vite dev server at **http://localhost:5173**.  
In dev mode the app talks directly to Jira (CORS must be allowed), or you can point it at a running proxy by setting `jiraBase` in `public/config.js`.

---

## Update checks

The app checks GitHub Releases for updates from the shared header. Publish user-facing updates as GitHub Releases in this repository:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The tag version should match the `version` in `package.json`. The checker compares the running app version with the latest release tag, so normal code pushes to `main` do not trigger update notices.
