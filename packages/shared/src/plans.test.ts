import { describe, expect, it } from 'vitest';
import {
  isActiveSubscriptionStatus,
  MAX_PLAN_LIMITS,
  PLAN_IDS,
  PLAN_LIMITS,
  PLAN_PERKS,
  planLimits,
  planRank,
} from './plans';

describe('plans', () => {
  it('each plan allows at least as much as the one below it', () => {
    for (let i = 1; i < PLAN_IDS.length; i++) {
      const lower = PLAN_LIMITS[PLAN_IDS[i - 1]!];
      const higher = PLAN_LIMITS[PLAN_IDS[i]!];
      for (const key of Object.keys(lower) as (keyof typeof lower)[]) {
        expect(higher[key], `${PLAN_IDS[i]} ${key}`).toBeGreaterThanOrEqual(lower[key]);
      }
      const lowerPerks = PLAN_PERKS[PLAN_IDS[i - 1]!];
      for (const key of Object.keys(lowerPerks) as (keyof typeof lowerPerks)[]) {
        if (lowerPerks[key]) expect(PLAN_PERKS[PLAN_IDS[i]!][key]).toBe(true);
      }
    }
  });

  it('keeps Free at the limits communities had before plans existed', () => {
    expect(PLAN_LIMITS.free).toEqual({
      servers: 25,
      roles: 100,
      channels: 200,
      attachments: 4,
      imageMb: 10,
      videoMb: 50,
    });
  });

  it('knows the highest limit on any plan, and falls back to Free', () => {
    expect(MAX_PLAN_LIMITS.attachments).toBe(PLAN_LIMITS.pro.attachments);
    expect(planLimits(undefined)).toBe(PLAN_LIMITS.free);
    expect(planRank('pro')).toBeGreaterThan(planRank('plus'));
  });

  it('keeps the plan through a failed payment, not after cancellation', () => {
    expect(isActiveSubscriptionStatus('past_due')).toBe(true);
    expect(isActiveSubscriptionStatus('active')).toBe(true);
    expect(isActiveSubscriptionStatus('canceled')).toBe(false);
    expect(isActiveSubscriptionStatus('incomplete')).toBe(false);
  });
});
