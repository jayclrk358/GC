#!/usr/bin/env node
/**
 * Verify that every translation key used in the web app exists in messages/en.json.
 * Handles `const t = useTranslations('ns')` / `await getTranslations('ns')` and calls like
 * t('key'), t(`prefix.${x}`) (checks that the prefix exists) and t.rich('key').
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../apps/web/', import.meta.url).pathname;
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
  const decl = /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*'([\w.]+)'\s*\)/g;
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

if (problems.length) {
  console.error(problems.map((p) => p.replace(root, '')).join('\n'));
  console.error(`\n✘ ${problems.length} missing translation key(s)`);
  process.exit(1);
}
console.log(`✔ ${checked} translation keys verified`);
