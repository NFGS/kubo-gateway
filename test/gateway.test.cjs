const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findRoute, proxyRoutes } = require('../dist/proxy/routes.js');
const { PUBLIC_PATHS } = require('../dist/middleware/auth.middleware.js');

test('la tabla de rutas cubre los cuatro microservicios', () => {
  const services = [...new Set(proxyRoutes.map((route) => route.service))].sort();
  assert.deepEqual(services, ['kubo-analytics', 'kubo-crm', 'kubo-erp', 'kubo-iam']);
});

test('findRoute resuelve prefijos exactos y anidados', () => {
  assert.equal(findRoute('/api/v1/sales')?.service, 'kubo-erp');
  assert.equal(findRoute('/api/v1/sales/123/items')?.service, 'kubo-erp');
  assert.equal(findRoute('/api/v1/customers/abc')?.service, 'kubo-crm');
  assert.equal(findRoute('/api/v1/dashboard/summary')?.service, 'kubo-analytics');
  assert.equal(findRoute('/api/v1/desconocido'), undefined);
});

test('una ruta protegida no puede confundirse con una publica', () => {
  assert.ok(PUBLIC_PATHS.has('/api/v1/auth/login'));
  assert.ok(PUBLIC_PATHS.has('/api/v1/auth/.well-known/jwks.json'));
  assert.ok(!PUBLIC_PATHS.has('/api/v1/auth/me'));
  assert.ok(!PUBLIC_PATHS.has('/api/v1/customers'));
});
