// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const artifactDir = path.join(__dirname, 'artifacts', 'ai-smoke');
const siteArtifactDir = path.join(__dirname, 'artifacts', 'ai-smoke-site');
const smokeSiteId = process.env.PLAYWRIGHT_SMOKE_SITE_ID || '1';

async function waitForUiToSettle(page, options = {}) {
    const {
        requireSiteReport = false,
        timeout = 45000
    } = options;

    await page.waitForLoadState('domcontentloaded');

    try {
        await page.waitForLoadState('networkidle', { timeout: 7000 });
    }
    catch (error) {
        // Some views keep background activity alive; explicit UI checks below are the source of truth.
    }

    if(requireSiteReport) {
        await expect(page.locator('#site-report-main-container')).toBeVisible({ timeout });
        await expect(page.locator('#site-report-content')).toBeVisible({ timeout });
    }
    else {
        await expect(page.locator('#result-container')).toBeVisible({ timeout });
    }

    await page.waitForFunction(({ requireSiteReport }) => {
        const isVisible = (element) => {
            if(!element) {
                return false;
            }

            const style = window.getComputedStyle(element);
            if(style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return false;
            }

            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        };

        const loaderSelector = [
            '#result-loading-indicator',
            '#site-report-loading-indicator',
            '#export-progress-bar-container',
            '.result-export-button[aria-busy="true"]',
            '.result-export-button.is-loading',
            '.result-export-button-mosaic[aria-busy="true"]',
            '.result-export-button-mosaic.is-loading',
            '.dataset-export-btn .cute-little-loading-indicator'
        ].join(',');

        const hasVisibleLoader = Array.from(document.querySelectorAll(loaderSelector)).some(isVisible);

        const siteReportReady = !requireSiteReport || document.querySelectorAll('#site-report-content .site-report-level-container, #site-report-content .content-item-container').length > 0;

        const menuItemCount = document.querySelectorAll('#result-menu [menu-item]').length;
        const body = document.body;
        const layoutKey = `${menuItemCount}:${body ? body.scrollHeight : 0}:${body ? body.scrollWidth : 0}`;
        const now = Date.now();

        if(!window.__aiSmokeLayoutStability || window.__aiSmokeLayoutStability.key !== layoutKey) {
            window.__aiSmokeLayoutStability = {
                key: layoutKey,
                since: now
            };
        }

        const layoutStable = now - window.__aiSmokeLayoutStability.since > 800;

        if(hasVisibleLoader || !siteReportReady || !layoutStable) {
            window.__aiSmokeStableSince = 0;
            return false;
        }

        if(!window.__aiSmokeStableSince) {
            window.__aiSmokeStableSince = now;
            return false;
        }

        return now - window.__aiSmokeStableSince > 900;
    }, { requireSiteReport }, { timeout });

    await page.waitForTimeout(150);
}

async function captureStep(page, screenshotPath, options = {}) {
    await waitForUiToSettle(page, options);
    await page.screenshot({ path: screenshotPath, fullPage: true });
}

async function dismissBlockingTutorial(page) {
    const tutorialDismissButton = page.locator('#tutorial-question .no-button');
    if(await tutorialDismissButton.isVisible().catch(() => false)) {
        await tutorialDismissButton.click();
        await page.waitForTimeout(150);
    }
}

test.describe('AI smoke flow on sead.test', () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeAll(() => {
        fs.mkdirSync(artifactDir, { recursive: true });
        fs.mkdirSync(siteArtifactDir, { recursive: true });
    });

    test('navigates key UI flows and captures screenshots', async ({ page }) => {
        test.setTimeout(120000);

        await page.context().addCookies([{
            name: 'tutorial_status',
            value: 'dismiss',
            domain: 'sead.test',
            path: '/'
        }]);

        await page.goto('/');
        await dismissBlockingTutorial(page);
        await expect(page).toHaveTitle(/SEAD/);
        await captureStep(page, path.join(artifactDir, '01-home.png'));

        await dismissBlockingTutorial(page);
        await page.click('#filter-menu-domain-area');
        await expect(page.locator('#domains-menu-anchor-point')).toBeVisible();
        await captureStep(page, path.join(artifactDir, '02-domain-menu.png'));

        await dismissBlockingTutorial(page);
        await page.click('#filter-menu-filter-area');
        await expect(page.locator('#filters-menu-anchor-point')).toBeVisible();
        await captureStep(page, path.join(artifactDir, '03-filter-menu.png'));

        await dismissBlockingTutorial(page);
        await page.click('#filters-menu-anchor-point > [menu-item="space_time"]');
        await page.click('#filters-menu-anchor-point > div > [menu-item="sites"]');
        await expect(page.locator('#facet-section > #facet-1')).toBeVisible();
        await captureStep(page, path.join(artifactDir, '04-site-filter-deployed.png'));

        await dismissBlockingTutorial(page);
        await page.click('#result-menu > [menu-item="map"]');
        await expect(page.locator('#result-menu > [menu-item="map"]')).toHaveClass(/sqs-menu-selected/);
        await captureStep(page, path.join(artifactDir, '05-result-map.png'));

        await dismissBlockingTutorial(page);
        await page.click('#result-menu > [menu-item="table"]');
        await expect(page.locator('#result-menu > [menu-item="table"]')).toHaveClass(/sqs-menu-selected/);
        await captureStep(page, path.join(artifactDir, '06-result-table.png'));

        await dismissBlockingTutorial(page);
        await page.click('#result-menu > [menu-item="mosaic"]');
        await expect(page.locator('#result-menu > [menu-item="mosaic"]')).toHaveClass(/sqs-menu-selected/);
        await captureStep(page, path.join(artifactDir, '07-result-mosaic.png'));
    });

    test(`navigates /site/:id export flow with screenshots (site ${smokeSiteId})`, async ({ page }) => {
        test.setTimeout(120000);

        await page.context().addCookies([{
            name: 'tutorial_status',
            value: 'dismiss',
            domain: 'sead.test',
            path: '/'
        }]);

        await page.goto(`/site/${smokeSiteId}`);
        await dismissBlockingTutorial(page);
        await expect(page.locator('#site-report-content')).toBeVisible({ timeout: 30000 });
        await captureStep(page, path.join(siteArtifactDir, `01-site-${smokeSiteId}-report.png`), { requireSiteReport: true });

        const siteReportExportButton = page.locator('.site-report-export-btn').first();
        await expect(siteReportExportButton).toBeVisible({ timeout: 30000 });
        await siteReportExportButton.click();

        const csvZipExportLink = page.locator('.site-report-export-download-btn', { hasText: 'Download CSV (ZIP)' }).first();
        await expect(csvZipExportLink).toBeVisible({ timeout: 30000 });
        await captureStep(page, path.join(siteArtifactDir, `02-site-${smokeSiteId}-export-dialog.png`), { requireSiteReport: true });

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            csvZipExportLink.click()
        ]);

        expect(download.suggestedFilename()).toMatch(/\.zip$/i);
        await download.saveAs(path.join(siteArtifactDir, `03-site-${smokeSiteId}-export-csv.zip`));

        await captureStep(page, path.join(siteArtifactDir, `04-site-${smokeSiteId}-after-export-click.png`), { requireSiteReport: true });
    });
});
