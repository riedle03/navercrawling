/**
 * server.js — 로컬 개발용 프록시 서버
 * 네이버 API CORS 우회 + 바른 API 프록시
 *
 * 실행: node server.js
 * 접속: http://localhost:3000
 */
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// .env 파일 로드 (선택)
try {
  const env = fs.readFileSync('.env', 'utf8');
  env.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val && !key.startsWith('#')) {
      process.env[key.trim()] = val.trim();
    }
  });
} catch (_) { /* .env 없으면 무시 */ }

const PORT = process.env.PORT || 3000;

// MIME 타입
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  const parsed  = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ── /api/naver 프록시 ─────────────────────────
  if (pathname === '/api/naver') {
    const clientId     = req.headers['x-naver-client-id']     || process.env.NAVER_CLIENT_ID     || '';
    const clientSecret = req.headers['x-naver-client-secret'] || process.env.NAVER_CLIENT_SECRET || '';

    if (!clientId || !clientSecret) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '네이버 API 키가 없습니다.' }));
    }

    const { query, display = '100', start = '1', sort = 'sim' } = parsed.query;
    if (!query) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '검색어(query)가 필요합니다.' }));
    }

    const naverPath = `/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&start=${start}&sort=${sort}`;

    const options = {
      hostname: 'openapi.naver.com',
      path:     naverPath,
      method:   'GET',
      headers: {
        'X-Naver-Client-Id':     clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    };

    const proxy = https.request(options, apiRes => {
      const chunks = [];
      apiRes.on('data', chunk => { chunks.push(chunk); });
      apiRes.on('end', () => {
        // Buffer.concat 후 utf8 디코딩 — 청크 경계 UTF-8 깨짐 방지
        const body = Buffer.concat(chunks).toString('utf8');
        res.writeHead(apiRes.statusCode, {
          'Content-Type':                'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(body);
      });
    });

    proxy.on('error', err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '네이버 API 호출 실패', detail: err.message }));
    });

    return proxy.end();
  }

  // ── /api/bareun/tokenize 프록시 ───────────────
  if (pathname === '/api/bareun/tokenize' && req.method === 'POST') {
    const reqChunks = [];
    req.on('data', chunk => { reqChunks.push(chunk); });
    req.on('end', () => {
      const body = Buffer.concat(reqChunks).toString('utf8');
      const options = {
        hostname: 'api.bareun.ai',
        path:     '/v1/tokenize',
        method:   'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key':      req.headers['api-key'] || '',
        },
      };

      const proxy = https.request(options, apiRes => {
        const chunks = [];
        apiRes.on('data', chunk => { chunks.push(chunk); });
        apiRes.on('end', () => {
          const resp = Buffer.concat(chunks).toString('utf8');
          res.writeHead(apiRes.statusCode, {
            'Content-Type':                'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(resp);
        });
      });

      proxy.on('error', err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '바른 API 호출 실패', detail: err.message }));
      });

      proxy.write(body);
      proxy.end();
    });
    return;
  }

  // ── OPTIONS preflight ─────────────────────────
  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }

  // ── 정적 파일 서빙 ────────────────────────────
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'text/plain',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ 슬기로운 말글마이너: 네이버 뉴스편 개발 서버`);
  console.log(`   http://localhost:${PORT}\n`);
});
