import { z } from 'zod';
import { endpointHistory, getServerDetail } from '@gamecentral/core';
import { HISTORY_RANGES } from '@gamecentral/shared';
import { publicJson } from '@/lib/api';

const rangeSchema = z.enum(HISTORY_RANGES).catch('24h');

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const range = rangeSchema.parse(new URL(req.url).searchParams.get('range'));
  let visibility = 'private';
  const res = await publicJson(async (userId) => {
    // Same visibility as the server page: public listings, or your own.
    const server = await getServerDetail(z.string().uuid().parse(id), userId);
    if (!server.private) visibility = 'public';
    return endpointHistory(server.endpointId, range);
  });
  // A public listing's history is the same for everyone; a private one is only for its owner.
  if (res.ok) res.headers.set('cache-control', `${visibility}, max-age=60`);
  return res;
}
