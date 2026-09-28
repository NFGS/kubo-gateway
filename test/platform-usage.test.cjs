const { test } = require('node:test');
const assert = require('node:assert/strict');

// El servicio compone dos servicios internos; aqui se intercepta `internalFetch`
// (antes de que el servicio lo importe) para probar la composicion y su
// degradacion sin levantar la malla entera.
process.env.KUBO_IAM_URL = 'http://iam.test';
process.env.KUBO_ERP_URL = 'http://erp.test';

const llamadas = [];

function respuesta(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const fetchPath = require.resolve('../dist/lib/internal-fetch.js');
require.cache[fetchPath] = {
  id: fetchPath,
  filename: fetchPath,
  loaded: true,
  exports: {
    internalFetch: async (url) => {
      llamadas.push(String(url));

      if (String(url).includes('/platform/tenants')) {
        return respuesta(200, [{ id: 't1' }, { id: 't2' }]);
      }
      if (String(url).includes('/internal/usage')) {
        return respuesta(200, {
          data: [
            {
              tenant_id: 't1',
              products: 3,
              warehouses: 1,
              sales_month: { count: 2, revenue: '100.00' },
              documents: { count: 1, bytes: 10 },
            },
          ],
        });
      }

      return respuesta(404, {});
    },
  },
};

const { PlatformService } = require('../dist/platform/platform.service.js');

test('la vista de uso une los negocios (IAM) con los conteos (ERP)', async () => {
  llamadas.length = 0;
  const servicio = new PlatformService();

  const resultado = await servicio.usage({ 'x-platform-admin-id': 'op-1' });

  assert.equal(resultado.data.length, 1);
  assert.equal(resultado.data[0].products, 3);
  assert.equal(resultado.unavailable, undefined);
  // El ERP recibe exactamente los negocios que devolvio IAM, en una sola llamada.
  const llamadaErp = llamadas.find((url) => url.includes('/internal/usage'));
  assert.ok(llamadaErp.includes('tenant_ids=t1%2Ct2'), `ids inesperados: ${llamadaErp}`);
});

test('si IAM no responde, la vista lo declara en lugar de romperse', async () => {
  const fetchOriginal = require.cache[fetchPath].exports.internalFetch;
  require.cache[fetchPath].exports.internalFetch = async () => respuesta(503, {});

  const servicio = new PlatformService();
  const resultado = await servicio.usage({});

  assert.deepEqual(resultado.data, []);
  assert.deepEqual(resultado.unavailable, ['tenants']);

  require.cache[fetchPath].exports.internalFetch = fetchOriginal;
});

test('si el ERP no responde, el panel conserva la lista de negocios', async () => {
  const fetchOriginal = require.cache[fetchPath].exports.internalFetch;
  require.cache[fetchPath].exports.internalFetch = async (url) =>
    String(url).includes('/platform/tenants') ? respuesta(200, [{ id: 't1' }]) : respuesta(500, {});

  const servicio = new PlatformService();
  const resultado = await servicio.usage({});

  assert.deepEqual(resultado.data, []);
  assert.deepEqual(resultado.unavailable, ['erp']);

  require.cache[fetchPath].exports.internalFetch = fetchOriginal;
});
