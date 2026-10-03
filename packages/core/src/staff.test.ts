import { describe, expect, it } from 'vitest';

// Read once, when the settings are first used.
process.env.PLATFORM_ADMIN_EMAILS = 'Boss@Example.test';
const { publicStaffRole, staffCan, staffRoleOf } = await import('./services/admin');

const owner = { email: 'boss@example.test', emailVerified: true, role: 'user' };

describe('staff roles', () => {
  it('makes a confirmed PLATFORM_ADMIN_EMAILS address the owner', () => {
    expect(staffRoleOf(owner)).toBe('owner');
    expect(staffRoleOf({ ...owner, emailVerified: false })).toBeNull();
    expect(staffRoleOf({ email: 'a@example.test', emailVerified: true, role: 'admin' })).toBe(
      'admin',
    );
    expect(staffRoleOf({ email: 'm@example.test', role: 'moderator' })).toBe('moderator');
    expect(staffRoleOf({ email: 'u@example.test', role: 'user' })).toBeNull();
    expect(staffRoleOf({ email: 'a@example.test', role: 'admin', banned: true })).toBeNull();
  });

  it('shows the owner to everyone else as an admin', () => {
    expect(publicStaffRole(owner)).toBe('admin');
    expect(publicStaffRole({ email: 'm@example.test', role: 'moderator' })).toBe('moderator');
    expect(publicStaffRole({ email: 'u@example.test', role: 'user' })).toBeNull();
  });

  it('keeps plans, suspensions, the team and the log from moderators', () => {
    for (const ability of ['plans', 'suspend', 'staff', 'log'] as const) {
      expect(staffCan('moderator', ability), ability).toBe(false);
      expect(staffCan('admin', ability), ability).toBe(true);
    }
    expect(staffCan('moderator', 'feedback')).toBe(true);
  });
});
