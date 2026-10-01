import { eventIcal, getMemberContext, isAppError } from '@magnox/core';
import { getUser } from '@/lib/auth';

/** One event as a calendar file, to add to your own calendar. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; eventId: string }> },
) {
  const { slug, eventId } = await params;
  const user = await getUser();
  try {
    const ctx = await getMemberContext({ slug }, user?.id ?? null);
    const { title, ics } = await eventIcal(ctx, eventId);
    // Without characters files can't have on Windows (or quotes, which would end the header).
    const file =
      [...title]
        .filter((c) => c >= ' ' && !'\\/:*?"<>|'.includes(c))
        .join('')
        .trim()
        .slice(0, 60) || 'event';
    return new Response(ics, {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': `attachment; filename="${file.replace(/[^\x20-\x7e]/g, '_')}.ics"; filename*=UTF-8''${encodeURIComponent(file)}.ics`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') return new Response('Not found', { status: 404 });
    throw e;
  }
}
