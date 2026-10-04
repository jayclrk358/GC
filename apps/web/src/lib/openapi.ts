// The public API as an OpenAPI 3.1 document (/api/v1/openapi.json), for Postman, Insomnia and
// code generators. Made from the same description as the docs page.
import { API_GROUPS, ERROR_CODES, type Param } from './api-docs';

function schemaFor(type: string): Record<string, unknown> {
  const literals = type.split('|').map((t) => t.trim());
  if (literals.length > 1 || type.startsWith('"')) {
    const values = literals.filter((t) => t !== 'null').map((t) => t.replace(/^"|"$/g, ''));
    const nullable = literals.includes('null');
    return {
      type: nullable ? ['string', 'null'] : 'string',
      enum: [...values, ...(nullable ? [null] : [])],
    };
  }
  switch (type) {
    case 'uuid':
      return { type: 'string', format: 'uuid' };
    case 'date-time':
      return { type: 'string', format: 'date-time' };
    case 'integer':
      return { type: 'integer', minimum: 0 };
    case 'boolean':
      return { type: 'boolean' };
    default:
      return { type: 'string' };
  }
}

const camel = (id: string) => id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

export function openApiDocument(base: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const group of API_GROUPS) {
    for (const e of group.endpoints) {
      const params = e.params ?? [];
      const inUrl = params.filter((p) => p.in !== 'body');
      const inBody = params.filter((p) => p.in === 'body');
      const status = String(e.status ?? 200);
      // Automod can hold what write calls post (202); the rest can come from any call.
      const errors = Object.fromEntries(
        ERROR_CODES.filter((c) => c.status !== 202 || e.write).map((c) => [
          String(c.status),
          errorResponse(c.meaning),
        ]),
      );
      delete errors[status];
      (paths[e.path] ??= {})[e.method.toLowerCase()] = {
        operationId: camel(e.id),
        summary: e.title,
        description: e.write
          ? `${e.description}\n\nNeeds a token that can post and make changes.`
          : e.description,
        tags: [group.title],
        security: [{ token: [] }],
        parameters: inUrl.map((p: Param) => ({
          name: p.name,
          in: p.in,
          required: p.in === 'path' || Boolean(p.required),
          description: p.description,
          schema: schemaFor(p.type),
        })),
        ...(inBody.length
          ? {
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: inBody.filter((p) => p.required).map((p) => p.name),
                      properties: Object.fromEntries(
                        inBody.map((p) => [
                          p.name,
                          { ...schemaFor(p.type), description: p.description },
                        ]),
                      ),
                    },
                    ...(e.body ? { example: e.body } : {}),
                  },
                },
              },
            }
          : {}),
        responses: {
          [status]: {
            description: e.title,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['data'], properties: { data: {} } },
                example: { data: e.response },
              },
            },
          },
          ...errors,
        },
      };
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Game Central API',
      version: '1',
      description:
        'Read and act on Game Central communities, chat, forums, wikis, events and game servers. Every call acts as the token’s owner, with exactly their access. Docs: /developers',
    },
    servers: [{ url: base }],
    tags: API_GROUPS.map((g) => ({ name: g.title, description: g.description })),
    components: {
      securitySchemes: {
        token: {
          type: 'http',
          scheme: 'bearer',
          description: 'A personal token from Settings → Developer (mx_…).',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', enum: ERROR_CODES.map((c) => c.code) },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
    paths,
  };
}
