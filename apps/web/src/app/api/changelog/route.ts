import { CHANGELOG } from '@gamecentral/shared';

// The latest updates, for the Windows app's loading screen and "What's new" window. Public, the
// same for everyone, and it only changes when the site is updated.
export const dynamic = 'force-static';

export function GET() {
  return Response.json(
    { entries: CHANGELOG.slice(0, 10) },
    { headers: { 'cache-control': 'public, max-age=300' } },
  );
}
