const { test, expect } = require('@playwright/test');
const fs = require('fs');

//The result view's "Export sites" dialog, XLSX: the server builds the workbook as a job that the
//client polls for a progress bar. Needs a database with more than 100 sites (the large-export notice).

async function openExportDialog(page, testInfo) {
	const host = new URL(testInfo.project.use.baseURL || 'http://sead.test').hostname;
	await page.context().addCookies([{ name: 'tutorial_status', value: 'dismiss', domain: host, path: '/' }]);
	await page.goto('/');
	const consentButton = page.getByRole('button', { name: /i agree|dismiss cookie message/i }).first();
	if(await consentButton.isVisible({ timeout: 5000 }).catch(() => false)) {
		await consentButton.click();
	}
	await expect(page.locator('#result-export-btn')).toBeVisible({ timeout: 60000 });
	await page.locator('#result-export-btn').click();
	await expect(page.locator('#sites-export-dl')).toBeVisible({ timeout: 60000 });
}

test('XLSX export of many sites: a notice, a progress bar, and the download', async ({ page }, testInfo) => {
	test.setTimeout(120000);
	await openExportDialog(page, testInfo);

	await expect(page.locator('.sites-export-limit-notice')).toContainText('This is a large export');
	await expect(page.locator('#sites-export-dl')).not.toHaveClass(/disabled/);

	//a few sites are enough to go through the job, and keep the test quick
	await page.route('**/sdf/export/jobs', async (route) => {
		const body = JSON.parse(route.request().postData());
		body.siteIds = body.siteIds.slice(0, 3);
		await route.continue({ postData: JSON.stringify(body) });
	});
	const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
	await page.locator('#sites-export-dl').click();
	await expect(page.locator('#export-progress-bar-container')).toBeVisible();
	await expect(page.locator('#export-progress-cancel')).toBeVisible();

	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/^sead_site_\d+_\d+_\d+_\d{8}\.xlsx$/);
	await expect(page.locator('#export-progress-bar-container')).toBeHidden();
});

test('XLSX export can be cancelled', async ({ page }, testInfo) => {
	test.setTimeout(120000);
	await openExportDialog(page, testInfo);

	let deleted = false;
	page.on('request', (request) => {
		if(request.method() === 'DELETE' && request.url().includes('/sdf/export/jobs/')) {
			deleted = true;
		}
	});
	await page.locator('#sites-export-dl').click();
	await expect(page.locator('#export-progress-bar-container .status-msg')).toContainText(/Collecting|Writing/, { timeout: 30000 });
	await page.locator('#export-progress-cancel').click();

	await expect(page.locator('.notification', { hasText: 'cancelled' }).first()).toBeVisible({ timeout: 15000 });
	await expect(page.locator('#export-progress-bar-container')).toBeHidden();
	expect(deleted).toBe(true);
});

test('Site list only: one row per site, in each format', async ({ page }, testInfo) => {
	test.setTimeout(120000);
	await openExportDialog(page, testInfo);
	const siteCount = parseInt(await page.locator('[data-num-sites]').textContent());

	await page.locator("input[name='sites-export-content'][value='sites']").check();
	await expect(page.locator('.sites-export-content-description[data-export-content="sites"]')).toBeVisible();
	await expect(page.locator('.sites-export-limit-notice')).toBeHidden();

	const header = 'Site ID,Site name,latitude,longitude,altitude,national_site_identifier,domain,sample_groups_num,samples_num,url';

	await page.locator('.sites-export-format-btn[data-export-format="csv"]').click();
	await expect(page.locator('.sites-export-datasets')).toBeHidden();
	let [download] = await Promise.all([page.waitForEvent('download'), page.locator('#sites-export-dl').click()]);
	expect(download.suggestedFilename()).toMatch(/^sead_site_list_\d{8}\.csv$/);
	const csv = fs.readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').trim().split('\r\n');
	expect(csv[0].replace(/"/g, '')).toBe(header);
	expect(csv.length - 1).toBe(siteCount);

	await page.locator('.sites-export-format-btn[data-export-format="json"]').click();
	[download] = await Promise.all([page.waitForEvent('download'), page.locator('#sites-export-dl').click()]);
	const rows = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
	expect(rows.length).toBe(siteCount);
	expect(Object.keys(rows[0])).toEqual(['site_id', 'site_name', 'latitude', 'longitude', 'altitude', 'national_site_identifier', 'domain', 'sample_groups_num', 'samples_num', 'url']);
	expect(rows[0].url).toBe(new URL(page.url()).origin+'/site/'+rows[0].site_id);
	expect(rows.some(row => row.domain)).toBe(true);

	await page.locator('.sites-export-format-btn[data-export-format="xlsx"]').click();
	[download] = await Promise.all([page.waitForEvent('download'), page.locator('#sites-export-dl').click()]);
	expect(download.suggestedFilename()).toMatch(/^sead_site_list_\d{8}\.xlsx$/);
});
