import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('logto.config', () => {
  it('isLogtoEnabled requires endpoint, appId and secret', async () => {
    const prev = { ...process.env };
    delete process.env.LOGTO_ENDPOINT;
    delete process.env.LOGTO_APP_ID;
    delete process.env.LOGTO_APP_SECRET;

    const mod = await import('../dist/modules/auth/logto/logto.config.js');
    assert.equal(mod.isLogtoEnabled(), false);

    process.env.LOGTO_ENDPOINT = 'https://demo.logto.app';
    process.env.LOGTO_APP_ID = 'app-id';
    process.env.LOGTO_APP_SECRET = 'secret';
    assert.equal(mod.isLogtoEnabled(), true);
    assert.ok(mod.buildLogtoAuthorizeUrl()?.includes('client_id=app-id'));

    Object.assign(process.env, prev);
  });

  it('isLogtoEnabled respects LOGTO_ENABLED=false', async () => {
    const prev = { ...process.env };
    process.env.LOGTO_ENABLED = 'false';
    process.env.LOGTO_ENDPOINT = 'https://demo.logto.app';
    process.env.LOGTO_APP_ID = 'app-id';
    process.env.LOGTO_APP_SECRET = 'secret';

    const mod = await import('../dist/modules/auth/logto/logto.config.js');
    assert.equal(mod.isLogtoEnabled(), false);
    assert.equal(mod.readLogtoConfig(), null);

    Object.assign(process.env, prev);
  });

  it('isLocalLoginAllowed respects AUTH_ALLOW_LOCAL_LOGIN=false', async () => {
    const prev = process.env.AUTH_ALLOW_LOCAL_LOGIN;
    process.env.AUTH_ALLOW_LOCAL_LOGIN = 'false';
    const mod = await import('../dist/modules/auth/logto/logto.config.js');
    assert.equal(mod.isLocalLoginAllowed(), false);
    process.env.AUTH_ALLOW_LOCAL_LOGIN = prev;
  });
});
