// @ts-check
const { test, expect } = require('@playwright/test');

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

async function waitForFilterViewReady(page) {
  await expect(page.locator('#filter-menu-domain-area')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#filter-view-main-container #filter-section-toggle-button-left')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#filter-view-main-container #filter-section-toggle-button-right')).toBeVisible({ timeout: 30000 });
}

async function sectionWidths(page) {
  return page.evaluate(() => {
    const leftSection = document.querySelector('#filter-view-main-container > .section-left');
    const rightSection = document.querySelector('#filter-view-main-container > .section-right');

    return {
      left: leftSection ? leftSection.getBoundingClientRect().width : 0,
      right: rightSection ? rightSection.getBoundingClientRect().width : 0
    };
  });
}

test.describe('Desktop layout smoke', () => {
  test('filter/result divider buttons collapse and restore desktop sections', async ({ page }) => {
    test.setTimeout(120000);

    await setTutorialDismissCookie(page);
    await page.goto('/');
    await dismissBlockingTutorial(page);
    await dismissCookieConsent(page);
    await waitForFilterViewReady(page);

    const leftToggleButton = page.locator('#filter-view-main-container #filter-section-toggle-button-left');
    const rightToggleButton = page.locator('#filter-view-main-container #filter-section-toggle-button-right');
    const mobileToggleButton = page.locator('#filter-view-main-container #switch-section-button');

    await expect(mobileToggleButton).toBeHidden();
    await expect(leftToggleButton).toHaveAttribute('aria-label', 'Show only result section');
    await expect(rightToggleButton).toHaveAttribute('aria-label', 'Show only filter section');

    await leftToggleButton.click();
    await expect(leftToggleButton).toHaveAttribute('aria-label', 'Show both sections');
    await expect(rightToggleButton).toBeHidden();
    await expect.poll(() => sectionWidths(page).then((sizes) => Math.round(sizes.left))).toBeLessThanOrEqual(4);

    await leftToggleButton.click();
    await expect(rightToggleButton).toBeVisible({ timeout: 10000 });
    await expect(leftToggleButton).toHaveAttribute('aria-label', 'Show only result section');
    await expect.poll(() => sectionWidths(page).then((sizes) => Math.round(Math.min(sizes.left, sizes.right)))).toBeGreaterThan(100);

    await rightToggleButton.click();
    await expect(rightToggleButton).toHaveAttribute('aria-label', 'Show both sections');
    await expect(leftToggleButton).toBeHidden();
    await expect.poll(() => sectionWidths(page).then((sizes) => Math.round(sizes.right))).toBeLessThanOrEqual(4);
  });
});