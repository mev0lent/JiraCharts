#!/usr/bin/env node
/**
 * Jira Charts proxy
 *
 * Usage:
 *   npm run build
 *   node proxy.js https://yourorg.atlassian.net [port]
 *
 * Opens Burndown at http://localhost:PORT  (default port: 7070)
 * API calls are proxied server-side, so the browser avoids CORS issues.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

let _fileConfig = {};
try {
  _fileConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'proxy.config.json'), 'utf8'));
} catch { /* no config file — rely on CLI args */ }

const JIRA = (process.argv[2] || _fileConfig.jiraUrl || '').replace(/\/$/, '');
const PORT = parseInt(process.argv[3] || String(_fileConfig.port ?? 7070), 10);

if (!JIRA) {
  console.error('Usage: node proxy.js https://yourorg.atlassian.net [port]');
  console.error('       or set "jiraUrl" in proxy.config.json');
  process.exit(1);
}

const HERE = __dirname;
const DIST = path.join(HERE, 'dist');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    ...CORS,
    'Content-Length': payload.length,
    ...headers,
  });
  res.end(payload);
}

function sendConfig(res) {
  const runtimeConfig = { jiraBase: JIRA };
  if (_fileConfig.theme) runtimeConfig.theme = _fileConfig.theme;
  const body = `window.__JIRA_CONFIG__ = ${JSON.stringify(runtimeConfig)};`;
  send(res, 200, body, { 'Content-Type': 'text/javascript; charset=utf-8' });
}

function sendIndex(res) {
  const filePath = path.join(DIST, 'index.html');
  if (!fs.existsSync(filePath)) {
    send(
      res,
      500,
      'dist/index.html not found. Run "npm run build" before starting proxy.js.',
      { 'Content-Type': 'text/plain; charset=utf-8' },
    );
    return;
  }
  send(res, 200, fs.readFileSync(filePath), { 'Content-Type': TYPES['.html'] });
}

function sendStatic(reqPath, res) {
  const decodedPath = decodeURIComponent(reqPath);
  const normalized = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(DIST, normalized);

  if (!filePath.startsWith(DIST)) {
    send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
    return true;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  const ext = path.extname(filePath);
  send(res, 200, fs.readFileSync(filePath), {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
  });
  return true;
}

function proxyJira(req, res) {
  const target = new url.URL(JIRA + req.url);
  const options = {
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: target.pathname + (target.search || ''),
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; jira-charts-proxy/1.0)',
      Accept: 'application/json',
    },
  };

  if (req.headers.authorization) {
    options.headers.Authorization = req.headers.authorization;
  }

  const lib = target.protocol === 'https:' ? https : http;
  const proxyReq = lib.request(options, proxyRes => {
    const chunks = [];
    proxyRes.on('data', chunk => chunks.push(chunk));
    proxyRes.on('end', () => {
      const body = Buffer.concat(chunks);
      res.writeHead(proxyRes.statusCode, {
        ...CORS,
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      });
      res.end(body);
    });
  });

  proxyReq.on('error', error => {
    send(res, 502, JSON.stringify({ error: String(error) }), {
      'Content-Type': 'application/json; charset=utf-8',
    });
  });

  proxyReq.end();
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  const reqPath = url.parse(req.url).pathname;

  if (reqPath === '/config.js') {
    sendConfig(res);
    return;
  }

  if (reqPath.startsWith('/rest/')) {
    proxyJira(req, res);
    return;
  }

  if (reqPath === '/' || reqPath === '/burndown.html') {
    sendIndex(res);
    return;
  }

  if (sendStatic(reqPath, res)) {
    return;
  }

  send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
});

console.log('Jira Charts proxy');
console.log(`  Jira:     ${JIRA}`);
console.log(`  Burndown: http://localhost:${PORT}`);
console.log('  Ctrl+C to stop\n');

server.listen(PORT, () => {});

process.on('SIGINT', () => {
  console.log('\nStopped.');
  process.exit(0);
});
