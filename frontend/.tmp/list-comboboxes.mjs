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

const combos = page.getByRole('combobox');
const count = await combos.count();
console.log(`combobox count: ${count}`);
for (let i = 0; i < count; i += 1) {
	const combo = combos.nth(i);
	const text = ((await combo.textContent()) || '').trim();
	const visible = await combo.isVisible();
	console.log(`combobox[${i}] visible=${visible} text=${text}`);
}

await browser.close();
