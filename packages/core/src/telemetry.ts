import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import type * as SentryModule from '@sentry/node';
import { env } from './env';
import { logger, onErrorLogged } from './logger';

// Optional error reporting and tracing, all off unless configured:
//   SENTRY_DSN                    errors (and, with SENTRY_TRACES_SAMPLE_RATE, performance) to Sentry
//   OTEL_EXPORTER_OTLP_ENDPOINT   traces to any OpenTelemetry collector (Grafana, Honeycomb, Jaeger…)
// Both load lazily, so a site without them never loads their code.

let sentry: typeof SentryModule | null = null;
let started: Promise<void> | null = null;

export type ServiceName = 'web' | 'realtime' | 'worker';

/** Start error reporting and tracing for this process (once; later calls wait for the first). */
export function initTelemetry(service: ServiceName): Promise<void> {
  started ??= start(service).catch((err: Error) =>
    logger('telemetry').warn({ err: err.message }, 'telemetry not started'),
  );
  return started;
}

async function start(service: ServiceName) {
  const e = env();
  const log = logger('telemetry');
  const version = process.env.MAGNOX_VERSION || undefined;

  if (e.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const [
      { NodeTracerProvider, BatchSpanProcessor, TraceIdRatioBasedSampler, ParentBasedSampler },
      { OTLPTraceExporter },
      { resourceFromAttributes },
      { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION },
    ] = await Promise.all([
      import('@opentelemetry/sdk-trace-node'),
      import('@opentelemetry/exporter-trace-otlp-http'),
      import('@opentelemetry/resources'),
      import('@opentelemetry/semantic-conventions'),
    ]);
    const provider = new NodeTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: e.OTEL_SERVICE_NAME
          ? `${e.OTEL_SERVICE_NAME}-${service}`
          : `magnox-${service}`,
        ...(version ? { [ATTR_SERVICE_VERSION]: version } : {}),
      }),
      sampler: new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(e.OTEL_TRACES_SAMPLE_RATE),
      }),
      // The exporter reads OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_EXPORTER_OTLP_HEADERS itself.
      spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
    });
    provider.register();
    process.once('beforeExit', () => void provider.shutdown());
    log.info({ service, endpoint: e.OTEL_EXPORTER_OTLP_ENDPOINT }, 'tracing on');
  }

  if (e.SENTRY_DSN) {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: e.SENTRY_DSN,
      environment: e.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
      release: version,
      serverName: `magnox-${service}`,
      tracesSampleRate: e.SENTRY_TRACES_SAMPLE_RATE,
      // No user details, cookies, headers or request bodies: tokens and personal data stay here.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
    });
    Sentry.setTag('service', service);
    sentry = Sentry;
    // Anything logged as an error is reported too (route handlers and actions catch their errors
    // and log them rather than letting them reach Next).
    onErrorLogged((err, context) => reportError(err, context));
    log.info({ service }, 'error reporting on');
  }
}

/** Send an unexpected error to Sentry (when set up). Logging it is still the caller's job. */
export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  if (!sentry) return;
  sentry.withScope((scope) => {
    for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
    sentry!.captureException(err);
  });
}

/** Send what's waiting before the process exits. */
export async function flushTelemetry(timeoutMs = 2000): Promise<void> {
  if (sentry) await sentry.flush(timeoutMs).catch(() => false);
}

const tracer = () => trace.getTracer('magnox');

/**
 * Run `fn` inside a span (a no-op without tracing). Errors are recorded on the span and
 * rethrown.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}
