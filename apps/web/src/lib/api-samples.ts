// Code samples for the developer docs: the same request as curl, JavaScript and Python.
import type { Endpoint } from './api-docs';

/** Example values for path parameters, so every sample can be pasted and run as it is. */
const EXAMPLE_IDS: Record<string, string> = {
  channels: '0192f1c4-7b3c-7c4d-8e5f-6a7b8c9d0e1f',
  messages: '0192f1d0-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
  threads: '0192f1d0-2b3c-7d4e-9f5a-6b7c8d9e0f1a',
  events: '0192f1e2-4d5e-7f6a-9b7c-8d9e0f1a2b3c',
  servers: '0192f1e2-5e6f-7a7b-8c8d-9e0f1a2b3c4d',
};

/** The endpoint's path with example values filled in, and its example query. */
export function examplePath(e: Endpoint): string {
  const resource = e.path.split('/')[1] ?? '';
  const path = e.path
    .replace('{slug}', 'my-clan')
    .replace('{username}', 'alice')
    .replace('{page}', 'rules')
    .replace('{emoji}', '%F0%9F%91%8D')
    .replace('{id}', EXAMPLE_IDS[resource] ?? 'ID');
  return path + (e.query ?? '');
}

function json(value: unknown, indent: number): string {
  return JSON.stringify(value, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : ' '.repeat(indent) + line))
    .join('\n');
}

export function curlSample(base: string, e: Endpoint): string {
  const lines = [
    `curl${e.method === 'GET' ? '' : ` -X ${e.method}`} "${base}${examplePath(e)}"`,
    `  -H "Authorization: Bearer $GC_TOKEN"`,
  ];
  if (e.body) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${JSON.stringify(e.body).replace(/'/g, "'\\''")}'`);
  }
  return lines.join(' \\\n');
}

export function jsSample(base: string, e: Endpoint): string {
  const options = [
    ...(e.method === 'GET' ? [] : [`  method: '${e.method}',`]),
    '  headers: {',
    '    Authorization: `Bearer ${process.env.GC_TOKEN}`,',
    ...(e.body ? [`    'Content-Type': 'application/json',`] : []),
    '  },',
    ...(e.body ? [`  body: JSON.stringify(${json(e.body, 2)}),`] : []),
  ];
  return [
    `const res = await fetch('${base}${examplePath(e)}', {`,
    ...options,
    '});',
    'if (!res.ok) throw new Error((await res.json()).error.message);',
    'const { data } = await res.json();',
  ].join('\n');
}

function pyValue(value: unknown, indent: number): string {
  return json(value, indent)
    .replace(/\bnull\b/g, 'None')
    .replace(/\btrue\b/g, 'True')
    .replace(/\bfalse\b/g, 'False');
}

export function pySample(base: string, e: Endpoint): string {
  return [
    'import os',
    'import requests',
    '',
    `res = requests.${e.method.toLowerCase()}(`,
    `    "${base}${examplePath(e)}",`,
    `    headers={"Authorization": f"Bearer {os.environ['GC_TOKEN']}"},`,
    ...(e.body ? [`    json=${pyValue(e.body, 4)},`] : []),
    ')',
    'res.raise_for_status()',
    'data = res.json()["data"]',
  ].join('\n');
}

const STATUS_TEXT: Record<number, string> = { 200: 'OK', 201: 'Created' };

export function responseSample(e: Endpoint): { status: string; body: string } {
  const code = e.status ?? 200;
  return {
    status: `${code} ${STATUS_TEXT[code] ?? ''}`.trim(),
    body: JSON.stringify({ data: e.response }, null, 2),
  };
}
