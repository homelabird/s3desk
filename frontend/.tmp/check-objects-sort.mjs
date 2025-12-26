import { chromium } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:8082';

async function runCheck(favoritesOnly) {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.addInitScript((favOnly) => {
		window.localStorage.setItem('objectsUIMode', JSON.stringify('simple'));
		window.localStorage.setItem('apiToken', JSON.stringify('playwright-token'));
		window.localStorage.setItem('profileId', JSON.stringify('playwright-smoke'));
		window.localStorage.setItem('bucket', JSON.stringify('playwright-bucket'));
		window.localStorage.setItem('objectsFavoritesOnly', JSON.stringify(favOnly));
		if (!window.localStorage.getItem('objectsSort')) {
			window.localStorage.setItem('objectsSort', JSON.stringify('name_asc'));
		}
		if (!window.localStorage.getItem('objectsFavoritesFirst')) {
			window.localStorage.setItem('objectsFavoritesFirst', JSON.stringify(false));
		}
	}, favoritesOnly);

	await page.goto(`${baseURL}/objects`, { waitUntil: 'domcontentloaded' });
	await page.getByPlaceholder('Search current folder').waitFor({ state: 'visible' });

	const sortSelect = page.locator('.ant-select', { hasText: 'Name (A -> Z)' }).first();
	await sortSelect.waitFor({ state: 'visible' });
	const sortClass = (await sortSelect.getAttribute('class')) || '';
	console.log(`[favoritesOnly=${favoritesOnly}] sort selection: Name (A -> Z)`);
	console.log(`[favoritesOnly=${favoritesOnly}] sort select class: ${sortClass}`);

	const favoritesFirstContainer = page.locator('.ant-space', { hasText: 'Favorites first' }).first();
	await favoritesFirstContainer.waitFor({ state: 'visible' });
	const switchButton = favoritesFirstContainer.locator('.ant-switch');
	const switchClass = (await switchButton.getAttribute('class')) || '';
	console.log(`[favoritesOnly=${favoritesOnly}] favorites first switch class: ${switchClass}`);

	if (!favoritesOnly && !sortClass.includes('ant-select-disabled')) {
		await sortSelect.locator('.ant-select-content-value').click();
		const option = page.locator('.ant-select-item-option-content', { hasText: 'Last modified (newest)' });
		await option.first().click();
		const updated = page.locator('.ant-select', { hasText: 'Last modified (newest)' });
		await updated.first().waitFor({ state: 'visible' });
		console.log('[favoritesOnly=false] after select: Last modified (newest)');

		await switchButton.click();
		const switchClassAfter = (await switchButton.getAttribute('class')) || '';
		console.log(`[favoritesOnly=false] favorites first after toggle: ${switchClassAfter}`);

		const persisted = await page.evaluate(() => ({
			sort: window.localStorage.getItem('objectsSort'),
			favoritesFirst: window.localStorage.getItem('objectsFavoritesFirst'),
		}));
		console.log(`[favoritesOnly=false] persisted localStorage sort=${persisted.sort} favoritesFirst=${persisted.favoritesFirst}`);

		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.getByPlaceholder('Search current folder').waitFor({ state: 'visible' });
		const sortAfterReload = page.locator('.ant-select', { hasText: 'Last modified (newest)' });
		await sortAfterReload.first().waitFor({ state: 'visible' });
		const switchReload = page.locator('.ant-space', { hasText: 'Favorites first' }).first().locator('.ant-switch');
		const switchClassReload = (await switchReload.getAttribute('class')) || '';
		console.log(`[favoritesOnly=false] reload sort persists: Last modified (newest)`);
		console.log(`[favoritesOnly=false] reload favorites first class: ${switchClassReload}`);
	} else if (!favoritesOnly) {
		console.log('[favoritesOnly=false] sort select disabled; skip option change');
	}

	await browser.close();
}

await runCheck(false);
await runCheck(true);
