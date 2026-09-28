import type { Page } from '@playwright/test';

export async function dragOutlineWidth(page: Page, width: number) {
    const handle = page.getByRole('separator', { name: 'Outline width' });
    const rect = (await handle.boundingBox())!;
    const sidebar = (await page.getByRole('complementary', { name: 'Scroll Pro outline' }).boundingBox())!;
    const direction = await page.locator('.scroll-pro-sidebar-shell').getAttribute('data-open-x');
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (width - sidebar.width) * (direction === 'left' ? -1 : 1), y);
    await page.mouse.up();
}
