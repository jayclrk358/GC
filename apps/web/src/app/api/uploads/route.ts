import { isAppError, isUploadPurpose, logger, saveUpload } from '@magnox/core';
import { MAX_PLAN_LIMITS } from '@magnox/shared';
import { getUser } from '@/lib/auth';

/** The biggest upload any plan allows, plus room for the form around it (and a video's still). */
const MAX_BODY = (MAX_PLAN_LIMITS.videoMb + 6) * 1_000_000;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Please sign in to upload.' }, { status: 401 });
  // Turn away anything too big before reading it into memory.
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) {
    return Response.json({ error: 'That file is too large.' }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: 'Invalid upload.' }, { status: 400 });
  }
  const file = form.get('file');
  const purpose = String(form.get('purpose') ?? '');
  const communityId = form.get('communityId') ? String(form.get('communityId')) : null;
  if (
    !(file instanceof File) ||
    !isUploadPurpose(purpose) ||
    purpose === 'preview' ||
    purpose === 'poster'
  ) {
    return Response.json({ error: 'Choose an image to upload.' }, { status: 400 });
  }
  try {
    const result = await saveUpload({
      userId: user.id,
      purpose,
      communityId,
      data: Buffer.from(await file.arrayBuffer()),
      alt: String(form.get('alt') ?? ''),
      filename: file.name,
      poster: await stillFor(purpose, form.get('poster')),
    });
    return Response.json(result);
  } catch (e) {
    if (isAppError(e)) return Response.json({ error: e.message }, { status: e.status });
    logger('upload').error({ err: e }, 'upload failed');
    return Response.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}

/** The still a browser made of a video's opening frame, if it sent one. */
async function stillFor(purpose: string, poster: FormDataEntryValue | null) {
  if (purpose !== 'video' || !(poster instanceof File)) return null;
  return Buffer.from(await poster.arrayBuffer());
}
