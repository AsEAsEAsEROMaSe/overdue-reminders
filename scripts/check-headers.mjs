// Звіряє JSDoc-шапки файлів src/ і test/ з реальними import.
// Запуск: node scripts/check-headers.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';

const FOLDERS = ['src', 'test'];

// Усі .ts файли в src/ і test/, шляхи від кореня проєкту
function listFiles() {
  const files = [];
  for (const folder of FOLDERS) {
    for (const name of readdirSync(folder)) {
      if (name.endsWith('.ts')) {
        files.push(folder + '/' + name);
      }
    }
  }
  return files;
}

// Перетворює відносний шлях з файлу на шлях від кореня
function resolveFrom(file, link) {
  const joined = join(dirname(file), link);
  const normalized = normalize(joined);
  const parts = normalized.split('\\');
  return parts.join('/');
}

// Локальні import файлу (лише відносні, зовнішні пакети пропускаємо)
function readImports(file, text) {
  const result = [];
  const pattern = /^import\s[^;]*?from\s+'([^']+)'/gm;
  let match = pattern.exec(text);
  while (match !== null) {
    const target = match[1];
    if (target.startsWith('.')) {
      const resolved = resolveFrom(file, target);
      if (!result.includes(resolved)) {
        result.push(resolved);
      }
    }
    match = pattern.exec(text);
  }
  return result;
}

// Посилання зі шапки, окремо для «Головний» і «Нижчі»
function readHeader(file, text) {
  const header = { upper: [], lower: [], ok: false };
  const end = text.indexOf('*/');
  if (!text.startsWith('/**')) {
    return header;
  }
  if (end === -1) {
    return header;
  }
  const headerText = text.slice(0, end);
  const lines = headerText.split('\n');
  let section = '';
  for (const line of lines) {
    if (line.includes('Головний')) {
      section = 'upper';
    }
    if (line.includes('Нижчі')) {
      section = 'lower';
    }
    const match = /@see \{@link ([^}]+)\}/.exec(line);
    if (match !== null) {
      const resolved = resolveFrom(file, match[1]);
      if (section === 'upper') {
        header.upper.push(resolved);
      }
      if (section === 'lower') {
        header.lower.push(resolved);
      }
    }
  }
  if (headerText.includes('@file')) {
    if (headerText.includes('@module')) {
      header.ok = true;
    }
  }
  return header;
}

function sameSet(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (const item of a) {
    if (!b.includes(item)) {
      return false;
    }
  }
  return true;
}

const files = listFiles();
const imports = {};
const headers = {};
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  imports[file] = readImports(file, text);
  headers[file] = readHeader(file, text);
}

let errors = 0;
for (const file of files) {
  const expectedLower = imports[file];
  const expectedUpper = [];
  for (const other of files) {
    if (imports[other].includes(file)) {
      expectedUpper.push(other);
    }
  }
  const header = headers[file];
  const problems = [];
  if (!header.ok) {
    problems.push('немає @file або @module');
  }
  if (!sameSet(header.lower, expectedLower)) {
    problems.push('Нижчі: у шапці [' + header.lower.join(', ') + '], в import [' + expectedLower.join(', ') + ']');
  }
  if (!sameSet(header.upper, expectedUpper)) {
    problems.push('Головний: у шапці [' + header.upper.join(', ') + '], імпортують [' + expectedUpper.join(', ') + ']');
  }
  if (problems.length === 0) {
    console.log('OK    ' + file + '  головних ' + expectedUpper.length + ', нижчих ' + expectedLower.length);
  } else {
    errors = errors + 1;
    console.log('ПОМИЛКА ' + file);
    for (const problem of problems) {
      console.log('        ' + problem);
    }
  }
}
if (errors === 0) {
  console.log('Усі шапки збігаються з import');
} else {
  console.log('Файлів з розбіжностями: ' + errors);
  process.exitCode = 1;
}
