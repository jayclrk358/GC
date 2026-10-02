import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDiscordWebhookUrl } from '@magnox/shared';
import {
  discordMessage,
  maskWebhookUrl,
  webhookSignature,
  type WebhookPayload,
} from './services/webhooks';

const DISCORD_URL =
  'https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-abc';

function payload(event: WebhookPayload['event'], data: Record<string, unknown>): WebhookPayload {
  return {
    id: '0192f1c4-0000-7000-8000-000000000000',
    event,
    occurredAt: '2026-01-01T00:00:00.000Z',
    community: { id: 'c1', slug: 'neon', name: 'Neon Arcade', url: 'https://m.test/c/neon' },
    data,
  };
}

describe('webhook addresses', () => {
  it('recognises Discord webhook URLs only', () => {
    expect(isDiscordWebhookUrl(DISCORD_URL)).toBe(true);
    expect(isDiscordWebhookUrl(DISCORD_URL.replace('discord.com', 'canary.discord.com'))).toBe(
      true,
    );
    expect(isDiscordWebhookUrl(DISCORD_URL.replace('https', 'http'))).toBe(false);
    expect(isDiscordWebhookUrl('https://discord.com.evil.test/api/webhooks/1234567/abc')).toBe(
      false,
    );
    expect(isDiscordWebhookUrl('https://example.com/hooks/1')).toBe(false);
  });

  it('hides the secret part of an address', () => {
    expect(maskWebhookUrl(DISCORD_URL)).toBe(
      'https://discord.com/api/webhooks/123456789012345678/••••',
    );
    expect(maskWebhookUrl('https://example.com/hook?token=secret')).toBe(
      'https://example.com/hook?…',
    );
    expect(maskWebhookUrl('not a url')).toBe('');
  });
});

describe('webhookSignature', () => {
  it('is the hex HMAC of "timestamp.body"', () => {
    const body = '{"event":"ping"}';
    const expected = createHmac('sha256', 'whsec_test').update(`1700000000.${body}`).digest('hex');
    expect(webhookSignature('whsec_test', '1700000000', body)).toBe(`sha256=${expected}`);
    expect(webhookSignature('other', '1700000000', body)).not.toBe(`sha256=${expected}`);
  });
});

describe('discordMessage', () => {
  it('never pings anyone', () => {
    const msg = discordMessage(
      payload('message.created', {
        channel: { id: 'ch', name: 'general' },
        message: { content: '@everyone free stuff', url: 'https://m.test/c/neon/m/1' },
        author: { name: 'Alice', url: 'https://m.test/u/alice' },
      }),
    );
    expect(msg.allowed_mentions).toEqual({ parse: [] });
    const [embed] = msg.embeds as Record<string, unknown>[];
    expect(embed!.title).toBe('New message in #general');
    expect(embed!.description).toBe('@everyone free stuff');
    expect(embed!.author).toEqual({ name: 'Alice', url: 'https://m.test/u/alice' });
    expect(embed!.footer).toEqual({ text: 'Neon Arcade' });
  });

  it('describes server alerts and departures', () => {
    const up = discordMessage(
      payload('server.up', { server: { name: 'Survival', url: 'u' }, downtimeMs: 3_600_000 }),
    );
    expect((up.embeds as { title: string }[])[0]!.title).toBe('Survival is back up after 1 h');
    const down = discordMessage(payload('server.down', { server: { name: 'Survival' } }));
    expect((down.embeds as { title: string }[])[0]!.title).toBe('Survival is down');
    const kicked = discordMessage(
      payload('member.left', { user: { name: 'Bob' }, reason: 'kicked' }),
    );
    expect((kicked.embeds as { title: string }[])[0]!.title).toBe('Bob was removed');
  });

  it('keeps long text within Discord’s limits', () => {
    const msg = discordMessage(
      payload('thread.created', {
        channel: { name: 'ideas' },
        thread: { title: 'x'.repeat(400), excerpt: 'y'.repeat(5000), url: 'u' },
      }),
    );
    const [embed] = msg.embeds as { title: string; description: string }[];
    expect(embed!.title.length).toBeLessThanOrEqual(256);
    expect(embed!.description.length).toBeLessThanOrEqual(4096);
  });
});

describe('setDiscordRole', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load(responses: { status: number; body?: unknown }[]) {
    vi.stubEnv('DISCORD_BOT_TOKEN', 'bot-token');
    vi.stubEnv('DISCORD_API_URL', 'https://discord.test/api/v10');
    const calls: { url: string; method: string; auth: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          method: String(init.method),
          auth: String((init.headers as Record<string, string>).authorization),
        });
        const r = responses.shift() ?? { status: 204 };
        return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
          status: r.status,
        });
      }),
    );
    vi.resetModules();
    const mod = await import('./services/discord');
    return { ...mod, calls };
  }

  it('adds and removes roles as the bot', async () => {
    const { setDiscordRole, calls } = await load([{ status: 204 }, { status: 204 }]);
    expect(await setDiscordRole('111111', '222222', '333333', true)).toBe(true);
    expect(await setDiscordRole('111111', '222222', '333333', false)).toBe(true);
    expect(calls).toEqual([
      {
        url: 'https://discord.test/api/v10/guilds/111111/members/222222/roles/333333',
        method: 'PUT',
        auth: 'Bot bot-token',
      },
      {
        url: 'https://discord.test/api/v10/guilds/111111/members/222222/roles/333333',
        method: 'DELETE',
        auth: 'Bot bot-token',
      },
    ]);
  });

  it('skips people who aren’t in the Discord server', async () => {
    const { setDiscordRole } = await load([{ status: 404, body: { code: 10007 } }]);
    expect(await setDiscordRole('111111', '222222', '333333', true)).toBe(false);
  });

  it('explains permission problems', async () => {
    const { setDiscordRole, DiscordError } = await load([{ status: 403, body: { code: 50013 } }]);
    const err = await setDiscordRole('111111', '222222', '333333', true).catch((e: Error) => e);
    expect(err).toBeInstanceOf(DiscordError);
    expect((err as Error).message).toMatch(/Manage Roles/);
  });

  it('waits out rate limits', async () => {
    const { setDiscordRole, calls } = await load([
      { status: 429, body: { retry_after: 0.01 } },
      { status: 204 },
    ]);
    expect(await setDiscordRole('111111', '222222', '333333', true)).toBe(true);
    expect(calls).toHaveLength(2);
  });
});
