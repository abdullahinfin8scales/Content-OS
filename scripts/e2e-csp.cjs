// Run: `npm run build`, then `node scripts/netlify-sim.cjs dist` (port 4600), then
// `node scripts/e2e-csp.cjs`. Checks sign-up and sync under the live site's headers.
// Production build + the live site's security headers: sign-up and sync must work
// with no Content-Security-Policy violations. Throwaway account, deleted after.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');

const APP = 'http://localhost:4600/';
const REF = 'hflykhxvnrcuuxsvoffg';
const RUN = Date.now().toString(36);
const EMAIL = `e2e-${RUN}-csp@example.com`;
const PASSWORD = 'e2e-' + Math.random().toString(36).slice(2) + '-Pw!';
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
const sql = (query) =>
  JSON.parse(execFileSync('curl', ['-sS', '--max-time', '60', '-X', 'POST', `https://api.supabase.com/v1/projects/${REF}/database/query`, '-H', 'Content-Type: application/json', '--data-binary', JSON.stringify({ query })], { encoding: 'utf8' }));

(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const violations = [];
  const errors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to/i.test(t)) violations.push(t);
    else if (m.type() === 'error' && !/Failed to load resource/.test(t)) errors.push(t);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const res = await page.goto(APP);
    const csp = (await res.headers())['content-security-policy'] ?? '';
    check('Served with the CSP that allows the Supabase project', csp.includes(`connect-src 'self' https://${REF}.supabase.co`), csp.match(/connect-src[^;]*/)?.[0]);
    await page.waitForSelector('#auth-email', { timeout: 30000 });
    await page.click('button:has-text("Create an account")');
    await page.fill('#auth-email', EMAIL);
    await page.fill('#auth-password', PASSWORD);
    await page.click('button:has-text("Create account")');
    await page.waitForSelector('text=Create your first space', { timeout: 30000 });
    await page.fill('#first-space-name', 'CSP check');
    await page.press('#first-space-name', 'Enter');
    await page.waitForSelector('aside >> text="CSP check"');
    await page.waitForFunction(() => [...document.querySelectorAll('aside button')].some((b) => /^Synced/.test(b.textContent.trim())), null, { timeout: 30000 });
    const rows = sql(`select r.kind from public.records r join auth.users u on u.id = r.user_id where u.email = '${EMAIL}'`);
    check('Production build signs up and syncs under the CSP', rows.some((r) => r.kind === 'space'), JSON.stringify(rows));
    check('No CSP violations', violations.length === 0, violations.slice(0, 3).join(' | '));
  } catch (err) {
    results.push('ERROR ' + err.message.split('\n')[0]);
  } finally {
    results.push('CLEANUP ' + JSON.stringify(sql(`with gone as (delete from auth.users where email like 'e2e-${RUN}-%@example.com' returning id) select count(*)::int as users from gone`)));
    console.log(results.join('\n'));
    console.log(errors.length ? 'Page errors:\n' + errors.slice(0, 10).join('\n') : 'No page errors');
    await browser.close();
  }
})();
