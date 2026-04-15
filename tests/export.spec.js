const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');

const smokeSiteId = process.env.PLAYWRIGHT_SMOKE_SITE_ID || '1';

async function setTutorialDismissCookie(page) {
	await page.context().addCookies([{
		name: 'tutorial_status',
		value: 'dismiss',
		domain: 'sead.test',
		path: '/'
	}]);
}

async function dismissBlockingTutorial(page) {
	const tutorialDismissButton = page.locator('#tutorial-question .no-button');
	if(await tutorialDismissButton.isVisible().catch(() => false)) {
		await tutorialDismissButton.click();
		await page.waitForTimeout(150);
	}
}

async function dismissCookieConsent(page) {
	const consentButton = page.getByRole('button', { name: /i agree/i }).first();
	if(await consentButton.isVisible().catch(() => false)) {
		await consentButton.click();
		await page.waitForTimeout(200);
	}
}

async function waitForSiteReportReady(page) {
	await expect(page.locator('#site-report-main-container')).toBeVisible({ timeout: 30000 });
	await expect(page.locator('#site-report-content')).toBeVisible({ timeout: 30000 });
	await expect(page.locator('#site-report-section-analyses')).toBeVisible({ timeout: 30000 });
}

async function openAnalysesSection(page) {
	const analysisSectionToggle = page.locator('#site-report-section-analyses .site-report-level-content .site-report-level-title').first();
	await expect(analysisSectionToggle).toBeVisible({ timeout: 30000 });
	await analysisSectionToggle.click();
}

function getColumnTitles(columns) {
	if(!Array.isArray(columns)) {
		return [];
	}
	return columns.map((col) => col?.title).filter(Boolean);
}

function inspectEcoCodeColumns(exportStruct) {
	if(!exportStruct || !exportStruct.datatable) {
		return {
			hasEcoCodeDefinition: false,
			hasColorColumn: false,
			hasTaxaColumn: false
		};
	}

	const topLevelTitles = getColumnTitles(exportStruct.datatable.columns);
	const hasTopLevelDefinition = topLevelTitles.includes('Ecocode definition ID');
	const hasTopLevelColor = topLevelTitles.includes('Eco code color');
	const hasTopLevelTaxa = topLevelTitles.includes('Taxa');

	if(hasTopLevelDefinition) {
		return {
			hasEcoCodeDefinition: true,
			hasColorColumn: hasTopLevelColor,
			hasTaxaColumn: hasTopLevelTaxa
		};
	}

	const subTableColumnKey = (exportStruct.datatable.columns || []).findIndex((col) => col && col.dataType == 'subtable');
	if(subTableColumnKey < 0 || !Array.isArray(exportStruct.datatable.rows) || exportStruct.datatable.rows.length == 0) {
		return {
			hasEcoCodeDefinition: false,
			hasColorColumn: false,
			hasTaxaColumn: false
		};
	}

	const firstSubTable = exportStruct.datatable.rows[0][subTableColumnKey]?.value;
	const subTitles = getColumnTitles(firstSubTable?.columns);
	return {
		hasEcoCodeDefinition: subTitles.includes('Ecocode definition ID'),
		hasColorColumn: subTitles.includes('Eco code color'),
		hasTaxaColumn: subTitles.includes('Taxa')
	};
}

test.describe('Site report content item export flow', () => {
	test(`uses lazy click-time generation and regenerates exports (site ${smokeSiteId})`, async ({ page }) => {
		test.setTimeout(120000);

		await setTutorialDismissCookie(page);
		await page.goto(`/site/${smokeSiteId}`);
		await dismissBlockingTutorial(page);
		await dismissCookieConsent(page);
		await waitForSiteReportReady(page);

		await openAnalysesSection(page);

		const analysisExportButton = page.locator('#site-report-section-analyses .content-item-container .site-report-toolbar-export-btn:visible').first();
		await expect(analysisExportButton).toBeVisible({ timeout: 30000 });

		let downloadCount = 0;
		page.on('download', () => {
			downloadCount += 1;
		});

		await analysisExportButton.click();

		const exportDialog = page.locator('#popover-dialog-frame');
		await expect(exportDialog).toBeVisible({ timeout: 10000 });

		const jsonBtn = page.locator('.site-report-export-download-btn', { hasText: 'Download JSON' }).first();
		const xlsxBtn = page.locator('.site-report-export-download-btn', { hasText: 'Download XLSX' }).first();
		await expect(jsonBtn).toBeVisible({ timeout: 10000 });
		await expect(xlsxBtn).toBeVisible({ timeout: 10000 });

		await page.waitForTimeout(750);
		expect(downloadCount).toBe(0);

		const [jsonDownload1] = await Promise.all([
			page.waitForEvent('download'),
			jsonBtn.click()
		]);
		expect(jsonDownload1.suggestedFilename().toLowerCase()).toContain('.json');
		await expect(jsonBtn).toHaveAttribute('aria-busy', 'false', { timeout: 10000 });
		expect(downloadCount).toBe(1);

		const [jsonDownload2] = await Promise.all([
			page.waitForEvent('download'),
			jsonBtn.click()
		]);
		expect(jsonDownload2.suggestedFilename().toLowerCase()).toContain('.json');
		expect(downloadCount).toBe(2);

		const [xlsxDownload] = await Promise.all([
			page.waitForEvent('download'),
			xlsxBtn.click()
		]);
		expect(xlsxDownload.suggestedFilename().toLowerCase()).toContain('.xlsx');
		await expect(xlsxBtn).toHaveAttribute('aria-busy', 'false', { timeout: 10000 });
		expect(downloadCount).toBe(3);
	});

	test(`adds eco code color and taxa columns via dataset prepareExport (site ${smokeSiteId})`, async ({ page }) => {
		test.setTimeout(120000);

		await setTutorialDismissCookie(page);
		await page.goto(`/site/${smokeSiteId}`);
		await dismissBlockingTutorial(page);
		await dismissCookieConsent(page);
		await waitForSiteReportReady(page);
		await openAnalysesSection(page);

		const allSubsectionToggles = page.locator('#site-report-section-analyses .site-report-level-content .site-report-level-title');
		const subsectionCount = await allSubsectionToggles.count();
		for(let i = 0; i < subsectionCount; i += 1) {
			await allSubsectionToggles.nth(i).click().catch(() => {});
		}

		const exportButtons = page.locator('#site-report-section-analyses .content-item-container .site-report-toolbar-export-btn:visible');
		const exportButtonCount = await exportButtons.count();
		expect(exportButtonCount).toBeGreaterThan(0);

		let foundEcoCodeExport = false;
		const scanLimit = Math.min(exportButtonCount, 10);

		for(let i = 0; i < scanLimit; i += 1) {
			await page.evaluate(() => {
				if(window.sqs && window.sqs.dialogManager) {
					window.sqs.dialogManager.hidePopOver();
				}
			});

			await exportButtons.nth(i).click();
			const jsonBtn = page.locator('.site-report-export-download-btn', { hasText: 'Download JSON' }).first();
			const hasJsonButton = await jsonBtn.isVisible().catch(() => false);
			if(!hasJsonButton) {
				continue;
			}

			let jsonDownload = null;
			try {
				([jsonDownload] = await Promise.all([
					page.waitForEvent('download', { timeout: 10000 }),
					jsonBtn.click()
				]));
			}
			catch (err) {
				continue;
			}

			const jsonPath = await jsonDownload.path();
			const jsonRaw = await fs.readFile(jsonPath, 'utf8');
			const exportStruct = JSON.parse(jsonRaw);
			const ecoCodeColumns = inspectEcoCodeColumns(exportStruct);

			if(ecoCodeColumns.hasEcoCodeDefinition) {
				foundEcoCodeExport = true;
				expect(ecoCodeColumns.hasColorColumn).toBeTruthy();
				expect(ecoCodeColumns.hasTaxaColumn).toBeTruthy();
				break;
			}

			await page.evaluate(() => {
				if(window.sqs && window.sqs.dialogManager) {
					window.sqs.dialogManager.hidePopOver();
				}
			});
		}

		test.skip(!foundEcoCodeExport, `No ecocode export detected on site ${smokeSiteId}`);
	});
});
