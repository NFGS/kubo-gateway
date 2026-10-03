// ---------------------------------------------------------------------------
// Verificacion del lado del proveedor (Pact).
//
// Reproduce los contratos del consumidor (kubo-web) contra el sistema vivo,
// detras del gateway. Los estados preparan los datos minimos y el
// `requestFilter` cambia el token de ejemplo del contrato por uno real.
//
// Uso:  node kubo-gateway/scripts/pact-verify.mjs   (o `make pact`)
// Requisitos: el sistema levantado y los pacts generados por el consumidor.
// ---------------------------------------------------------------------------
import { Verifier } from '@pact-foundation/pact';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const pactsDir = resolve(aqui, '../../kubo-web/pacts');
const baseUrl = process.env.KUBO_API_BASE ?? 'http://localhost:9080';
const adminEmail = process.env.KUBO_ADMIN_EMAIL ?? 'admin@kubo.local';
const adminPassword = process.env.KUBO_ADMIN_PASSWORD ?? 'Admin123!';

const pactUrls = readdirSync(pactsDir)
  .filter((archivo) => archivo.endsWith('.json'))
  .map((archivo) => resolve(pactsDir, archivo));

if (pactUrls.length === 0) {
  console.error('[pact] no hay contratos en kubo-web/pacts; ejecute primero el consumidor');
  process.exit(1);
}

async function api(ruta, opciones = {}) {
  return fetch(`${baseUrl}/api/v1${ruta}`, opciones);
}

async function iniciarSesion() {
  const res = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });

  if (!res.ok) {
    throw new Error(`[pact] no fue posible autenticar al verificador: ${res.status}`);
  }

  return (await res.json()).accessToken;
}

const token = await iniciarSesion();
const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

const stateHandlers = {
  'el negocio de demostracion existe': async () => undefined,

  'existe al menos un producto': async () => {
    const res = await api('/products', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        sku: 'PACT-PRODUCTO',
        name: 'Producto de contrato',
        price: 1000,
        cost: 600,
        min_stock: 0,
      }),
    });

    // 409/422: el producto ya existe de una corrida anterior.
    if (![201, 409, 422].includes(res.status)) {
      throw new Error(`[pact] no se pudo preparar el producto: ${res.status}`);
    }
  },

  'existe un cliente con documento': async () => {
    // Documento unico por corrida: el cliente queda primero en el listado
    // (orden por creacion) y el contrato puede verificar el enmascarado.
    const res = await api('/customers', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        name: 'Cliente de contrato',
        stage: 'CUSTOMER',
        document_number: `PACT-${Date.now()}`,
        phone: '3001234567',
      }),
    });

    if (res.status !== 201) {
      throw new Error(`[pact] no se pudo preparar el cliente: ${res.status}`);
    }
  },
};

const verifier = new Verifier({
  provider: 'kubo-api',
  providerBaseUrl: baseUrl,
  pactUrls,
  stateHandlers,
  requestFilter: (req, _res, next) => {
    // El consumidor firma con un token de ejemplo: se reemplaza por uno real.
    if (req.headers.authorization) {
      req.headers.authorization = `Bearer ${token}`;
    }
    next();
  },
  logLevel: 'warn',
});

try {
  await verifier.verifyProvider();
  console.log(`[pact] ${pactUrls.length} contrato(s) verificados contra ${baseUrl}`);
} catch (error) {
  console.error('[pact] la verificacion fallo');
  console.error(error);
  process.exit(1);
}
