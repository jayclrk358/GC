import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
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
