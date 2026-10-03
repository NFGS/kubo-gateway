const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthMiddleware } = require('../dist/middleware/auth.middleware.js');

function fakeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('una ruta publica pasa sin token y sin tocar el JWKS', async () => {
  const middleware = createAuthMiddleware({
    verify: async () => {
      throw new Error('no deberia verificarse en una ruta publica');
    },
  });
  const request = { path: '/api/v1/auth/login', headers: {} };
  const response = fakeResponse();
  let paso = false;

  await middleware(request, response, () => {
    paso = true;
  });

  assert.equal(paso, true);
  assert.equal(response.statusCode, 200);
});

test('los webhooks de proveedores pasan sin token (firma HMAC en IAM)', async () => {
  const middleware = createAuthMiddleware({
    verify: async () => {
      throw new Error('no deberia verificarse un webhook');
    },
  });
  const request = { path: '/api/v1/webhooks/payments/manual', headers: {} };
  const response = fakeResponse();
  let paso = false;

  await middleware(request, response, () => {
    paso = true;
  });

  assert.equal(paso, true);
});

test('sin cabecera Bearer responde 401 MISSING_TOKEN', async () => {
  const middleware = createAuthMiddleware({ verify: async () => ({}) });
  const request = { path: '/api/v1/sales', headers: {} };
  const response = fakeResponse();
  let paso = false;

  await middleware(request, response, () => {
    paso = true;
  });

  assert.equal(paso, false);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, 'MISSING_TOKEN');
});

test('un token de negocio no entra al panel de plataforma (403)', async () => {
  const middleware = createAuthMiddleware({
    verify: async () => ({ sub: 'usuario-1', platform: false }),
  });
  const request = {
    path: '/api/v1/platform/tenants',
    headers: { authorization: 'Bearer token' },
  };
  const response = fakeResponse();

  await middleware(request, response, () => {
    throw new Error('no deberia pasar');
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, 'FORBIDDEN');
});

test('un token de plataforma no lee el API del negocio (403)', async () => {
  const middleware = createAuthMiddleware({
    verify: async () => ({ sub: 'operador-1', platform: true }),
  });
  const request = { path: '/api/v1/customers', headers: { authorization: 'Bearer token' } };
  const response = fakeResponse();

  await middleware(request, response, () => {
    throw new Error('no deberia pasar');
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, 'FORBIDDEN');
});

test('un token de plataforma viaja como cabeceras del operador', async () => {
  const middleware = createAuthMiddleware({
    verify: async () => ({ sub: 'operador-1', email: 'operador@kubo.local', platform: true }),
  });
  const request = {
    path: '/api/v1/platform/tenants',
    headers: { authorization: 'Bearer token' },
  };
  const response = fakeResponse();
  let paso = false;

  await middleware(request, response, () => {
    paso = true;
  });

  assert.equal(paso, true);
  assert.equal(request.headers['x-platform-admin-id'], 'operador-1');
  assert.equal(request.headers['x-platform-admin-email'], 'operador@kubo.local');
});

test('un token invalido responde 401 INVALID_TOKEN', async () => {
  const middleware = createAuthMiddleware({
    verify: async () => {
      throw new Error('firma invalida');
    },
  });
  const request = { path: '/api/v1/sales', headers: { authorization: 'Bearer roto' } };
  const response = fakeResponse();
  let paso = false;

  await middleware(request, response, () => {
    paso = true;
  });

  assert.equal(paso, false);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, 'INVALID_TOKEN');
});
