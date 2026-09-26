import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';

export type ScenarioName = 'current-turn-unit' | 'long-response-l01' | 'long-response-l02';

type CurrentExpected = {
  roles: string[];
  prompts: string[];
  headings: string[];
  responses: string[];
  absentText?: string[];
};

type SnapshotExpected = {
  turnKeys: string[];
  contentUnits: number;
  headingCount: number;
  firstPrompt?: string;
  firstHeading?: string;
  lastHeading?: string;
  newPrompt?: string;
  newFirstHeading?: string;
  newLastHeading?: string;
};

type LongL01Expected = { cold: SnapshotExpected; loaded: SnapshotExpected };

const fixtureRoot = resolve(process.cwd(), 'tests/fixtures/chatgpt');

export async function loadScenario(context: BrowserContext, page: Page, name: 'current-turn-unit'): Promise<CurrentExpected>;
export async function loadScenario(context: BrowserContext, page: Page, name: 'long-response-l01'): Promise<LongL01Expected>;
export async function loadScenario(context: BrowserContext, page: Page, name: 'long-response-l02'): Promise<SnapshotExpected>;
export async function loadScenario(context: BrowserContext, page: Page, name: ScenarioName) {
  const directory = resolve(fixtureRoot, name);
  const [html, css, expectedText] = await Promise.all([
    readFile(resolve(directory, 'page.html'), 'utf8'),
    readFile(resolve(directory, 'layout.css'), 'utf8'),
    readFile(resolve(directory, 'expected.json'), 'utf8'),
  ]);
  const url = name === 'current-turn-unit'
    ? `https://chatgpt.com/c/fixture-${name}`
    : `https://chatgpt.com/g/g-p-fixture/c/fixture-${name}`;
  await context.route('**/*', async (route) => {
    const requestUrl = route.request().url();
    if (requestUrl === url) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: html });
    } else if (requestUrl === 'https://chatgpt.com/fixture-layout.css') {
      await route.fulfill({ status: 200, contentType: 'text/css', body: css });
    } else if (/^https?:/.test(requestUrl)) {
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.goto(url);
  return JSON.parse(expectedText) as CurrentExpected | LongL01Expected | SnapshotExpected;
}
