const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const requireFrontend = createRequire(path.resolve(__dirname, '../frontend/package.json'));
const { chromium } = requireFrontend('@playwright/test');

(async () => {
  const base = process.argv[2];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const legacyApis of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      if (legacyApis) await context.addInitScript(() => {
        delete AbortSignal.any;
        delete AbortSignal.prototype.throwIfAborted;
        delete window.structuredClone;
        delete String.prototype.replaceAll;
        delete Array.prototype.at;
        delete Crypto.prototype.randomUUID;
      });
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', r => { if (r.url().startsWith(new URL(base).origin)) requests.push(new URL(r.url()).pathname); });
      // Only database-dependent UI data is stubbed; auth/config and assets use the real container.
      await page.route('**/api/v1/dashboard*', route => {
        const options = new URL(route.request().url()).pathname.endsWith('/options');
        const data = { total: 0, located: 0, monitored: 0, sourceUpdatedAt: null,
          monitoringDefaulted: 0, withMonitoringDevices: 0, normalUse: 0,
          specialTypesRegistered: 0, specialFlagProvided: 0, singleColumnPiers: 0 };
        for (const k of ['cities','types','monitoringTypes','technicalGrades','points','conditionGrades','structureGrades',
          'conditionGradeCategories','structureGradeCategories','spanTypes','maintenanceCategories','bridgeStatuses','specialTypes']) data[k] = [];
        return route.fulfill({ json: { code: 'OK', data: options ? [] : data } });
      });
      await page.route('**/api/v1/alarms?*', route => route.fulfill({ json: { code: 'OK', data: { items: [], total: 0, page: 1, size: 50 } } }));
      await page.goto(base + '/');
      await page.waitForURL('**/zntmh/ql/screen');
      await page.locator('.screen-title h1').waitFor();
      await page.reload();
      await page.locator('.screen-title h1').waitFor();
      const outside = requests.filter(p => !p.startsWith('/zntmh/ql/'));
      if (outside.length) throw new Error('Requests escaped portal prefix: ' + outside.join(','));
      if (!requests.some(p => p.endsWith('/api/v1/auth/config'))) throw new Error('Missing real auth/config request');
      if (errors.length) throw new Error(errors.join('\n'));
      const compat = await page.evaluate(() => ({ abort: typeof AbortSignal.any, clone: typeof structuredClone, replace: typeof ''.replaceAll, uuid: typeof crypto.randomUUID }));
      if (Object.values(compat).some(v => v !== 'function')) throw new Error('Missing runtime helper');
      const dest = path.resolve(__dirname, '../runtime/cce-release-20261102-p18089-portal');
      await page.screenshot({ path: path.join(dest, legacyApis ? 'portal-polyfills.png' : 'portal-page.png') });
      console.log(JSON.stringify({ browser: 'Chromium', removedModernApis: legacyApis, title: await page.locator('.screen-title h1').innerText(), requests: requests.length, pageErrors: errors.length, prefix: 'PASS', reload: 'PASS', compat }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
