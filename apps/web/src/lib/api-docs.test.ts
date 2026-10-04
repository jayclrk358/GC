import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { API_GROUPS, ENDPOINTS } from './api-docs';
import { curlSample, examplePath, jsSample, pySample } from './api-samples';
import { openApiDocument } from './openapi';

const V1 = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/api/v1');

/** Every method exported by a route under app/api/v1, as "GET /communities/{slug}". */
function routes(dir = V1, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const segment = entry.name.replace(/^\[(.+)\]$/, '{$1}');
      out.push(...routes(full, `${prefix}/${segment}`));
    } else if (entry.name === 'route.ts') {
      const source = fs.readFileSync(full, 'utf8');
      for (const [, method] of source.matchAll(
        /export (?:async )?function (GET|POST|PATCH|PUT|DELETE)\b/g,
      )) {
        out.push(`${method} ${prefix || '/'}`);
      }
    }
  }
  return out;
}

describe('API docs', () => {
  it('describe exactly the routes there are', () => {
    const documented = ENDPOINTS.map((e) => `${e.method} ${e.path}`).sort();
    const real = routes()
      .filter((r) => r !== 'GET /openapi.json')
      .sort();
    expect(documented).toEqual(real);
  });

  it('name every path parameter, with unique anchors', () => {
    const ids = new Set<string>();
    for (const e of ENDPOINTS) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      const inPath = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const params = (e.params ?? [])
        .filter((p) => p.in === 'path')
        .map((p) => p.name)
        .sort();
      expect(params, e.id).toEqual(inPath);
      // Writes say so, and have a body or nothing to send.
      if (e.method !== 'GET') expect(e.write, e.id).toBe(true);
      if (e.body)
        expect(
          (e.params ?? []).some((p) => p.in === 'body'),
          e.id,
        ).toBe(true);
    }
    expect(new Set(API_GROUPS.map((g) => g.id)).size).toBe(API_GROUPS.length);
  });

  it('make runnable samples', () => {
    const send = ENDPOINTS.find((e) => e.id === 'send-message')!;
    expect(examplePath(send)).toMatch(/^\/channels\/[0-9a-f-]{36}\/messages$/);
    expect(curlSample('https://x.test/api/v1', send)).toContain(
      `curl -X POST "https://x.test/api/v1${examplePath(send)}"`,
    );
    expect(jsSample('https://x.test/api/v1', send)).toContain("method: 'POST'");
    expect(pySample('https://x.test/api/v1', send)).toContain('requests.post(');
    for (const e of ENDPOINTS) expect(examplePath(e), e.id).not.toMatch(/[{}]/);
  });

  it('make an OpenAPI document with every operation', () => {
    const doc = openApiDocument('https://x.test/api/v1');
    const operations = Object.entries(doc.paths).flatMap(([p, ops]) =>
      Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`),
    );
    expect(operations.sort()).toEqual(ENDPOINTS.map((e) => `${e.method} ${e.path}`).sort());
    expect(JSON.parse(JSON.stringify(doc)).openapi).toBe('3.1.0');
  });
});
