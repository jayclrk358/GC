import { z } from 'zod';
import { endpointHistory, getServerDetail } from '@magnox/core';
import { HISTORY_RANGES } from '@magnox/shared';
import { publicJson } from '@/lib/api';

const rangeSchema = z.enum(HISTORY_RANGES).catch('24h');

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const range = rangeSchema.parse(new URL(req.url).searchParams.get('range'));
  return publicJson(async (userId) => {
    // Same visibility as the server page: public listings, or your own.
    const server = await getServerDetail(z.string().uuid().parse(id), userId);
    return endpointHistory(server.endpointId, range);
  });
}
