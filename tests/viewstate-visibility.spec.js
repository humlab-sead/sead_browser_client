// @ts-check
const { test, expect } = require('@playwright/test');

/*
* Public and private viewstates: the save dialog asks which (public by default, with a Share button), and the
* load dialog lists whether each is public or private, switches it, and shares the public ones. The session
* and json_api_server's viewstate endpoints are stood in for here.
*/

const USER = { provider: 'orcid', id: '0000-0002-1825-0097', displayName: 'Rita Reader', emails: [] };

async function serveSignedIn(page) {
  const state = { posts: [], patches: [] };
  await page.route('**/jsonapi/auth/status', route => route.fulfill({
    json: { loggedIn: true, providers: [{ id: 'orcid', label: 'ORCID', loginUrl: '/jsonapi/auth/orcid' }], user: USER,
            roles: ['user'], permissions: [], consent: { required: false, version: '2026-10-07' } }
  }));
  await page.route('**/jsonapi/viewstate', route => {
    state.posts.push(route.request().postDataJSON());
    return route.fulfill({ json: { status: 'ok' } });
  });
  await page.route('**/jsonapi/viewstate/*', route => {
    if(route.request().method() == 'PATCH') {
      state.patches.push({ url: route.request().url(), body: route.request().postDataJSON() });
      return route.fulfill({ json: { status: 'ok' } });
    }
    return route.fallback();
  });
  await page.route('**/jsonapi/viewstates', route => route.fulfill({ json: [
    { id: 'publicone', name: 'Shared map', saved: 1791277787000, seadRelease: '2026-10.3', visibility: 'public' },
    { id: 'privateone', name: 'My <b>draft</b>', saved: 1791277780000, seadRelease: '2026-10.3', visibility: 'private' }
  ] }));
  return state;
}

async function waitForSignedIn(page) {
  await page.waitForFunction(() => window.sqs && window.sqs.systemReady && window.sqs.userManager.getUser() != null);
}

test.describe('viewstate visibility', () => {
  test('saving is public by default; the switch makes it private, and a private one has no Share', async ({ page }) => {
    const state = await serveSignedIn(page);
    await page.goto('/');
    await waitForSignedIn(page);

    await page.evaluate(() => $.event.trigger('seadSaveStateClicked', {}));
    const toggle = page.locator('#popover-dialog .viewstate-private-toggle');
    await expect(toggle).not.toBeChecked();
    await expect(page.locator('#popover-dialog .viewstate-visibility-option-active')).toHaveText(/Public/);
    //no Share until it is saved
    await expect(page.locator('#popover-dialog .viewstate-share-btn')).toBeHidden();

    await page.locator('#popover-dialog .viewstate-switch').click();
    await expect(toggle).toBeChecked();
    await expect(page.locator('#popover-dialog .viewstate-visibility-option-active')).toHaveText(/Private/);
    await expect(page.locator('#popover-dialog .viewstate-visibility-hint')).toContainText('Only you');
    //the word Public switches it back, and Private again
    await page.locator('#popover-dialog .viewstate-visibility-option[data-visibility=public]').click();
    await expect(toggle).not.toBeChecked();
    await page.locator('#popover-dialog .viewstate-visibility-option[data-visibility=private]').click();

    await page.fill('#popover-dialog #viewstate-save-input', 'Only mine');
    await page.click('#popover-dialog #viewstate-save-btn');

    await expect(page.locator('#popover-dialog-frame > h1')).toHaveText('Viewstate saved');
    await expect(page.locator('#popover-dialog .viewstate-saved-message')).toContainText('private');
    await expect(page.locator('#popover-dialog .viewstate-share-btn')).toBeHidden();
    expect(state.posts.length).toBe(1);
    expect(state.posts[0].visibility).toBe('private');
    expect(JSON.parse(state.posts[0].data).name).toBe('Only mine');
  });

  test('a saved public viewstate can be shared', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const state = await serveSignedIn(page);
    await page.goto('/');
    await waitForSignedIn(page);
    //no system share sheet here, so the link is copied
    await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined }); });

    await page.evaluate(() => $.event.trigger('seadSaveStateClicked', {}));
    await page.press('#popover-dialog #viewstate-save-input', 'Enter');
    await expect(page.locator('#popover-dialog .viewstate-share-btn')).toBeVisible();
    expect(state.posts[0].visibility).toBe('public');

    const id = JSON.parse(state.posts[0].data).id;
    const link = page.locator('#popover-dialog .viewstate-link-url');
    await expect(link).toHaveText(new RegExp('/viewstate/'+id+'$'));
    await expect(link).toHaveAttribute('href', new RegExp('/viewstate/'+id+'$'));
    await page.click('#popover-dialog .viewstate-share-btn');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp('/viewstate/'+id+'$'));
  });

  test('the list shows and switches visibility, and shares public ones', async ({ page }) => {
    const state = await serveSignedIn(page);
    await page.goto('/');
    await waitForSignedIn(page);
    await page.evaluate(() => $.event.trigger('seadLoadStateClicked', {}));

    await expect(page.locator('#vs-publicone .viewstate-visibility-btn')).toHaveText(/Public/);
    await expect(page.locator('#vs-privateone .viewstate-visibility-btn')).toHaveText(/Private/);
    await expect(page.locator('#vs-publicone .viewstate-share-list-btn')).toHaveCount(1);
    await expect(page.locator('#vs-privateone .viewstate-share-list-btn')).toHaveCount(0);
    await expect(page.locator('#vs-privateone')).toContainText('My <b>draft</b>');

    await page.click('#vs-publicone .viewstate-visibility-btn');
    await expect(page.locator('#vs-publicone .viewstate-visibility-btn')).toHaveText(/Private/);
    await expect(page.locator('#vs-publicone .viewstate-share-list-btn')).toHaveCount(0);
    expect(state.patches).toEqual([{ url: expect.stringMatching(/\/jsonapi\/viewstate\/publicone$/), body: { visibility: 'private' } }]);
    //switching is not loading
    await expect(page.locator('#popover-dialog-frame > h1')).toHaveText('Load viewstate');
  });
});
