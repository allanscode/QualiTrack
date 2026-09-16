import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const read = file => readFile(new URL(`../${file}`,import.meta.url),'utf8');
test('deployed CSP allows Turnstile and actual inline scripts without conflicting HTML policy',async () => {
  // Browsers normalize HTML CRLF to LF before hashing inline scripts.
  const html = (await read('index.html')).replace(/\r\n/g,'\n');
  const vercel = JSON.parse(await read('vercel.json'));
  const headers = Object.fromEntries(vercel.headers[0].headers.map(x => [x.key,x.value]));
  const csp = headers['Content-Security-Policy'];
  assert.doesNotMatch(html,/http-equiv=["']Content-Security-Policy/i);
  assert.doesNotMatch(html,/qualitrack\.com\.br/);
  assert.doesNotMatch(csp,/localhost|unsafe-inline.*script-src/);
  assert.match(csp,/script-src[^;]*https:\/\/challenges.cloudflare.com/);
  assert.match(csp,/frame-src[^;]*https:\/\/challenges.cloudflare.com/);
  assert.match(csp,/upgrade-insecure-requests/);
  assert.equal(headers['Cross-Origin-Opener-Policy'],'same-origin');
  assert.ok(headers['Permissions-Policy']);
  for (const [,attributes,content] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(attributes)) continue;
    assert.ok(csp.includes(`'sha256-${createHash('sha256').update(content).digest('base64')}'`),'Inline theme script hash must match deployed CSP');
  }
  const nginx = await read('nginx.conf');
  assert.ok(nginx.includes(csp));
  assert.match(nginx,/listen \$\{PORT\};/);
});
