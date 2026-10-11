'use strict';

/**
 * Проверка контента на запрещённые формулировки.
 * Правила описаны в README (раздел «Правила контента»); сами запрещённые
 * строки собраны здесь из фрагментов, чтобы не повторять их в документации.
 *
 * Запуск: node scripts/check-content.js   → код выхода 1, если что-то найдено.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'screenshots', 'tmp']);
const SKIP_FILES = new Set([path.basename(__filename)]);
const TEXT_EXT = new Set(['.html', '.css', '.js', '.json', '.md', '.txt', '.xml', '.svg', '.example']);

// Шаблоны собираются из частей, чтобы файл сам не содержал запрещённых строк целиком.
const P = [
  ['Yes', 'Idea'].join(''),
  ['Yes', ' ', 'Idea'].join(''),
  ['Yes', ' ', 'Идея'].join(''),
  ['Есть', 'Идея'].join(''),
  ['MVP', ' ', 'Studio'].join(''),
  'ООО',
  'ИНН',
  'ОГРН',
  '₽',
  'руб',
  'гарантир',
  'лучший',
  'революц',
  'безриск',
  'лидер рынка',
  ['La', ' ', 'Villa'].join(''),
  'Юность',
  ['Твой', ' ', 'Новый'].join(''),
  ['CRM', ' ', 'v2'].join(''),
  ['Personal', ' ', 'OS'].join(''),
  'Милюкин',
  'Milyukin',
  ['yes-idea', '.ru'].join(''),
];

const regex = new RegExp(P.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (TEXT_EXT.has(path.extname(entry.name)) || entry.name.startsWith('.env')) {
      if (!SKIP_FILES.has(entry.name)) out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const files = walk(ROOT, []);
let hits = 0;
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const m = line.match(regex);
    if (m) {
      hits += 1;
      console.log(`${path.relative(ROOT, file)}:${i + 1}: «${m[0]}» → ${line.trim().slice(0, 120)}`);
    }
  });
}

if (hits) {
  console.error(`\nНайдено совпадений: ${hits}`);
  process.exit(1);
}
console.log(`Проверено файлов: ${files.length}. Запрещённых формулировок не найдено.`);
