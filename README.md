# kubo-gateway
[!\[CI](https://github.com/NFGS/kubo-gateway/actions/workflows/ci.yml/badge.svg)\]([https://github.com/NFGS/kubo-gateway/actions/workflows/ci.yml](https://github.com/NFGS/kubo-gateway/actions/workflows/ci.yml))
> Parte del proyecto **Kubo** — [kubo-workspace](https://github.com/NFGS/kubo-workspace) (ERP + CRM autoalojable para PYMES).
API Gateway de Kubo. Es el único punto de entrada del sistema: valida la
identidad, aplica límites de tasa, propaga la trazabilidad y enruta cada
petición al microservicio correspondiente.
<table header-row="true">
<tr>
<td>Campo</td>
<td>Valor</td>
</tr>
<tr>
<td>Stack</td>
<td>Node.js 22 · TypeScript 6 · NestJS 12 (Express)</td>
</tr>
<tr>
<td>Puerto</td>
<td>8080 (contenedor) · 9080 (host)</td>
</tr>
<tr>
<td>Dependencias</td>
<td>Redis (límites de tasa), kubo-iam (JWKS)</td>
</tr>
</table>
## Responsabilidades
1. **Verificación de JWT** (RS256) contra el JWKS de `kubo-iam`. La llave privada
	nunca sale del servicio de identidad.
2. **Anti-suplantación**: elimina cualquier cabecera `X-User-*` enviada por el
	cliente antes de inyectar la identidad verificada. También propaga la
	configuración del negocio que viaja en el token: zona horaria, vertical,
	plan y datos fiscales (NIT, DV, régimen, resolución y prefijo).
3. **Límites de tasa** por **usuario**, negocio o IP, con ventana de un minuto y
	umbral más estricto en las rutas de autenticación.
4. **BFF de autenticación**: intercepta `login`, `refresh` y `logout`, deja el
	refresh token en una **cookie ****`httpOnly`**** + ****`SameSite=Strict`** y lo elimina del
	cuerpo de la respuesta.
5. **Correlation ID** por petición, propagado a los servicios y a los logs.
6. **Enrutamiento** sin reescritura de rutas: cada servicio sirve `/api/v1/...`.
7. **Observabilidad**: logs JSON estructurados, con `Authorization` redactado.
## Tabla de enrutamiento
<table header-row="true">
<tr>
<td>Prefijo</td>
<td>Servicio</td>
</tr>
<tr>
<td>`/api/v1/auth`, `/api/v1/users`, `/api/v1/audit`, `/api/v1/tenants`, `/api/v1/platform`, `/api/v1/webhooks`</td>
<td>kubo-iam</td>
</tr>
<tr>
<td>`/api/v1/customers`</td>
<td>kubo-crm</td>
</tr>
<tr>
<td>`/api/v1/packs`, `/api/v1/products`, `/api/v1/sales`, `/api/v1/stock`, `/api/v1/suppliers`, `/api/v1/warehouses`, `/api/v1/transfers`, `/api/v1/notifications`, `/api/v1/documents`, `/api/v1/usage`, `/api/v1/purchases`, `/api/v1/cash-sessions`, `/api/v1/reports`</td>
<td>kubo-erp</td>
</tr>
<tr>
<td>`/api/v1/dashboard`, `/api/v1/events`</td>
<td>kubo-analytics</td>
</tr>
</table>
El gateway también atiende por sí mismo las vistas compuestas del BFF
(`/api/v1/dashboard/overview` y `/api/v1/platform/usage`) y su sonda
`/api/v1/health`.
## Rutas públicas
`/api/v1/health`, `/api/v1/auth/login`, `/api/v1/auth/register`,
`/api/v1/auth/refresh`, `/api/v1/auth/logout`,
`/api/v1/auth/forgot-password`, `/api/v1/auth/reset-password`,
`/api/v1/auth/totp/verify` (segundo paso del acceso), `/api/v1/platform/auth/login`
y `/api/v1/platform/auth/totp` (acceso del operador),
`/api/v1/auth/.well-known/jwks.json` y los webhooks de pago
(`/api/v1/webhooks/...`, que se autentican con firma HMAC en IAM). Todo lo demás
exige `Bearer <token>`.
## Ejecución local
```bash
npm install
npm run build
npm test          # 19 pruebas: rutas, middleware de acceso, limite de tasa (Redis real) y vista compuesta de plataforma
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
- **BFF para el refresh token**: el navegador nunca ve el token de refresco; viaja
	solo en la cookie `httpOnly` con `Path=/api/v1/auth` y `Secure` cuando la
	petición llega por HTTPS (`KUBO_COOKIE_SECURE=true` o `X-Forwarded-Proto`).
- **Límite por usuario**: una cuenta comprometida no consume la cuota de todo el
	negocio (`KUBO_USER_RATE_LIMIT_PER_MINUTE`, 300 por defecto).
## Observabilidad y contratos (Fase 2)
- **Trazas OpenTelemetry**: `src/tracing.ts` activa el SDK solo si
	`OTEL_EXPORTER_OTLP_ENDPOINT` está definido; la instrumentación automática
	cubre HTTP, Express y los proxys hacia los microservicios.
- **Contratos ejecutables**: `scripts/contracts.mjs` valida las respuestas reales
	contra `kubo-docs/api/openapi.json` con Ajv (`make contracts`, 23 verificaciones).
	El esquema `LoginResponse` usa `additionalProperties: false`: un `refreshToken`
	filtrado rompe la validación. El job necesita el sistema en ejecución
	(`KUBO_API`); el gate local lo corre `make ci`.
- **Verificación de firma**: `jwtVerify` fija `algorithms: ['RS256']`; la
	identidad solo se acepta firmada con RSA.
- **CI**: gate local `make ci` (typecheck, pruebas, contratos, Pact, humo y E2E);
	los pipelines de GitLab se retiraron al quedar GitHub como único destino.
- **Cobertura**: `npm test` corre con la cobertura nativa de Node y exige ≥ 80 %
	en líneas y funciones (hoy 95.6 / 85.2), excluyendo los archivos de prueba.
- **Contratos del consumidor (Pact)**: `scripts/pact-verify.mjs` reproduce los
	contratos de la PWA contra el sistema vivo (estados + token real); `make pact`.
