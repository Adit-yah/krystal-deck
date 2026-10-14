import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'out');

const routeFiles = [
  path.join(rootDir, 'src', 'app', 'api', 'music-search', 'route.js'),
  path.join(rootDir, 'src', 'app', 'api', 'media-resolve', 'route.js'),
];

const movedRoutes = [];

try {
  // Temporarily rename route.js -> _route.server.js during static export (`output: 'export'`)
  // because GitHub Pages serves static files and `clientMusicApi.js` handles search/resolve directly in the browser.
  // Renaming individual files avoids Windows directory-lock EPERM issues.
  for (const filePath of routeFiles) {
    if (fs.existsSync(filePath)) {
      const tempPath = path.join(path.dirname(filePath), '_route.server.js');
      fs.renameSync(filePath, tempPath);
      movedRoutes.push({ from: tempPath, to: filePath });
    }
  }

  console.log('Building static export for GitHub Pages...');
  execSync('npx next build', {
    stdio: 'inherit',
    env: {
      ...process.env,
      STATIC_EXPORT: 'true',
    },
  });

  if (fs.existsSync(outDir)) {
    fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
    console.log('✓ Created out/.nojekyll for GitHub Pages.');
  }
} finally {
  for (const item of movedRoutes) {
    if (fs.existsSync(item.from)) {
      fs.renameSync(item.from, item.to);
    }
  }
}
