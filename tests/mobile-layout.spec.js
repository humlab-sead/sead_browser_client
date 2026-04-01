// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const artifactDir = path.join(__dirname, 'artifacts', 'mobile-layout');
const smokeSiteId = process.env.PLAYWRIGHT_SMOKE_SITE_ID || '1';

function projectSlug(testInfo) {
  return testInfo.project.name.toLowerCase().replace(/\s+/g, '-');
}

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
  if (await tutorialDismissButton.isVisible().catch(() => false)) {
    await tutorialDismissButton.click();
    await page.waitForTimeout(150);
  }
}

async function dismissCookieConsent(page) {
  const consentButton = page.getByRole('button', { name: /i agree/i }).first();
  if (await consentButton.isVisible().catch(() => false)) {
    await consentButton.click();
    await page.waitForTimeout(200);
  }
}

async function assertNoHorizontalOverflow(page, maxOverflowPx = 2) {
  const overflowPixels = await page.evaluate(() => {
    return Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
  });
  expect(overflowPixels).toBeLessThanOrEqual(maxOverflowPx);
}

async function waitForFilterViewReady(page) {
  await expect(page.locator('#filter-menu-domain-area')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#filter-view-main-container #switch-section-button')).toBeVisible({ timeout: 30000 });
}

async function waitForSiteReportReady(page) {
  await expect(page.locator('#site-report-main-container')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#site-report-content')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.site-report-export-btn').first()).toBeVisible({ timeout: 30000 });
}

test.describe('Mobile layout smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    fs.mkdirSync(artifactDir, { recursive: true });
  });

  test('filter/result view toggles cleanly on mobile', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    const slug = projectSlug(testInfo);

    await setTutorialDismissCookie(page);
    await page.goto('/');
    await dismissBlockingTutorial(page);
    await dismissCookieConsent(page);
    await waitForFilterViewReady(page);
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: path.join(artifactDir, `${slug}-01-filters-initial.png`),
      fullPage: true
    });

    const sectionToggleButton = page.locator('#filter-view-main-container #switch-section-button');
    const initialLabel = (await sectionToggleButton.innerText()).trim();

    await sectionToggleButton.click();
    await dismissBlockingTutorial(page);
    await dismissCookieConsent(page);
    await expect(sectionToggleButton).not.toHaveText(initialLabel, { timeout: 10000 });
    await expect(page.locator('#result-menu')).toBeVisible({ timeout: 30000 });
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: path.join(artifactDir, `${slug}-02-after-toggle.png`),
      fullPage: true
    });

    await sectionToggleButton.click();
    await expect(sectionToggleButton).toHaveText(initialLabel, { timeout: 10000 });
    await expect(page.locator('#filter-menu-domain-area')).toBeVisible({ timeout: 30000 });
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: path.join(artifactDir, `${slug}-03-after-toggle-back.png`),
      fullPage: true
    });
  });

  test(`site report export dialog stays usable on mobile (site ${smokeSiteId})`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    const slug = projectSlug(testInfo);

    await setTutorialDismissCookie(page);
    await page.goto(`/site/${smokeSiteId}`);
    await dismissBlockingTutorial(page);
    await dismissCookieConsent(page);
    await waitForSiteReportReady(page);
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: path.join(artifactDir, `${slug}-04-site-report.png`),
      fullPage: true
    });

    const siteReportExportButton = page.locator('.site-report-export-btn').first();
    await siteReportExportButton.click();

    const csvZipExportLink = page.locator('.site-report-export-download-btn', { hasText: 'Download CSV (ZIP)' }).first();
    await expect(csvZipExportLink).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#popover-dialog-frame')).toBeVisible({ timeout: 30000 });
    await assertNoHorizontalOverflow(page);

    const dialogFitsViewport = await page.locator('#popover-dialog-frame').evaluate((dialogFrame) => {
      const rect = dialogFrame.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= window.innerWidth + 1;
    });
    expect(dialogFitsViewport).toBeTruthy();

    await page.screenshot({
      path: path.join(artifactDir, `${slug}-05-site-export-dialog.png`),
      fullPage: true
    });
  });
});
