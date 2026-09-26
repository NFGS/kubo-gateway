const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findRoute, proxyRoutes } = require('../dist/proxy/routes.js');
const { PUBLIC_PATHS } = require('../dist/middleware/auth.middleware.js');

test('la tabla de rutas cubre los cuatro microservicios', () => {
  const services = [...new Set(proxyRoutes.map((route) => route.service))].sort();
  assert.deepEqual(services, ['kubo-analytics', 'kubo-crm', 'kubo-erp', 'kubo-iam']);
});

test('la tabla de rutas cubre packs y perfil del negocio', () => {
  assert.equal(findRoute('/api/v1/packs')?.service, 'kubo-erp');
  assert.equal(findRoute('/api/v1/tenants/me')?.service, 'kubo-iam');
});

test('findRoute resuelve prefijos exactos y anidados', () => {
  assert.equal(findRoute('/api/v1/sales')?.service, 'kubo-erp');
  assert.equal(findRoute('/api/v1/sales/123/items')?.service, 'kubo-erp');
  assert.equal(findRoute('/api/v1/purchases')?.service, 'kubo-erp');
  assert.equal(findRoute('/api/v1/purchases/123/void')?.service, 'kubo-erp');
  assert.equal(findRoute('/api/v1/suppliers/abc')?.service, 'kubo-erp');
  assert.equal(findRoute('/api/v1/customers/abc')?.service, 'kubo-crm');
  assert.equal(findRoute('/api/v1/dashboard/summary')?.service, 'kubo-analytics');
  assert.equal(findRoute('/api/v1/desconocido'), undefined);
});

test('una ruta protegida no puede confundirse con una publica', () => {
  assert.ok(PUBLIC_PATHS.has('/api/v1/auth/login'));
  assert.ok(PUBLIC_PATHS.has('/api/v1/auth/.well-known/jwks.json'));
  assert.ok(PUBLIC_PATHS.has('/api/v1/auth/totp/verify'));
  assert.ok(!PUBLIC_PATHS.has('/api/v1/auth/me'));
  assert.ok(!PUBLIC_PATHS.has('/api/v1/customers'));
});

test('la identidad verificada viaja como cabeceras, incluida la zona horaria', async () => {
  const { createAuthMiddleware } = require('../dist/middleware/auth.middleware.js');
  const jwks = {
    verify: async () => ({
      sub: 'usuario-1',
      tenant_id: 'negocio-1',
      role: 'OWNER',
      email: 'admin@kubo.local',
      tenant_timezone: 'America/Mexico_City',
      tenant_vertical: 'restaurantes',
      tenant: 'Tienda La Esquina',
      tenant_plan: 'community',
    }),
  };
  const middleware = createAuthMiddleware(jwks);

  const request = {
    path: '/api/v1/sales',
    headers: {
      authorization: 'Bearer token',
      // El cliente intenta suplantar identidad: debe borrarse y reescribirse.
      'x-user-id': 'intruso',
      'x-tenant-timezone': 'Pacific/Kiritimati',
    },
  };
  const response = fakeResponse();
  let paso = false;

  await middleware(request, response, () => {
    paso = true;
  });

  assert.equal(paso, true);
  assert.equal(request.headers['x-user-id'], 'usuario-1');
  assert.equal(request.headers['x-tenant-id'], 'negocio-1');
  assert.equal(request.headers['x-tenant-timezone'], 'America/Mexico_City');
  assert.equal(request.headers['x-tenant-vertical'], 'restaurantes');
  assert.equal(request.headers['x-tenant-name'], 'Tienda La Esquina');
  assert.equal(request.headers['x-tenant-plan'], 'community');
});

test('sin zona horaria en el token la cabecera no queda con el valor del cliente', async () => {
  const { createAuthMiddleware } = require('../dist/middleware/auth.middleware.js');
  const jwks = { verify: async () => ({ sub: 'usuario-1', tenant_id: 'negocio-1' }) };
  const middleware = createAuthMiddleware(jwks);

  const request = {
    path: '/api/v1/sales',
    headers: { authorization: 'Bearer token', 'x-tenant-timezone': 'Pacific/Kiritimati' },
  };

  await middleware(request, fakeResponse(), () => undefined);

  assert.equal(request.headers['x-tenant-timezone'], '');
});

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
