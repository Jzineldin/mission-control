#!/usr/bin/env node
'use strict';
/**
 * ensure-build.js — Checks that the frontend has been built.
 * If frontend/dist/index.html is missing, runs "npm run build" first.
 * Called automatically by "npm start".
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distIndex = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');

if (!fs.existsSync(distIndex)) {
  console.log('[ensure-build] Frontend not built yet — running build...');
  try {
    execSync('npm run build', {
      cwd: path.join(__dirname, '..', 'frontend'),
      stdio: 'inherit',
    });
    console.log('[ensure-build] Build complete.');
  } catch (e) {
    console.error('[ensure-build] Build failed:', e.message);
    process.exit(1);
  }
}
