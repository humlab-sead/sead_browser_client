const { test, expect } = require('@playwright/test');

//The site report's "Export site data" dialog: every download is named like the SDF workbook,
//sead_site_<id>_<yyyymmdd>.<ext>

const SITE_ID = 1;

async function openSiteExportDialog(page, testInfo) {
	const host = new URL(testInfo.project.use.baseURL || 'http://sead.test').hostname;
	await page.context().addCookies([{ name: 'tutorial_status', value: 'dismiss', domain: host, path: '/' }]);
	await page.goto('/site/' + SITE_ID);
	const consentButton = page.getByRole('button', { name: /i agree|dismiss cookie message/i }).first();
	if(await consentButton.isVisible({ timeout: 5000 }).catch(() => false)) {
		await consentButton.click();
	}
	await expect(page.locator('.site-report-export-btn:visible').first()).toBeVisible({ timeout: 60000 });
	await page.locator('.site-report-export-btn:visible').first().click();
	await expect(page.getByRole('button', { name: 'Download JSON' })).toBeVisible();
}

for(const [label, ext] of [['Download JSON', 'json'], ['Download CSV (ZIP)', 'zip'], ['Download XLSX', 'xlsx']]) {
	test(`site report export, ${label}, is named sead_site_<id>_<date>.${ext}`, async ({ page }, testInfo) => {
		test.setTimeout(120000);
		await openSiteExportDialog(page, testInfo);
		const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
		await page.getByRole('button', { name: label }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(new RegExp(`^sead_site_${SITE_ID}_\\d{8}\\.${ext}$`));
	});
}
