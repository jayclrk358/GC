import type { Instrumentation } from 'next';

// Next calls these on the server: start error reporting and tracing (when configured; see
// packages/core/src/telemetry.ts), and report errors that reach Next.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { initTelemetry } = await import('@gamecentral/core/telemetry');
  await initTelemetry('web');
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reportError } = await import('@gamecentral/core/telemetry');
  reportError(err, {
    // The route pattern, not the path: paths can hold ids people would rather not send.
    route: context.routePath,
    routeType: context.routeType,
    method: request.method,
  });
};
