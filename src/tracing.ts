/**
 * Trazas OpenTelemetry del gateway (P-07).
 *
 * Solo se activa cuando `OTEL_EXPORTER_OTLP_ENDPOINT` esta definido: sin
 * collector, el gateway arranca igual y no intenta exportar nada. La
 * instrumentacion automatica cubre HTTP, Express y las llamadas salientes
 * (los proxys hacia los microservicios), de modo que una peticion del POS se ve
 * como una traza unica que cruza el gateway.
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const sdk = new NodeSDK({
    serviceName: 'kubo-gateway',
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    void sdk.shutdown().catch(() => undefined);
  });
}
