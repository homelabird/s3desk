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

const selects = page.locator('.ant-select');
const count = await selects.count();
console.log(`select count: ${count}`);
for (let i = 0; i < count; i += 1) {
	const select = selects.nth(i);
	const text = ((await select.textContent()) || '').trim().replace(/\s+/g, ' ');
	const visible = await select.isVisible();
	const className = (await select.getAttribute('class')) || '';
	console.log(`select[${i}] visible=${visible} class=${className} text=${text}`);
}

await browser.close();
