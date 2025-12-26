import { chromium } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:8082';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(() => {
	window.localStorage.setItem('objectsUIMode', JSON.stringify('simple'));
	window.localStorage.setItem('apiToken', JSON.stringify('playwright-token'));
	window.localStorage.setItem('profileId', JSON.stringify('playwright-smoke'));
	window.localStorage.setItem('bucket', JSON.stringify('playwright-bucket'));
	window.localStorage.setItem('objectsSort', JSON.stringify('name_asc'));
});

await page.goto(`${baseURL}/objects`, { waitUntil: 'domcontentloaded' });
await page.getByPlaceholder('Search current folder').waitFor({ state: 'visible' });

const sortSelect = page.locator('.ant-select', { hasText: 'Name (A -> Z)' }).first();
await sortSelect.waitFor({ state: 'visible' });
const html = await sortSelect.evaluate((el) => el.outerHTML);
console.log(html);

await browser.close();
