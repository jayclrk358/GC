import { isAppError, isUploadPurpose, logger, saveUpload } from '@magnox/core';
import { getUser } from '@/lib/auth';

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Please sign in to upload.' }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: 'Invalid upload.' }, { status: 400 });
  }
  const file = form.get('file');
  const purpose = String(form.get('purpose') ?? '');
  const communityId = form.get('communityId') ? String(form.get('communityId')) : null;
  if (!(file instanceof File) || !isUploadPurpose(purpose) || purpose === 'preview') {
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
    });
    return Response.json(result);
  } catch (e) {
    if (isAppError(e)) return Response.json({ error: e.message }, { status: e.status });
    logger('upload').error({ err: e }, 'upload failed');
    return Response.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
