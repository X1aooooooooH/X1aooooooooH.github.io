#!/usr/bin/env node
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.cjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.wasm':'application/wasm', '.bin':'application/octet-stream',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon',
  '.ttf':'font/ttf', '.woff':'font/woff', '.woff2':'font/woff2', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8'
};
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400); return res.end('Bad URL'); }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const target = path.resolve(root, '.' + pathname);
  if (target !== root && !target.startsWith(root + path.sep)) {
    res.writeHead(403, {'Content-Type':'text/plain; charset=utf-8'}); return res.end('Forbidden');
  }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store'}); return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size, 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  });
});
function listen(port) {
  server.once('error', error => {
    if (error.code === 'EADDRINUSE' && port < 18820) return listen(port + 1);
    console.error('BlockFlow 本地服务启动失败：', error.message); process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    const address = `http://127.0.0.1:${port}/`;
    console.log('BlockFlow 本地工作台已启动：' + address);
    console.log('保持此窗口开启；关闭窗口即可停止服务。');
  });
}
listen(Number(process.env.BLOCKFLOW_PORT) || 18765);
