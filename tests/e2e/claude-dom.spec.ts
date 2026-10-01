import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { build } from 'vite';
import type { Provider } from '../../src/types/index.ts';

// Run the real parser in Chromium without mounting the extension or mocking DOM.
let providerScript: string;
test.beforeAll(async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve('src/providers/claude.ts'), name: 'TurnlineClaude', formats: ['iife'] },
    },
  });
  const output = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in output)) throw new Error('Expected a Claude parser bundle');
  const script = output.output.find(file => file.type === 'chunk');
  if (!script) throw new Error('Claude parser bundle has no script');
  providerScript = script.code;
});

const contracts = [
  {
    name: 'thinking and response rows',
    html: `<div data-testid="conversation-turn" data-turn-id="fixture-thinking" id="thinking-turn">
      <div class="font-claude-response" data-testid="assistant-response">
        <div class="row-start-1"><h2>Private reasoning</h2><p>Invented thinking text that must not be copied.</p></div>
        <div class="row-start-2"><h2 id="response-heading">Moon itinerary</h2><p>A <strong>silver</strong> moon.</p></div>
        <button>Show thinking</button>
      </div>
    </div>`,
    turns: [{
      id: 'claude-fixture-thinking-assistant', turnId: 'claude-fixture-thinking', role: 'assistant',
      elementId: 'thinking-turn', text: '## Moon itinerary\n\nA **silver** moon.',
      headings: [{ innerText: 'Moon itinerary', tagName: 'H2', elementId: 'response-heading' }],
    }],
  },
  {
    name: 'nested duplicate selectors and longest response candidates',
    html: `<div data-testid="conversation-turn" data-turn-id="fixture-nested" id="nested-turn">
      <div data-testid="user-message">Short</div>
      <div class="font-user-message"><div data-testid="conversation-turn" data-turn-id="fixture-user-copy">
        <div data-testid="user-message">Compare fictional moons.</div>
      </div></div>
      <div data-testid="assistant-response">Brief.</div>
      <div class="font-claude-response"><div data-testid="conversation-turn" data-turn-id="fixture-answer-copy">
        <div data-testid="assistant-response"><div data-testid="assistant-message">
          <h3 id="nested-heading">Full moon comparison</h3><p>The invented silver moon is quieter than the blue moon.</p>
        </div></div>
      </div></div>
    </div>`,
    turns: [
      { id: 'claude-fixture-nested-user', turnId: 'claude-fixture-nested-user', role: 'user', elementId: 'nested-turn', text: 'Compare fictional moons.', headings: [] },
      {
        id: 'claude-fixture-nested-assistant', turnId: 'claude-fixture-nested', role: 'assistant',
        elementId: 'nested-turn', text: '### Full moon comparison\n\nThe invented silver moon is quieter than the blue moon.',
        headings: [{ innerText: 'Full moon comparison', tagName: 'H3', elementId: 'nested-heading' }],
      },
    ],
  },
  {
    name: 'streaming container fallback and message identity',
    html: `<div data-is-streaming="false" data-message-id="fixture-fallback" id="fallback-turn">
      <div class="font-user-message">Describe a fictional comet.</div>
      <div data-testid="assistant-message"><h6 id="fallback-heading">Comet details</h6><p>A violet tail crosses an imaginary sky.</p></div>
    </div>`,
    turns: [
      { id: 'claude-fixture-fallback-user', turnId: 'claude-fixture-fallback-user', role: 'user', elementId: 'fallback-turn', text: 'Describe a fictional comet.', headings: [] },
      {
        id: 'claude-fixture-fallback-assistant', turnId: 'claude-fixture-fallback', role: 'assistant',
        elementId: 'fallback-turn', text: '###### Comet details\n\nA violet tail crosses an imaginary sky.',
        headings: [{ innerText: 'Comet details', tagName: 'H6', elementId: 'fallback-heading' }],
      },
    ],
  },
];

for (const contract of contracts) {
  test(`Claude DOM contract: ${contract.name} [synthetic]`, async ({ page }) => {
    await page.route('**/*', route => route.abort());
    await page.setContent(`<main><div id="contract-root">${contract.html}</div></main>`);
    await page.addScriptTag({ content: providerScript });
    const turns = await page.evaluate(() => {
      const provider = (window as unknown as { TurnlineClaude: { claude: Provider } }).TurnlineClaude.claude;
      return provider.getTurns(document.querySelector<HTMLElement>('#contract-root')!).map(turn => ({
        id: turn.id, turnId: turn.turnId, role: turn.role, text: turn.text, elementId: turn.element.id,
        headings: turn.headings.map(heading => ({ innerText: heading.innerText, tagName: heading.tagName, elementId: heading.element.id })),
      }));
    });
    expect(turns).toEqual(contract.turns);
  });
}
