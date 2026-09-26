import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';

type Fixtures = {
  extensionContext: BrowserContext;
  extensionPage: Page;
};

const extensionPath = resolve(process.cwd(), 'dist');

export const test = base.extend<Fixtures>({
  extensionContext: async ({}, use, testInfo) => {
    const profile = await mkdtemp(join(tmpdir(), 'scroll-e2e-'));
    let context: BrowserContext | undefined;
    let tracingStarted = false;
    try {
      context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: true,
        args: process.env.SCROLL_E2E_NO_EXTENSION === '1' ? [] : [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        ],
      });
      await context.tracing.start({ screenshots: true, snapshots: true });
      tracingStarted = true;
      await use(context);
    } finally {
      if (context) {
        if (tracingStarted) {
          if (testInfo.status !== 'passed') {
            const trace = testInfo.outputPath('trace.zip');
            await context.tracing.stop({ path: trace });
            await testInfo.attach('trace', { path: trace, contentType: 'application/zip' });
          } else {
            await context.tracing.stop();
          }
        }
        await context.close();
      }
      await rm(profile, { recursive: true, force: true });
    }
  },
  extensionPage: async ({ extensionContext }, use, testInfo) => {
    const page = await extensionContext.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await use(page);
    if (testInfo.status !== 'passed') {
      await testInfo.attach('browser-errors', {
        body: errors.join('\n') || '(none)',
        contentType: 'text/plain',
      });
      await testInfo.attach('screenshot', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
    await page.close();
  },
});

export { expect } from '@playwright/test';
