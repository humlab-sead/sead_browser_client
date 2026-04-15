// @ts-check
const { test, expect, chromium } = require('@playwright/test');
const { Stagehand } = require('@browserbasehq/stagehand');
const path = require('node:path');

const stagehandModel = process.env.STAGEHAND_MODEL || 'openai/gpt-4.1-mini';
const stagehandApiKey = process.env.OPENAI_API_KEY;
const stagehandEnv = process.env.STAGEHAND_ENV || 'LOCAL';
const stagehandBaseUrl = process.env.STAGEHAND_BASE_URL || 'http://sead.test';
const stagehandCookieDomain = (() => {
    try {
        return new URL(stagehandBaseUrl).hostname;
    }
    catch (error) {
        return 'sead.test';
    }
})();
const verbose = Number.parseInt(process.env.STAGEHAND_VERBOSE || '0', 10);
const stagehandVerbose = Number.isInteger(verbose) && verbose >= 0 && verbose <= 2 ? verbose : 0;
const stagehandActRetriesRaw = Number.parseInt(process.env.STAGEHAND_ACT_RETRIES || '2', 10);
const stagehandActRetries = Number.isInteger(stagehandActRetriesRaw) && stagehandActRetriesRaw > 0 ? stagehandActRetriesRaw : 2;

async function dismissBlockingTutorial(page) {
    const tutorialDismissButton = page.locator('#tutorial-question .no-button');
    if(await tutorialDismissButton.isVisible().catch(() => false)) {
        await tutorialDismissButton.click();
        await page.waitForTimeout(150);
    }
}

function isStagehandObjectSchemaError(error) {
    if(!error) {
        return false;
    }

    const message = `${error.name || ''} ${error.message || ''}`;
    if(message.includes('AI_NoObjectGeneratedError') || message.includes('did not match schema')) {
        return true;
    }

    const causeMessage = error.cause ? `${error.cause.name || ''} ${error.cause.message || ''}` : '';
    return causeMessage.includes('Type validation failed');
}

function createClickAction(selector, description) {
    return {
        selector,
        description,
        method: 'click',
        arguments: []
    };
}

test.describe('Stagehand smoke flow on sead.test', () => {
    test.describe.configure({ mode: 'serial' });

    /** @type {import('@browserbasehq/stagehand').Stagehand | null} */
    let stagehand = null;
    /** @type {import('@playwright/test').Browser | null} */
    let browser = null;
    /** @type {import('@playwright/test').BrowserContext | null} */
    let context = null;
    /** @type {import('@playwright/test').Page | null} */
    let page = null;

    function getSession() {
        if(!stagehand || !page) {
            throw new Error('Stagehand test session has not been initialized.');
        }

        return { stagehand, page };
    }

    async function runAiClick(session, instruction, fallbackAction) {
        let lastError = null;

        for(let attempt = 1; attempt <= stagehandActRetries; attempt++) {
            try {
                await session.stagehand.act(instruction, { page: session.page });
                return;
            }
            catch (error) {
                lastError = error;
                if(!isStagehandObjectSchemaError(error) || attempt === stagehandActRetries) {
                    break;
                }

                await session.page.waitForTimeout(300 * attempt);
            }
        }

        if(fallbackAction) {
            await session.stagehand.act(fallbackAction, { page: session.page });
            return;
        }

        throw lastError;
    }

    test.beforeEach(async () => {
        test.skip(!stagehandApiKey, 'OPENAI_API_KEY is required for Stagehand tests.');

        stagehand = new Stagehand({
            env: stagehandEnv,
            disableAPI: true,
            verbose: stagehandVerbose,
            cacheDir: path.join(__dirname, '.cache', 'stagehand'),
            model: {
                modelName: stagehandModel,
                apiKey: stagehandApiKey
            },
            localBrowserLaunchOptions: {
                headless: process.env.STAGEHAND_HEADLESS === 'false' ? false : true
            }
        });

        await stagehand.init();
        browser = await chromium.connectOverCDP(stagehand.connectURL());

        const contexts = browser.contexts();
        context = contexts[0] || await browser.newContext();

        const pages = context.pages();
        page = pages[0] || await context.newPage();

        await context.addCookies([{
            name: 'tutorial_status',
            value: 'dismiss',
            domain: stagehandCookieDomain,
            path: '/'
        }]);

        await page.goto(stagehandBaseUrl, { waitUntil: 'domcontentloaded' });
        await dismissBlockingTutorial(page);
        await expect(page).toHaveTitle(/SEAD/);
        await expect(page.locator('#result-container')).toBeVisible({ timeout: 30000 });
    });

    test.afterEach(async () => {
        if(browser) {
            await browser.close().catch(() => {});
            browser = null;
        }

        if(stagehand) {
            await stagehand.close({ force: true }).catch(() => {});
            stagehand = null;
        }

        context = null;
        page = null;
    });

    test('opens the site filters menu with Stagehand', async () => {
        const session = getSession();
        await runAiClick(
            session,
            'Click the filter menu button with selector #filter-menu-filter-area',
            createClickAction('#filter-menu-filter-area', 'Click the filter menu button')
        );
        await expect(session.page.locator('#filters-menu-anchor-point')).toBeVisible({ timeout: 30000 });
    });

    test('deploys the Sites filter through Space/Time with Stagehand', async () => {
        const session = getSession();
        await runAiClick(
            session,
            'Click the filter menu button with selector #filter-menu-filter-area',
            createClickAction('#filter-menu-filter-area', 'Click the filter menu button')
        );
        await expect(session.page.locator('#filters-menu-anchor-point')).toBeVisible({ timeout: 30000 });

        await runAiClick(
            session,
            'In the open filter menu, click the Space/Time item with selector #filters-menu-anchor-point > [menu-item="space_time"]',
            createClickAction('#filters-menu-anchor-point > [menu-item="space_time"]', 'Click the Space/Time filter menu item')
        );
        await runAiClick(
            session,
            'In the submenu, click Sites with selector #filters-menu-anchor-point > div > [menu-item="sites"]',
            createClickAction('#filters-menu-anchor-point > div > [menu-item="sites"]', 'Click the Sites filter item')
        );

        await expect(session.page.locator('#facet-section > #facet-1')).toBeVisible({ timeout: 30000 });
    });

    test('switches between map and table result views with Stagehand', async () => {
        const session = getSession();
        await runAiClick(
            session,
            'Click the map tab with selector #result-menu > [menu-item="map"]',
            createClickAction('#result-menu > [menu-item="map"]', 'Click the map result tab')
        );
        await expect(session.page.locator('#result-menu > [menu-item="map"]')).toHaveClass(/sqs-menu-selected/);

        await runAiClick(
            session,
            'Click the table tab with selector #result-menu > [menu-item="table"]',
            createClickAction('#result-menu > [menu-item="table"]', 'Click the table result tab')
        );
        await expect(session.page.locator('#result-menu > [menu-item="table"]')).toHaveClass(/sqs-menu-selected/);
    });
});
