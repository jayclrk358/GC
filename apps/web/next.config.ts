import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Share the monorepo root .env with the other apps. Existing variables always win.
const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  // Caddy compresses responses (zstd or gzip) on the way out; doing it here as well would only
  // cost CPU and stop Caddy using zstd.
  compress: false,
  reactStrictMode: true,
  agentRules: false,
  // Keep the dev badge clear of the sidebar's bottom controls.
  devIndicators: { position: 'bottom-right' },
  // Render metadata in <head> before the page instead of streaming it into <body> afterwards.
  // Screen readers announce the document title on load, so it must be there from the start
  // (WCAG 2.4.2). Our generateMetadata reuses the request-cached community load, so it's cheap.
  htmlLimitedBots: /.*/,
  transpilePackages: ['@magnox/shared', '@magnox/core', '@magnox/db', '@magnox/auth'],
  serverExternalPackages: [
    'sharp',
    'postgres',
    'ioredis',
    'bullmq',
    'pino',
    'nodemailer',
    // Error reporting and tracing load only when configured (packages/core/src/telemetry.ts).
    '@sentry/node',
    '@opentelemetry/sdk-trace-node',
    '@opentelemetry/exporter-trace-otlp-http',
  ],
  experimental: {
    // No server action takes files (they go to /api/uploads); the biggest bodies are long posts
    // and wiki pages as rich text, well under this.
    serverActions: { bodySizeLimit: '2mb' },
    // The proxy keeps a copy of each request body up to this size, cutting off the rest, so it
    // caps every route that passes through it (server actions, webhooks, the API). Uploads skip
    // it (see the matcher in proxy.ts) and check their own size; Caddy caps everything too.
    proxyClientMaxBodySize: '2mb',
    // Import only the Radix components used, not the whole umbrella package.
    optimizePackageImports: ['radix-ui'],
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
