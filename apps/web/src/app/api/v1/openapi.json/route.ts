import { env } from '@gamecentral/core';
import { openApiDocument } from '@/lib/openapi';

/** The API described for tools (Postman, Insomnia, code generators). No token needed. */
export function GET() {
  const base = `${env().APP_URL.replace(/\/$/, '')}/api/v1`;
  return Response.json(openApiDocument(base), {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-disposition': 'inline; filename="gamecentral-openapi.json"',
      'access-control-allow-origin': '*',
    },
  });
}
