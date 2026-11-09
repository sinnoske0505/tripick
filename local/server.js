// 하나로 도는 서버: 화면 파일(public 폴더)과 API(api 폴더)를 함께 제공한다.
// 내 컴퓨터 테스트용이자, Render 같은 서비스에 올릴 때 쓰는 서버.
// 실행: npm run local  →  http://localhost:3000
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import identify from '../api/identify.js';
import pricetag from '../api/pricetag.js';
import info from '../api/info.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = process.env.PORT || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
};
const routes = { '/api/identify': identify, '/api/pricetag': pricetag, '/api/info': info };

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (routes[path]) return routes[path](req, res);

  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`TRIPICK 실행 중: http://localhost:${PORT}`));
