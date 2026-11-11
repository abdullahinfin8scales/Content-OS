// Serves dist/ like Netlify would: static files plus the rules in dist/_headers.
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2]);
const rules = [];
let current = null;
for (const line of fs.readFileSync(path.join(root, '_headers'), 'utf8').split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!line.startsWith(' ')) { current = { pattern: line.trim(), headers: {} }; rules.push(current); continue; }
  const i = line.indexOf(':');
  current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const match = (pattern, url) => pattern.endsWith('*') ? url.startsWith(pattern.slice(0, -1)) : url === pattern;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  const headers = { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' };
  for (const r of rules) if (match(r.pattern, url)) Object.assign(headers, r.headers);
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}).listen(4600, () => console.log('netlify sim on 4600'));
