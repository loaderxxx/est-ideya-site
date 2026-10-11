'use strict';

/**
 * Генерация растровых изображений (og.png 1200×630, favicon.png 512×512)
 * из HTML/SVG-шаблонов с помощью локально установленного Chromium-браузера
 * в headless-режиме. Только встроенные модули Node.js, без npm-зависимостей.
 *
 * Запуск:  node scripts/generate-images.js
 * Браузер: переменная BROWSER_PATH или автоматический поиск Edge/Chrome/Chromium.
 *
 * Результаты коммитятся в репозиторий, поэтому на сервере скрипт не нужен.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

const CANDIDATES = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ],
};

function findBrowser() {
  if (process.env.BROWSER_PATH && fs.existsSync(process.env.BROWSER_PATH)) return process.env.BROWSER_PATH;
  const list = CANDIDATES[process.platform] || [];
  return list.find((p) => fs.existsSync(p)) || null;
}

function render(browser, htmlFile, outFile, width, height) {
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'est-ideya-shot-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    '--force-device-scale-factor=1',
    `--user-data-dir=${tmpProfile}`,
    `--window-size=${width},${height}`,
    `--screenshot=${outFile}`,
    pathToFileURL(htmlFile).href,
  ];
  execFileSync(browser, args, { stdio: 'ignore', timeout: 60000 });
  fs.rmSync(tmpProfile, { recursive: true, force: true });
  const size = fs.statSync(outFile).size;
  console.log(`✓ ${path.relative(ROOT, outFile)} (${width}×${height}, ${(size / 1024).toFixed(1)} KB)`);
}

function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error('Браузер Chromium/Edge не найден. Укажите путь в переменной BROWSER_PATH.');
    process.exit(1);
  }
  console.log(`Браузер: ${browser}`);
  render(browser, path.join(__dirname, 'og-template.html'), path.join(PUBLIC, 'og.png'), 1200, 630);
  render(browser, path.join(__dirname, 'favicon-template.html'), path.join(PUBLIC, 'favicon.png'), 512, 512);
}

main();
