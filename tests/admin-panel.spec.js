// @ts-check
const { test, expect } = require('@playwright/test');

/*
* The admin panel: the account menu offers it to users with the administer_users permission, and it lists and
* changes users and roles through json_api_server's /admin endpoints. The agent chatbox is shown to users with
* the sead_agent permission. Both the session and those endpoints are stood in for by the test.
*/

const ADMIN = { provider: 'saml', id: 'admin@umu.se', displayName: 'Ada Admin', emails: [{ value: 'ada@umu.se' }], organization: 'umu.se' };
const PROVIDERS = [{ id: 'saml', label: 'SEAD login', loginUrl: '/auth/saml/login' }];
const PERMISSIONS = [
  { id: 'administer_users', label: 'Administer users', description: 'Use the admin panel.' },
  { id: 'sead_agent', label: 'SEAD agent', description: 'Use the SEAD agent chatbox.' }
];

function roles() {
  return [
    { id: 'sysadmin', description: 'Administers SEAD.', permissions: ['administer_users', 'sead_agent'], builtin: true, locked: ['administer_users'], users: 1 },
    { id: 'agent-users', description: 'May chat', permissions: ['sead_agent'], builtin: false, locked: [], users: 0 }
  ];
}

function users() {
  return [
    { id: 'saml:admin@umu.se', provider: 'saml', display_name: 'Ada Admin', email: 'ada@umu.se', organization: 'umu.se', uri: null,
      first_sign_in_at: '2026-10-01T08:00:00Z', last_sign_in_at: '2026-10-07T08:00:00Z', sign_ins: 4, signed_in: true,
      roles: ['sysadmin'], note: null, roles_updated_at: null, roles_updated_by: null },
    { id: 'orcid:0000-0002-1825-0097', provider: 'orcid', display_name: 'Rita Reader', email: null, organization: null,
      uri: 'https://orcid.org/0000-0002-1825-0097', first_sign_in_at: '2026-10-02T08:00:00Z', last_sign_in_at: '2026-10-03T08:00:00Z',
      sign_ins: 1, signed_in: true, roles: [], note: null, roles_updated_at: null, roles_updated_by: null },
    { id: 'saml:<b>evil</b>@x.se', provider: 'saml', display_name: '<img src=x onerror="window.xss=1">', email: null, organization: null,
      uri: null, first_sign_in_at: null, last_sign_in_at: null, sign_ins: 0, signed_in: false,
      roles: [], note: null, roles_updated_at: null, roles_updated_by: null }
  ];
}

async function serveSignedIn(page, roles, permissions) {
  await page.route('**/jsonapi/auth/status', route => route.fulfill({
    json: { loggedIn: true, providers: PROVIDERS, user: ADMIN, roles: roles, permissions: permissions }
  }));
}

const SYSADMIN = [['sysadmin'], ['administer_users', 'sead_agent']];

/* The /admin endpoints, on a list of users the test can inspect. */
async function serveAdmin(page) {
  const state = { users: users(), roles: roles(), requests: [] };
  await page.route('**/jsonapi/admin/roles**', async route => {
    const request = route.request();
    const path = decodeURIComponent(new URL(request.url()).pathname);
    state.requests.push({ method: request.method(), path: path, body: request.postDataJSON() });
    if(request.method() == 'GET') {
      return route.fulfill({ json: { permissions: PERMISSIONS, roles: state.roles } });
    }
    if(request.method() == 'POST') {
      const body = request.postDataJSON();
      const role = { id: body.id, description: body.description, permissions: body.permissions, builtin: false, locked: [], users: 0 };
      state.roles.push(role);
      return route.fulfill({ status: 201, json: role });
    }
    const id = path.split('/admin/roles/')[1];
    if(request.method() == 'PUT') {
      const role = state.roles.find(r => r.id == id);
      Object.assign(role, request.postDataJSON());
      return route.fulfill({ json: role });
    }
    state.roles = state.roles.filter(r => r.id != id);
    return route.fulfill({ json: { id: id, users: 0 } });
  });
  await page.route('**/jsonapi/admin/users**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    state.requests.push({ method: request.method(), path: decodeURIComponent(path), body: request.postDataJSON() });
    if(request.method() == 'GET') {
      return route.fulfill({ json: { you: 'saml:admin@umu.se', users: state.users } });
    }
    const id = decodeURIComponent(path.split('/admin/users/')[1].replace(/\/sessions$/, ''));
    if(request.method() == 'PUT') {
      const body = request.postDataJSON();
      let user = state.users.find(u => u.id == id);
      if(!user) {
        user = { id: id, provider: 'orcid', display_name: null, roles: [], signed_in: false, sign_ins: 0 };
        state.users.push(user);
      }
      user.roles = body.roles;
      return route.fulfill({ json: { id: id, roles: body.roles } });
    }
    return route.fulfill({ json: { id: id, ended: 1 } });
  });
  return state;
}

async function openAdminPanel(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.sqs && window.sqs.systemReady && window.sqs.userManager.getUser() != null);
  await page.click('#aux-menu-button');
  await page.locator('#aux-menu [menu-item="account"]').click();
  await page.locator('#aux-menu [menu-item="admin"]').click();
  await expect(page.locator('#popover-dialog-frame > h1')).toHaveText('Admin');
}

const row = (page, id) => page.locator(`#popover-dialog .admin-user[data-user-id="${id}"]`);

test.describe('admin panel', () => {
  test('is not offered without the administer_users permission', async ({ page }) => {
    await serveSignedIn(page, ['agent-users'], ['sead_agent']);
    await page.goto('/');
    await page.waitForFunction(() => window.sqs && window.sqs.systemReady && window.sqs.userManager.getUser() != null);
    await page.click('#aux-menu-button');
    await page.locator('#aux-menu [menu-item="account"]').click();
    await expect(page.locator('#aux-menu [menu-item="sign-out"]')).toBeVisible();
    await expect(page.locator('#aux-menu [menu-item="admin"]')).toBeHidden();
  });

  test('lists the users, as text', async ({ page }) => {
    await serveSignedIn(page, ...SYSADMIN);
    await serveAdmin(page);
    await openAdminPanel(page);

    await expect(page.locator('#popover-dialog .admin-user')).toHaveCount(3);
    await expect(page.locator('#popover-dialog .admin-users-summary')).toHaveText('3 users, 2 signed in now, 1 with a role.');
    await expect(row(page, 'saml:admin@umu.se').locator('input[type=checkbox]')).toHaveCount(2);
    await expect(row(page, 'orcid:0000-0002-1825-0097')).toContainText('https://orcid.org/0000-0002-1825-0097');
    await expect(row(page, 'saml:<b>evil</b>@x.se')).toContainText('<img src=x');
    expect(await page.evaluate(() => window.xss)).toBeUndefined();

    //you cannot take away your own sysadmin role, nor sign yourself out here
    await expect(row(page, 'saml:admin@umu.se').locator('input[value=sysadmin]')).toBeDisabled();
    await expect(row(page, 'saml:admin@umu.se').getByRole('button', { name: 'Sign out' })).toHaveCount(0);

    await page.fill('#popover-dialog .admin-users-filter', 'rita');
    await expect(page.locator('#popover-dialog .admin-user')).toHaveCount(1);
  });

  test('gives and takes away roles, and signs users out', async ({ page }) => {
    await serveSignedIn(page, ...SYSADMIN);
    const state = await serveAdmin(page);
    await openAdminPanel(page);

    await row(page, 'orcid:0000-0002-1825-0097').locator('input[value=sysadmin]').check();
    await expect(page.locator('#popover-dialog .admin-status')).toHaveText('Saved Rita Reader.');
    expect(state.requests.at(-1)).toEqual({ method: 'PUT', path: '/jsonapi/admin/users/orcid:0000-0002-1825-0097', body: { roles: ['sysadmin'] } });
    //the roles tab counts the users of each role
    await expect(page.locator('#popover-dialog .admin-role[data-role-id=sysadmin] .admin-role-users')).toHaveText('2');

    await row(page, 'orcid:0000-0002-1825-0097').locator('input[value=sysadmin]').uncheck();
    await expect(page.locator('#popover-dialog .admin-status')).toHaveText('Saved Rita Reader.');
    expect(state.requests.at(-1).body).toEqual({ roles: [] });

    page.once('dialog', dialog => dialog.accept());
    await row(page, 'orcid:0000-0002-1825-0097').getByRole('button', { name: 'Sign out' }).click();
    await expect(page.locator('#popover-dialog .admin-status')).toHaveText('Rita Reader has been signed out.');
    expect(state.requests.at(-1).method).toBe('DELETE');
    await expect(row(page, 'orcid:0000-0002-1825-0097').getByRole('button', { name: 'Sign out' })).toHaveCount(0);

    await page.fill('#popover-dialog .admin-add-user-id', 'orcid:0000-0001-5109-3700');
    await page.press('#popover-dialog .admin-add-user-id', 'Enter');
    await expect(page.locator('#popover-dialog .admin-status')).toHaveText('orcid:0000-0001-5109-3700 has the role sysadmin.');
    await expect(row(page, 'orcid:0000-0001-5109-3700').locator('input[value=sysadmin]')).toBeChecked();
  });

  test('a change the server refuses is put back', async ({ page }) => {
    await serveSignedIn(page, ...SYSADMIN);
    await serveAdmin(page);
    await page.route('**/jsonapi/admin/users/*', route => route.request().method() == 'PUT'
      ? route.fulfill({ status: 500, json: { error: 'The roles could not be saved.' } })
      : route.fallback());
    await openAdminPanel(page);

    await row(page, 'orcid:0000-0002-1825-0097').locator('input[value=sysadmin]').check();
    await expect(page.locator('#popover-dialog .admin-status')).toHaveText('Rita Reader could not be saved: The roles could not be saved.');
    await expect(row(page, 'orcid:0000-0002-1825-0097').locator('input[value=sysadmin]')).not.toBeChecked();
  });

  test('decides what each role may do, and creates and deletes roles', async ({ page }) => {
    await serveSignedIn(page, ...SYSADMIN);
    const state = await serveAdmin(page);
    await openAdminPanel(page);
    await page.click('#popover-dialog .admin-tab[data-tab=roles]');
    await expect(page.locator('#popover-dialog .admin-tab-panel[data-tab=users]')).toBeHidden();

    const roleRow = id => page.locator(`#popover-dialog .admin-role[data-role-id="${id}"]`);
    await expect(page.locator('#popover-dialog .admin-roles-table thead')).toContainText('Administer users');
    await expect(page.locator('#popover-dialog .admin-roles-table thead')).toContainText('SEAD agent');
    //sysadmin always administers users, and is built in
    await expect(roleRow('sysadmin').locator('input[value=administer_users]')).toBeDisabled();
    await expect(roleRow('sysadmin').getByRole('button', { name: 'Delete' })).toHaveCount(0);

    await roleRow('sysadmin').locator('input[value=sead_agent]').uncheck();
    await expect(page.locator('#popover-dialog .admin-status')).toHaveText('Saved the role sysadmin.');
    expect(state.requests.at(-1)).toEqual({ method: 'PUT', path: '/jsonapi/admin/roles/sysadmin', body: { description: 'Administers SEAD.', permissions: ['administer_users'] } });

    await page.fill('#popover-dialog .admin-add-role-id', 'useradmins');
    await page.locator('#popover-dialog .admin-add-role-permissions input[value=administer_users]').check();
    await page.press('#popover-dialog .admin-add-role-id', 'Enter');
    await expect(page.locator('#popover-dialog .admin-status')).toHaveText('Created the role useradmins. Give it to users in the Users tab.');
    expect(state.requests.find(r => r.method == 'POST').body).toEqual({ id: 'useradmins', description: '', permissions: ['administer_users'] });
    await expect(roleRow('useradmins').locator('input[value=administer_users]')).toBeChecked();

    page.once('dialog', dialog => dialog.accept());
    await roleRow('agent-users').getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('#popover-dialog .admin-status')).toHaveText('Deleted the role agent-users.');
    await expect(roleRow('agent-users')).toHaveCount(0);
  });
});

test.describe('SEAD agent chatbox', () => {
  test('is there for users with the sead_agent permission, without dev mode', async ({ page }) => {
    await serveSignedIn(page, ['agent-users'], ['sead_agent']);
    await page.goto('/');
    await page.waitForFunction(() => window.sqs && window.sqs.systemReady && window.sqs.userManager.getUser() != null);
    await expect(page.locator('#chatbox-icon')).toBeVisible();
  });

  test('is not there for users without it, and goes when the permission does', async ({ page }) => {
    await serveSignedIn(page, ...SYSADMIN);
    await page.goto('/');
    await page.waitForFunction(() => window.sqs && window.sqs.systemReady && window.sqs.userManager.getUser() != null);
    await expect(page.locator('#chatbox-icon')).toBeVisible();

    await page.evaluate(() => window.sqs.userManager.setUser(window.sqs.userManager.getUser(), ['sysadmin'], ['administer_users']));
    await expect(page.locator('#chatbox-icon')).toBeHidden();
    //nor does dev mode bring it back
    await page.keyboard.press('Shift+D');
    await expect(page.locator('#chatbox-icon')).toBeHidden();
  });

  test('is not there when signed out', async ({ page }) => {
    await page.route('**/jsonapi/auth/status', route => route.fulfill({ json: { loggedIn: false, providers: PROVIDERS } }));
    await page.goto('/');
    await page.waitForFunction(() => window.sqs && window.sqs.systemReady);
    await expect(page.locator('#chatbox-icon')).toBeHidden();
  });
});
