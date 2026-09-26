import { searchMessages } from '@magnox/core';
import { communityJson } from '@/lib/api';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams.get('q') ?? '';
  return communityJson(id, async (ctx) => ({ results: await searchMessages(ctx, q) }));
}
