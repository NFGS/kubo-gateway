# kubo-gateway

API Gateway de Kubo. Es el único punto de entrada del sistema: valida la
identidad, aplica límites de tasa, propaga la trazabilidad y enruta cada
petición al microservicio correspondiente.

| Campo | Valor |
| --- | --- |
| Stack | Node.js 22 · TypeScript 6 · NestJS 12 (Express) |
| Puerto | 8080 (contenedor) · 9080 (host) |
| Dependencias | Redis (límites de tasa), kubo-iam (JWKS) |

## Responsabilidades

1. **Verificación de JWT** (RS256) contra el JWKS de `kubo-iam`. La llave privada
   nunca sale del servicio de identidad.
2. **Anti-suplantación**: elimina cualquier cabecera `X-User-*` enviada por el
   cliente antes de inyectar la identidad verificada.
3. **Límites de tasa** por negocio o IP, con ventana de un minuto y umbral más
   estricto en las rutas de autenticación.
4. **Correlation ID** por petición, propagado a los servicios y a los logs.
5. **Enrutamiento** sin reescritura de rutas: cada servicio sirve `/api/v1/...`.
6. **Observabilidad**: logs JSON estructurados, con `Authorization` redactado.

## Tabla de enrutamiento

| Prefijo | Servicio |
| --- | --- |
| `/api/v1/auth`, `/api/v1/users`, `/api/v1/audit` | kubo-iam |
| `/api/v1/customers` | kubo-crm |
| `/api/v1/products`, `/api/v1/sales`, `/api/v1/stock` | kubo-erp |
| `/api/v1/dashboard`, `/api/v1/events` | kubo-analytics |

## Rutas públicas

`/api/v1/health`, `/api/v1/auth/login`, `/api/v1/auth/register`,
`/api/v1/auth/refresh`, `/api/v1/auth/logout` y
`/api/v1/auth/.well-known/jwks.json`. Todo lo demás exige `Bearer <token>`.

## Ejecución local

```bash
npm install
npm run build
npm test          # pruebas de la tabla de rutas y de las rutas publicas
npm start
```

## Decisiones de diseño

- **`bodyParser: false`**: el gateway reenvía los cuerpos sin interpretarlos; así
  las subidas de archivos y los payloads grandes no se duplican en memoria.
- **Despachador único** en lugar de `app.use(prefijo, proxy)`: evita que Express
  recorte el prefijo de `req.url` y garantiza que el microservicio reciba la ruta
  original.
- **Fail-open en Redis**: si el almacén de límites cae, se permite el tráfico y se
  registra la advertencia; el negocio no se detiene por un componente auxiliar.
