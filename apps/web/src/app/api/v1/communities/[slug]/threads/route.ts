import { apiCommunityContext, apiCreateThread, apiThreads } from '@gamecentral/core';
import { apiV1, jsonBody, queryOf } from '@/lib/api-v1';

type Params = { params: Promise<{ slug: string }> };

/** Forum threads: in one forum (?channel=), or the latest across all of them. */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  return apiV1(req, async (caller) =>
    apiThreads(await apiCommunityContext(slug, caller.userId), queryOf(req)),
  );
}

/** Start a thread in one of the community's forums, as the token's owner. */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const body = await jsonBody(req);
  return apiV1(
    req,
    async (caller) => apiCreateThread(await apiCommunityContext(slug, caller.userId), body),
    { write: true, status: 201 },
  );
}
