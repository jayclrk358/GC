#!/usr/bin/env node
/**
 * Verify that every translation key used in the web app exists in messages/en.json.
 * Handles `const t = useTranslations('ns')` / `await getTranslations('ns')` and calls like
 * t('key'), t(`prefix.${x}`) (checks that the prefix exists) and t.rich('key').
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: the latter gives "/C:/..." on Windows.
const root = fileURLToPath(new URL('../apps/web/', import.meta.url));
const messages = JSON.parse(readFileSync(join(root, 'messages/en.json'), 'utf8'));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mts)$/.test(name)) out.push(p);
  }
  return out;
}

function lookup(path) {
  let node = messages;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

const problems = [];
let checked = 0;
for (const file of walk(join(root, 'src'))) {
  const src = readFileSync(file, 'utf8');
  const decl =
    /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*'([\w.]+)'\s*\)/g;
  for (const m of src.matchAll(decl)) {
    const [, v, ns] = m;
    if (lookup(ns) === undefined) problems.push(`${file}: namespace "${ns}" missing`);
    const call = new RegExp(`\\b${v}(?:\\.rich|\\.has)?\\(\\s*(['\`])([^'\`]+)\\1`, 'g');
    for (const c of src.matchAll(call)) {
      const key = c[2];
      checked++;
      if (key.includes('${')) {
        const prefix = key.slice(0, key.indexOf('${')).replace(/\.$/, '');
        if (prefix && typeof lookup(`${ns}.${prefix}`) !== 'object') {
          problems.push(`${file}: ${ns}.${prefix}.* missing`);
        }
      } else if (lookup(`${ns}.${key}`) === undefined) {
        problems.push(`${file}: ${ns}.${key} missing`);
      }
    }
  }
}

// Other languages: the same keys as English (missing ones fall back to English), and the same
// placeholders ({name}) and tags (<link>) in each string.
function flatten(node, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}
const placeholders = (s) =>
  new Set([...String(s).matchAll(/\{\s*([A-Za-z_][\w]*)\s*(?=[,}])/g)].map((m) => m[1]));
const tags = (s) => [...String(s).matchAll(/<\/?([a-z][\w-]*)>/gi)].map((m) => m[0]).sort();
const english = flatten(messages);
const locales = readdirSync(join(root, 'messages')).filter(
  (f) => f.endsWith('.json') && f !== 'en.json',
);
const missingByLocale = [];
for (const file of locales) {
  let other;
  try {
    other = flatten(JSON.parse(readFileSync(join(root, 'messages', file), 'utf8')));
  } catch (e) {
    problems.push(`messages/${file}: not valid JSON (${e.message})`);
    continue;
  }
  let missing = 0;
  for (const key of english.keys()) if (!other.has(key)) missing++;
  if (missing)
    missingByLocale.push(`${file}: ${missing} string(s) not translated yet (English shows)`);
  for (const [key, value] of other) {
    if (!english.has(key)) {
      problems.push(`messages/${file}: ${key} isn't in en.json`);
      continue;
    }
    const en = english.get(key);
    if (typeof value !== 'string') {
      problems.push(`messages/${file}: ${key} should be text`);
      continue;
    }
    const want = placeholders(en);
    const got = placeholders(value);
    // Plural and select branches hold words, so only check English's arguments are all there.
    const branched = /\{\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/.test(en);
    for (const p of want) if (!got.has(p)) problems.push(`messages/${file}: ${key} lost {${p}}`);
    if (!branched) {
      for (const p of got)
        if (!want.has(p)) problems.push(`messages/${file}: ${key} has unknown {${p}}`);
    }
    if (tags(en).join() !== tags(value).join()) {
      problems.push(`messages/${file}: ${key} has different tags than English`);
    }
    if (/'[{}]/.test(value)) {
      problems.push(`messages/${file}: ${key} has a ' before a brace (use ’, or it escapes it)`);
    }
  }
}

if (problems.length) {
  console.error(problems.map((p) => p.replace(root, '')).join('\n'));
  console.error(`\n✘ ${problems.length} translation problem(s)`);
  process.exit(1);
}
for (const m of missingByLocale) console.log(`ℹ ${m}`);
console.log(
  `✔ ${checked} translation keys verified${locales.length ? `, ${locales.length} other language(s) checked` : ''}`,
);
