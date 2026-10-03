import { describe, expect, it, vi } from 'vitest';
import { canSubscribe, getMemberContext, loadChannel, revokedRooms } from './access';

// Malformed ids must be turned away before any query: Postgres rejects them with an error.
vi.mock('@gamecentral/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const db = new Proxy(
    {},
    {
      get: () => {
        throw new Error('no database in this test');
      },
    },
  );
  return { ...actual, db };
});

const ID = '0190f3a2-7b1c-7d4e-8f00-123456789abc';

describe('ids that are not uuids', () => {
  it('are not found, rather than a database error', async () => {
    await expect(getMemberContext({ id: 'not-a-uuid' }, null)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(getMemberContext({ id: `${ID}x` }, 'user1')).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(await loadChannel('1; drop table channels')).toBeNull();
  });

  it('never get a room', async () => {
    for (const kind of ['community', 'channel', 'chat', 'thread', 'server']) {
      expect(await canSubscribe('user1', kind, '------------------------------------')).toBeNull();
    }
    expect(await canSubscribe('user1', 'user', ID)).toBeNull();
  });
});

describe('canSubscribe', () => {
  it('lets anyone follow a game server, which belongs to no community', async () => {
    expect(await canSubscribe(null, 'server', ID)).toEqual({ communityId: null });
  });
});

describe('revokedRooms', () => {
  it('takes every room away when the community id is unusable', async () => {
    const sockets = [
      { userId: 'a', rooms: ['community:x', 'chat:y'] },
      { userId: null, rooms: ['thread:z'] },
    ];
    expect(await revokedRooms('nope', sockets)).toEqual([['community:x', 'chat:y'], ['thread:z']]);
  });
});
