#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const patterns = ['localStorage', 'window.storageService'];
const excludeDirs = [
  'node_modules',
  'docs',
  '.git',
  'tests',
  'migrations',
  '.github',
  'data', // allow data/StorageService.js to use localStorage
  'tools' // don't scan tools/ (scanner itself contains patterns)
];

function walk(dir) {
  const res = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (excludeDirs.includes(e.name)) continue;
      res.push(...walk(full));
    } else if (e.isFile()) {
      if (!full.endsWith('.js') && !full.endsWith('.ts')) continue;
      res.push(full);
    }
  }
  return res;
}

function main() {
  const files = walk(root);
  const issues = [];
  const regex = new RegExp(patterns.join('|'), 'g');
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\\\/g, '/');
    try {
      const txt = fs.readFileSync(f, 'utf8');
      let m;
      const lines = txt.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // ignore lines that are single-line comments
        if (trimmed.startsWith('//')) continue;
        if (regex.test(line)) {
          issues.push({ file: rel, line: i + 1, text: trimmed });
        }
      }
    } catch (e) {
      console.error('Failed to read', f, e.message);
    }
  }

  if (issues.length) {
    console.error('Direct storage access detected (forbidden patterns:', patterns.join(', '), ')');
    for (const it of issues) {
      console.error(`${it.file}:L${it.line}: ${it.text}`);
    }
    process.exit(1);
  }

  console.log('No direct storage access found.');
  process.exit(0);
}

main();
