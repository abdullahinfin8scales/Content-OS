// Run: start `npm run dev:cloud` (port 5174), then `node scripts/e2e-sync.cjs`.
// Needs the Supabase access token saved for api.supabase.com (see CLAUDE.md).
// Creates throwaway e2e accounts in the real project and always deletes them.
// End-to-end: accounts + cloud sync against the real Supabase project, using
// throwaway accounts e2e-<run>-*@example.com that are deleted at the end.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');

const APP = 'http://localhost:5174/';
const REF = 'hflykhxvnrcuuxsvoffg';
const OUT = require('os').tmpdir() + '/content-os-e2e-';
const RUN = Date.now().toString(36);
const PASSWORD = 'e2e-' + Math.random().toString(36).slice(2) + '-Pw!';
const A = `e2e-${RUN}-a@example.com`;
const B = `e2e-${RUN}-b@example.com`;
const C = `e2e-${RUN}-c@example.com`;
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);

function sql(query) {
  const out = execFileSync('curl', ['-sS', '--max-time', '60', '-X', 'POST', `https://api.supabase.com/v1/projects/${REF}/database/query`, '-H', 'Content-Type: application/json', '--data-binary', JSON.stringify({ query })], { encoding: 'utf8' });
  return JSON.parse(out);
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
function serverRows(email) {
  return sql(`select r.kind, r.id, r.deleted, r.data->>'title' as title, r.data->>'name' as name from public.records r join auth.users u on u.id = r.user_id where u.email = ${lit(email)} order by r.kind, r.id`);
}
function cleanup() {
  return sql(`with gone as (delete from auth.users where email like ${lit(`e2e-${RUN}-%@example.com`)} returning id) select count(*)::int as users from gone`);
}

async function local(page, table) {
  return page.evaluate(
    (t) =>
      new Promise((res) => {
        const r = indexedDB.open('infin8-content-os');
        r.onsuccess = () => {
          const db = r.result;
          if (![...db.objectStoreNames].includes(t)) return res([]);
          const q = db.transaction(t, 'readonly').objectStore(t).getAll();
          q.onsuccess = () => {
            res(q.result);
            db.close();
          };
        };
        r.onerror = () => res([]);
      }),
    table,
  );
}

async function waitSynced(page, label) {
  // Synced = no waiting changes and the sidebar says so.
  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll('aside button')].find((b) => /^Synced/.test(b.textContent.trim()));
      return !!btn;
    },
    null,
    { timeout: 30000 },
  );
  const pending = (await local(page, 'outbox')).length;
  if (pending) throw new Error(`${label}: ${pending} changes still waiting`);
}

async function signUp(page, email) {
  await page.goto(APP);
  await page.waitForSelector('#auth-email', { timeout: 30000 });
  await page.click('button:has-text("Create an account")');
  await page.waitForSelector('text=Create your account');
  await page.fill('#auth-email', email);
  await page.fill('#auth-password', PASSWORD);
  await page.click('button:has-text("Create account")');
}

async function signIn(page, email) {
  await page.goto(APP);
  await page.waitForSelector('#auth-email', { timeout: 30000 });
  await page.fill('#auth-email', email);
  await page.fill('#auth-password', PASSWORD);
  await page.click('form button[type=submit]');
}

async function openSettings(page) {
  await page.click('aside button:has-text("Settings")');
  await page.waitForSelector('text=Cloud sync');
}

(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } });
  const errors = [];
  const watch = (page, name) => {
    page.on('pageerror', (e) => errors.push(`[${name} pageerror] ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`[${name} console] ${m.text()}`);
    });
  };
  try {
    // ---------------------------------------------------------- 1. sign up
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const a = await ctxA.newPage();
    watch(a, 'A');
    await signUp(a, A);
    await a.waitForSelector('text=Create your first space', { timeout: 30000 });
    check('New account starts with its own empty workspace', true);

    await a.fill('#first-space-name', 'E2E space');
    await a.press('#first-space-name', 'Enter');
    await a.waitForSelector('aside >> text="E2E space"');
    await a.keyboard.press('n');
    await a.click('[role=option]:has-text("Blank document")');
    await a.click('button:has-text("Create")');
    await a.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Title');
    await a.keyboard.type('Synced post');
    await a.keyboard.press('Enter');
    await a.keyboard.type('Hello from laptop A.');
    await a.waitForSelector('text=Saved on this device');
    await waitSynced(a, 'A after writing');
    const docId = decodeURIComponent(a.url().match(/#doc-(.+)$/)[1]);
    let rows = serverRows(A);
    check('Writes reach the cloud', rows.some((r) => r.kind === 'doc' && r.title === 'Synced post') && rows.some((r) => r.kind === 'content' && r.id === docId) && rows.some((r) => r.kind === 'space'), JSON.stringify(rows.map((r) => r.kind)));
    await a.screenshot({ path: OUT + 'e2e-a-synced.png' });

    // ------------------------------------------------- 2. second laptop
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const b = await ctxB.newPage();
    watch(b, 'B');
    await signIn(b, A);
    await b.waitForSelector('aside >> text="Synced post"', { timeout: 30000 });
    await b.click('aside >> text="Synced post"');
    await b.waitForSelector('.ProseMirror');
    await b.waitForTimeout(500);
    const bodyB = await b.locator('.ProseMirror').textContent();
    check('Second laptop downloads the post', bodyB.includes('Hello from laptop A.'), JSON.stringify(bodyB));

    // ------------------------------------------- 3. edit on B, pull on A
    await b.click('[aria-label="Title"]');
    await b.keyboard.press('End');
    await b.keyboard.type(' (edited on B)');
    await b.waitForTimeout(1200);
    await waitSynced(b, 'B after editing');
    await openSettings(a);
    await a.click('button:has-text("Sync now")');
    await a.keyboard.press('Escape');
    await a.waitForSelector('aside >> text="Synced post (edited on B)"', { timeout: 30000 });
    check('Edit on one laptop shows up on the other', true);

    // ---------------------------------------------- 4. offline on A
    await ctxA.setOffline(true);
    await a.evaluate(() => (location.hash = '#library'));
    await a.waitForTimeout(300);
    await a.hover('aside a[href^="#space-"]');
    await a.click('aside [role=treeitem]:has-text("E2E space") >> button[aria-label="Add"] >> nth=0');
    await a.click('[role=menuitem]:has-text("New folder")');
    await a.waitForSelector('aside input[aria-label=Name]');
    await a.fill('aside input[aria-label=Name]', 'Made offline');
    await a.keyboard.press('Enter');
    await a.waitForFunction(() => [...document.querySelectorAll('aside button')].some((b) => /Offline/.test(b.textContent)), null, { timeout: 30000 });
    const offlineLabel = await a.evaluate(() => [...document.querySelectorAll('aside button')].map((b) => b.textContent.trim()).find((t) => /Offline/.test(t)));
    check('Offline: changes wait on this laptop', /change/.test(offlineLabel), offlineLabel);
    await a.waitForTimeout(600); // let the colour transition finish (mistake 015)
    await a.screenshot({ path: OUT + 'e2e-a-offline.png' });
    await ctxA.setOffline(false);
    await waitSynced(a, 'A back online');
    rows = serverRows(A);
    check('Back online: offline changes upload', rows.some((r) => r.kind === 'folder' && r.name === 'Made offline'));

    // --------------------------------------------- 5. delete for good
    await a.locator(`aside a[href="#doc-${encodeURIComponent(docId)}"]`).click({ button: 'right' });
    await a.click('[role=menuitem]:has-text("Delete")');
    await a.waitForTimeout(500);
    await a.evaluate(() => (location.hash = '#trash'));
    await a.waitForSelector('button:has-text("Empty trash")', { timeout: 10000 });
    await a.click('button:has-text("Empty trash")');
    await a.click('button:has-text("Delete permanently")');
    await a.waitForTimeout(800);
    await waitSynced(a, 'A after emptying trash');
    rows = serverRows(A);
    check('Permanent delete is sent as a deletion', rows.filter((r) => r.id === docId).every((r) => r.deleted === true) && rows.some((r) => r.id === docId), JSON.stringify(rows.filter((r) => r.id === docId)));
    await openSettings(b);
    await b.click('button:has-text("Sync now")');
    await b.keyboard.press('Escape');
    await b.waitForFunction((id) => !document.querySelector(`aside a[href="#doc-${encodeURIComponent(id)}"]`), docId, { timeout: 30000 });
    const bDocs = await local(b, 'docs');
    check('The other laptop removes it too', !bDocs.some((d) => d.id === docId), `docs left: ${bDocs.length}`);

    // ------------------------------------------ 6. another account
    const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const c = await ctxC.newPage();
    watch(c, 'C');
    await signUp(c, B);
    await c.waitForSelector('text=Create your first space', { timeout: 30000 });
    check('A second account sees none of the first one’s posts', (await c.locator('aside >> text="E2E space"').count()) === 0);
    const isolation = sql(`select count(*)::int as n from public.records r join auth.users u on u.id = r.user_id where u.email = ${lit(B)}`);
    check('Second account has no rows of its own yet', isolation[0].n === 0, JSON.stringify(isolation));
    // Try to read the first account's rows directly with the second account's session.
    const leak = await c.evaluate(async ({ ref }) => {
      const raw = JSON.parse(localStorage.getItem('infin8-content-os-auth'));
      const res = await fetch(`https://${ref}.supabase.co/rest/v1/records?select=kind,id`, {
        headers: { apikey: 'sb_publishable_cNtPuRzHmNhH8q63tw5GmQ_tRi7J6kW', Authorization: `Bearer ${raw.access_token}` },
      });
      return { status: res.status, rows: (await res.json()).length };
    }, { ref: REF });
    check('Row-level security: reading the table directly returns only your own rows', leak.status === 200 && leak.rows === 0, JSON.stringify(leak));
    const anon = await c.evaluate(async ({ ref }) => {
      const res = await fetch(`https://${ref}.supabase.co/rest/v1/records?select=kind,id`, { headers: { apikey: 'sb_publishable_cNtPuRzHmNhH8q63tw5GmQ_tRi7J6kW' } });
      return { status: res.status, body: (await res.text()).slice(0, 120) };
    }, { ref: REF });
    check('Signed-out requests are refused', anon.status === 401 || anon.status === 403 || anon.body === '[]', JSON.stringify(anon));

    // ----------------------------------- 7. sign out clears this laptop
    await openSettings(a);
    await a.click('button:has-text("Sign out")');
    await a.waitForSelector('#auth-email', { timeout: 30000 });
    const leftDocs = (await local(a, 'docs')).length + (await local(a, 'spaces')).length + (await local(a, 'outbox')).length;
    check('Sign out removes the laptop copy', leftDocs === 0, `records left: ${leftDocs}`);
    rows = serverRows(A);
    check('Sign out leaves the cloud copy alone', rows.some((r) => r.kind === 'space' && !r.deleted) && rows.some((r) => r.kind === 'folder' && r.name === 'Made offline'));
    await signIn(a, A);
    await a.waitForSelector('aside >> text="E2E space"', { timeout: 30000 });
    check('Signing back in brings everything back', (await a.locator('aside >> text="Made offline"').count()) === 1);

    // ------------------------ 8. posts written before accounts are kept
    const ctxD = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const d = await ctxD.newPage();
    watch(d, 'D');
    await d.goto(APP + 'robots.txt');
    await d.evaluate(
      () =>
        new Promise((res, rej) => {
          const r = indexedDB.open('infin8-content-os', 30); // the version live before accounts
          r.onupgradeneeded = () => {
            const db = r.result;
            db.createObjectStore('spaces', { keyPath: 'id' });
            const f = db.createObjectStore('folders', { keyPath: 'id' });
            f.createIndex('spaceId', 'spaceId');
            f.createIndex('parentId', 'parentId');
            const dd = db.createObjectStore('docs', { keyPath: 'id' });
            dd.createIndex('spaceId', 'spaceId');
            dd.createIndex('folderId', 'folderId');
            dd.createIndex('updatedAt', 'updatedAt');
            db.createObjectStore('contents', { keyPath: 'id' });
            db.createObjectStore('texts', { keyPath: 'id' });
            db.createObjectStore('meta', { keyPath: 'key' });
            db.createObjectStore('platforms', { keyPath: 'id' });
          };
          r.onsuccess = () => {
            const db = r.result;
            const now = Date.now();
            const tx = db.transaction(['spaces', 'docs', 'contents', 'texts'], 'readwrite');
            tx.objectStore('spaces').put({ id: 'oldspace1', name: 'Written before accounts', icon: 'sparkles', color: 'white', order: 0, createdAt: now, updatedAt: now, deletedAt: null, trashRootId: null });
            tx.objectStore('docs').put({ id: 'olddoc1', spaceId: 'oldspace1', folderId: null, kind: 'content', title: 'My old post', excerpt: 'Old words', status: 'posted', platforms: ['instagram'], tags: [], publishDate: '2026-10-01', publishTime: null, postUrl: '', metrics: {}, pinned: false, font: 'sans', wordCount: 2, charCount: 9, createdAt: now, updatedAt: now, deletedAt: null, trashRootId: null });
            tx.objectStore('contents').put({ id: 'olddoc1', json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old words' }] }] } });
            tx.objectStore('texts').put({ id: 'olddoc1', text: 'Old words' });
            tx.oncomplete = () => {
              db.close();
              res();
            };
            tx.onerror = () => rej(tx.error);
          };
          r.onerror = () => rej(r.error);
        }),
    );
    await signUp(d, C);
    await d.waitForSelector('aside >> text="My old post"', { timeout: 30000 });
    await waitSynced(d, 'D after claiming');
    rows = serverRows(C);
    check('Posts written before accounts upload on first sign-in', rows.some((r) => r.kind === 'doc' && r.title === 'My old post') && rows.some((r) => r.kind === 'content' && r.id === 'olddoc1') && rows.some((r) => r.kind === 'space' && r.name === 'Written before accounts'), JSON.stringify(rows.map((r) => r.kind + ':' + r.id)));
    await d.screenshot({ path: OUT + 'e2e-d-claimed.png' });

    await openSettings(d);
    await d.waitForTimeout(600);
    const scrolled = await d.evaluate(() => document.querySelector('[role=dialog] .overflow-y-auto, [role=dialog] [class*=overflow]')?.scrollTop ?? -1);
    check('Settings opens at the top, Account visible', (await d.locator('text="Signed in"').isVisible()) && scrolled <= 0, `scrollTop=${scrolled}`);
    await d.screenshot({ path: OUT + 'e2e-settings-account.png' });
  } catch (err) {
    results.push('ERROR ' + err.message.split('\n')[0]);
  } finally {
    try {
      const removed = cleanup();
      results.push(`CLEANUP removed test accounts: ${JSON.stringify(removed)}`);
      const left = sql(`select (select count(*)::int from auth.users where email like 'e2e-%') as e2e_users, (select count(*)::int from public.records r where not exists (select 1 from auth.users u where u.id = r.user_id)) as orphan_rows`);
      results.push(`CLEANUP check: ${JSON.stringify(left)}`);
    } catch (e) {
      results.push('CLEANUP FAILED ' + e.message);
    }
    console.log(results.join('\n'));
    console.log(errors.length ? 'Page errors:\n' + errors.slice(0, 15).join('\n') : 'No page errors');
    await browser.close();
  }
})();
