import { checkCalendarFeedKey, communityIcal, getMemberContext, isAppError } from '@magnox/core';

/**
 * A community's events for calendar apps to subscribe to. Calendar apps can't sign in, so a
 * private community's address carries a member's key (see calendarFeedKey).
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const userId = url.searchParams.get('u');
  const key = url.searchParams.get('k');
  try {
    let ctx = await getMemberContext({ slug }, null).catch(() => null);
    if (!ctx && userId && key) {
      const member = await getMemberContext({ slug }, userId);
      if (member.isMember && checkCalendarFeedKey(member.community.id, userId, key)) ctx = member;
    }
    if (!ctx) return new Response('Not found', { status: 404 });
    return new Response(await communityIcal(ctx), {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'cache-control':
          ctx.community.visibility === 'private' ? 'private, max-age=900' : 'public, max-age=900',
      },
    });
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') return new Response('Not found', { status: 404 });
    throw e;
  }
}
