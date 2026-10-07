// @ts-check
const { test, expect } = require('@playwright/test');

/*
* Accounts: a user who signs in for the first time is asked to accept the privacy policy before they have an
* account, and until then the page treats them as signed out. The Account dialog shows what SEAD keeps about
* them and lets them delete their account. The session and json_api_server's answers are stood in for here.
*/

const USER = { provider: 'orcid', id: '0000-0002-1825-0097', displayName: 'Rita Reader', uri: 'https://orcid.org/0000-0002-1825-0097', emails: [] };
const PROVIDERS = [{ id: 'orcid', label: 'ORCID', loginUrl: '/jsonapi/auth/orcid' }];

/* A session that is signed in, and has (or has yet to) accept the privacy policy; records what is posted. */
async function serveSession(page, { consented }) {
  const state = { consented: consented, posts: [] };
  await page.route('**/jsonapi/auth/status', route => route.fulfill({
    json: { loggedIn: true, providers: PROVIDERS, user: USER, roles: state.consented ? ['user'] : [], permissions: [],
            consent: { required: !state.consented, version: '2026-10-07' } }
  }));
  await page.route('**/jsonapi/auth/consent', route => {
    state.posts.push({ path: 'consent', body: route.request().postDataJSON() });
    state.consented = true;
    return route.fulfill({ json: { roles: ['user'], permissions: [], consent: { required: false, version: '2026-10-07' } } });
  });
  await page.route('**/jsonapi/auth/logout', route => {
    state.posts.push({ path: 'logout' });
    return route.fulfill({ json: { message: 'Logged out successfully' } });
  });
  await page.route('**/jsonapi/auth/account', route => {
    if(route.request().method() == 'DELETE') {
      state.posts.push({ path: 'delete-account' });
      return route.fulfill({ json: { deleted: true } });
    }
    return route.fulfill({ json: {
      id: 'orcid:0000-0002-1825-0097',
      account: { display_name: 'Rita Reader', email: null, organization: null, uri: USER.uri, first_sign_in_at: '2026-10-07T08:00:00Z',
                 last_sign_in_at: '2026-10-07T09:00:00Z', sign_ins: 2, privacy_consent: { version: '2026-10-07', at: '2026-10-07T08:00:00Z' } },
      roles: ['user'], note: 'Reviewer for <b>ceramics</b>', viewstates: 3
    } });
  });
  return state;
}

async function waitForSystem(page) {
  await page.waitForFunction(() => window.sqs && window.sqs.systemReady);
}

test.describe('accounts', () => {
  test('a first sign-in asks for the privacy policy to be accepted, and the page waits for it', async ({ page }) => {
    const state = await serveSession(page, { consented: false });
    await page.goto('/');
    await waitForSystem(page);

    await expect(page.locator('#popover-dialog-frame > h1')).toHaveText('Your SEAD account');
    await expect(page.locator('#popover-dialog .privacy-consent-name')).toHaveText('Rita Reader');
    expect(await page.evaluate(() => window.sqs.userManager.getUser())).toBeNull();

    //the policy itself is there to read
    await page.locator('#popover-dialog .privacy-consent-policy summary').click();
    await expect(page.locator('#popover-dialog .privacy-consent-policy-text')).toContainText('Your rights');

    const accept = page.locator('#popover-dialog .privacy-consent-accept');
    await expect(accept).toBeDisabled();
    await page.locator('#popover-dialog .privacy-consent-checkbox').check();
    await accept.click();

    await expect(page.locator('#popover-dialog')).toBeHidden();
    expect(state.posts).toEqual([{ path: 'consent', body: { version: '2026-10-07' } }]);
    expect(await page.evaluate(() => [window.sqs.userManager.getUser().displayName, window.sqs.userManager.roles])).toEqual(['Rita Reader', ['user']]);
  });

  test('declining signs the user out', async ({ page }) => {
    const state = await serveSession(page, { consented: false });
    await page.goto('/');
    await waitForSystem(page);
    await page.locator('#popover-dialog .privacy-consent-decline').click();
    await expect.poll(() => state.posts.map(p => p.path)).toEqual(['logout']);
    expect(await page.evaluate(() => [window.sqs.userManager.getUser(), window.sqs.userManager.pendingUser])).toEqual([null, null]);
  });

  test('what needs an account waits for the policy, then carries on', async ({ page }) => {
    await serveSession(page, { consented: false });
    await page.route('**/jsonapi/viewstates', route => route.fulfill({ json: [] }));
    await page.goto('/');
    await waitForSystem(page);
    await page.evaluate(() => window.sqs.dialogManager.hidePopOver());

    await page.evaluate(() => $.event.trigger('seadSaveStateClicked', {}));
    await expect(page.locator('#popover-dialog-frame > h1')).toHaveText('Your SEAD account');
    await page.locator('#popover-dialog .privacy-consent-checkbox').check();
    await page.locator('#popover-dialog .privacy-consent-accept').click();
    await expect(page.locator('#popover-dialog-frame > h1')).toHaveText('Save viewstate');
  });

  test('the Account dialog shows what SEAD keeps, as text, and deletes the account', async ({ page }) => {
    const state = await serveSession(page, { consented: true });
    await page.goto('/');
    await page.waitForFunction(() => window.sqs && window.sqs.systemReady && window.sqs.userManager.getUser() != null);
    await page.evaluate(() => window.sqs.userManager.showAccountDialog());

    const facts = page.locator('#popover-dialog .account-data-facts');
    await expect(facts).toContainText('Saved viewstates');
    await expect(facts).toContainText('Reviewer for <b>ceramics</b>');
    await expect(facts).toContainText('version of 2026-10-07');

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#popover-dialog .account-data-delete-button').click();
    await expect(page.locator('#popover-dialog')).toBeHidden();
    expect(state.posts.map(p => p.path)).toEqual(['delete-account']);
    expect(await page.evaluate(() => window.sqs.userManager.getUser())).toBeNull();
  });

  test('an admin is not offered to delete their account', async ({ page }) => {
    await serveSession(page, { consented: true });
    await page.route('**/jsonapi/auth/status', route => route.fulfill({
      json: { loggedIn: true, providers: PROVIDERS, user: USER, roles: ['sysadmin'], permissions: ['administer_users'], consent: { required: false } }
    }));
    await page.goto('/');
    await page.waitForFunction(() => window.sqs && window.sqs.systemReady && window.sqs.userManager.getUser() != null);
    await page.evaluate(() => window.sqs.userManager.showAccountDialog());
    await expect(page.locator('#popover-dialog .account-data-delete-button')).toBeDisabled();
  });

  test('the privacy policy is at /privacy, and under Legal', async ({ page }) => {
    await page.goto('/privacy');
    await waitForSystem(page);
    await expect(page.locator('#popover-dialog-frame > h1')).toHaveText('Privacy policy');
    await expect(page.locator('#popover-dialog .privacy-policy')).toContainText('What your account keeps, and why');

    await page.evaluate(() => window.sqs.dialogManager.hidePopOver());
    await page.click('#aux-menu-button');
    await page.locator('#aux-menu [menu-item="legal"]').click();
    await expect(page.locator('#popover-dialog-frame > h1')).toHaveText('Privacy policy');
  });
});
