const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Limites pequenos para provocar el 429 sin inundar: la configuracion se lee al
// importar el modulo, por eso se ajusta el entorno antes de los require.
process.env.KUBO_AUTH_RATE_LIMIT_PER_MINUTE = '3';
process.env.KUBO_USER_RATE_LIMIT_PER_MINUTE = '2';

const { config } = require('../dist/config.js');
const { RedisService } = require('../dist/services/redis.service.js');
const { createRateLimitMiddleware } = require('../dist/middleware/rate-limit.middleware.js');

let redis;
let middleware;

before(async () => {
  redis = new RedisService();

  for (let intento = 0; intento < 50 && !redis.isHealthy(); intento += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.ok(
    redis.isHealthy(),
    `Redis no disponible en ${config.redisUrl}: estas pruebas requieren el Redis real (make up)`,
  );

  middleware = createRateLimitMiddleware(redis);
});

after(async () => {
  await redis.onModuleDestroy();
});

test('la ventana de autenticacion bloquea con 429 al exceder el limite', async () => {
  const ip = ipUnica('10.99');
  const permitidas = [];

  for (let intento = 1; intento <= 3; intento += 1) {
    const response = fakeResponse();
    await middleware(fakeRequest({ path: '/api/v1/auth/login', ip }), response, () =>
      permitidas.push(intento),
    );

    assert.equal(response.statusCode, 200, `el intento ${intento} debia pasar`);
    assert.equal(response.headers['x-ratelimit-limit'], '3');
  }

  const bloqueada = fakeResponse();
  await middleware(fakeRequest({ path: '/api/v1/auth/login', ip }), bloqueada, () =>
    permitidas.push('extra'),
  );

  assert.deepEqual(permitidas, [1, 2, 3], 'solo los tres primeros intentos deben pasar');
  assert.equal(bloqueada.statusCode, 429);
  assert.equal(bloqueada.body.code, 'RATE_LIMIT_EXCEEDED');
  assert.equal(bloqueada.headers['x-ratelimit-remaining'], '0');
});

test('el limite por usuario es independiente entre cuentas', async () => {
  const usuarioA = `prueba-a-${Date.now()}`;
  const usuarioB = `prueba-b-${Date.now()}`;

  for (let intento = 1; intento <= 2; intento += 1) {
    const response = fakeResponse();
    await middleware(fakeRequest({ headers: { 'x-user-id': usuarioA } }), response, () => undefined);
    assert.equal(response.statusCode, 200, `el intento ${intento} de A debia pasar`);
  }

  const terceraA = fakeResponse();
  await middleware(fakeRequest({ headers: { 'x-user-id': usuarioA } }), terceraA, () => undefined);
  assert.equal(terceraA.statusCode, 429, 'la cuenta A ya consumio su cuota');

  const primeraB = fakeResponse();
  await middleware(fakeRequest({ headers: { 'x-user-id': usuarioB } }), primeraB, () => undefined);
  assert.equal(primeraB.statusCode, 200, 'la cuenta B tiene su propia ventana');
});

test('sin identidad el limite se aplica por IP', async () => {
  const response = fakeResponse();
  await middleware(fakeRequest({ ip: ipUnica('10.98') }), response, () => undefined);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-ratelimit-limit'], String(config.rateLimitPerMinute));
});

function ipUnica(prefijo) {
  const octavo1 = Math.floor(Math.random() * 250);
  const octavo2 = Math.floor(Math.random() * 250);
  return `${prefijo}.${octavo1}.${octavo2}`;
}

function fakeRequest({ path = '/api/v1/sales', ip = '10.0.0.1', headers = {} } = {}) {
  return { path, ip, headers };
}

function fakeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = String(value);
    },
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
