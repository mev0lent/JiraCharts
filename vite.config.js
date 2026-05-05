import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

function gitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version || '0.0.0'),
    'import.meta.env.VITE_APP_COMMIT': JSON.stringify(gitCommit()),
    'import.meta.env.VITE_GITHUB_REPOSITORY': JSON.stringify('Niclassslua/JiraCharts'),
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        backlog: 'backlog.html',
      },
    },
  },
});
