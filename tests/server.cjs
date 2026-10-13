// Tiny static file server for the browser tests. It only ever serves files inside `root`:
// - listens on the loopback interface only (127.0.0.1), on a random free port
// - malformed percent-encoding or NUL bytes -> 400 (instead of crashing the process)
// - the resolved path must stay inside root, both as a path and after resolving symlinks,
//   so "../" tricks and similarly named sibling folders ("site-outside" next to "site") -> 404
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function createStaticServer(root) {
  const rootReal = fs.realpathSync(path.resolve(root));
  return http.createServer((req, res) => {
    const send = (code, text) => {
      res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(text);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'method not allowed');
    let urlPath;
    try {
      urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    } catch {
      return send(400, 'bad request');
    }
    if (urlPath.includes('\0')) return send(400, 'bad request');
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const file = path.resolve(rootReal, '.' + path.posix.normalize('/' + urlPath));
    if (!inside(rootReal, file)) return send(404, 'not found');
    fs.realpath(file, (err, real) => {
      if (err || !inside(rootReal, real)) return send(404, 'not found');
      fs.stat(real, (err2, st) => {
        if (err2 || !st.isFile()) return send(404, 'not found');
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(real).toLowerCase()] || 'application/octet-stream',
          'Content-Length': st.size,
          'Cache-Control': 'no-store',
        });
        if (req.method === 'HEAD') return res.end();
        const stream = fs.createReadStream(real);
        stream.on('error', () => res.destroy());
        stream.pipe(res);
      });
    });
  });
}

// Start a server for `root` on 127.0.0.1 and a free port; resolves to the http.Server.
function serve(root) {
  const server = createStaticServer(root);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { serve, createStaticServer };
