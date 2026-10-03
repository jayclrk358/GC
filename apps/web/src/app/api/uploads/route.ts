import {
  checkUploadAllowed,
  isAppError,
  isUploadPurpose,
  logger,
  saveUpload,
} from '@gamecentral/core';
import { MAX_PLAN_LIMITS } from '@gamecentral/shared';
import { getUser } from '@/lib/auth';

/** The biggest upload any plan allows, plus room for the form around it (and a video's still). */
const MAX_BODY = (MAX_PLAN_LIMITS.videoMb + 6) * 1_000_000;

const tooLarge = () => Response.json({ error: 'That file is too large.' }, { status: 413 });

/**
 * The request body, cut off (and the rest never read) once it's longer than `limit`. The proxy
 * skips this route so it never holds a copy of a video, so nothing else caps it here.
 */
function limitedBody(body: ReadableStream<Uint8Array>, limit: number) {
  const state = { tooLarge: false };
  let size = 0;
  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > limit) {
          state.tooLarge = true;
          controller.error(new Error('Request body too large'));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
  return { stream, state };
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Please sign in to upload.' }, { status: 401 });
  // Uploads must say how big they are, so anything too big is turned away before it's read.
  const length = req.headers.get('content-length');
  const declared = Number(length);
  if (!length || !Number.isSafeInteger(declared) || declared < 0) {
    return Response.json({ error: 'Invalid upload.' }, { status: 411 });
  }
  if (declared > MAX_BODY) return tooLarge();
  try {
    await checkUploadAllowed(user.id);
  } catch (e) {
    if (isAppError(e)) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
  if (!req.body) return Response.json({ error: 'Invalid upload.' }, { status: 400 });

  let form: FormData;
  // No more than it said it would send (chunked bodies have no length, and are turned away above).
  const body = limitedBody(req.body, declared);
  try {
    form = await new Response(body.stream, {
      headers: { 'content-type': req.headers.get('content-type') ?? '' },
    }).formData();
  } catch {
    if (body.state.tooLarge) return tooLarge();
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
