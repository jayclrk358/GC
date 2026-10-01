import { memberList } from '@magnox/core';
import { communityJson } from '@/lib/api';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return communityJson(id, (ctx) => memberList(ctx));
}
