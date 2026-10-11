'use strict';

/**
 * Минимальный HTTP-сервер сайта «Есть идея».
 *
 * - раздаёт статику из ./public с корректными MIME-типами и кэш-заголовками;
 * - GET /config.js  — runtime-конфигурация контактов из переменных окружения;
 * - GET /healthz    — проверка живости для платформы;
 * - GET /robots.txt и /sitemap.xml — генерируются с учётом SITE_URL;
 * - в HTML подставляет SITE_URL в canonical / Open Graph.
 *
 * Зависимостей нет — только встроенные модули Node.js.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- конфигурация из окружения ----------

function cleanString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function cleanUrl(value, allowedProtocols) {
  const raw = cleanString(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!allowedProtocols.includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function cleanEmail(value) {
  const raw = cleanString(value);
  // намеренно простая проверка: один символ @, без пробелов и угловых скобок
  if (!raw || /[\s<>]/.test(raw) || raw.split('@').length !== 2) return '';
  return raw;
}

function cleanSiteUrl(value) {
  const url = cleanUrl(value, ['https:', 'http:']);
  if (!url) return '';
  // без завершающего слэша, без пути/query
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

function readConfig() {
  return {
    contactEmail: cleanEmail(process.env.CONTACT_EMAIL),
    contactTelegramUrl: cleanUrl(process.env.CONTACT_TELEGRAM_URL, ['https:', 'tg:']),
    formEndpoint: cleanUrl(process.env.FORM_ENDPOINT, ['https:', 'http:']),
    siteUrl: cleanSiteUrl(process.env.SITE_URL),
  };
}

// Конфигурация читается при старте; Railway перезапускает процесс при смене переменных.
const CONFIG = readConfig();

// ---------- MIME и кэш ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function cacheControlFor(ext) {
  switch (ext) {
    case '.html':
      return 'no-cache';
    case '.woff2':
    case '.woff':
    case '.png':
    case '.svg':
    case '.ico':
    case '.webp':
    case '.jpg':
    case '.jpeg':
      return 'public, max-age=31536000, immutable';
    case '.css':
    case '.js':
      // имена файлов без хэша — всегда ревалидируем (дёшево: 304 по Last-Modified)
      return 'no-cache';
    default:
      return 'public, max-age=3600';
  }
}

// ---------- заголовки безопасности ----------

function securityHeaders() {
  const connectSrc = ["'self'"];
  if (CONFIG.formEndpoint) {
    try {
      connectSrc.push(new URL(CONFIG.formEndpoint).origin);
    } catch {
      /* проигнорировано: endpoint уже провалидирован */
    }
  }
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
  ].join('; ');

  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

// ---------- ответы ----------

function send(res, status, body, headers) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  res.writeHead(status, {
    'Content-Length': buffer.length,
    ...securityHeaders(),
    ...headers,
  });
  res.end(buffer);
}

function sendText(res, status, text) {
  send(res, status, text, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}

function renderHtml(source) {
  const token = /__SITE_URL__/g;
  if (CONFIG.siteUrl) {
    return source.replace(token, CONFIG.siteUrl);
  }
  // Без SITE_URL: убираем теги, которым нужен абсолютный адрес (canonical, og:url),
  // остальные ссылки делаем относительными.
  return source
    .split('\n')
    .filter((line) => !(/__SITE_URL__/.test(line) && /(rel="canonical"|property="og:url")/.test(line)))
    .join('\n')
    .replace(token, '');
}

function configScript() {
  const payload = {
    CONTACT_EMAIL: CONFIG.contactEmail || null,
    CONTACT_TELEGRAM_URL: CONFIG.contactTelegramUrl || null,
    FORM_ENDPOINT: CONFIG.formEndpoint || null,
    SITE_URL: CONFIG.siteUrl || null,
  };
  // </script не может появиться: значения провалидированы как URL/e-mail, но экранируем на всякий случай
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `window.SITE_CONFIG = Object.freeze(${json});\n`;
}

function robotsTxt() {
  const lines = ['User-agent: *', 'Allow: /'];
  if (CONFIG.siteUrl) lines.push('', `Sitemap: ${CONFIG.siteUrl}/sitemap.xml`);
  return lines.join('\n') + '\n';
}

function sitemapXml() {
  const base = CONFIG.siteUrl || '';
  const today = new Date().toISOString().slice(0, 10);
  const pages = [
    { loc: `${base}/`, priority: '1.0' },
    { loc: `${base}/privacy.html`, priority: '0.2' },
  ];
  const urls = pages
    .map(
      (p) =>
        `  <url>\n    <loc>${p.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${p.priority}</priority>\n  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// ---------- статика ----------

function resolvePublicPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  let relative = decoded.replace(/^\/+/, '');
  if (relative === '') relative = 'index.html';
  const absolute = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!absolute.startsWith(PUBLIC_DIR + path.sep) && absolute !== PUBLIC_DIR) return null;
  return absolute;
}

function serveStatic(req, res, urlPath) {
  const filePath = resolvePublicPath(urlPath);
  if (!filePath) return sendText(res, 400, 'Некорректный путь');

  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      // чистые адреса без расширения: /privacy → /privacy.html
      if (!statErr && stat.isDirectory()) {
        return serveStatic(req, res, urlPath.replace(/\/?$/, '/index.html'));
      }
      if (!path.extname(filePath)) {
        return fs.stat(`${filePath}.html`, (err2, stat2) => {
          if (err2 || !stat2.isFile()) return notFound(req, res);
          return streamFile(req, res, `${filePath}.html`, stat2);
        });
      }
      return notFound(req, res);
    }
    return streamFile(req, res, filePath, stat);
  });
}

function streamFile(req, res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'Cache-Control': cacheControlFor(ext),
    'Last-Modified': stat.mtime.toUTCString(),
  };

  if (ext === '.html') {
    return fs.readFile(filePath, 'utf8', (err, source) => {
      if (err) return sendText(res, 500, 'Ошибка чтения файла');
      const html = renderHtml(source);
      if (req.method === 'HEAD') {
        res.writeHead(200, { ...securityHeaders(), ...headers });
        return res.end();
      }
      return send(res, 200, html, headers);
    });
  }

  if (req.headers['if-modified-since']) {
    const since = Date.parse(req.headers['if-modified-since']);
    if (!Number.isNaN(since) && Math.floor(stat.mtimeMs / 1000) * 1000 <= since) {
      res.writeHead(304, { ...securityHeaders(), 'Cache-Control': headers['Cache-Control'] });
      return res.end();
    }
  }

  res.writeHead(200, { ...securityHeaders(), ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) sendText(res, 500, 'Ошибка чтения файла');
    else res.destroy();
  });
  return stream.pipe(res);
}

function notFound(req, res) {
  const page = path.join(PUBLIC_DIR, '404.html');
  fs.readFile(page, 'utf8', (err, source) => {
    if (err) return sendText(res, 404, 'Страница не найдена');
    return send(res, 404, renderHtml(source), {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
  });
}

// ---------- маршрутизация ----------

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Метод не поддерживается', {
      'Content-Type': 'text/plain; charset=utf-8',
      Allow: 'GET, HEAD',
    });
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  switch (pathname) {
    case '/healthz':
      return send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    case '/config.js':
      return send(res, 200, configScript(), {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      });
    case '/robots.txt':
      return send(res, 200, robotsTxt(), { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    case '/sitemap.xml':
      return send(res, 200, sitemapXml(), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    default:
      return serveStatic(req, res, pathname);
  }
});

server.listen(PORT, HOST, () => {
  const summary = {
    port: PORT,
    siteUrl: CONFIG.siteUrl || '(не задан)',
    contactEmail: CONFIG.contactEmail ? 'задан' : 'не задан',
    contactTelegramUrl: CONFIG.contactTelegramUrl ? 'задан' : 'не задан',
    formEndpoint: CONFIG.formEndpoint ? 'задан' : 'не задан',
  };
  console.log(`«Есть идея» — сервер запущен на http://${HOST}:${PORT}`);
  console.log(JSON.stringify(summary));
});

function shutdown(signal) {
  console.log(`Получен ${signal}, завершаем работу…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
