import { apiCommunityContext, apiThreads } from '@magnox/core';
import { apiV1, queryOf } from '@/lib/api-v1';

type Params = { params: Promise<{ slug: string }> };

/** Forum threads: in one forum (?channel=), or the latest across all of them. */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  return apiV1(req, async (caller) =>
    apiThreads(await apiCommunityContext(slug, caller.userId), queryOf(req)),
  );
}
