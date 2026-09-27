import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';

for (const change of ['remount', 'late-layout'] as const) {
  test(`long jump survives ${change}`, async ({ extensionContext, extensionPage: page }) => {
    const expected = await loadScenario(extensionContext, page, 'long-response-l01');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await page.locator('.thread-scroll-container').evaluate(el => { el.scrollTop = 0; });
    await page.evaluate(change => {
      const scroller = document.querySelector<HTMLElement>('.thread-scroll-container')!;
      scroller.addEventListener('scroll', () => {
        setTimeout(() => {
          if (change === 'remount') {
            const top = scroller.scrollTop;
            const replacement = scroller.cloneNode(true) as HTMLElement;
            scroller.replaceWith(replacement);
            replacement.scrollTop = top;
          } else {
            // Host changes layout after the 700ms animation has ended.
            scroller.style.overflowAnchor = 'none';
            const firstHeading = scroller.querySelector<HTMLElement>('[data-markdown-text-style] h1, [data-markdown-text-style] h2')!;
            const spacer = document.createElement('div');
            spacer.style.height = '900px';
            firstHeading.before(spacer);
          }
        }, change === 'remount' ? 100 : 850);
      }, { once: true });
    }, change);
    await sidebar.getByRole('button', { name: expected.cold.firstHeading!, exact: true }).click();
    await page.waitForTimeout(1800);
    await expect.poll(() => page.getByRole('heading', { name: expected.cold.firstHeading!, exact: true }).evaluate(node => {
      const view = document.querySelector('.thread-scroll-container')!.getBoundingClientRect();
      return Math.abs(node.getBoundingClientRect().top - view.top - 24);
    })).toBeLessThan(3);
  });
}
