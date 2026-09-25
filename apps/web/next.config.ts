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
  reactStrictMode: true,
  agentRules: false,
  transpilePackages: ['@magnox/shared', '@magnox/core', '@magnox/db', '@magnox/auth'],
  serverExternalPackages: ['sharp', 'postgres', 'ioredis', 'bullmq', 'pino', 'nodemailer'],
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
