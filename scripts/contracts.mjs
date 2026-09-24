#!/usr/bin/env node
/**
 * Prueba de contrato ejecutable (P-09).
 *
 * Valida las respuestas reales del API Gateway contra los esquemas de
 * `kubo-docs/api/openapi.json` con Ajv. Una respuesta que deje de cumplir el
 * contrato (un campo que desaparece, un tipo que cambia, un `refreshToken` que
 * se filtra al cuerpo) falla aqui y bloquea el merge en CI.
 *
 * Uso:  make contracts        (requiere el sistema levantado)
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv from 'ajv';

const BASE = process.env.KUBO_API ?? 'http://localhost:9080/api/v1';
const EMAIL = process.env.KUBO_ADMIN_EMAIL ?? 'admin@kubo.local';
const PASSWORD = process.env.KUBO_ADMIN_PASSWORD ?? 'Admin123!';

const here = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(here, '../../kubo-docs/api/openapi.json');

const spec = JSON.parse(await readFile(specPath, 'utf8'));
spec.$id = 'urn:kubo:api';

const ajv = new Ajv({ strict: false, allErrors: true });
ajv.addSchema(spec);

const validate = (schemaName) =>
  ajv.compile({ $ref: `urn:kubo:api#/components/schemas/${schemaName}` });

let pass = 0;
let fail = 0;

function check(name, schemaName, payload) {
  const validator = validate(schemaName);
  if (validator(payload)) {
    console.log(`  \u001b[32mPASA\u001b[0m  ${name}`);
    pass += 1;
  } else {
    console.log(`  \u001b[31mFALLA\u001b[0m ${name}`);
    for (const error of validator.errors ?? []) {
      console.log(`         ${error.instancePath || '/'} ${error.message}`);
    }
    fail += 1;
  }
}

async function get(pathname, token) {
  const response = await fetch(`${BASE}${pathname}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

console.log('\nKubo \u00b7 contratos ejecutables (OpenAPI)');
console.log('================================================================');

// 1. Error 401 sin token
const unauthorized = await get('/customers');
if (unauthorized.status === 401) {
  check('401 sin token cumple el esquema Error', 'Error', unauthorized.body);
} else {
  console.log(`  \u001b[31mFALLA\u001b[0m se esperaba 401 sin token (obtenido ${unauthorized.status})`);
  fail += 1;
}

// 2. Login
const loginResponse = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const login = { status: loginResponse.status, body: await loginResponse.json() };
if (login.status === 200) {
  check('login cumple el esquema LoginResponse (sin refreshToken en el cuerpo)', 'LoginResponse', login.body);
} else {
  console.log(`  \u001b[31mFALLA\u001b[0m login respondio ${login.status}`);
  fail += 1;
  process.exit(1);
}
const token = login.body.accessToken;

// 3. Endpoints de negocio
const me = await get('/auth/me', token);
if (me.status === 200) check('/auth/me cumple el esquema User', 'User', me.body);
else {
  console.log(`  \u001b[31mFALLA\u001b[0m /auth/me respondio ${me.status}`);
  fail += 1;
}

const products = await get('/products?limit=2', token);
if (products.status === 200) check('/products cumple el esquema ProductList', 'ProductList', products.body);
else {
  console.log(`  \u001b[31mFALLA\u001b[0m /products respondio ${products.status}`);
  fail += 1;
}

const productId = products.body?.data?.[0]?.id;
if (productId) {
  const detail = await get(`/products/${productId}`, token);
  if (detail.status === 200) check('/products/{id} cumple el esquema ProductItem', 'ProductItem', detail.body);
  else {
    console.log(`  \u001b[31mFALLA\u001b[0m /products/{id} respondio ${detail.status}`);
    fail += 1;
  }
}

const customers = await get('/customers', token);
if (customers.status === 200) check('/customers cumple el esquema CustomerList', 'CustomerList', customers.body);
else {
  console.log(`  \u001b[31mFALLA\u001b[0m /customers respondio ${customers.status}`);
  fail += 1;
}

const sales = await get('/sales?limit=2', token);
if (sales.status === 200) check('/sales cumple el esquema SaleList', 'SaleList', sales.body);
else {
  console.log(`  \u001b[31mFALLA\u001b[0m /sales respondio ${sales.status}`);
  fail += 1;
}

const overview = await get('/dashboard/overview', token);
if (overview.status === 200) {
  check('/dashboard/overview cumple el esquema OverviewResponse', 'OverviewResponse', overview.body);
} else {
  console.log(`  \u001b[31mFALLA\u001b[0m /dashboard/overview respondio ${overview.status}`);
  fail += 1;
}

console.log('================================================================');
console.log(`Resultado: \u001b[32m${pass} contratos verificados\u001b[0m, \u001b[31m${fail} fallidos\u001b[0m\n`);

if (fail > 0) {
  process.exit(1);
}
