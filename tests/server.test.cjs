// Regression checks for the test server (tests/server.cjs), using throwaway folders only:
// a root "site" and a similarly named sibling "site-outside" holding a marker file.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { serve } = require('./server.cjs');

let failures = 0;
function check(cond, msg) {
  console.log(`${cond === true ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond !== true) failures++;
}

function get(port, rawPath) {
  // Send the path exactly as written (no client-side normalisation of ../ or %2e).
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    });
    req.on('error', (e) => resolve({ status: 0, error: e.code }));
    req.end();
  });
}

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pirates-server-test-'));
  const site = path.join(base, 'site');
  const outside = path.join(base, 'site-outside');
  fs.mkdirSync(path.join(site, 'src'), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(site, 'index.html'), '<!doctype html><title>ok</title>');
  fs.writeFileSync(path.join(site, 'src', 'a.js'), 'export const a = 1;');
  fs.writeFileSync(path.join(outside, 'marker.txt'), 'DISPOSABLE-MARKER');
  let symlinked = false;
  try {
    fs.symlinkSync(path.join(outside, 'marker.txt'), path.join(site, 'link.txt'));
    symlinked = true;
  } catch {
    // Symlinks may be unavailable (e.g. Windows without privileges); that case is skipped.
  }

  const server = await serve(site);
  const { address, port } = server.address();
  try {
    check(address === '127.0.0.1', `listens on loopback only (${address})`);

    const root = await get(port, '/');
    check(root.status === 200 && /text\/html/.test(root.type) && /ok/.test(root.body), `/ serves index.html (${root.status}, ${root.type})`);
    const js = await get(port, '/src/a.js');
    check(js.status === 200 && /javascript/.test(js.type), `module files keep their MIME type (${js.type})`);

    for (const p of [
      '/%2e%2e%2fsite-outside%2fmarker.txt',
      '/../site-outside/marker.txt',
      '/%2e%2e/site-outside/marker.txt',
      '/src/..%2f..%2fsite-outside%2fmarker.txt',
      '/..%5csite-outside%5cmarker.txt',
    ]) {
      const r = await get(port, p);
      check(r.status === 404 && !/DISPOSABLE-MARKER/.test(r.body || ''), `sibling folder is not reachable via ${p} (${r.status})`);
    }
    if (symlinked) {
      const r = await get(port, '/link.txt');
      check(r.status === 404 && !/DISPOSABLE-MARKER/.test(r.body || ''), `a symlink pointing outside the root is refused (${r.status})`);
    } else {
      console.log('SKIP  symlink containment (symlinks unavailable here)');
    }

    const bad = await get(port, '/%');
    check(bad.status === 400, `malformed percent-encoding gets 400 (${bad.status})`);
    const nul = await get(port, '/index.html%00.js');
    check(nul.status === 400, `NUL byte gets 400 (${nul.status})`);
    const after = await get(port, '/index.html');
    check(after.status === 200, 'server keeps serving after bad requests');
    const missing = await get(port, '/nope.js');
    check(missing.status === 404, `missing files get 404 (${missing.status})`);
    const dir = await get(port, '/src');
    check(dir.status === 404, `directories are not listed (${dir.status})`);
  } finally {
    server.close();
    fs.rmSync(base, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} server check(s) failed` : '\nAll server checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
