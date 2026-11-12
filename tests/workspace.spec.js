import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const origin = 'http://127.0.0.1:4173';
const ownerPassword = 'e2e-private-workspace-password';
let csrf;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const { bootstrapToken } = JSON.parse(await fs.readFile('.tmp/e2e.json', 'utf8'));
  const response = await context.request.post(`${origin}/api/auth/bootstrap`, {
    headers: { Origin: origin },
    data: { password: ownerPassword, bootstrapToken }
  });
  expect(response.ok()).toBeTruthy();
  await context.storageState({ path: '.tmp/auth.json' });
  csrf = (await response.json()).csrf;
  await context.close();
});
test.use({ storageState: '.tmp/auth.json' });
test('desktop: files persist, authenticated native download supports Range, notes save and conflict, secrets hide', async ({
  page,
  context
}) => {
  await page.addInitScript(() => localStorage.setItem('vault-last-module', 'files'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Recent', exact: true })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: 'Files', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
  const file = {
    name: 'range-fixture.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello private vault')
  };
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'range-fixture.txt', exact: true })).toBeVisible();
  const files = await (await context.request.get('/api/files')).json();
  const item = files.items.find((f) => f.name === file.name);
  const ranged = await context.request.get(`/api/files/${item.id}/download`, {
    headers: { Range: 'bytes=0-4' }
  });
  expect(ranged.status()).toBe(206);
  expect(await ranged.text()).toBe('hello');
  expect(ranged.headers()['content-range']).toBe('bytes 0-4/19');
  expect((await context.request.get(`/_private_objects/${item.id}`)).status()).toBe(404);
  await page.getByRole('button', { name: 'range-fixture.txt', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '文件详情' })).toBeVisible();
  await page.getByRole('button', { name: '安全预览' }).click();
  await expect(page.locator('.file-preview')).toContainText('hello private vault');
  await page.getByRole('button', { name: '关闭详情' }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: '新建笔记', exact: true }).click();
  await page.getByRole('textbox', { name: '笔记标题' }).fill('Runtime notes');
  await page.locator('.cm-content').fill('# Hello Vault\nPrivate note');
  await expect(page.locator('.save-state')).toHaveText('Saved');
  const notes = await (await context.request.get('/api/notes')).json();
  const note = notes.items.find((n) => n.title === 'Runtime notes');
  expect(note).toBeTruthy();
  await page.getByText('预览', { exact: true }).click();
  await expect(page.locator('.markdown-preview h1')).toHaveText('Hello Vault');
  await page.getByText('编辑', { exact: true }).click();
  const version = (await (await context.request.get(`/api/notes/${note.id}`)).json()).version;
  expect(
    (
      await context.request.put(`/api/notes/${note.id}`, {
        headers: { Origin: origin, 'x-csrf-token': csrf },
        data: {
          title: 'Runtime notes',
          language: 'markdown',
          content: 'other tab version',
          version
        }
      })
    ).ok()
  ).toBeTruthy();
  await page.locator('.cm-content').fill('my conflicting draft');
  await expect(page.locator('.note-save-error')).toBeVisible();
  await expect(page.getByRole('button', { name: '另存副本' })).toBeVisible();
  await page.getByRole('button', { name: '另存副本' }).click();
  await expect(page.getByText('已另存为新笔记')).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: 'Secrets', exact: true }).click();
  await page.getByRole('button', { name: '添加密钥', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('Production API');
  await page.getByLabel('API Key', { exact: true }).fill('super-private-test-key');
  await page.getByRole('button', { name: '加密保存' }).click();
  await expect(page.getByText('密钥已加密保存')).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('super-private-test-key');
  const secretCalls = [];
  page.on('request', (req) => {
    if (/\/api\/secrets\/\d+$/.test(req.url())) secretCalls.push(req.url());
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '关闭详情' }).click();
  await page.getByRole('button', { name: '复制 Production API 的API Key', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('super-private-test-key');
  await expect(page.getByRole('complementary', { name: '密钥详情' })).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('super-private-test-key');
  expect(secretCalls.length).toBe(1);
  secretCalls.length = 0;
  await page.getByRole('button', { name: '查看 Production API', exact: true }).click();
  await expect(page.locator('.secret-locked')).toBeVisible();
  expect(secretCalls.length).toBe(0);
  await page.evaluate(() => navigator.clipboard.writeText('before-copy'));
  await page
    .locator('.secret-locked')
    .getByRole('button', { name: '复制API Key', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('super-private-test-key');
  await expect(page.locator('.secret-locked')).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('super-private-test-key');
  await page.getByRole('button', { name: '显示内容', exact: true }).click();
  await expect(
    page.locator('.secret-field pre').filter({ hasText: 'super-private-test-key' })
  ).toBeVisible();
  await page.getByRole('button', { name: '立即隐藏' }).click();
  await expect(page.getByText('super-private-test-key', { exact: true })).toHaveCount(0);
  await page.clock.install();
  await page.getByRole('button', { name: '显示内容', exact: true }).click();
  await expect(
    page.locator('.secret-field pre').filter({ hasText: 'super-private-test-key' })
  ).toBeVisible();
  await page.clock.fastForward(31000);
  await expect(page.getByText('super-private-test-key', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: 'artifacts/vault-desktop.png',
    fullPage: true,
    animations: 'disabled'
  });
});
test('mobile: files, notes and secrets remain usable without horizontal overflow', async ({
  page,
  context
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/files');
  await page.locator('.mobile-tabbar').getByRole('button', { name: 'Files' }).click();
  await expect(page.getByRole('button', { name: 'range-fixture.txt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'range-fixture.txt', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '文件详情' })).toBeVisible();
  await page.getByRole('button', { name: '关闭详情' }).click();
  await page.locator('.mobile-tabbar').getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('button', { name: '新建笔记', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '笔记标题' })).toBeVisible();
  await page.locator('.cm-content').fill('mobile note');
  await expect(page.locator('.save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: '返回笔记列表' }).click();
  await page.locator('.mobile-tabbar').getByRole('button', { name: 'Secrets' }).click();
  await page.getByRole('button', { name: '查看 Production API', exact: true }).click();
  await expect(page.getByRole('button', { name: '显示内容' })).toBeVisible();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page
    .locator('.secret-locked')
    .getByRole('button', { name: '复制API Key', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('super-private-test-key');
  expect(await page.locator('body').innerText()).not.toContain('super-private-test-key');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  ).toBeTruthy();
  await page.screenshot({
    path: 'artifacts/vault-mobile.png',
    fullPage: true,
    animations: 'disabled'
  });
});
test('file detail race, responsive widths and private object access', async ({
  page,
  browser,
  context
}) => {
  await page.goto('/#/files');
  await expect(page.getByRole('button', { name: 'range-fixture.txt', exact: true })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'second-fixture.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('second')
  });
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const files = (await (await context.request.get('/api/files')).json()).items;
  const first = files.find((f) => f.name === 'range-fixture.txt');
  const second = files.find((f) => f.name === 'second-fixture.txt');
  await page.route(`**/api/files/${first.id}`, async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole('button', { name: first.name, exact: true }).click();
  await page.getByRole('button', { name: second.name, exact: true }).click();
  await expect(page.locator('.detail-hero h2')).toHaveText(second.name);
  await page.waitForTimeout(400);
  await expect(page.locator('.detail-hero h2')).toHaveText(second.name);
  await page.getByRole('button', { name: '关闭详情' }).click();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `overflow at ${width}`
    ).toBeTruthy();
  }
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  expect((await anonymous.request.get(`${origin}/api/files/${first.id}/download`)).status()).toBe(
    401
  );
  await anonymous.close();
});
test('Markdown preview removes script, event attributes and dangerous links', async ({
  page,
  context
}) => {
  const response = await context.request.post('/api/notes', {
    headers: { Origin: origin, 'x-csrf-token': csrf },
    data: {
      title: 'Safe Markdown',
      language: 'markdown',
      content:
        '# Safe\n<script>window.__vaultXss=true</script>\n<img src=x onerror="window.__vaultXss=true">\n[bad](javascript:alert(1))'
    }
  });
  const note = await response.json();
  await page.goto(`/#/notes/${note.id}`);
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByText('预览', { exact: true }).click();
  await expect(page.locator('.markdown-preview h1')).toHaveText('Safe');
  expect(
    await page
      .locator(
        '.markdown-preview script,.markdown-preview img,.markdown-preview [onerror],.markdown-preview a[href^="javascript:"]'
      )
      .count()
  ).toBe(0);
  expect(await page.evaluate(() => window.__vaultXss)).toBeUndefined();
});
test('command palette searches titles and never secret plaintext', async ({ page }) => {
  await page.goto('/#/files');
  await expect(page.getByRole('heading', { name: /Files/ })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: '全局搜索' }).fill('Production');
  await expect(page.getByRole('option', { name: /Production API/ })).toBeVisible();
  expect(await page.locator('.command-results').innerText()).not.toContain(
    'super-private-test-key'
  );
  await page.keyboard.press('Escape');
});

test('offline save failure retains an encrypted recoverable draft', async ({ page, context }) => {
  const created = await context.request.post('/api/notes', {
    headers: { Origin: origin, 'x-csrf-token': csrf },
    data: { title: 'Recovery notebook', language: 'text', content: 'initial' }
  });
  const note = await created.json();
  await page.goto(`/#/notes/${note.id}`);
  await expect(page.locator('.cm-content')).toBeVisible();
  await context.setOffline(true);
  await page.locator('.cm-content').fill('unsaved-private-offline-content');
  await expect(page.locator('.save-state')).toHaveText('Save failed');
  expect(
    await page.evaluate(() =>
      JSON.stringify(sessionStorage).includes('unsaved-private-offline-content')
    )
  ).toBe(false);
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText('发现可恢复的加密草稿')).toBeVisible();
  await page.getByRole('button', { name: '恢复草稿' }).click();
  await expect
    .poll(async () => (await (await context.request.get(`/api/notes/${note.id}`)).json()).content)
    .toBe('unsaved-private-offline-content');
  await expect(page.locator('.save-state')).toHaveText('Saved');
});

test('Recent replaces favorites, persists actual opens and navigates across modules on desktop and mobile', async ({
  page,
  context
}) => {
  const headers = { Origin: origin, 'x-csrf-token': csrf };
  const note = await (
    await context.request.post('/api/notes', {
      headers,
      data: { title: 'Recent note fixture', language: 'text', content: 'recent confidential body' }
    })
  ).json();
  const secret = await (
    await context.request.post('/api/secrets', {
      headers,
      data: {
        name: 'Recent secret fixture',
        secret_type: 'apikey',
        data: { key: 'recent confidential key' }
      }
    })
  ).json();
  const folder = await (
    await context.request.post('/api/files/folders', {
      headers,
      data: { name: 'Recent folder fixture', parent_id: null }
    })
  ).json();
  await page.goto('/#/files');
  await expect(page.getByRole('button', { name: /Favorites|Favourite|收藏/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Recent folder fixture', exact: true }).click();
  await expect
    .poll(async () =>
      (await (await context.request.get('/api/recent?module=files')).json()).items.some(
        (r) => r.id === folder.id
      )
    )
    .toBe(true);
  await page.locator('.sidebar').getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: /Recent note fixture/ }).click();
  await expect(page.getByRole('textbox', { name: '笔记标题' })).toHaveValue('Recent note fixture');
  await page.locator('.sidebar').getByRole('button', { name: 'Secrets', exact: true }).click();
  await page.getByRole('button', { name: '查看 Recent secret fixture', exact: true }).click();
  await expect(page.locator('.secret-locked')).toBeVisible();
  await expect
    .poll(async () =>
      (await (await context.request.get('/api/recent?module=secrets')).json()).items.some(
        (r) => r.id === String(secret.id)
      )
    )
    .toBe(true);
  await page.locator('.sidebar').getByRole('button', { name: 'Recent', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recent', exact: true })).toBeVisible();
  for (const title of ['Recent note fixture', 'Recent secret fixture', 'Recent folder fixture']) {
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  }
  expect(await page.locator('body').innerText()).not.toMatch(/recent confidential/);
  await page.reload();
  await page.getByRole('radiogroup').getByText('Notes', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Recent folder fixture', exact: true })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Recent note fixture', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '笔记标题' })).toHaveValue('Recent note fixture');
  await page.locator('.brand').click();
  await expect(page.getByRole('heading', { name: 'Recent', exact: true })).toBeVisible();
  await page.goto('/#/favorites');
  await expect(page.getByRole('heading', { name: 'Recent', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Recent', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Recent secret fixture', exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  ).toBeTruthy();
  await page.screenshot({
    path: 'artifacts/vault-recent-mobile.png',
    fullPage: true,
    animations: 'disabled'
  });
  await page.getByRole('button', { name: 'Recent secret fixture', exact: true }).click();
  await expect(page.locator('.secret-locked')).toBeVisible();
});

test('same device reopens with a persistent seven-day login and no password prompt for secrets', async ({
  browser
}) => {
  const first = await browser.newContext({ storageState: '.tmp/auth.json' });
  let reopened;
  try {
    const firstPage = await first.newPage();
    await firstPage.goto(origin);
    await expect(firstPage.getByRole('heading', { name: 'Recent', exact: true })).toBeVisible();
    const saved = await first.storageState();
    const cookie = saved.cookies.find((item) => item.name === 'vault_dev_session');
    expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 6 * 86400);
    await first.close();
    reopened = await browser.newContext({ storageState: saved });
    const page = await reopened.newPage();
    const passwordRequests = [];
    page.on('request', (request) => {
      if (/\/api\/auth\/(login|reauth)$/.test(request.url()))
        passwordRequests.push(request.method());
    });
    await page.goto(`${origin}/#/secrets`);
    await page.getByRole('button', { name: '查看 Production API', exact: true }).click();
    await expect(page.locator('.secret-locked')).toBeVisible();
    await page.getByRole('button', { name: '显示内容', exact: true }).click();
    await expect(
      page.locator('.secret-field pre').filter({ hasText: 'super-private-test-key' })
    ).toBeVisible();
    await expect(page.getByRole('dialog', { name: '验证主密码', exact: true })).toHaveCount(0);
    expect(passwordRequests).toHaveLength(0);
  } finally {
    await first.close();
    await reopened?.close();
  }
});
