import { exportAccount, isAppError } from '@magnox/core';
import { getUser } from '@/lib/auth';

/** Everything Magnox keeps about you, as a JSON file to download. */
export async function GET() {
  const user = await getUser();
  try {
    const data = await exportAccount(user?.id ?? null);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="magnox-data-${day}.json"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    if (isAppError(e)) return new Response(e.message, { status: e.status });
    throw e;
  }
}
