// tests/export.spec.js
import { test, expect } from '@playwright/test';

// Define the site IDs you want to test
const siteIdsToTest = [1, 2, 74, 99, 123]; // Add more IDs as needed

test.describe('CSV Export Functionality', () => {

    let consoleErrors = []; // Array to store console errors for each page

    // Listen for console messages before each test
    test.beforeEach(async ({ page }) => {
        consoleErrors = []; // Reset for each test
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });
    });

    // Test for each site ID
    for (const siteId of siteIdsToTest) {
        test(`should successfully export CSV for site ${siteId}`, async ({ page }) => {
            const baseUrl = 'http://localhost:8081/site/'; // Adjust if your local setup is different
            const siteUrl = `${baseUrl}${siteId}`;

            console.log(`Navigating to: ${siteUrl}`);
            await page.goto(siteUrl);

            // Wait for the "Export" button to be visible and enabled
            const exportButton = page.getByRole('button', { name: /export/i });
            await expect(exportButton).toBeVisible();
            await expect(exportButton).toBeEnabled();

            // Click the Export button
            await exportButton.click();

            // Assuming a modal or dropdown appears with "Excel" or "CSV" option
            // Adjust selectors based on your actual UI
            const csvOption = page.getByRole('menuitem', { name: /csv/i }) || page.getByText(/csv/i); // Example selector

            // Wait for the CSV option to appear and click it
            await expect(csvOption).toBeVisible();
            await csvOption.click();

            console.log(`Triggering download for site ${siteId}...`);

            // Playwright's way to wait for a download
            // This is crucial for asserting on the downloaded file
            const [download] = await Promise.all([
                page.waitForEvent('download'), // Wait for the download event
                // If clicking the button directly initiates the download, you might not need another click here
                // If 'csvOption.click()' was already the trigger, this is fine.
                // If there's another "confirm download" button, click it here.
            ]);

            // Assertions on the downloaded file
            expect(download).not.toBeNull();
            console.log(`Downloaded file URL: ${download.url()}`);
            console.log(`Downloaded file suggested filename: ${download.suggestedFilename()}`);

            // Optional: Save the file and inspect its contents (if needed)
            // const path = await download.path(); // Get the temporary path where Playwright saved it
            // console.log(`Downloaded file saved at: ${path}`);
            // expect(fs.existsSync(path)).toBe(true); // Requires 'node:fs' import

            // You can also assert on the filename, e.g., to ensure it contains the siteId
            expect(download.suggestedFilename()).toContain(`site_${siteId}`);
            expect(download.suggestedFilename()).toMatch(/\.zip$/); // Assuming it's a .zip file as per your code

            // Check for console errors after the entire operation
            expect(consoleErrors.length).toBe(0, `Expected no console errors, but found: \n${consoleErrors.join('\n')}`);
            console.log(`Successfully completed export test for site ${siteId}`);
        });
    }

    // Optional: After all tests, you can report overall console errors if you want
    // test.afterAll(() => {
    //     if (consoleErrors.length > 0) {
    //         console.warn("Global Console Errors across tests:", consoleErrors);
    //     }
    // });
});